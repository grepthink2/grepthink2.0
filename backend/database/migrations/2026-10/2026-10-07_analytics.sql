-- 2026-10-07 — analytics: scope helpers, the live section functions, the nightly rollup and trends
--
-- EXPAND, idempotent, one transaction. Named 07 so it sorts after
-- 2026-10-06_assignment_deadlines_and_events.sql, which it reads (events, classes.institution_id,
-- institutions.timezone). Spec: docs/superpowers/specs/2026-10-05-analytics-dashboard-design.md §6.2, §7.
--
-- Applied: DEV 2026-10-08 (by Claude, via the Supabase connector)   PROD ____-__-__
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
--     analytics_rollup_day(p_day, true) — pg_cron, 09:00 UTC, for yesterday — and backfilled by
--     analytics_rollup_range(p_from, p_to). class_id is a plain uuid, not a foreign key: a deleted
--     class keeps its own history rows (two deleted classes would otherwise collide on the unique
--     key once both were SET NULL), which is what makes long-range trends honest. UNIQUE NULLS NOT
--     DISTINCT needs Postgres 15+: DEV and PROD both run 17 (checked 2026-10-07).
--   * Lockdown (spec D17): EXECUTE on every function for service_role only; analytics_daily has RLS
--     on, no policies and no client privileges. pg_cron runs as postgres.
--   * Indexes: none on existing tables; analytics_daily gets its unique key (analytics_daily_uq) and
--     analytics_daily_inst_day_idx. Message reads start at the earliest bound of the two ranges, which the
--     existing messages_conv_created_id_idx (conversation_id, created_at DESC, id DESC) serves; stories
--     and tasks are read all-time for the medians (hundreds of rows today). Revisit at ~100k messages.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------------ scope helpers ----
-- The classes of one institution (or one class of it). The label is what analytics shows for a
-- class: its name, and its term when it has one. course_code is the join code and never leaves.
CREATE OR REPLACE FUNCTION public.analytics_scope_classes(p_institution uuid, p_class uuid)
RETURNS TABLE (class_id uuid, label text, start_date date, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id,
         c.name || CASE WHEN nullif(btrim(c.term), '') IS NOT NULL THEN ' · ' || btrim(c.term) ELSE '' END,
         c.start_date,
         c.created_at
    FROM classes c
   WHERE c.institution_id = p_institution
     AND (p_class IS NULL OR c.id = p_class);
$$;

-- A team is a project with at least one current member (decision 12). Every section function takes
-- teams from here; the rollup's `teams` metric restates the rule as of each day.
CREATE OR REPLACE FUNCTION public.analytics_scope_teams(p_institution uuid, p_class uuid)
RETURNS TABLE (project_id uuid, class_id uuid, name text, members integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id, p.class_id, p.name, count(DISTINCT pm.user_id)::int
    FROM projects p
    JOIN analytics_scope_classes(p_institution, p_class) s ON s.class_id = p.class_id
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id IS NOT NULL
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
           row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at, sp.id)::int AS ordinal
      FROM sprints sp JOIN teams t ON t.project_id = sp.project_id)
  SELECT tk.project_id, t.class_id, tk.status, coalesce(tk.points, 0), coalesce(so.ordinal, 0)
    FROM tasks tk
    JOIN teams t ON t.project_id = tk.project_id
    JOIN user_stories us ON us.id = tk.story_id AND us.archived_at IS NULL
    LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id;
$$;

-- ------------------------------------------------------------------ scope counts ----
-- Classes, teams (projects with at least one member), students (distinct student enrollments),
-- people of the school who signed in during the last 7 days (NULL until any login event exists; the
-- previous 7-day figure stays NULL until login history covers it, so a launch week never compares
-- against a fabricated 0), and the per-class / per-team rows the breakdown table starts from.
CREATE OR REPLACE FUNCTION public.analytics_scope_counts(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH scope AS (SELECT * FROM analytics_scope_classes(p_institution, p_class)),
  teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  students AS (
    SELECT DISTINCT ce.user_id, ce.class_id
      FROM class_enrollments ce JOIN scope s ON s.class_id = ce.class_id
     WHERE ce.enrollment_role = 'student'),
  school_people AS (
    SELECT DISTINCT ur.user_id
      FROM analytics_user_roles() ur JOIN classes c ON c.id = ur.class_id
     WHERE c.institution_id = p_institution),
  has_logins AS (
    SELECT EXISTS (SELECT 1 FROM events WHERE kind = 'login') AS cur,
           EXISTS (SELECT 1 FROM events WHERE kind = 'login'
                     AND occurred_at < now() - interval '14 days') AS prev),
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
      CASE WHEN (SELECT cur FROM has_logins) THEN (SELECT n FROM active) END,
    'active_users_prev_7d',
      CASE WHEN (SELECT prev FROM has_logins) THEN (SELECT n FROM active_prev) END,
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
  team_msgs AS (                                   -- from the earliest bound of the two ranges, so the
    SELECT m.created_at, ct.class_id, ct.project_id   -- (conversation_id, created_at) index serves it
      FROM messages m JOIN counted_team ct ON ct.id = m.conversation_id, bounds b
     WHERE m.created_at >= least(b.cur_start, coalesce(b.prev_start, b.cur_start))),
  dm_msgs AS (
    SELECT m.created_at
      FROM messages m JOIN counted_dm cd ON cd.id = m.conversation_id, bounds b
     WHERE m.created_at >= least(b.cur_start, coalesce(b.prev_start, b.cur_start))),
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
           row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at, sp.id)::int AS ordinal
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

-- Lockdown for the section functions and helpers; the rollup and trends functions are locked down below.
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

-- ------------------------------------------------------------------ nightly rollup ----
-- One row per (institution, class or NULL, calendar day in the school's zone, metric). Written by
-- analytics_rollup_day(day, true) for yesterday (pg_cron, 09:00 UTC) and by analytics_rollup_range for
-- a backfill (activity metrics only: a board snapshot cannot be reconstructed for a past day). Upserts:
-- re-running the same morning changes nothing; re-running a PAST day with p_snapshot = true would
-- overwrite that day's board snapshot with today's board, so the default is false and the nightly job
-- and the Check pass true for yesterday only. class_id has no foreign key on purpose (header).
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  institution_id uuid        NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  class_id       uuid,
  day            date        NOT NULL,
  metric         text        NOT NULL CHECK (metric ~ '^[a-z][a-z0-9_]{1,39}$'),
  value          numeric     NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_daily_uq UNIQUE NULLS NOT DISTINCT (institution_id, class_id, day, metric)
);
CREATE INDEX IF NOT EXISTS analytics_daily_inst_day_idx ON public.analytics_daily (institution_id, day);
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_daily FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.analytics_daily TO service_role;   -- explicit: analytics_trends is SECURITY INVOKER

CREATE OR REPLACE FUNCTION public.analytics_rollup_day(p_day date, p_snapshot boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  inst      record;
  day_start timestamptz;
  day_end   timestamptz;
  n         integer := 0;
  k         integer;
BEGIN
  FOR inst IN SELECT id, timezone FROM institutions ORDER BY id LOOP
    -- one school's bad zone name must not stop the others (AT TIME ZONE raises on an unknown name)
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = inst.timezone) THEN
      RAISE WARNING 'analytics_rollup_day: institution % has unknown timezone %; skipped', inst.id, inst.timezone;
      CONTINUE;
    END IF;
    day_start := p_day::timestamp AT TIME ZONE inst.timezone;
    day_end   := (p_day + 1)::timestamp AT TIME ZONE inst.timezone;

    -- per class: one row per metric for EVERY class of the school that existed by the end of the day,
    -- zeros included, so weekly averages over the rollup never skip a quiet class
    WITH scope AS (SELECT class_id FROM analytics_scope_classes(inst.id, NULL) WHERE created_at < day_end),
    teams AS (SELECT * FROM analytics_scope_teams(inst.id, NULL)),
    channels AS (
      SELECT cv.id, t.class_id, t.project_id
        FROM conversations cv JOIN teams t ON t.project_id = cv.project_id
       WHERE cv.type = 'team_members'),
    day_msgs AS (
      SELECT ch.class_id, ch.project_id
        FROM messages m JOIN channels ch ON ch.id = m.conversation_id
       WHERE m.created_at >= day_start AND m.created_at < day_end),
    day_stories AS (
      SELECT t.class_id, t.project_id, coalesce(us.points, 0) AS points
        FROM user_stories us JOIN teams t ON t.project_id = us.project_id
       WHERE us.created_at >= day_start AND us.created_at < day_end),
    day_tasks AS (
      SELECT t.class_id, t.project_id, coalesce(tk.points, 0) AS points
        FROM tasks tk JOIN teams t ON t.project_id = tk.project_id
       WHERE tk.created_at >= day_start AND tk.created_at < day_end),
    day_moves AS (
      SELECT t.class_id, t.project_id
        FROM task_moves mv JOIN tasks tk ON tk.id = mv.task_id JOIN teams t ON t.project_id = tk.project_id
       WHERE mv.moved_at >= day_start AND mv.moved_at < day_end),
    day_views AS (                                 -- by project, so the team rule applies like every other metric;
      SELECT DISTINCT t.class_id, e.actor_id, e.project_id   -- one row per person and board a day: a refetch is no visit
        FROM events e JOIN teams t ON t.project_id = e.project_id
       WHERE e.kind = 'board_viewed' AND e.occurred_at >= day_start AND e.occurred_at < day_end),
    active_teams AS (
      SELECT DISTINCT class_id, project_id FROM (
        SELECT class_id, project_id FROM day_msgs
        UNION ALL SELECT class_id, project_id FROM day_stories
        UNION ALL SELECT class_id, project_id FROM day_tasks
        UNION ALL SELECT class_id, project_id FROM day_moves) a),
    live AS (SELECT class_id, status, points FROM analytics_live_tasks(inst.id, NULL)),
    metrics AS (
      SELECT s.class_id, 'team_messages'::text AS metric,
             (SELECT count(*) FROM day_msgs d WHERE d.class_id = s.class_id)::numeric AS value FROM scope s
      UNION ALL SELECT s.class_id, 'stories_created',
             (SELECT count(*) FROM day_stories d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'tasks_created',
             (SELECT count(*) FROM day_tasks d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'story_points_created',
             (SELECT coalesce(sum(points), 0) FROM day_stories d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'task_points_created',
             (SELECT coalesce(sum(points), 0) FROM day_tasks d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'active_teams',
             (SELECT count(*) FROM active_teams a WHERE a.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'board_views',
             (SELECT count(*) FROM day_views v WHERE v.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'teams',          -- as of the day: projects that existed by then with a
             (SELECT count(*) FROM projects p         -- current member who had joined by then (membership
               WHERE p.class_id = s.class_id          -- history is not kept, decision 12, so this is the
                 AND p.created_at < day_end           -- closest honest figure for a backfilled day)
                 AND EXISTS (SELECT 1 FROM project_members pm
                              WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL
                                AND pm.created_at < day_end)) FROM scope s
      UNION ALL
      SELECT s.class_id, m.metric, m.value
        FROM scope s
        CROSS JOIN LATERAL (
          SELECT 'tasks_todo'::text AS metric, count(*) FILTER (WHERE status = 'todo')::numeric AS value
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'tasks_in_progress', count(*) FILTER (WHERE status = 'in_progress')
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'tasks_done', count(*) FILTER (WHERE status = 'done')
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'points_todo', coalesce(sum(points) FILTER (WHERE status = 'todo'), 0)
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'points_in_progress', coalesce(sum(points) FILTER (WHERE status = 'in_progress'), 0)
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'points_done', coalesce(sum(points) FILTER (WHERE status = 'done'), 0)
            FROM live l WHERE l.class_id = s.class_id) m
       WHERE p_snapshot)
    INSERT INTO analytics_daily (institution_id, class_id, day, metric, value)
    SELECT inst.id, class_id, p_day, metric, value FROM metrics
    ON CONFLICT (institution_id, class_id, day, metric)
    DO UPDATE SET value = EXCLUDED.value, computed_at = now();
    GET DIAGNOSTICS k = ROW_COUNT;
    n := n + k;

    -- per institution (class_id NULL): direct messages that count for the school (the rule is
    -- analytics_counted_dm's) and the distinct people of the school who signed in that day
    WITH school_people AS (
      SELECT DISTINCT ur.user_id FROM analytics_user_roles() ur JOIN classes c ON c.id = ur.class_id
       WHERE c.institution_id = inst.id),
    counted_dm AS (SELECT conversation_id AS id FROM analytics_counted_dm(inst.id)),
    metrics AS (
      SELECT 'dm_messages'::text AS metric,
             (SELECT count(*) FROM messages m JOIN counted_dm cd ON cd.id = m.conversation_id
               WHERE m.created_at >= day_start AND m.created_at < day_end)::numeric AS value
      UNION ALL
      SELECT 'active_users',
             (SELECT count(DISTINCT e.actor_id) FROM events e JOIN school_people sp ON sp.user_id = e.actor_id
               WHERE e.kind = 'login' AND e.occurred_at >= day_start AND e.occurred_at < day_end))
    INSERT INTO analytics_daily (institution_id, class_id, day, metric, value)
    SELECT inst.id, NULL, p_day, metric, value FROM metrics
    ON CONFLICT (institution_id, class_id, day, metric)
    DO UPDATE SET value = EXCLUDED.value, computed_at = now();
    GET DIAGNOSTICS k = ROW_COUNT;
    n := n + k;
  END LOOP;
  RETURN n;
END;
$$;

-- Backfill of activity metrics for a closed range; snapshots are skipped (they start at go-live).
CREATE OR REPLACE FUNCTION public.analytics_rollup_range(p_from date, p_to date)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d date;
  n integer := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'analytics_rollup_range: bad range % .. %', p_from, p_to;
  END IF;
  FOR d IN SELECT generate_series(p_from, p_to, interval '1 day')::date LOOP
    n := n + analytics_rollup_day(d, false);
  END LOOP;
  RETURN n;
END;
$$;

-- ------------------------------------------------------------------ trends (from the rollup) ----
-- Weekly rows the backend turns into the Trends panels and the tile sparklines: team messages,
-- tasks created, the week's last points_done snapshot and the week's average team count, summed over
-- the class rows in scope (every class the school ever had, deleted ones included, or the selected
-- class); dm_messages from the institution rows, on days with or without class rows. Weeks start on
-- Monday (days are already calendar days in the school's zone). Covers whole weeks from the Monday of
-- least(p_prev_from, as_of - 84 days, p_to - 84 days) to p_to, so the previous range and a 12-week sparkline both fit
-- and the first bucket is never a partial week.
CREATE OR REPLACE FUNCTION public.analytics_trends(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH as_of AS (SELECT max(day) AS d FROM analytics_daily WHERE institution_id = p_institution),
  lo AS (SELECT date_trunc('week', least(coalesce(p_prev_from, p_from),
                                        coalesce((SELECT d FROM as_of), p_from) - 84,
                                        p_to - 84)::timestamp)::date AS d),
  -- class rows of every class the school ever had (a deleted class keeps its rows: that is the point
  -- of the rollup), or of the one selected class
  class_rows AS (
    SELECT ad.day, ad.metric, ad.value
      FROM analytics_daily ad
     WHERE ad.institution_id = p_institution AND ad.class_id IS NOT NULL
       AND (p_class IS NULL OR ad.class_id = p_class)
       AND ad.day >= (SELECT d FROM lo) AND ad.day <= p_to),
  inst_rows AS (
    SELECT ad.day, ad.metric, ad.value
      FROM analytics_daily ad
     WHERE ad.institution_id = p_institution AND ad.class_id IS NULL
       AND ad.day >= (SELECT d FROM lo) AND ad.day <= p_to),
  daily_class AS (
    SELECT day,
           sum(value) FILTER (WHERE metric = 'team_messages') AS team_messages,
           sum(value) FILTER (WHERE metric = 'tasks_created') AS tasks_created,
           sum(value) FILTER (WHERE metric = 'points_done')   AS points_done,
           sum(value) FILTER (WHERE metric = 'teams')         AS teams
      FROM class_rows GROUP BY day),
  daily_inst AS (
    SELECT day, sum(value) FILTER (WHERE metric = 'dm_messages') AS dm_messages
      FROM inst_rows GROUP BY day),
  daily AS (                                      -- a day with DMs but no class rows still counts
    SELECT coalesce(c.day, i.day) AS day, c.team_messages, c.tasks_created, c.points_done, c.teams, i.dm_messages
      FROM daily_class c FULL OUTER JOIN daily_inst i ON i.day = c.day),
  weekly AS (
    SELECT date_trunc('week', d.day::timestamp)::date AS week_start,
           coalesce(sum(d.team_messages), 0) AS team_messages,
           coalesce(sum(d.tasks_created), 0) AS tasks_created,
           (array_agg(d.points_done ORDER BY d.day DESC) FILTER (WHERE d.points_done IS NOT NULL))[1] AS points_done,
           avg(d.teams) AS teams,
           coalesce(sum(d.dm_messages), 0) AS dm_messages
      FROM daily d
     GROUP BY 1)
  SELECT jsonb_build_object(
    'as_of', (SELECT d FROM as_of),
    'weekly', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'week_start', week_start, 'team_messages', team_messages, 'tasks_created', tasks_created,
                'points_done', points_done, 'teams', teams, 'dm_messages', dm_messages)
                ORDER BY week_start) FROM weekly), '[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.analytics_rollup_day(date, boolean)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_rollup_range(date, date)                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_trends(uuid, uuid, date, date, date, date, text)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_rollup_day(date, boolean)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_rollup_range(date, date)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_trends(uuid, uuid, date, date, date, date, text)     TO service_role;

COMMIT;

-- ======================================================================= CHECK (part 1) ====
-- Run on DEV and PROD after applying. `ucsc` is the seeded slug, looked up
-- inline. Every query names its expectation:
--   fn_count = 11 (four section functions, five helpers, two rollup functions)
--   client_execute = 0 rows (no anon/authenticated EXECUTE on any analytics_% function)
--   service_role_execute = fn_count (service_role may execute every analytics_% function)
--   classes_match = t, teams_match = t, active_rule = t (scope counts agree with their own rows; the
--          active-user figure is NULL exactly when no login event exists)
--   team_match = t, dm_match = t, weekly_match = t, team_match_all_time = t (the function's team and DM
--          message totals equal direct counts, the weekly rows sum to them, and an all-time range
--          exercises real rows even when the last 30 days are quiet)
--   dm_rule = t (analytics_counted_dm returns exactly the DM conversations a direct restatement counts)
--   prev_null = t (with NULL previous bounds every prev_* key is JSON null)
--   snapshot_match = t, created_match = t, overall_rows ≤ 2 (by_sprint sums to the live task count,
--          stories_created equals a direct count, one all-sprints median per entity)
--   mondays = t (every weekly.week_start over 90 days is a Monday; vacuously true on no data)
SELECT count(*) AS fn_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'analytics\_%';
SELECT p.proname, r.rolname AS client_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
 WHERE n.nspname = 'public' AND p.proname LIKE 'analytics\_%'
   AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
SELECT count(*) AS service_role_execute FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'analytics\_%'
   AND has_function_privilege('service_role', p.oid, 'EXECUTE');
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst, 'America/Los_Angeles'::text AS tz),
     sc AS (SELECT analytics_scope_counts(inst, NULL, current_date - 29, current_date,
                                         current_date - 59, current_date - 30, tz) AS j FROM args)
SELECT (j->>'classes')::int = jsonb_array_length(j->'by_class') AS classes_match,
       (j->>'teams')::int = coalesce((SELECT sum((c->>'teams')::int) FROM jsonb_array_elements(j->'by_class') c), 0) AS teams_match,
       (j->'active_users_7d' = 'null'::jsonb) = NOT EXISTS (SELECT 1 FROM events WHERE kind = 'login') AS active_rule
  FROM sc;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst,
                     current_date - 29 AS d0, current_date AS d1, 'America/Los_Angeles'::text AS tz),
     conv AS (SELECT analytics_conversations(inst, NULL, d0, d1, d0 - 30, d0 - 1, tz) AS j FROM args),
     conv_all AS (SELECT analytics_conversations(inst, NULL, '2000-01-01', d1, NULL, NULL, tz) AS j FROM args),
     team_direct AS (
       SELECT m.created_at
         FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
         JOIN projects p ON p.id = cv.project_id JOIN classes c ON c.id = p.class_id, args a
        WHERE cv.type = 'team_members' AND c.institution_id = a.inst
          AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)),
     dm_direct AS (
       SELECT m.created_at
         FROM messages m JOIN analytics_counted_dm((SELECT inst FROM args)) cd ON cd.conversation_id = m.conversation_id)
SELECT (SELECT (j->>'team_members')::int FROM conv)
         = (SELECT count(*) FROM team_direct t, args a
             WHERE t.created_at >= (a.d0::timestamp AT TIME ZONE a.tz)
               AND t.created_at <  ((a.d1 + 1)::timestamp AT TIME ZONE a.tz)) AS team_match,
       (SELECT (j->>'dm')::int FROM conv)
         = (SELECT count(*) FROM dm_direct d, args a
             WHERE d.created_at >= (a.d0::timestamp AT TIME ZONE a.tz)
               AND d.created_at <  ((a.d1 + 1)::timestamp AT TIME ZONE a.tz)) AS dm_match,
       (SELECT (j->>'team_members')::int = coalesce((SELECT sum((w->>'team_members')::int) FROM jsonb_array_elements(j->'weekly') w), 0)
           AND (j->>'dm')::int = coalesce((SELECT sum((w->>'dm')::int) FROM jsonb_array_elements(j->'weekly') w), 0)
          FROM conv) AS weekly_match,
       (SELECT (j->>'team_members')::int FROM conv_all) = (SELECT count(*) FROM team_direct) AS team_match_all_time;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     ur AS (SELECT ce.user_id, ce.class_id, ce.enrollment_role AS role FROM class_enrollments ce
            UNION ALL SELECT c.created_by, c.id, 'instructor' FROM classes c),
     people AS (SELECT DISTINCT ur.user_id FROM ur JOIN classes c ON c.id = ur.class_id, args a WHERE c.institution_id = a.inst),
     excluded AS (SELECT DISTINCT cv.id FROM conversations cv JOIN ur a ON a.user_id = cv.user_a
                    JOIN ur b ON b.user_id = cv.user_b AND b.class_id = a.class_id
                   WHERE cv.type = 'dm' AND ((a.role IN ('instructor', 'ta') AND b.role = 'student')
                                          OR (b.role IN ('instructor', 'ta') AND a.role = 'student'))),
     direct AS (SELECT cv.id FROM conversations cv
                 WHERE cv.type = 'dm' AND cv.id NOT IN (SELECT id FROM excluded)
                   AND cv.user_a IN (SELECT user_id FROM people) AND cv.user_b IN (SELECT user_id FROM people)),
     fn AS (SELECT conversation_id AS id FROM analytics_counted_dm((SELECT inst FROM args)))
SELECT (SELECT count(*) FROM fn) = (SELECT count(*) FROM direct)
       AND NOT EXISTS (SELECT 1 FROM fn WHERE fn.id NOT IN (SELECT id FROM direct)) AS dm_rule;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     c AS (SELECT analytics_conversations(inst, NULL, current_date - 29, current_date, NULL, NULL, 'America/Los_Angeles') AS j FROM args),
     s AS (SELECT analytics_scrum(inst, NULL, current_date - 29, current_date, NULL, NULL, 'America/Los_Angeles') AS j FROM args)
SELECT (SELECT j->'prev_team_members' = 'null'::jsonb AND j->'prev_dm' = 'null'::jsonb FROM c)
   AND (SELECT j->'prev_stories_created' = 'null'::jsonb AND j->'prev_tasks_created' = 'null'::jsonb
          AND j->'prev_story_points_created' = 'null'::jsonb AND j->'prev_task_points_created' = 'null'::jsonb FROM s) AS prev_null;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst,
                     current_date - 29 AS d0, current_date AS d1, 'America/Los_Angeles'::text AS tz),
     sc AS (SELECT analytics_scrum(inst, NULL, d0, d1, NULL, NULL, tz) AS j FROM args)
SELECT coalesce((SELECT sum((e->>'todo')::int + (e->>'in_progress')::int + (e->>'done')::int)
                   FROM jsonb_array_elements(j->'by_sprint') e), 0)
         = (SELECT count(*) FROM tasks tk JOIN user_stories us ON us.id = tk.story_id AND us.archived_at IS NULL
              JOIN projects p ON p.id = tk.project_id JOIN classes c ON c.id = p.class_id, args a
             WHERE c.institution_id = a.inst
               AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)) AS snapshot_match,
       (j->>'stories_created')::int
         = (SELECT count(*) FROM user_stories us JOIN projects p ON p.id = us.project_id JOIN classes c ON c.id = p.class_id, args a
             WHERE c.institution_id = a.inst
               AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)
               AND us.created_at >= (a.d0::timestamp AT TIME ZONE a.tz)
               AND us.created_at <  ((a.d1 + 1)::timestamp AT TIME ZONE a.tz)) AS created_match,
       (SELECT count(*) FROM jsonb_array_elements(j->'chars') ch WHERE ch->'ordinal' = 'null'::jsonb) AS overall_rows
  FROM sc;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     conv AS (SELECT analytics_conversations(inst, NULL, current_date - 89, current_date, NULL, NULL, 'America/Los_Angeles') AS j FROM args)
SELECT coalesce(bool_and(extract(isodow FROM (w->>'week_start')::date) = 1), true) AS mondays
  FROM conv, jsonb_array_elements(j->'weekly') w;

-- ======================================================================= CHECK (part 2) ====
-- Expected: fn_count above = 11; daily_rls = t; anon_select = f, auth_select = f, service_select = t;
--   first_run_rows_ok = t (yesterday's run writes 14 rows per class that existed and 2 per school),
--   second_run_same = t (a re-run writes the same number), backfill_rows_ok = t (a backfill day writes
--   the 8 activity rows per class, no snapshot); team_day_match = t and dm_day_match = t (yesterday's
--   summed team_messages and the school's dm_messages equal direct counts over the school-zone day); views_day_match = t
--   (yesterday's summed board_views equals the distinct person-board pairs among the day's board_viewed events);
--   quiet_class_rows ≥ 0 (classes with no team messages yesterday still have a row with value 0);
--   weeks > 0 after one rollup and weeks_start_on_monday = t (vacuously true on no data);
--   prev_bound_match = t (with a previous range set, the previous team and DM totals equal direct counts
--   over the previous bounds — pins the message CTEs' lower bound); prev_active_rule = t
--   (active_users_prev_7d is NULL exactly when no login event is older than 14 days).
SELECT relrowsecurity AS daily_rls FROM pg_class WHERE oid = 'public.analytics_daily'::regclass;
SELECT has_table_privilege('anon', 'public.analytics_daily', 'SELECT')          AS anon_select,
       has_table_privilege('authenticated', 'public.analytics_daily', 'SELECT') AS auth_select,
       has_table_privilege('service_role', 'public.analytics_daily', 'SELECT')  AS service_select;
WITH k AS (
  SELECT (SELECT count(*) FROM classes c JOIN institutions i ON i.id = c.institution_id
           WHERE c.created_at < (current_date::timestamp AT TIME ZONE i.timezone))        AS cls_yesterday,
         (SELECT count(*) FROM classes c JOIN institutions i ON i.id = c.institution_id
           WHERE c.created_at < ((current_date - 1)::timestamp AT TIME ZONE i.timezone))  AS cls_day_before,
         (SELECT count(*) FROM institutions WHERE timezone IN (SELECT name FROM pg_timezone_names)) AS sch)
SELECT analytics_rollup_day(current_date - 1, true)  = 14 * cls_yesterday  + 2 * sch AS first_run_rows_ok,
       analytics_rollup_day(current_date - 1, true)  = 14 * cls_yesterday  + 2 * sch AS second_run_same,
       analytics_rollup_day(current_date - 2, false) =  8 * cls_day_before + 2 * sch AS backfill_rows_ok
  FROM k;
WITH args AS (SELECT i.id AS inst, ((current_date - 1)::timestamp AT TIME ZONE i.timezone) AS d0,
                     (current_date::timestamp AT TIME ZONE i.timezone) AS d1
                FROM institutions i WHERE i.slug = 'ucsc')
SELECT (SELECT coalesce(sum(value), 0) FROM analytics_daily ad, args a
         WHERE ad.institution_id = a.inst AND ad.day = current_date - 1 AND ad.metric = 'team_messages')
         = (SELECT count(*) FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
              JOIN projects p ON p.id = cv.project_id JOIN classes c ON c.id = p.class_id, args a
             WHERE cv.type = 'team_members' AND c.institution_id = a.inst
               AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)
               AND m.created_at >= a.d0 AND m.created_at < a.d1) AS team_day_match,
       (SELECT coalesce(sum(value), 0) FROM analytics_daily ad, args a
         WHERE ad.institution_id = a.inst AND ad.day = current_date - 1 AND ad.class_id IS NULL AND ad.metric = 'dm_messages')
         = (SELECT count(*) FROM messages m
              JOIN analytics_counted_dm((SELECT inst FROM args)) cd ON cd.conversation_id = m.conversation_id, args a
             WHERE m.created_at >= a.d0 AND m.created_at < a.d1) AS dm_day_match,
       (SELECT coalesce(sum(value), 0) FROM analytics_daily ad, args a
         WHERE ad.institution_id = a.inst AND ad.day = current_date - 1 AND ad.metric = 'board_views')
         = (SELECT count(*) FROM (
              SELECT DISTINCT e.actor_id, e.project_id
                FROM events e JOIN projects p ON p.id = e.project_id JOIN classes c ON c.id = p.class_id, args a
               WHERE e.kind = 'board_viewed' AND c.institution_id = a.inst
                 AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)
                 AND e.occurred_at >= a.d0 AND e.occurred_at < a.d1) v) AS views_day_match;
SELECT count(*) AS quiet_class_rows FROM analytics_daily
 WHERE day = current_date - 1 AND metric = 'team_messages' AND value = 0;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst),
     tr AS (SELECT analytics_trends(inst, NULL, current_date - 29, current_date, current_date - 59, current_date - 30,
                                    'America/Los_Angeles') AS j FROM args)
SELECT j->>'as_of' AS as_of, jsonb_array_length(j->'weekly') AS weeks,
       coalesce((SELECT bool_and(extract(isodow FROM (w->>'week_start')::date) = 1)
                   FROM jsonb_array_elements(j->'weekly') w), true) AS weeks_start_on_monday
  FROM tr;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst,
                     current_date - 29 AS d0, current_date AS d1, 'America/Los_Angeles'::text AS tz),
     conv AS (SELECT analytics_conversations(inst, NULL, d0, d1, d0 - 30, d0 - 1, tz) AS j FROM args),
     team_direct AS (
       SELECT m.created_at
         FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
         JOIN projects p ON p.id = cv.project_id JOIN classes c ON c.id = p.class_id, args a
        WHERE cv.type = 'team_members' AND c.institution_id = a.inst
          AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)),
     dm_direct AS (
       SELECT m.created_at
         FROM messages m JOIN analytics_counted_dm((SELECT inst FROM args)) cd ON cd.conversation_id = m.conversation_id)
SELECT (SELECT (j->>'prev_team_members')::int FROM conv)
         = (SELECT count(*) FROM team_direct t, args a
             WHERE t.created_at >= ((a.d0 - 30)::timestamp AT TIME ZONE a.tz)
               AND t.created_at <  (a.d0::timestamp AT TIME ZONE a.tz))
   AND (SELECT (j->>'prev_dm')::int FROM conv)
         = (SELECT count(*) FROM dm_direct d, args a
             WHERE d.created_at >= ((a.d0 - 30)::timestamp AT TIME ZONE a.tz)
               AND d.created_at <  (a.d0::timestamp AT TIME ZONE a.tz)) AS prev_bound_match;
WITH args AS (SELECT (SELECT id FROM institutions WHERE slug = 'ucsc') AS inst, 'America/Los_Angeles'::text AS tz),
     sc AS (SELECT analytics_scope_counts(inst, NULL, current_date - 29, current_date,
                                         current_date - 59, current_date - 30, tz) AS j FROM args)
SELECT (j->'active_users_prev_7d' = 'null'::jsonb)
         = NOT EXISTS (SELECT 1 FROM events WHERE kind = 'login' AND occurred_at < now() - interval '14 days') AS prev_active_rule
  FROM sc;

-- Undo. Run the cron file's Undo FIRST (or the nightly job fails on a missing function). The backend
-- answers 200 with every section in failures[] while the functions are missing. DROP TABLE destroys the
-- board-snapshot history, which cannot be rebuilt — export analytics_daily before dropping it.
--   DROP FUNCTION IF EXISTS public.analytics_trends(uuid, uuid, date, date, date, date, text);
--   DROP FUNCTION IF EXISTS public.analytics_rollup_range(date, date);
--   DROP FUNCTION IF EXISTS public.analytics_rollup_day(date, boolean);
--   DROP TABLE IF EXISTS public.analytics_daily;
--   DROP FUNCTION IF EXISTS public.analytics_scrum(uuid, uuid, date, date, date, date, text);
--   DROP FUNCTION IF EXISTS public.analytics_conversations(uuid, uuid, date, date, date, date, text);
--   DROP FUNCTION IF EXISTS public.analytics_scope_counts(uuid, uuid, date, date, date, date, text);
--   DROP FUNCTION IF EXISTS public.analytics_live_tasks(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.analytics_counted_dm(uuid);
--   DROP FUNCTION IF EXISTS public.analytics_user_roles();
--   DROP FUNCTION IF EXISTS public.analytics_scope_teams(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.analytics_scope_classes(uuid, uuid);
