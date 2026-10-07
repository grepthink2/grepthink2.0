-- 2026-10-07 — analytics: scope helpers, the live section functions, the nightly rollup and trends
--
-- EXPAND, idempotent, one transaction. Named 07 so it sorts after
-- 2026-10-06_assignment_deadlines_and_events.sql, which it reads (events, classes.institution_id,
-- institutions.timezone). Spec: docs/superpowers/specs/2026-10-05-analytics-dashboard-design.md §6.2, §7.
--
-- Applied: DEV ____-__-__   PROD ____-__-__
--
-- ⚠️  ORDER: after 2026-09/2026-09-25_institutions.sql, 2026-09/2026-09-30_institution_timezones.sql and
--     2026-10/2026-10-06_assignment_deadlines_and_events.sql. The pg_cron schedule lives in
--     prod/2026-10/2026-10-07_analytics_cron.sql and is applied AFTER this file (DEV then PROD).
--
--   * Section functions (STABLE, jsonb): analytics_scope_counts, analytics_conversations,
--     analytics_scrum, analytics_trends. Same seven parameters each: the institution, an optional
--     class, the inclusive date range [p_from, p_to], the previous range of equal length (NULL for
--     the "all" preset) and the school's IANA zone, in which dates become instants and weeks start
--     on Monday. The backend fans them out over RPC and composes one payload (app/analytics).
--   * analytics_daily: one row per (institution, class or NULL, day, metric), written by
--     analytics_rollup_day(p_day) — pg_cron, 09:00 UTC, for yesterday — and backfilled by
--     analytics_rollup_range(p_from, p_to). class_id is a plain uuid, not a foreign key: a deleted
--     class keeps its own history rows (two deleted classes would otherwise collide on the unique
--     key once both were SET NULL), which is what makes long-range trends honest.
--   * Lockdown (spec D17): EXECUTE on every function for service_role only; analytics_daily has RLS
--     on, no policies and no client privileges. pg_cron runs as postgres.
--   * Indexes: none added at today's volume (DEV: ~hundreds of messages and tasks). When messages
--     passes ~100k rows add messages (created_at) and tasks (created_at).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------------ scope helpers ----
-- The classes of one institution (or one class of it). The label is what analytics shows for a
-- class: its name, and its term when it has one. course_code is the join code and never leaves.
CREATE OR REPLACE FUNCTION public.analytics_scope_classes(p_institution uuid, p_class uuid)
RETURNS TABLE (class_id uuid, label text, start_date date, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id,
         c.name || CASE WHEN c.term IS NOT NULL AND c.term <> '' THEN ' · ' || c.term ELSE '' END,
         c.start_date,
         c.created_at
    FROM classes c
   WHERE c.institution_id = p_institution
     AND (p_class IS NULL OR c.id = p_class);
$$;

-- The projects of those classes with their current member count (0 included; callers filter).
CREATE OR REPLACE FUNCTION public.analytics_scope_teams(p_institution uuid, p_class uuid)
RETURNS TABLE (project_id uuid, class_id uuid, name text, members integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id, p.class_id, p.name, count(pm.user_id)::int
    FROM projects p
    JOIN analytics_scope_classes(p_institution, p_class) s ON s.class_id = p.class_id
    LEFT JOIN project_members pm ON pm.project_id = p.id
   GROUP BY p.id, p.class_id, p.name;
$$;

-- Everyone's role in every class: enrollments carry student/ta, the creator is the instructor.
CREATE OR REPLACE FUNCTION public.analytics_user_roles()
RETURNS TABLE (user_id uuid, class_id uuid, role text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT ce.user_id, ce.class_id, ce.enrollment_role FROM class_enrollments ce
  UNION ALL
  SELECT c.created_by, c.id, 'instructor' FROM classes c;
$$;

-- Direct messages that count for a school (decision 3): both users belong to the school, and the pair
-- does not share a class in which one is staff (instructor or TA) and the other a student. Used by the
-- conversations function and the nightly rollup, so the rule lives once.
CREATE OR REPLACE FUNCTION public.analytics_counted_dm(p_institution uuid)
RETURNS TABLE (conversation_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH user_roles AS (SELECT * FROM analytics_user_roles()),
  school_people AS (
    SELECT DISTINCT ur.user_id FROM user_roles ur JOIN classes c ON c.id = ur.class_id
     WHERE c.institution_id = p_institution),
  staff_student_dm AS (
    SELECT DISTINCT cv.id FROM conversations cv
      JOIN user_roles a ON a.user_id = cv.user_a
      JOIN user_roles b ON b.user_id = cv.user_b AND b.class_id = a.class_id
     WHERE cv.type = 'dm'
       AND ((a.role IN ('instructor', 'ta') AND b.role = 'student')
         OR (b.role IN ('instructor', 'ta') AND a.role = 'student')))
  SELECT cv.id FROM conversations cv
   WHERE cv.type = 'dm'
     AND cv.id NOT IN (SELECT id FROM staff_student_dm)
     AND cv.user_a IN (SELECT user_id FROM school_people)
     AND cv.user_b IN (SELECT user_id FROM school_people);
$$;

-- The board as it is now: tasks of non-archived stories of the teams in scope, with the story's sprint
-- ordinal within its project (0 = Backlog). Used by the scrum function and the nightly snapshot.
CREATE OR REPLACE FUNCTION public.analytics_live_tasks(p_institution uuid, p_class uuid)
RETURNS TABLE (project_id uuid, class_id uuid, status text, points integer, ordinal integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  sprint_ordinals AS (
    SELECT sp.id AS sprint_id,
           row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at)::int AS ordinal
      FROM sprints sp JOIN teams t ON t.project_id = sp.project_id)
  SELECT tk.project_id, t.class_id, tk.status, coalesce(tk.points, 0), coalesce(so.ordinal, 0)
    FROM tasks tk
    JOIN teams t ON t.project_id = tk.project_id
    JOIN user_stories us ON us.id = tk.story_id AND us.archived_at IS NULL
    LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id;
$$;

-- ------------------------------------------------------------------ scope counts ----
-- Classes, teams (projects with at least one member), students (distinct student enrollments),
-- people of the school who signed in during the last 7 days (NULL until any login event exists),
-- and the per-class / per-team rows the breakdown table starts from.
CREATE OR REPLACE FUNCTION public.analytics_scope_counts(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH scope AS (SELECT * FROM analytics_scope_classes(p_institution, p_class)),
  teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class) WHERE members >= 1),
  students AS (
    SELECT DISTINCT ce.user_id, ce.class_id
      FROM class_enrollments ce JOIN scope s ON s.class_id = ce.class_id
     WHERE ce.enrollment_role = 'student'),
  school_people AS (
    SELECT DISTINCT ur.user_id
      FROM analytics_user_roles() ur JOIN classes c ON c.id = ur.class_id
     WHERE c.institution_id = p_institution),
  has_logins AS (SELECT EXISTS (SELECT 1 FROM events WHERE kind = 'login') AS yes),
  active AS (
    SELECT count(DISTINCT e.actor_id) AS n
      FROM events e JOIN school_people sp ON sp.user_id = e.actor_id
     WHERE e.kind = 'login' AND e.occurred_at >= now() - interval '7 days'),
  active_prev AS (
    SELECT count(DISTINCT e.actor_id) AS n
      FROM events e JOIN school_people sp ON sp.user_id = e.actor_id
     WHERE e.kind = 'login'
       AND e.occurred_at >= now() - interval '14 days'
       AND e.occurred_at <  now() - interval '7 days'),
  by_class AS (
    SELECT s.class_id, s.label,
           (SELECT count(*) FROM teams t WHERE t.class_id = s.class_id)     AS teams,
           (SELECT count(*) FROM students st WHERE st.class_id = s.class_id) AS students
      FROM scope s)
  SELECT jsonb_build_object(
    'classes',  (SELECT count(*) FROM scope),
    'teams',    (SELECT count(*) FROM teams),
    'students', (SELECT count(DISTINCT user_id) FROM students),
    'active_users_7d',
      CASE WHEN (SELECT yes FROM has_logins) THEN (SELECT n FROM active) END,
    'active_users_prev_7d',
      CASE WHEN (SELECT yes FROM has_logins) THEN (SELECT n FROM active_prev) END,
    'by_class', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'class_id', class_id, 'label', label, 'teams', teams, 'students', students)
                  ORDER BY label) FROM by_class), '[]'::jsonb),
    'by_team',  coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'project_id', project_id, 'class_id', class_id, 'name', name, 'members', members)
                  ORDER BY name) FROM teams), '[]'::jsonb));
$$;

-- ------------------------------------------------------------------ conversations ----
-- Decision 3: team-member channels of the teams in scope (per class) plus direct messages between two
-- people of the school (school-wide; p_class is ignored for them on purpose), minus any DM whose two
-- users share a class in which one is staff (instructor or TA) and the other a student — the rule is
-- analytics_counted_dm's. team_ta and team_instructor channels never count. Range bounds are the
-- school-zone midnights; weeks start on Monday in the school's zone.
CREATE OR REPLACE FUNCTION public.analytics_conversations(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  counted_dm AS (SELECT conversation_id AS id FROM analytics_counted_dm(p_institution)),
  counted_team AS (
    SELECT cv.id, t.class_id, t.project_id
      FROM conversations cv JOIN teams t ON t.project_id = cv.project_id
     WHERE cv.type = 'team_members'),
  bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE p_tz)            AS cur_start,
           ((p_to + 1)::timestamp AT TIME ZONE p_tz)        AS cur_end,
           (p_prev_from::timestamp AT TIME ZONE p_tz)       AS prev_start,
           ((p_prev_to + 1)::timestamp AT TIME ZONE p_tz)   AS prev_end),
  team_msgs AS (
    SELECT m.created_at, ct.class_id, ct.project_id
      FROM messages m JOIN counted_team ct ON ct.id = m.conversation_id),
  dm_msgs AS (
    SELECT m.created_at FROM messages m JOIN counted_dm cd ON cd.id = m.conversation_id),
  cur_team AS (SELECT tm.* FROM team_msgs tm, bounds b WHERE tm.created_at >= b.cur_start AND tm.created_at < b.cur_end),
  cur_dm   AS (SELECT dm.* FROM dm_msgs dm,   bounds b WHERE dm.created_at >= b.cur_start AND dm.created_at < b.cur_end),
  weekly AS (
    SELECT week_start, sum(tm) AS team_members, sum(dm) AS dm
      FROM (SELECT date_trunc('week', created_at AT TIME ZONE p_tz)::date AS week_start, 1 AS tm, 0 AS dm FROM cur_team
            UNION ALL
            SELECT date_trunc('week', created_at AT TIME ZONE p_tz)::date, 0, 1 FROM cur_dm) w
     GROUP BY week_start)
  SELECT jsonb_build_object(
    'team_members', (SELECT count(*) FROM cur_team),
    'dm',           (SELECT count(*) FROM cur_dm),
    'total',        (SELECT count(*) FROM cur_team) + (SELECT count(*) FROM cur_dm),
    'prev_team_members', CASE WHEN p_prev_from IS NULL THEN NULL ELSE
      (SELECT count(*) FROM team_msgs tm, bounds b WHERE tm.created_at >= b.prev_start AND tm.created_at < b.prev_end) END,
    'prev_dm', CASE WHEN p_prev_from IS NULL THEN NULL ELSE
      (SELECT count(*) FROM dm_msgs dm, bounds b WHERE dm.created_at >= b.prev_start AND dm.created_at < b.prev_end) END,
    'weekly', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'week_start', week_start, 'team_members', team_members, 'dm', dm) ORDER BY week_start)
                FROM weekly), '[]'::jsonb),
    'by_class', coalesce((SELECT jsonb_agg(jsonb_build_object('class_id', class_id, 'team_messages', n) ORDER BY class_id)
                FROM (SELECT class_id, count(*) AS n FROM cur_team GROUP BY class_id) x), '[]'::jsonb),
    'by_team', coalesce((SELECT jsonb_agg(jsonb_build_object('project_id', project_id, 'team_messages', n) ORDER BY project_id)
                FROM (SELECT project_id, count(*) AS n FROM cur_team GROUP BY project_id) y), '[]'::jsonb));
$$;

-- ------------------------------------------------------------------ scrum ----
-- Created counts and points in the range (archived stories count); the LIVE board snapshot by sprint
-- ordinal within each project (0 = Backlog; tasks of archived stories excluded); the median length of
-- title + description per entity, per ordinal and overall, all time; per-class and per-team rows for
-- the breakdown (points_done / points_total are live board figures).
CREATE OR REPLACE FUNCTION public.analytics_scrum(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE p_tz)            AS cur_start,
           ((p_to + 1)::timestamp AT TIME ZONE p_tz)        AS cur_end,
           (p_prev_from::timestamp AT TIME ZONE p_tz)       AS prev_start,
           ((p_prev_to + 1)::timestamp AT TIME ZONE p_tz)   AS prev_end),
  stories AS (
    SELECT us.id, us.project_id, us.sprint_id, us.title, us.description_md, coalesce(us.points, 0) AS points,
           us.archived_at, us.created_at, t.class_id
      FROM user_stories us JOIN teams t ON t.project_id = us.project_id),
  tasks_all AS (
    SELECT tk.id, tk.story_id, tk.project_id, tk.title, tk.description_md, coalesce(tk.points, 0) AS points,
           tk.status, tk.created_at, t.class_id
      FROM tasks tk JOIN teams t ON t.project_id = tk.project_id),
  cur_stories  AS (SELECT s.* FROM stories s,   bounds b WHERE s.created_at >= b.cur_start  AND s.created_at < b.cur_end),
  cur_tasks    AS (SELECT k.* FROM tasks_all k, bounds b WHERE k.created_at >= b.cur_start  AND k.created_at < b.cur_end),
  prev_stories AS (SELECT s.* FROM stories s,   bounds b WHERE s.created_at >= b.prev_start AND s.created_at < b.prev_end),
  prev_tasks   AS (SELECT k.* FROM tasks_all k, bounds b WHERE k.created_at >= b.prev_start AND k.created_at < b.prev_end),
  sprint_ordinals AS (
    SELECT sp.id AS sprint_id,
           row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at)::int AS ordinal
      FROM sprints sp JOIN teams t ON t.project_id = sp.project_id),
  live AS (SELECT * FROM analytics_live_tasks(p_institution, p_class)),
  by_sprint AS (
    SELECT ordinal,
           CASE WHEN ordinal = 0 THEN 'Backlog' ELSE 'Sprint ' || ordinal END AS label,
           count(DISTINCT project_id)                                   AS teams,
           count(*) FILTER (WHERE status = 'todo')                      AS todo,
           count(*) FILTER (WHERE status = 'in_progress')               AS in_progress,
           count(*) FILTER (WHERE status = 'done')                      AS done,
           coalesce(sum(points) FILTER (WHERE status = 'todo'), 0)        AS points_todo,
           coalesce(sum(points) FILTER (WHERE status = 'in_progress'), 0) AS points_in_progress,
           coalesce(sum(points) FILTER (WHERE status = 'done'), 0)        AS points_done
      FROM live GROUP BY ordinal),
  chars_src AS (
    SELECT 'task'::text AS entity, coalesce(so.ordinal, 0) AS ordinal,
           char_length(tk.title) + char_length(coalesce(tk.description_md, '')) AS len
      FROM tasks_all tk JOIN stories us ON us.id = tk.story_id
      LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id
    UNION ALL
    SELECT 'story', coalesce(so.ordinal, 0),
           char_length(us.title) + char_length(coalesce(us.description_md, ''))
      FROM stories us LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id),
  chars AS (
    SELECT entity, ordinal, count(*) AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY len))::int AS median
      FROM chars_src GROUP BY entity, ordinal
    UNION ALL
    SELECT entity, NULL, count(*), round(percentile_cont(0.5) WITHIN GROUP (ORDER BY len))::int
      FROM chars_src GROUP BY entity),
  weekly_tasks AS (
    SELECT date_trunc('week', created_at AT TIME ZONE p_tz)::date AS week_start, count(*) AS n
      FROM cur_tasks GROUP BY 1),
  by_class AS (
    SELECT c.class_id,
           (SELECT count(*) FROM cur_stories s WHERE s.class_id = c.class_id)                               AS stories,
           (SELECT count(*) FROM cur_tasks k WHERE k.class_id = c.class_id)                                 AS tasks,
           (SELECT coalesce(sum(points) FILTER (WHERE status = 'done'), 0) FROM live l WHERE l.class_id = c.class_id) AS points_done,
           (SELECT coalesce(sum(points), 0) FROM live l WHERE l.class_id = c.class_id)                      AS points_total
      FROM (SELECT DISTINCT class_id FROM teams) c),
  by_team AS (
    SELECT t.project_id,
           (SELECT count(*) FROM cur_stories s WHERE s.project_id = t.project_id)                               AS stories,
           (SELECT count(*) FROM cur_tasks k WHERE k.project_id = t.project_id)                                 AS tasks,
           (SELECT coalesce(sum(points) FILTER (WHERE status = 'done'), 0) FROM live l WHERE l.project_id = t.project_id) AS points_done,
           (SELECT coalesce(sum(points), 0) FROM live l WHERE l.project_id = t.project_id)                      AS points_total
      FROM teams t)
  SELECT jsonb_build_object(
    'stories_created',      (SELECT count(*) FROM cur_stories),
    'tasks_created',        (SELECT count(*) FROM cur_tasks),
    'story_points_created', (SELECT coalesce(sum(points), 0) FROM cur_stories),
    'task_points_created',  (SELECT coalesce(sum(points), 0) FROM cur_tasks),
    'prev_stories_created',      CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT count(*) FROM prev_stories) END,
    'prev_tasks_created',        CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT count(*) FROM prev_tasks) END,
    'prev_story_points_created', CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT coalesce(sum(points), 0) FROM prev_stories) END,
    'prev_task_points_created',  CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT coalesce(sum(points), 0) FROM prev_tasks) END,
    'weekly_tasks', coalesce((SELECT jsonb_agg(jsonb_build_object('week_start', week_start, 'tasks_created', n) ORDER BY week_start)
                     FROM weekly_tasks), '[]'::jsonb),
    'by_sprint', coalesce((SELECT jsonb_agg(jsonb_build_object(
                   'ordinal', ordinal, 'label', label, 'teams', teams,
                   'todo', todo, 'in_progress', in_progress, 'done', done,
                   'points_todo', points_todo, 'points_in_progress', points_in_progress, 'points_done', points_done)
                   ORDER BY ordinal) FROM by_sprint), '[]'::jsonb),
    'chars', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'entity', entity, 'ordinal', ordinal,
               'label', CASE WHEN ordinal IS NULL THEN 'All sprints' WHEN ordinal = 0 THEN 'Backlog' ELSE 'Sprint ' || ordinal END,
               'n', n, 'median', median)
               ORDER BY entity, ordinal NULLS FIRST) FROM chars), '[]'::jsonb),
    'by_class', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'class_id', class_id, 'stories', stories, 'tasks', tasks,
                  'points_done', points_done, 'points_total', points_total) ORDER BY class_id) FROM by_class), '[]'::jsonb),
    'by_team', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'project_id', project_id, 'stories', stories, 'tasks', tasks,
                 'points_done', points_done, 'points_total', points_total) ORDER BY project_id) FROM by_team), '[]'::jsonb));
$$;

-- Lockdown for the functions written so far (Task 2 adds the rest).
REVOKE ALL ON FUNCTION public.analytics_scope_classes(uuid, uuid)                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_scope_teams(uuid, uuid)                                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_user_roles()                                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_counted_dm(uuid)                                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_live_tasks(uuid, uuid)                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_scope_counts(uuid, uuid, date, date, date, date, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_conversations(uuid, uuid, date, date, date, date, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_scrum(uuid, uuid, date, date, date, date, text)                 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_scope_classes(uuid, uuid)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_scope_teams(uuid, uuid)                                      TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_user_roles()                                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_counted_dm(uuid)                                             TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_live_tasks(uuid, uuid)                                       TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_scope_counts(uuid, uuid, date, date, date, date, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_conversations(uuid, uuid, date, date, date, date, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_scrum(uuid, uuid, date, date, date, date, text)              TO service_role;

-- ======================================================================= CHECK (part 1) ====
-- Run on DEV after applying, with the UCSC institution id in :inst (SELECT id FROM institutions WHERE
-- slug = 'ucsc') and a 30-day range ending today. Expected:
--   fn_count = 8 (three section functions, five helpers)   [Task 2 adds analytics_trends and the two rollup functions: 11]
--   client_execute = 0 rows (no anon/authenticated EXECUTE on any analytics_% function)
--   team_total = direct_team_total (the function agrees with a direct count of team_members messages)
--   dm_excluded ≥ 0 and dm_counted + dm_excluded + dm_outside = dm_all (every DM is classified once)
--   snapshot_tasks = live_tasks (the by_sprint counts sum to the non-archived task count)
--   every weekly.week_start is a Monday (dow = 1)
SELECT count(*) AS fn_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'analytics\_%';
SELECT p.proname, r.rolname AS client_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
 WHERE n.nspname = 'public' AND p.proname LIKE 'analytics\_%'
   AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst,
                     current_date - 29 AS d0, current_date AS d1, 'America/Los_Angeles'::text AS tz),
     conv AS (SELECT analytics_conversations(inst, NULL, d0, d1, d0 - 30, d0 - 1, tz) AS j FROM args)
SELECT (j->>'team_members')::int AS team_total,
       (SELECT count(*) FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
          JOIN projects p ON p.id = cv.project_id JOIN classes c ON c.id = p.class_id, args a
         WHERE cv.type = 'team_members' AND c.institution_id = a.inst
           AND m.created_at >= (a.d0::timestamp AT TIME ZONE a.tz)
           AND m.created_at <  ((a.d1 + 1)::timestamp AT TIME ZONE a.tz)) AS direct_team_total,
       (j->>'dm')::int AS dm_counted
  FROM conv;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     ur AS (SELECT * FROM analytics_user_roles()),
     people AS (SELECT DISTINCT ur.user_id FROM ur JOIN classes c ON c.id = ur.class_id, args a WHERE c.institution_id = a.inst),
     excluded AS (SELECT DISTINCT cv.id FROM conversations cv JOIN ur a ON a.user_id = cv.user_a
                    JOIN ur b ON b.user_id = cv.user_b AND b.class_id = a.class_id
                   WHERE cv.type = 'dm' AND ((a.role IN ('instructor','ta') AND b.role = 'student')
                                          OR (b.role IN ('instructor','ta') AND a.role = 'student')))
SELECT (SELECT count(*) FROM conversations WHERE type = 'dm') AS dm_all,
       (SELECT count(*) FROM conversations cv WHERE cv.type = 'dm' AND cv.id IN (SELECT id FROM excluded)
          AND cv.user_a IN (SELECT user_id FROM people) AND cv.user_b IN (SELECT user_id FROM people)) AS dm_excluded,
       (SELECT count(*) FROM conversations cv WHERE cv.type = 'dm' AND cv.id NOT IN (SELECT id FROM excluded)
          AND cv.user_a IN (SELECT user_id FROM people) AND cv.user_b IN (SELECT user_id FROM people)) AS dm_counted,
       (SELECT count(*) FROM conversations cv WHERE cv.type = 'dm'
          AND NOT (cv.user_a IN (SELECT user_id FROM people) AND cv.user_b IN (SELECT user_id FROM people))) AS dm_outside;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     sc AS (SELECT analytics_scrum(inst, NULL, current_date - 29, current_date, NULL, NULL, 'America/Los_Angeles') AS j FROM args)
SELECT (SELECT sum((e->>'todo')::int + (e->>'in_progress')::int + (e->>'done')::int) FROM jsonb_array_elements(j->'by_sprint') e) AS snapshot_tasks,
       (SELECT count(*) FROM tasks tk JOIN user_stories us ON us.id = tk.story_id AND us.archived_at IS NULL
          JOIN projects p ON p.id = tk.project_id JOIN classes c ON c.id = p.class_id, args a
         WHERE c.institution_id = a.inst) AS live_tasks
  FROM sc;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     conv AS (SELECT analytics_conversations(inst, NULL, current_date - 89, current_date, NULL, NULL, 'America/Los_Angeles') AS j FROM args)
SELECT bool_and(extract(isodow FROM (w->>'week_start')::date) = 1) AS weeks_start_on_monday
  FROM conv, jsonb_array_elements(j->'weekly') w;
