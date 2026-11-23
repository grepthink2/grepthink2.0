


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_conversations"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_conversations"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_counted_dm"("p_institution" "uuid") RETURNS TABLE("conversation_id" "uuid")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_counted_dm"("p_institution" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_live_tasks"("p_institution" "uuid", "p_class" "uuid") RETURNS TABLE("project_id" "uuid", "class_id" "uuid", "status" "text", "points" integer, "ordinal" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_live_tasks"("p_institution" "uuid", "p_class" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_rollup_day"("p_day" "date", "p_snapshot" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_rollup_day"("p_day" "date", "p_snapshot" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_rollup_range"("p_from" "date", "p_to" "date") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_rollup_range"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_scope_classes"("p_institution" "uuid", "p_class" "uuid") RETURNS TABLE("class_id" "uuid", "label" "text", "start_date" "date", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT c.id,
         c.name || CASE WHEN nullif(btrim(c.term), '') IS NOT NULL THEN ' · ' || btrim(c.term) ELSE '' END,
         c.start_date,
         c.created_at
    FROM classes c
   WHERE c.institution_id = p_institution
     AND (p_class IS NULL OR c.id = p_class);
$$;


ALTER FUNCTION "public"."analytics_scope_classes"("p_institution" "uuid", "p_class" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_scope_counts"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_scope_counts"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_scope_teams"("p_institution" "uuid", "p_class" "uuid") RETURNS TABLE("project_id" "uuid", "class_id" "uuid", "name" "text", "members" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.class_id, p.name, count(DISTINCT pm.user_id)::int
    FROM projects p
    JOIN analytics_scope_classes(p_institution, p_class) s ON s.class_id = p.class_id
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id IS NOT NULL
   GROUP BY p.id, p.class_id, p.name;
$$;


ALTER FUNCTION "public"."analytics_scope_teams"("p_institution" "uuid", "p_class" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_scrum"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."analytics_scrum"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_trends"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH as_of AS (SELECT max(day) AS d FROM analytics_daily WHERE institution_id = p_institution),
  lo AS (SELECT date_trunc('week', least(coalesce(p_prev_from, p_from),
                                        coalesce((SELECT d FROM as_of), p_from) - 84,
                                        p_to - 84)::timestamp)::date AS d),
  -- class rows of every class the school ever had (a deleted class keeps its rows: that is the point
  -- of the rollup), or of the one selected class
  class_rows AS (
    SELECT ad.class_id, ad.day, ad.metric, ad.value
      FROM analytics_daily ad
     WHERE ad.institution_id = p_institution AND ad.class_id IS NOT NULL
       AND (p_class IS NULL OR ad.class_id = p_class)
       AND ad.day >= (SELECT d FROM lo) AND ad.day <= p_to),
  inst_rows AS (
    SELECT ad.day, ad.metric, ad.value
      FROM analytics_daily ad
     WHERE ad.institution_id = p_institution AND ad.class_id IS NULL
       AND ad.day >= (SELECT d FROM lo) AND ad.day <= p_to),
  class_day AS (                                  -- one row per class and rolled-up day
    SELECT class_id, day,
           sum(value) FILTER (WHERE metric = 'team_messages') AS team_messages,
           sum(value) FILTER (WHERE metric = 'tasks_created') AS tasks_created,
           sum(value) FILTER (WHERE metric = 'points_done')   AS points_done,
           sum(value) FILTER (WHERE metric = 'teams')         AS teams,
           sum(value) FILTER (WHERE metric IN ('team_messages', 'tasks_created', 'stories_created', 'active_teams')) AS activity
      FROM class_rows GROUP BY class_id, day),
  in_session AS (                                 -- whole weeks: the week of a class's first day with activity
    SELECT class_id,                              -- to the week of its last one
           date_trunc('week', min(day)::timestamp)::date AS first_week,
           date_trunc('week', max(day)::timestamp)::date AS last_week
      FROM class_day WHERE activity > 0 GROUP BY class_id),
  daily_class AS (                                -- teams and board points only from the classes in session
    SELECT cd.day,
           sum(cd.team_messages) AS team_messages,
           sum(cd.tasks_created) AS tasks_created,
           sum(cd.points_done) FILTER (WHERE s.class_id IS NOT NULL) AS points_done,
           sum(cd.teams)       FILTER (WHERE s.class_id IS NOT NULL) AS teams
      FROM class_day cd
      LEFT JOIN in_session s ON s.class_id = cd.class_id
                            AND date_trunc('week', cd.day::timestamp)::date BETWEEN s.first_week AND s.last_week
     GROUP BY cd.day),
  daily_inst AS (
    SELECT day, sum(value) FILTER (WHERE metric = 'dm_messages') AS dm_messages
      FROM inst_rows GROUP BY day),
  daily AS (                                      -- a day with DMs but no class rows still counts
    SELECT coalesce(c.day, i.day) AS day, c.team_messages, c.tasks_created, c.points_done, c.teams, i.dm_messages
      FROM daily_class c FULL OUTER JOIN daily_inst i ON i.day = c.day),
  weekly AS (
    SELECT date_trunc('week', d.day::timestamp)::date AS week_start,
           count(DISTINCT d.day) AS days,
           coalesce(sum(d.team_messages), 0) AS team_messages,
           coalesce(sum(d.tasks_created), 0) AS tasks_created,
           (array_agg(d.points_done ORDER BY d.day DESC) FILTER (WHERE d.points_done IS NOT NULL))[1] AS points_done,
           avg(d.teams) AS teams,                 -- over the days with a class in session; NULL without one
           coalesce(sum(d.dm_messages), 0) AS dm_messages
      FROM daily d
     GROUP BY 1)
  SELECT jsonb_build_object(
    'as_of', (SELECT d FROM as_of),
    'weekly', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'week_start', week_start, 'days', days, 'team_messages', team_messages,
                'tasks_created', tasks_created, 'points_done', points_done, 'teams', teams,
                'dm_messages', dm_messages)
                ORDER BY week_start) FROM weekly), '[]'::jsonb));
$$;


ALTER FUNCTION "public"."analytics_trends"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_user_roles"() RETURNS TABLE("user_id" "uuid", "class_id" "uuid", "role" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT ce.user_id, ce.class_id, ce.enrollment_role FROM class_enrollments ce
  UNION ALL
  SELECT c.created_by, c.id, 'instructor' FROM classes c;
$$;


ALTER FUNCTION "public"."analytics_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."book_final_review_slot"("p_slot" "uuid", "p_project" "uuid", "p_actor" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_starts_at timestamptz;
  v_holder    uuid;
  v_freed     integer;
BEGIN
  -- Lock order: the project row before any slot row, as a project delete does (no deadlock).
  PERFORM 1 FROM projects WHERE id = p_project FOR KEY SHARE;

  SELECT s.starts_at, s.project_id
    INTO v_starts_at, v_holder
    FROM final_review_slots s
    JOIN projects p ON p.id = p_project AND p.class_id = s.class_id
   WHERE s.id = p_slot
     FOR UPDATE OF s;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_holder = p_project THEN
    RETURN 'booked';
  END IF;
  IF v_holder IS NOT NULL THEN
    RETURN 'slot_taken';
  END IF;

  -- Free the team's other slot first: while that row still names the team,
  -- final_review_slots_project_uniq would refuse the claim below.
  UPDATE final_review_slots
     SET project_id = NULL, booked_by = NULL, booked_at = NULL
   WHERE project_id = p_project;
  GET DIAGNOSTICS v_freed = ROW_COUNT;

  UPDATE final_review_slots
     SET project_id = p_project, booked_by = p_actor, booked_at = now()
   WHERE id = p_slot;

  UPDATE projects SET final_review_at = v_starts_at WHERE id = p_project;

  IF v_freed = 0 THEN
    RETURN 'booked';
  END IF;
  DELETE FROM project_review_tas WHERE project_id = p_project;
  RETURN 'moved';
END;
$$;


ALTER FUNCTION "public"."book_final_review_slot"("p_slot" "uuid", "p_project" "uuid", "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_conversation_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE conversations
       SET last_message_at = NEW.created_at
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_conversation_last_message"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "to_email" "text" NOT NULL,
    "user_id" "uuid",
    "class_id" "uuid",
    "batch_id" "uuid",
    "created_by" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "dedupe_key" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_until" timestamp with time zone,
    "last_error" "text",
    "provider_reference_id" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text", 'bounced'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."email_outbox" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_email_outbox"("p_limit" integer DEFAULT 10, "p_lease_seconds" integer DEFAULT 120) RETURNS SETOF "public"."email_outbox"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.email_outbox o
     SET status       = 'sending',
         attempts     = o.attempts + 1,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         updated_at   = now()
   WHERE o.id IN (
     SELECT id
       FROM public.email_outbox
      WHERE (status = 'pending' AND next_attempt_at <= now())
         OR (status = 'sending' AND locked_until < now())
      ORDER BY next_attempt_at
      LIMIT greatest(p_limit, 0)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
$$;


ALTER FUNCTION "public"."claim_email_outbox"("p_limit" integer, "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  claims jsonb;
  v_user_id uuid;
  v_user_role text;
  meta_role text;
begin
  -- Access user id
  v_user_id := (event ->> 'user_id')::uuid;
  -- Ensure we have a claims object
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- First try to find role in provided claims (user_metadata or app_metadata)
  meta_role := null;
  if jsonb_typeof(claims->'user_metadata') = 'object' then
    meta_role := (claims->'user_metadata')->> 'role';
  end if;
  if meta_role is null or meta_role = '' then
    if jsonb_typeof(claims->'app_metadata') = 'object' then
      meta_role := (claims->'app_metadata')->> 'role';
    end if;
  end if;

  -- If no role in metadata, fall back to profiles table lookup (if we have user id)
  if (meta_role is null or meta_role = '') and v_user_id is not null then
    select role into v_user_role
    from public.profiles
    where id = v_user_id
    limit 1;
  else
    v_user_role := meta_role;
  end if;

  -- Keep the Postgres mapped role as 'authenticated' (so DB mapping unchanged)
  claims := jsonb_set(claims, '{role}', to_jsonb('authenticated'::text), true);

  -- Add user_role claim (explicit null if not found)
  if v_user_role is not null and v_user_role <> '' then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(v_user_role), true);
  else
    claims := jsonb_set(claims, '{app_role}', 'null'::jsonb, true);
  end if;

  -- Update event and return
  event := jsonb_set(event, '{claims}', claims, true);
  return event;
end;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."document_create"("p_project_id" "uuid", "p_kind" "text", "p_sprint_id" "uuid", "p_body" "jsonb", "p_user" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_sprint_id IS NOT NULL THEN
    PERFORM 1 FROM sprints s WHERE s.id = p_sprint_id AND s.project_id = p_project_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sprint not found' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  INSERT INTO project_documents (project_id, kind, sprint_id, head_revision, created_by)
  VALUES (p_project_id, p_kind, p_sprint_id, 1, p_user)
  RETURNING id INTO v_id;
  INSERT INTO project_document_revisions (document_id, number, body, source, saved_by)
  VALUES (v_id, 1, p_body, 'seed', p_user);
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."document_create"("p_project_id" "uuid", "p_kind" "text", "p_sprint_id" "uuid", "p_body" "jsonb", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."document_finalize"("p_document_id" "uuid", "p_revision" integer, "p_snapshot" "jsonb", "p_user" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_head integer;
  v_finalized integer;
BEGIN
  SELECT d.head_revision, d.finalized_revision INTO v_head, v_finalized
    FROM project_documents d
   WHERE d.id = p_document_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_head IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION 'document changed' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_finalized IS NOT DISTINCT FROM p_revision THEN
    RETURN NULL;
  END IF;
  UPDATE project_document_revisions r
     SET snapshot = p_snapshot, finalized_at = now(), finalized_by = p_user
   WHERE r.document_id = p_document_id AND r.number = p_revision;
  UPDATE project_documents d
     SET status = 'final', finalized_revision = p_revision, finalized_at = now(), finalized_by = p_user,
         updated_at = now()
   WHERE d.id = p_document_id;
  RETURN p_revision;
END;
$$;


ALTER FUNCTION "public"."document_finalize"("p_document_id" "uuid", "p_revision" integer, "p_snapshot" "jsonb", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."document_save"("p_document_id" "uuid", "p_body" "jsonb", "p_user" "uuid", "p_source" "text", "p_base" integer) RETURNS TABLE("number" integer, "overwrote_number" integer, "overwrote_by" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_head integer;
  v_head_by uuid;
BEGIN
  SELECT d.head_revision INTO v_head
    FROM project_documents d
   WHERE d.id = p_document_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT r.saved_by INTO v_head_by
    FROM project_document_revisions r
   WHERE r.document_id = p_document_id AND r.number = v_head;
  INSERT INTO project_document_revisions (document_id, number, body, source, saved_by)
  VALUES (p_document_id, v_head + 1, p_body, p_source, p_user);
  UPDATE project_documents d
     SET head_revision = v_head + 1, updated_at = now()
   WHERE d.id = p_document_id;
  number := v_head + 1;
  IF p_base IS NOT NULL AND p_base <> v_head THEN
    overwrote_number := v_head;
    overwrote_by := v_head_by;
  END IF;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."document_save"("p_document_id" "uuid", "p_body" "jsonb", "p_user" "uuid", "p_source" "text", "p_base" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _role text;
BEGIN
  _role := new.raw_user_meta_data->>'role';
  IF _role IS NULL OR _role NOT IN ('student', 'instructor') THEN
    _role := NULL;  -- chosen by the user on /select
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, _role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_inbox"("p_user" "uuid") RETURNS TABLE("id" "uuid", "type" "text", "project_id" "uuid", "team_name" "text", "created_at" timestamp with time zone, "last_message_at" timestamp with time zone, "unread_count" bigint, "my_last_read_at" timestamp with time zone, "last_message" "jsonb", "participants" "jsonb", "can_send" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
WITH my_convs AS (
  SELECT c.*
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.user_id = p_user
    LEFT JOIN conversation_deletes cd
      ON cd.conversation_id = c.id AND cd.user_id = p_user
   WHERE (cd.deleted_at IS NULL OR c.last_message_at > cd.deleted_at)
),
my_classes AS (
  SELECT class_id FROM class_enrollments WHERE user_id = p_user
  UNION
  SELECT id FROM classes WHERE created_by = p_user
)
SELECT
  c.id, c.type, c.project_id, p.name AS team_name,
  c.created_at, c.last_message_at,
  COALESCE(un.cnt, 0) AS unread_count,
  r.last_read_at AS my_last_read_at,
  lm.msg AS last_message,
  parts.arr AS participants,
  -- NOTE: mirrors can_message() in backend/app/messages/controller.py (the two share a
  -- class, nothing else) — that function is the authoritative send-time check; keep the
  -- two in sync.
  CASE
    WHEN c.type <> 'dm' THEN true
    ELSE (
      EXISTS (
        SELECT 1 FROM my_classes mc
         WHERE mc.class_id IN (
           SELECT class_id FROM class_enrollments WHERE user_id = other_id.uid
           UNION
           SELECT id FROM classes WHERE created_by = other_id.uid
         )
      )
    )
  END AS can_send
FROM my_convs c
LEFT JOIN projects p ON p.id = c.project_id
LEFT JOIN conversation_reads r
  ON r.conversation_id = c.id AND r.user_id = p_user
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM messages m
   WHERE m.conversation_id = c.id AND m.sender_id <> p_user
     AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
) un ON true
LEFT JOIN LATERAL (
  SELECT to_jsonb(x) AS msg FROM (
    SELECT m.id, m.sender_id, m.body, m.created_at
      FROM messages m WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) x
) lm ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', pr.id, 'role', cp.role, 'email', pr.email,
           'first_name', pr.first_name, 'last_name', pr.last_name,
           'image_url', pr.image_url, 'last_read_at', cr.last_read_at
         ) ORDER BY cp.role, pr.first_name) AS arr
    FROM conversation_participants cp
    JOIN profiles pr ON pr.id = cp.user_id
    LEFT JOIN conversation_reads cr
      ON cr.conversation_id = c.id AND cr.user_id = cp.user_id
   WHERE cp.conversation_id = c.id
) parts ON true
LEFT JOIN LATERAL (
  SELECT CASE WHEN c.type = 'dm' THEN
           CASE WHEN c.user_a = p_user THEN c.user_b ELSE c.user_a END
         END AS uid
) other_id ON true
WHERE
  (c.type = 'dm' AND c.last_message_at IS NOT NULL)
  OR c.type IN ('team_members','team_instructor')
  OR (c.type = 'team_ta' AND (
        c.last_message_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM conversation_participants tp
                    WHERE tp.conversation_id = c.id AND tp.role = 'ta')))
ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
LIMIT 200;
$$;


ALTER FUNCTION "public"."messages_inbox"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_role_sanitizer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.role is not null and not (new.role = any (array['instructor', 'student'])) then
      new.role := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_role_sanitizer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provision_team_channels"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_class_owner uuid;
BEGIN
  INSERT INTO conversations (type, project_id)
  SELECT t, p_project_id
    FROM unnest(ARRAY['team_ta','team_instructor','team_members']) AS t
  ON CONFLICT (project_id, type) WHERE type <> 'dm' DO NOTHING;

  -- members into all three channels
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, pm.user_id, 'member'
    FROM conversations c
    JOIN project_members pm ON pm.project_id = p_project_id
   WHERE c.project_id = p_project_id AND c.type <> 'dm'
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- TA seat
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, p.assigned_ta_id, 'ta'
    FROM conversations c
    JOIN projects p ON p.id = p_project_id
   WHERE c.project_id = p_project_id AND c.type = 'team_ta'
     AND p.assigned_ta_id IS NOT NULL
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- instructor seat (class owner)
  SELECT cl.created_by INTO v_class_owner
    FROM projects p JOIN classes cl ON cl.id = p.class_id
   WHERE p.id = p_project_id;
  IF v_class_owner IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, v_class_owner, 'instructor'
      FROM conversations c
     WHERE c.project_id = p_project_id AND c.type = 'team_instructor'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
END;
$$;


ALTER FUNCTION "public"."provision_team_channels"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_document_revisions"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_pruned integer;
BEGIN
  DELETE FROM project_document_revisions r
   USING project_documents d
   WHERE r.document_id = d.id
     AND r.number <> d.head_revision
     AND r.number IS DISTINCT FROM d.finalized_revision
     AND r.snapshot IS NULL
     AND (
       EXISTS (SELECT 1 FROM sprints s WHERE s.id = d.sprint_id AND s.ends_at <= v_today - 7)
       OR (d.sprint_id IS NULL
           AND EXISTS (SELECT 1 FROM projects p JOIN classes c ON c.id = p.class_id
                        WHERE p.id = d.project_id AND c.end_date <= v_today - 30))
     );
  GET DIAGNOSTICS v_pruned = ROW_COUNT;
  RETURN v_pruned;
END;
$$;


ALTER FUNCTION "public"."prune_document_revisions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_final_review_slot"("p_project" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_freed integer;
BEGIN
  -- Lock order: the project row before any slot row, as a project delete does (no deadlock).
  PERFORM 1 FROM projects WHERE id = p_project FOR KEY SHARE;

  UPDATE final_review_slots
     SET project_id = NULL, booked_by = NULL, booked_at = NULL
   WHERE project_id = p_project;
  GET DIAGNOSTICS v_freed = ROW_COUNT;
  IF v_freed = 0 THEN
    RETURN false;
  END IF;

  UPDATE projects SET final_review_at = NULL WHERE id = p_project;
  DELETE FROM project_review_tas WHERE project_id = p_project;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."release_final_review_slot"("p_project" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scrum_apply_task_move"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT status INTO NEW.from_status FROM tasks WHERE id = NEW.task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task % not found', NEW.task_id; END IF;
  UPDATE tasks SET status = NEW.to_status, moved_by = NEW.moved_by,
                   moved_at = NEW.moved_at, updated_at = NEW.moved_at
   WHERE id = NEW.task_id;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."scrum_apply_task_move"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  n_stories integer := jsonb_array_length(p_stories);
  n_tasks integer;
  story_no integer;
  task_no integer;
  sprint_ids jsonb := '{}'::jsonb;
  out_sprints jsonb := '[]'::jsonb;
  out_stories jsonb := '[]'::jsonb;
  out_tasks jsonb;
  sp jsonb;
  st jsonb;
  tk jsonb;
  v_id uuid;
  v_story_id uuid;
  v_sprint_id uuid;
BEGIN
  SELECT coalesce(sum(jsonb_array_length(coalesce(nullif(e -> 'tasks', 'null'::jsonb), '[]'::jsonb))), 0)
    INTO n_tasks
    FROM jsonb_array_elements(p_stories) AS e;

  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  UPDATE scrum_counters
     SET story_seq = story_seq + n_stories, task_seq = task_seq + n_tasks
   WHERE project_id = p_project_id
  RETURNING story_seq - n_stories, task_seq - n_tasks INTO story_no, task_no;

  FOR sp IN SELECT e FROM jsonb_array_elements(p_sprints) WITH ORDINALITY AS a(e, i) ORDER BY i LOOP
    INSERT INTO sprints (project_id, name, starts_at, ends_at)
    VALUES (p_project_id, sp ->> 'name', (sp ->> 'starts_at')::date, (sp ->> 'ends_at')::date)
    RETURNING id INTO v_id;
    sprint_ids := sprint_ids || jsonb_build_object(sp ->> 'ref', v_id);
    out_sprints := out_sprints || jsonb_build_object('ref', sp ->> 'ref', 'id', v_id, 'name', sp ->> 'name');
  END LOOP;

  FOR st IN SELECT e FROM jsonb_array_elements(p_stories) WITH ORDINALITY AS a(e, i) ORDER BY i LOOP
    IF st ->> 'sprint_ref' IS NOT NULL THEN
      v_sprint_id := (sprint_ids ->> (st ->> 'sprint_ref'))::uuid;
      IF v_sprint_id IS NULL THEN
        RAISE EXCEPTION 'sprint_ref % names no sprint in this batch', st ->> 'sprint_ref';
      END IF;
    ELSIF st ->> 'sprint_id' IS NOT NULL THEN
      SELECT id INTO v_sprint_id FROM sprints
       WHERE id = (st ->> 'sprint_id')::uuid AND project_id = p_project_id;
      IF v_sprint_id IS NULL THEN
        RAISE EXCEPTION 'sprint % is not a sprint of this project', st ->> 'sprint_id';
      END IF;
    ELSE
      v_sprint_id := NULL;
    END IF;
    story_no := story_no + 1;
    INSERT INTO user_stories (project_id, key, title, description_md, points, assignee_id, sprint_id, reporter_id)
    VALUES (
      p_project_id, 'US-' || story_no, st ->> 'title', st ->> 'description_md', (st ->> 'points')::integer,
      (st ->> 'assignee_id')::uuid, v_sprint_id, p_reporter_id
    )
    RETURNING id INTO v_story_id;

    out_tasks := '[]'::jsonb;
    FOR tk IN
      SELECT e FROM jsonb_array_elements(coalesce(nullif(st -> 'tasks', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS a(e, i) ORDER BY i
    LOOP
      task_no := task_no + 1;
      INSERT INTO tasks (
        story_id, project_id, key, title, description_md, points, estimate_hours, assignee_id, tags, reporter_id
      )
      VALUES (
        v_story_id, p_project_id, 'GT-' || task_no, tk ->> 'title', tk ->> 'description_md',
        (tk ->> 'points')::integer, (tk ->> 'estimate_hours')::integer, (tk ->> 'assignee_id')::uuid,
        ARRAY(SELECT jsonb_array_elements_text(coalesce(nullif(tk -> 'tags', 'null'::jsonb), '[]'::jsonb))), p_reporter_id
      )
      RETURNING id INTO v_id;
      out_tasks := out_tasks || jsonb_build_object('id', v_id, 'key', 'GT-' || task_no, 'title', tk ->> 'title');
    END LOOP;

    out_stories := out_stories || jsonb_build_object(
      'id', v_story_id, 'key', 'US-' || story_no, 'title', st ->> 'title', 'sprint_id', v_sprint_id,
      'tasks', out_tasks
    );
  END LOOP;

  RETURN jsonb_build_object('sprints', out_sprints, 'stories', out_stories);
END;
$$;


ALTER FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb", "p_burnup" "jsonb", "p_expected_story_seq" integer, "p_expected_task_seq" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  n_stories integer := jsonb_array_length(p_stories);
  n_tasks integer;
  story_no integer;
  task_no integer;
  sprint_ids jsonb := '{}'::jsonb;
  out_sprints jsonb := '[]'::jsonb;
  out_stories jsonb := '[]'::jsonb;
  out_tasks jsonb;
  sp jsonb;
  st jsonb;
  tk jsonb;
  v_id uuid;
  v_story_id uuid;
  v_sprint_id uuid;
  v_status text;
  burnup_sprints uuid[];
BEGIN
  SELECT coalesce(sum(jsonb_array_length(coalesce(nullif(e -> 'tasks', 'null'::jsonb), '[]'::jsonb))), 0)
    INTO n_tasks
    FROM jsonb_array_elements(p_stories) AS e;

  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  UPDATE scrum_counters
     SET story_seq = story_seq + n_stories, task_seq = task_seq + n_tasks
   WHERE project_id = p_project_id
  RETURNING story_seq - n_stories, task_seq - n_tasks INTO story_no, task_no;

  IF jsonb_array_length(p_burnup) > 0
     AND (story_no, task_no) IS DISTINCT FROM (p_expected_story_seq, p_expected_task_seq) THEN
    RAISE EXCEPTION 'the board changed while this batch was being prepared' USING ERRCODE = '23505';
  END IF;

  FOR sp IN SELECT e FROM jsonb_array_elements(p_sprints) WITH ORDINALITY AS a(e, i) ORDER BY i LOOP
    INSERT INTO sprints (project_id, name, starts_at, ends_at)
    VALUES (p_project_id, sp ->> 'name', (sp ->> 'starts_at')::date, (sp ->> 'ends_at')::date)
    RETURNING id INTO v_id;
    sprint_ids := sprint_ids || jsonb_build_object(sp ->> 'ref', v_id);
    out_sprints := out_sprints || jsonb_build_object('ref', sp ->> 'ref', 'id', v_id, 'name', sp ->> 'name');
  END LOOP;

  FOR st IN SELECT e FROM jsonb_array_elements(p_stories) WITH ORDINALITY AS a(e, i) ORDER BY i LOOP
    IF st ->> 'sprint_ref' IS NOT NULL THEN
      v_sprint_id := (sprint_ids ->> (st ->> 'sprint_ref'))::uuid;
      IF v_sprint_id IS NULL THEN
        RAISE EXCEPTION 'sprint_ref % names no sprint in this batch', st ->> 'sprint_ref';
      END IF;
    ELSIF st ->> 'sprint_id' IS NOT NULL THEN
      SELECT id INTO v_sprint_id FROM sprints
       WHERE id = (st ->> 'sprint_id')::uuid AND project_id = p_project_id;
      IF v_sprint_id IS NULL THEN
        RAISE EXCEPTION 'sprint % is not a sprint of this project', st ->> 'sprint_id';
      END IF;
    ELSE
      v_sprint_id := NULL;
    END IF;
    story_no := story_no + 1;
    INSERT INTO user_stories (
      project_id, key, title, description_md, points, assignee_id, sprint_id, reporter_id, imported_at
    )
    VALUES (
      p_project_id, 'US-' || story_no, st ->> 'title', st ->> 'description_md', (st ->> 'points')::integer,
      (st ->> 'assignee_id')::uuid, v_sprint_id, p_reporter_id, (st ->> 'imported_at')::timestamptz
    )
    RETURNING id INTO v_story_id;

    out_tasks := '[]'::jsonb;
    FOR tk IN
      SELECT e FROM jsonb_array_elements(coalesce(nullif(st -> 'tasks', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS a(e, i) ORDER BY i
    LOOP
      task_no := task_no + 1;
      INSERT INTO tasks (
        story_id, project_id, key, title, description_md, points, estimate_hours, assignee_id, tags, reporter_id
      )
      VALUES (
        v_story_id, p_project_id, 'GT-' || task_no, tk ->> 'title', tk ->> 'description_md',
        (tk ->> 'points')::integer, (tk ->> 'estimate_hours')::integer, (tk ->> 'assignee_id')::uuid,
        ARRAY(SELECT jsonb_array_elements_text(coalesce(nullif(tk -> 'tags', 'null'::jsonb), '[]'::jsonb))), p_reporter_id
      )
      RETURNING id INTO v_id;
      v_status := coalesce(tk ->> 'status', 'todo');
      IF v_status <> 'todo' THEN
        INSERT INTO task_moves (task_id, to_status, moved_by, moved_at)
        VALUES (v_id, v_status, p_reporter_id, (tk ->> 'moved_at')::timestamptz);
      END IF;
      out_tasks := out_tasks || jsonb_build_object(
        'id', v_id, 'key', 'GT-' || task_no, 'title', tk ->> 'title', 'status', v_status
      );
    END LOOP;

    out_stories := out_stories || jsonb_build_object(
      'id', v_story_id, 'key', 'US-' || story_no, 'title', st ->> 'title', 'sprint_id', v_sprint_id,
      'tasks', out_tasks
    );
  END LOOP;

  SELECT array_agg(DISTINCT coalesce((e ->> 'sprint_id')::uuid, (sprint_ids ->> (e ->> 'sprint_ref'))::uuid))
    INTO burnup_sprints
    FROM jsonb_array_elements(p_burnup) AS e;
  IF EXISTS (
    SELECT 1 FROM unnest(burnup_sprints) AS u(id)
     WHERE u.id IS NULL
        OR NOT EXISTS (SELECT 1 FROM sprints s WHERE s.id = u.id AND s.project_id = p_project_id)
  ) THEN
    RAISE EXCEPTION 'p_burnup names a sprint that is not in this project or this batch';
  END IF;
  DELETE FROM sprint_burnup_days WHERE sprint_id = ANY(burnup_sprints);
  INSERT INTO sprint_burnup_days (sprint_id, day, scope_points, completed_points, scope_hours, completed_hours)
  SELECT coalesce((e ->> 'sprint_id')::uuid, (sprint_ids ->> (e ->> 'sprint_ref'))::uuid),
         (e ->> 'day')::date,
         (e ->> 'scope_points')::integer, (e ->> 'completed_points')::integer,
         (e ->> 'scope_hours')::integer, (e ->> 'completed_hours')::integer
    FROM jsonb_array_elements(p_burnup) AS e
  -- A board opened just now can snapshot today between the delete and this insert.
  ON CONFLICT (sprint_id, day) DO UPDATE
    SET scope_points = EXCLUDED.scope_points, completed_points = EXCLUDED.completed_points,
        scope_hours = EXCLUDED.scope_hours, completed_hours = EXCLUDED.completed_hours;

  RETURN jsonb_build_object('sprints', out_sprints, 'stories', out_stories);
END;
$$;


ALTER FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb", "p_burnup" "jsonb", "p_expected_story_seq" integer, "p_expected_task_seq" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scrum_next_key"("p_project_id" "uuid", "p_kind" "text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE v integer;
BEGIN
  IF p_kind NOT IN ('story','task') THEN RAISE EXCEPTION 'bad kind %', p_kind; END IF;
  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  IF p_kind = 'story' THEN
    UPDATE scrum_counters SET story_seq = story_seq + 1 WHERE project_id = p_project_id RETURNING story_seq INTO v;
  ELSE
    UPDATE scrum_counters SET task_seq = task_seq + 1 WHERE project_id = p_project_id RETURNING task_seq INTO v;
  END IF;
  RETURN v;
END; $$;


ALTER FUNCTION "public"."scrum_next_key"("p_project_id" "uuid", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scrum_set_story_order"("p_project_id" "uuid", "p_sprint_id" "uuid", "p_story_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  listed uuid[];
  sent uuid[];
  ranked integer;
BEGIN
  -- The list's stories, locked in id order: two saves of one list queue instead of deadlocking, and no
  -- story leaves or joins the list until this transaction ends. A story that a concurrent move took out
  -- of the list is checked again once that move commits, and left out.
  SELECT coalesce(array_agg(l.id ORDER BY l.id), '{}') INTO listed
    FROM (
      SELECT id FROM user_stories
       WHERE project_id = p_project_id
         AND ((p_sprint_id IS NULL AND (sprint_id IS NULL OR archived_at IS NOT NULL))
              OR (sprint_id = p_sprint_id AND archived_at IS NULL))
       ORDER BY id
       FOR UPDATE
    ) AS l;
  SELECT coalesce(array_agg(DISTINCT u.id ORDER BY u.id), '{}') INTO sent
    FROM unnest(p_story_ids) AS u(id);
  IF cardinality(sent) <> cardinality(p_story_ids) OR sent IS DISTINCT FROM listed THEN
    RAISE EXCEPTION 'stories changed' USING ERRCODE = 'unique_violation';
  END IF;
  UPDATE user_stories s SET rank = o.ord::integer
    FROM unnest(p_story_ids) WITH ORDINALITY AS o(id, ord)
   WHERE s.id = o.id AND s.project_id = p_project_id;
  GET DIAGNOSTICS ranked = ROW_COUNT;
  RETURN ranked;
END;
$$;


ALTER FUNCTION "public"."scrum_set_story_order"("p_project_id" "uuid", "p_sprint_id" "uuid", "p_story_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_classes_owner_swap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    DELETE FROM conversation_participants cp
     USING conversations c, projects p
     WHERE cp.conversation_id = c.id AND c.type = 'team_instructor'
       AND c.project_id = p.id AND p.class_id = NEW.id AND cp.role = 'instructor';
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.created_by, 'instructor'
      FROM conversations c JOIN projects p ON p.id = c.project_id
     WHERE c.type = 'team_instructor' AND p.class_id = NEW.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_classes_owner_swap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_dm_participants"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.type = 'dm' THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, NEW.user_a, 'member'), (NEW.id, NEW.user_b, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_dm_participants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_project_members_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM provision_team_channels(NEW.project_id);
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.user_id, 'member'
      FROM conversations c
     WHERE c.project_id = NEW.project_id AND c.type <> 'dm'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = OLD.project_id AND c.type <> 'dm'
       AND cp.user_id = OLD.user_id AND cp.role = 'member';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_project_members_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_projects_provision_channels"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM provision_team_channels(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_projects_provision_channels"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_projects_ta_swap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.assigned_ta_id IS DISTINCT FROM OLD.assigned_ta_id THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = NEW.id AND c.type = 'team_ta' AND cp.role = 'ta';
    IF NEW.assigned_ta_id IS NOT NULL THEN
      PERFORM provision_team_channels(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_projects_ta_swap"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."TSRs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evaluator_id" "uuid" DEFAULT "gen_random_uuid"(),
    "evaluatee_id" "uuid" DEFAULT "gen_random_uuid"(),
    "project_id" "uuid" DEFAULT "gen_random_uuid"(),
    "percent_contribution" bigint,
    "positive_feedback" "text",
    "constructive_feedback" "text",
    "scrum_master_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "week" bigint,
    "assignment_id" "uuid",
    "scrum_master_tickets" "text",
    "scrum_master_assessment" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."TSRs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_draft_usage" (
    "user_id" "uuid" NOT NULL,
    "used_on" "date" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ai_draft_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_daily" (
    "institution_id" "uuid" NOT NULL,
    "class_id" "uuid",
    "day" "date" NOT NULL,
    "metric" "text" NOT NULL,
    "value" numeric NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_daily_metric_check" CHECK (("metric" ~ '^[a-z][a-z0-9_]{1,39}$'::"text"))
);


ALTER TABLE "public"."analytics_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "Title" "text",
    "open_date" "date",
    "close_date" "date",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid",
    "assignment_type" "text",
    "due_at" timestamp with time zone,
    "accept_until" timestamp with time zone
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "status" "text" NOT NULL,
    "marked_by" "uuid",
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meeting_id" "uuid",
    CONSTRAINT "attendance_status_valid" CHECK (("status" = ANY (ARRAY['present'::"text", 'late'::"text", 'absent'::"text"]))),
    CONSTRAINT "attendance_week_positive" CHECK (("week_number" >= 1))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "enrollment_role" "text" DEFAULT 'student'::"text" NOT NULL,
    "can_extend_deadlines" boolean DEFAULT false NOT NULL,
    CONSTRAINT "class_enrollments_enrollment_role_check" CHECK (("enrollment_role" = ANY (ARRAY['student'::"text", 'ta'::"text"]))),
    CONSTRAINT "class_enrollments_extend_requires_ta" CHECK ((("enrollment_role" = 'ta'::"text") OR (NOT "can_extend_deadlines")))
);


ALTER TABLE "public"."class_enrollments" OWNER TO "postgres";


COMMENT ON TABLE "public"."class_enrollments" IS 'Tracks which students are enrolled in which classes';



COMMENT ON COLUMN "public"."class_enrollments"."class_id" IS 'Foreign key to classes table';



COMMENT ON COLUMN "public"."class_enrollments"."user_id" IS 'Foreign key to users table (student)';



COMMENT ON COLUMN "public"."class_enrollments"."enrolled_at" IS 'Timestamp when the student was enrolled';



CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "course_code" "text" NOT NULL,
    "year" double precision,
    "term" "text",
    "start_date" "date",
    "can_students_make_project" boolean,
    "image_url" "text",
    "status" "text" NOT NULL,
    "meetings_per_week" integer DEFAULT 1 NOT NULL,
    "meeting_duration_minutes" integer DEFAULT 45 NOT NULL,
    "review_period_open" boolean DEFAULT false NOT NULL,
    "review_zoom_url" "text",
    "institution_id" "uuid",
    "external_tasks_url" "text",
    "end_date" "date",
    "sprint_count" smallint,
    "sprint_frequency" "text",
    "sprints_start_on" "date",
    CONSTRAINT "classes_end_date_after_start" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR (("end_date" >= "start_date") AND ("end_date" <= ("start_date" + 370))))),
    CONSTRAINT "classes_external_tasks_url_valid" CHECK ((("external_tasks_url" IS NULL) OR (("length"("external_tasks_url") <= 2048) AND ("external_tasks_url" ~* '^https?://[^/?#[:space:]]+[^[:space:]]*$'::"text")))),
    CONSTRAINT "classes_meetings_per_week_valid" CHECK ((("meetings_per_week" >= 1) AND ("meetings_per_week" <= 7))),
    CONSTRAINT "classes_sprint_schedule_valid" CHECK (((("sprint_count" IS NULL) AND ("sprint_frequency" IS NULL) AND ("sprints_start_on" IS NULL)) OR (("sprint_count" IS NOT NULL) AND ("sprint_frequency" IS NOT NULL) AND (("sprint_count" >= 1) AND ("sprint_count" <= 20)) AND ("sprint_frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text"])) AND ("sprints_start_on" IS NOT NULL))))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_deletes" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_deletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_participants_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'ta'::"text", 'instructor'::"text"])))
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_reads" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a" "uuid",
    "user_b" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone,
    "type" "text" DEFAULT 'dm'::"text" NOT NULL,
    "project_id" "uuid",
    CONSTRAINT "conversations_canonical_order" CHECK (("user_a" < "user_b")),
    CONSTRAINT "conversations_shape" CHECK (((("type" = 'dm'::"text") AND ("user_a" IS NOT NULL) AND ("user_b" IS NOT NULL) AND ("project_id" IS NULL)) OR (("type" <> 'dm'::"text") AND ("project_id" IS NOT NULL) AND ("user_a" IS NULL) AND ("user_b" IS NULL)))),
    CONSTRAINT "conversations_type_valid" CHECK (("type" = ANY (ARRAY['dm'::"text", 'team_ta'::"text", 'team_instructor'::"text", 'team_members'::"text"])))
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edu_email_verifications" (
    "user_id" "uuid" NOT NULL,
    "edu_email" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "edu_email_verifications_attempts_check" CHECK (("attempts" >= 0))
);


ALTER TABLE "public"."edu_email_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_preferences" (
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_suppressions" (
    "email" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_suppressions_email_lower" CHECK (("email" = "lower"("email"))),
    CONSTRAINT "email_suppressions_reason_check" CHECK (("reason" = ANY (ARRAY['bounced'::"text", 'rejected'::"text", 'complained'::"text"])))
);


ALTER TABLE "public"."email_suppressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" bigint NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" NOT NULL,
    "actor_id" "uuid",
    "class_id" "uuid",
    "project_id" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "events_kind_check" CHECK (("kind" ~ '^[a-z][a-z0-9_]{1,39}$'::"text")),
    CONSTRAINT "events_meta_check" CHECK (("pg_column_size"("meta") <= 2048))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


ALTER TABLE "public"."events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."feedback_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "q1_liked" "text" NOT NULL,
    "q2_frustrating" "text" NOT NULL,
    "q3_missing_feature" "text" NOT NULL,
    "q4_bugs" "text" NOT NULL,
    "q5_suggestions" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_review_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "template_version" integer DEFAULT 1 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."final_review_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_review_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "product" numeric(2,1),
    "team" numeric(2,1),
    "scrum" numeric(2,1),
    "overall" numeric(2,1),
    "notes" "text",
    "scored_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "final_review_scores_bounds" CHECK (((("product" IS NULL) OR (("product" >= 1.0) AND ("product" <= 5.0))) AND (("team" IS NULL) OR (("team" >= 1.0) AND ("team" <= 5.0))) AND (("scrum" IS NULL) OR (("scrum" >= 1.0) AND ("scrum" <= 5.0))) AND (("overall" IS NULL) OR (("overall" >= 1.0) AND ("overall" <= 5.0))))),
    CONSTRAINT "final_review_scores_role_valid" CHECK (("role" = ANY (ARRAY['home'::"text", 'review'::"text", 'instructor'::"text"]))),
    CONSTRAINT "final_review_scores_shape" CHECK (((("role" = 'home'::"text") AND ("overall" IS NULL) AND ("product" IS NOT NULL) AND ("team" IS NOT NULL) AND ("scrum" IS NOT NULL)) OR (("role" <> 'home'::"text") AND ("overall" IS NOT NULL) AND ("product" IS NULL) AND ("team" IS NULL) AND ("scrum" IS NULL))))
);


ALTER TABLE "public"."final_review_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_review_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "project_id" "uuid",
    "booked_by" "uuid",
    "booked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "final_review_slots_duration_valid" CHECK (("duration_minutes" = 60))
);


ALTER TABLE "public"."final_review_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."institutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "email_domains" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Los_Angeles'::"text" NOT NULL,
    CONSTRAINT "institutions_slug_format" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."institutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_form" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "interest_value" smallint NOT NULL,
    "interest_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interest_form_value_range" CHECK ((("interest_value" >= 1) AND ("interest_value" <= 5)))
);


ALTER TABLE "public"."interest_form" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "taking_115c" boolean,
    "previous_project_name" "text",
    "previous_project_link" "text",
    "notes" "text",
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interest_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_team_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "peer_user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interest_team_preferences_kind_valid" CHECK (("kind" = ANY (ARRAY['work_with'::"text", 'dont_work_with'::"text"]))),
    CONSTRAINT "interest_team_preferences_no_self" CHECK (("user_id" <> "peer_user_id"))
);


ALTER TABLE "public"."interest_team_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mcp_authorizations" (
    "id" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "params" "jsonb" NOT NULL,
    "user_id" "uuid",
    "code_hash" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "grant_id" "uuid"
);


ALTER TABLE "public"."mcp_authorizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mcp_clients" (
    "client_id" "text" NOT NULL,
    "info" "jsonb" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "mcp_clients_info_check" CHECK (("pg_column_size"("info") <= 8192))
);


ALTER TABLE "public"."mcp_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mcp_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."mcp_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mcp_tokens" (
    "token_hash" "text" NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mcp_tokens_kind_check" CHECK (("kind" = ANY (ARRAY['access'::"text", 'refresh'::"text"])))
);


ALTER TABLE "public"."mcp_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "title" "text",
    "cadence" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "day_of_week" "text",
    "start_time" time without time zone,
    "scheduled_at" timestamp with time zone,
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "sequence" integer DEFAULT 1 NOT NULL,
    "location" "text",
    "zoom_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'ta_meeting'::"text" NOT NULL,
    "note" "text",
    CONSTRAINT "meetings_cadence_valid" CHECK (("cadence" = ANY (ARRAY['weekly'::"text", 'once'::"text"]))),
    CONSTRAINT "meetings_day_valid" CHECK ((("day_of_week" IS NULL) OR ("lower"("day_of_week") = ANY (ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"])))),
    CONSTRAINT "meetings_kind_valid" CHECK (("kind" = ANY (ARRAY['ta_meeting'::"text", 'team_meeting'::"text"]))),
    CONSTRAINT "meetings_location_length" CHECK ((("location" IS NULL) OR ("char_length"("location") <= 120))),
    CONSTRAINT "meetings_note_length" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "meetings_seq_positive" CHECK (("sequence" >= 1)),
    CONSTRAINT "meetings_shape" CHECK ((("cadence" = 'weekly'::"text") OR (("cadence" = 'once'::"text") AND ("scheduled_at" IS NOT NULL)))),
    CONSTRAINT "meetings_team_meeting_shape" CHECK ((("kind" <> 'team_meeting'::"text") OR (("cadence" = 'once'::"text") AND ("project_id" IS NOT NULL) AND ("title" IS NOT NULL) AND (("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 80)) AND (("duration_minutes" % 15) = 0) AND (("duration_minutes" >= 15) AND ("duration_minutes" <= 240))))),
    CONSTRAINT "meetings_zoom_url_length" CHECK ((("zoom_url" IS NULL) OR ("char_length"("zoom_url") <= 500)))
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_body_length" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 1024)))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "instructor_id" "text" NOT NULL,
    "emails" "jsonb" NOT NULL,
    "send_at" timestamp with time zone NOT NULL,
    "cancelled" boolean DEFAULT false NOT NULL,
    "sent" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_subject" "text",
    "custom_body" "text",
    "cc" "jsonb",
    "bcc" "jsonb",
    "custom_body_html" "text"
);


ALTER TABLE "public"."pending_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "linkedin" "text",
    "github" "text",
    "image_url" "text",
    "edu_email" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['instructor'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_document_revisions" (
    "document_id" "uuid" NOT NULL,
    "number" integer NOT NULL,
    "body" "jsonb" NOT NULL,
    "snapshot" "jsonb",
    "source" "text" DEFAULT 'edit'::"text" NOT NULL,
    "saved_by" "uuid",
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalized_at" timestamp with time zone,
    "finalized_by" "uuid",
    CONSTRAINT "project_document_revisions_number_valid" CHECK (("number" >= 1)),
    CONSTRAINT "project_document_revisions_size" CHECK ((("pg_column_size"("body") <= 262144) AND (("snapshot" IS NULL) OR ("pg_column_size"("snapshot") <= 262144)))),
    CONSTRAINT "project_document_revisions_source_valid" CHECK (("source" = ANY (ARRAY['seed'::"text", 'edit'::"text", 'import'::"text", 'export'::"text"])))
);


ALTER TABLE "public"."project_document_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "sprint_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "head_revision" integer DEFAULT 0 NOT NULL,
    "finalized_revision" integer,
    "finalized_at" timestamp with time zone,
    "finalized_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_documents_kind_valid" CHECK (("kind" = ANY (ARRAY['sprint_plan'::"text", 'sprint_report'::"text", 'release_plan'::"text", 'release_summary'::"text", 'test_report'::"text"]))),
    CONSTRAINT "project_documents_sprint_shape" CHECK ((("kind" = ANY (ARRAY['sprint_plan'::"text", 'sprint_report'::"text"])) = ("sprint_id" IS NOT NULL))),
    CONSTRAINT "project_documents_status_valid" CHECK (("status" = ANY (ARRAY['draft'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."project_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" DEFAULT "gen_random_uuid"(),
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "reviewed_at" timestamp with time zone,
    "reviewer_id" "uuid" DEFAULT "gen_random_uuid"(),
    "request_status" "public"."request_status",
    "invited_by" "uuid",
    "message" "text",
    CONSTRAINT "project_join_requests_message_length" CHECK ((("message" IS NULL) OR ("char_length"("message") <= 500)))
);


ALTER TABLE "public"."project_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "project_id" "uuid" DEFAULT "gen_random_uuid"(),
    "role" "text"
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_review_tas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_review_tas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_ta_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_ta_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_size" bigint,
    "skills" "jsonb",
    "looking_for_roles" "jsonb",
    "sentiment" "text",
    "num_members" bigint,
    "sponsor_name" "text",
    "sponsor_company" "text",
    "sponsor_email" "text",
    "sponsor_website" "text",
    "sponsor_description" "text",
    "image_url" "text",
    "assigned_ta_id" "uuid",
    "final_review_at" timestamp with time zone,
    "estimate_scale" "text" DEFAULT 'fibonacci'::"text" NOT NULL,
    CONSTRAINT "projects_estimate_scale_valid" CHECK (("estimate_scale" = ANY (ARRAY['linear'::"text", 'exponential'::"text", 'fibonacci'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."looking_for_roles" IS 'Holds roles the project is looking for';



CREATE TABLE IF NOT EXISTS "public"."roster_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "email" "text",
    "status" "text",
    "matched_profile_id" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "is_manual" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."roster_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scrum_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid",
    "task_id" "uuid",
    "author_id" "uuid" NOT NULL,
    "body_md" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scrum_comments_body_md_check" CHECK ((("char_length"("body_md") >= 1) AND ("char_length"("body_md") <= 4000))),
    CONSTRAINT "scrum_comments_parent_xor" CHECK (("num_nonnulls"("story_id", "task_id") = 1))
);


ALTER TABLE "public"."scrum_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scrum_counters" (
    "project_id" "uuid" NOT NULL,
    "story_seq" integer DEFAULT 0 NOT NULL,
    "task_seq" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."scrum_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scrum_repos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "repo_url" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "access_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scrum_repos_access_token_check" CHECK (("char_length"("access_token") <= 200)),
    CONSTRAINT "scrum_repos_provider_valid" CHECK (("provider" = ANY (ARRAY['github'::"text", 'gitlab'::"text"]))),
    CONSTRAINT "scrum_repos_repo_url_check" CHECK (("char_length"("repo_url") <= 500))
);


ALTER TABLE "public"."scrum_repos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprint_burnup_days" (
    "sprint_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "scope_points" integer NOT NULL,
    "completed_points" integer NOT NULL,
    "scope_hours" integer DEFAULT 0 NOT NULL,
    "completed_hours" integer DEFAULT 0 NOT NULL,
    "stories" "jsonb",
    CONSTRAINT "sprint_burnup_days_stories_valid" CHECK ((("stories" IS NULL) OR ("jsonb_typeof"("stories") = 'array'::"text")))
);


ALTER TABLE "public"."sprint_burnup_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "starts_at" "date" NOT NULL,
    "ends_at" "date" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sequence" smallint,
    CONSTRAINT "sprints_dates_valid" CHECK (("ends_at" >= "starts_at")),
    CONSTRAINT "sprints_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80))),
    CONSTRAINT "sprints_sequence_check" CHECK ((("sequence" IS NULL) OR ("sequence" >= 1))),
    CONSTRAINT "sprints_status_valid" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."sprints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_dependencies" (
    "task_id" "uuid" NOT NULL,
    "depends_on_task_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_dependencies_not_self" CHECK (("task_id" <> "depends_on_task_id"))
);


ALTER TABLE "public"."task_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_moves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "from_status" "text" NOT NULL,
    "to_status" "text" NOT NULL,
    "moved_by" "uuid",
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_moves_to_status_check" CHECK (("to_status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."task_moves" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description_md" "text",
    "points" integer,
    "time_estimate" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "assignee_id" "uuid",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pr_url" "text",
    "pr_provider" "text",
    "pr_state" "text",
    "pr_checked_at" timestamp with time zone,
    "moved_by" "uuid",
    "moved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estimate_hours" smallint,
    CONSTRAINT "tasks_description_md_check" CHECK (("char_length"("description_md") <= 20000)),
    CONSTRAINT "tasks_estimate_hours_valid" CHECK ((("estimate_hours" IS NULL) OR (("estimate_hours" >= 1) AND ("estimate_hours" <= 15)))),
    CONSTRAINT "tasks_points_check" CHECK (("points" > 0)),
    CONSTRAINT "tasks_pr_state_valid" CHECK ((("pr_state" IS NULL) OR ("pr_state" = ANY (ARRAY['open'::"text", 'merged'::"text", 'closed'::"text", 'draft'::"text"])))),
    CONSTRAINT "tasks_pr_url_check" CHECK (("char_length"("pr_url") <= 500)),
    CONSTRAINT "tasks_provider_valid" CHECK ((("pr_provider" IS NULL) OR ("pr_provider" = ANY (ARRAY['github'::"text", 'gitlab'::"text"])))),
    CONSTRAINT "tasks_status_valid" CHECK (("status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text"]))),
    CONSTRAINT "tasks_tags_valid" CHECK (("tags" <@ ARRAY['backend'::"text", 'frontend'::"text", 'ui/ux'::"text", 'infra'::"text", 'design'::"text", 'research'::"text", 'bug'::"text", 'chore'::"text", 'optimization'::"text", 'docs'::"text"])),
    CONSTRAINT "tasks_time_estimate_check" CHECK (("char_length"("time_estimate") <= 20)),
    CONSTRAINT "tasks_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 200)))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "sprint_id" "uuid",
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description_md" "text",
    "points" integer,
    "time_estimate" "text",
    "reporter_id" "uuid" NOT NULL,
    "assignee_id" "uuid",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "imported_at" timestamp with time zone,
    "rank" integer,
    "acceptance_criteria" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "user_stories_criteria_valid" CHECK (("cardinality"("acceptance_criteria") <= 20)),
    CONSTRAINT "user_stories_description_md_check" CHECK (("char_length"("description_md") <= 20000)),
    CONSTRAINT "user_stories_points_check" CHECK (("points" > 0)),
    CONSTRAINT "user_stories_time_estimate_check" CHECK (("char_length"("time_estimate") <= 20)),
    CONSTRAINT "user_stories_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 200)))
);


ALTER TABLE "public"."user_stories" OWNER TO "postgres";


ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_draft_usage"
    ADD CONSTRAINT "ai_draft_usage_pkey" PRIMARY KEY ("user_id", "used_on");



ALTER TABLE ONLY "public"."analytics_daily"
    ADD CONSTRAINT "analytics_daily_uq" UNIQUE NULLS NOT DISTINCT ("institution_id", "class_id", "day", "metric");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_user_id_key" UNIQUE ("class_id", "user_id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_deletes"
    ADD CONSTRAINT "conversation_deletes_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_unique_pair" UNIQUE ("user_a", "user_b");



ALTER TABLE ONLY "public"."edu_email_verifications"
    ADD CONSTRAINT "edu_email_verifications_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_pkey" PRIMARY KEY ("user_id", "category");



ALTER TABLE ONLY "public"."email_suppressions"
    ADD CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_unique" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."final_review_notes"
    ADD CONSTRAINT "final_review_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."final_review_notes"
    ADD CONSTRAINT "final_review_notes_project_unique" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."final_review_scores"
    ADD CONSTRAINT "final_review_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."final_review_scores"
    ADD CONSTRAINT "final_review_scores_uniq" UNIQUE ("project_id", "student_id", "role");



ALTER TABLE ONLY "public"."final_review_slots"
    ADD CONSTRAINT "final_review_slots_class_start_uniq" UNIQUE ("class_id", "starts_at");



ALTER TABLE ONLY "public"."final_review_slots"
    ADD CONSTRAINT "final_review_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institutions"
    ADD CONSTRAINT "institutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."institutions"
    ADD CONSTRAINT "institutions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_unique" UNIQUE ("user_id", "class_id", "project_id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_unique" UNIQUE ("user_id", "class_id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_unique" UNIQUE ("user_id", "class_id", "peer_user_id", "kind");



ALTER TABLE ONLY "public"."mcp_authorizations"
    ADD CONSTRAINT "mcp_authorizations_code_hash_key" UNIQUE ("code_hash");



ALTER TABLE ONLY "public"."mcp_authorizations"
    ADD CONSTRAINT "mcp_authorizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mcp_clients"
    ADD CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."mcp_grants"
    ADD CONSTRAINT "mcp_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mcp_tokens"
    ADD CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("token_hash");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_invites"
    ADD CONSTRAINT "pending_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_edu_email_key" UNIQUE ("edu_email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_document_revisions"
    ADD CONSTRAINT "project_document_revisions_pkey" PRIMARY KEY ("document_id", "number");



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_project_unique" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."project_ta_assignments"
    ADD CONSTRAINT "project_ta_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_ta_assignments"
    ADD CONSTRAINT "project_ta_assignments_unique" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roster_entries"
    ADD CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scrum_comments"
    ADD CONSTRAINT "scrum_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scrum_counters"
    ADD CONSTRAINT "scrum_counters_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."scrum_repos"
    ADD CONSTRAINT "scrum_repos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scrum_repos"
    ADD CONSTRAINT "scrum_repos_url_uq" UNIQUE ("project_id", "repo_url");



ALTER TABLE ONLY "public"."sprint_burnup_days"
    ADD CONSTRAINT "sprint_burnup_days_pkey" PRIMARY KEY ("sprint_id", "day");



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("task_id", "depends_on_task_id");



ALTER TABLE ONLY "public"."task_moves"
    ADD CONSTRAINT "task_moves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_key_uq" UNIQUE ("project_id", "key");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_stories"
    ADD CONSTRAINT "user_stories_key_uq" UNIQUE ("project_id", "key");



ALTER TABLE ONLY "public"."user_stories"
    ADD CONSTRAINT "user_stories_pkey" PRIMARY KEY ("id");



CREATE INDEX "analytics_daily_inst_day_idx" ON "public"."analytics_daily" USING "btree" ("institution_id", "day");



CREATE INDEX "attendance_meeting_idx" ON "public"."attendance" USING "btree" ("meeting_id", "week_number");



CREATE UNIQUE INDEX "attendance_meeting_slot_uniq" ON "public"."attendance" USING "btree" ("meeting_id", "user_id", "week_number");



CREATE INDEX "attendance_project_week_idx" ON "public"."attendance" USING "btree" ("project_id", "week_number");



CREATE INDEX "attendance_user_idx" ON "public"."attendance" USING "btree" ("user_id");



CREATE INDEX "class_enrollments_class_id_idx" ON "public"."class_enrollments" USING "btree" ("class_id");



CREATE INDEX "class_enrollments_user_id_idx" ON "public"."class_enrollments" USING "btree" ("user_id");



CREATE INDEX "classes_course_code_idx" ON "public"."classes" USING "btree" ("course_code");



CREATE UNIQUE INDEX "classes_course_code_upper_uq" ON "public"."classes" USING "btree" ("upper"("course_code"));



CREATE INDEX "classes_created_by_idx" ON "public"."classes" USING "btree" ("created_by");



CREATE INDEX "conversation_participants_user_idx" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "conversations_last_message_at_idx" ON "public"."conversations" USING "btree" ("last_message_at" DESC NULLS LAST);



CREATE INDEX "conversations_project_idx" ON "public"."conversations" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE UNIQUE INDEX "conversations_team_channel_uq" ON "public"."conversations" USING "btree" ("project_id", "type") WHERE ("type" <> 'dm'::"text");



CREATE INDEX "conversations_user_a_idx" ON "public"."conversations" USING "btree" ("user_a");



CREATE INDEX "conversations_user_b_idx" ON "public"."conversations" USING "btree" ("user_b");



CREATE INDEX "events_actor_time_idx" ON "public"."events" USING "btree" ("actor_id", "occurred_at" DESC);



CREATE INDEX "events_class_time_idx" ON "public"."events" USING "btree" ("class_id", "occurred_at" DESC) WHERE ("class_id" IS NOT NULL);



CREATE INDEX "events_kind_time_idx" ON "public"."events" USING "btree" ("kind", "occurred_at" DESC);



CREATE INDEX "events_project_time_idx" ON "public"."events" USING "btree" ("project_id", "occurred_at" DESC) WHERE ("project_id" IS NOT NULL);



CREATE UNIQUE INDEX "final_review_slots_project_uniq" ON "public"."final_review_slots" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_assignments_class_id" ON "public"."assignments" USING "btree" ("class_id");



CREATE INDEX "idx_attendance_marked_by" ON "public"."attendance" USING "btree" ("marked_by");



CREATE INDEX "idx_class_enrollments_role" ON "public"."class_enrollments" USING "btree" ("class_id", "enrollment_role");



CREATE INDEX "idx_classes_institution_id" ON "public"."classes" USING "btree" ("institution_id");



CREATE INDEX "idx_conversation_deletes_user_id" ON "public"."conversation_deletes" USING "btree" ("user_id");



CREATE INDEX "idx_conversation_reads_user_id" ON "public"."conversation_reads" USING "btree" ("user_id");



CREATE INDEX "idx_email_outbox_batch" ON "public"."email_outbox" USING "btree" ("batch_id") WHERE ("batch_id" IS NOT NULL);



CREATE INDEX "idx_email_outbox_class_id" ON "public"."email_outbox" USING "btree" ("class_id");



CREATE INDEX "idx_email_outbox_created_by" ON "public"."email_outbox" USING "btree" ("created_by");



CREATE INDEX "idx_email_outbox_due" ON "public"."email_outbox" USING "btree" ("next_attempt_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_email_outbox_lease" ON "public"."email_outbox" USING "btree" ("locked_until") WHERE ("status" = 'sending'::"text");



CREATE INDEX "idx_email_outbox_reference" ON "public"."email_outbox" USING "btree" ("provider_reference_id") WHERE ("provider_reference_id" IS NOT NULL);



CREATE INDEX "idx_email_outbox_user_id" ON "public"."email_outbox" USING "btree" ("user_id");



CREATE INDEX "idx_feedback_submissions_assignment" ON "public"."feedback_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_feedback_submissions_student_id" ON "public"."feedback_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_final_review_notes_class" ON "public"."final_review_notes" USING "btree" ("class_id");



CREATE INDEX "idx_final_review_notes_updated_by" ON "public"."final_review_notes" USING "btree" ("updated_by");



CREATE INDEX "idx_final_review_scores_class" ON "public"."final_review_scores" USING "btree" ("class_id");



CREATE INDEX "idx_final_review_scores_project" ON "public"."final_review_scores" USING "btree" ("project_id");



CREATE INDEX "idx_final_review_scores_scored_by" ON "public"."final_review_scores" USING "btree" ("scored_by");



CREATE INDEX "idx_final_review_scores_student" ON "public"."final_review_scores" USING "btree" ("student_id");



CREATE INDEX "idx_final_review_slots_booked_by" ON "public"."final_review_slots" USING "btree" ("booked_by");



CREATE INDEX "idx_final_review_slots_created_by" ON "public"."final_review_slots" USING "btree" ("created_by");



CREATE INDEX "idx_meetings_created_by" ON "public"."meetings" USING "btree" ("created_by");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_pending_invites_class_id" ON "public"."pending_invites" USING "btree" ("class_id");



CREATE INDEX "idx_project_join_requests_invited_by" ON "public"."project_join_requests" USING "btree" ("invited_by");



CREATE INDEX "idx_project_join_requests_project_id" ON "public"."project_join_requests" USING "btree" ("project_id");



CREATE INDEX "idx_project_join_requests_reviewer_id" ON "public"."project_join_requests" USING "btree" ("reviewer_id");



CREATE INDEX "idx_project_join_requests_user_id" ON "public"."project_join_requests" USING "btree" ("user_id");



CREATE INDEX "idx_project_members_project_id" ON "public"."project_members" USING "btree" ("project_id");



CREATE INDEX "idx_project_members_user_id" ON "public"."project_members" USING "btree" ("user_id");



CREATE INDEX "idx_project_review_tas_assigned_by" ON "public"."project_review_tas" USING "btree" ("assigned_by");



CREATE INDEX "idx_project_review_tas_class" ON "public"."project_review_tas" USING "btree" ("class_id");



CREATE INDEX "idx_project_review_tas_project" ON "public"."project_review_tas" USING "btree" ("project_id");



CREATE INDEX "idx_project_review_tas_user" ON "public"."project_review_tas" USING "btree" ("user_id");



CREATE INDEX "idx_project_ta_assignments_class" ON "public"."project_ta_assignments" USING "btree" ("class_id");



CREATE INDEX "idx_project_ta_assignments_project" ON "public"."project_ta_assignments" USING "btree" ("project_id");



CREATE INDEX "idx_project_ta_assignments_user" ON "public"."project_ta_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_projects_final_review_at" ON "public"."projects" USING "btree" ("class_id", "final_review_at");



CREATE INDEX "idx_roster_entries_course_id" ON "public"."roster_entries" USING "btree" ("course_id");



CREATE INDEX "idx_roster_entries_matched_profile_id" ON "public"."roster_entries" USING "btree" ("matched_profile_id");



CREATE INDEX "idx_tsrs_assignment_id" ON "public"."TSRs" USING "btree" ("assignment_id");



CREATE INDEX "idx_tsrs_evaluatee_id" ON "public"."TSRs" USING "btree" ("evaluatee_id");



CREATE INDEX "idx_tsrs_evaluator_id" ON "public"."TSRs" USING "btree" ("evaluator_id");



CREATE INDEX "idx_tsrs_project_id" ON "public"."TSRs" USING "btree" ("project_id");



CREATE INDEX "interest_form_class_idx" ON "public"."interest_form" USING "btree" ("class_id");



CREATE INDEX "interest_form_project_idx" ON "public"."interest_form" USING "btree" ("project_id");



CREATE INDEX "interest_form_user_idx" ON "public"."interest_form" USING "btree" ("user_id", "class_id");



CREATE INDEX "interest_submissions_class_idx" ON "public"."interest_submissions" USING "btree" ("class_id");



CREATE INDEX "interest_team_preferences_class_idx" ON "public"."interest_team_preferences" USING "btree" ("class_id");



CREATE INDEX "interest_team_preferences_peer_idx" ON "public"."interest_team_preferences" USING "btree" ("peer_user_id", "class_id");



CREATE INDEX "mcp_authorizations_client_idx" ON "public"."mcp_authorizations" USING "btree" ("client_id");



CREATE INDEX "mcp_authorizations_expires_idx" ON "public"."mcp_authorizations" USING "btree" ("expires_at");



CREATE INDEX "mcp_clients_unused_idx" ON "public"."mcp_clients" USING "btree" ("registered_at") WHERE ("last_used_at" IS NULL);



CREATE INDEX "mcp_grants_client_idx" ON "public"."mcp_grants" USING "btree" ("client_id");



CREATE INDEX "mcp_grants_user_idx" ON "public"."mcp_grants" USING "btree" ("user_id");



CREATE INDEX "mcp_tokens_grant_idx" ON "public"."mcp_tokens" USING "btree" ("grant_id");



CREATE INDEX "meetings_class_idx" ON "public"."meetings" USING "btree" ("class_id");



CREATE INDEX "meetings_project_idx" ON "public"."meetings" USING "btree" ("project_id");



CREATE INDEX "meetings_project_once_idx" ON "public"."meetings" USING "btree" ("project_id", "scheduled_at") WHERE ("cadence" = 'once'::"text");



CREATE UNIQUE INDEX "meetings_project_seq_uniq" ON "public"."meetings" USING "btree" ("project_id", "sequence") WHERE ("cadence" = 'weekly'::"text");



CREATE INDEX "messages_conv_created_id_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC, "id" DESC);



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE INDEX "pending_invites_send_at_idx" ON "public"."pending_invites" USING "btree" ("send_at") WHERE (("cancelled" = false) AND ("sent" = false));



CREATE INDEX "project_document_revisions_finalized_by_idx" ON "public"."project_document_revisions" USING "btree" ("finalized_by") WHERE ("finalized_by" IS NOT NULL);



CREATE INDEX "project_document_revisions_saved_by_idx" ON "public"."project_document_revisions" USING "btree" ("saved_by");



CREATE INDEX "project_documents_created_by_idx" ON "public"."project_documents" USING "btree" ("created_by");



CREATE INDEX "project_documents_finalized_by_idx" ON "public"."project_documents" USING "btree" ("finalized_by");



CREATE INDEX "project_documents_project_idx" ON "public"."project_documents" USING "btree" ("project_id");



CREATE UNIQUE INDEX "project_documents_project_kind_uq" ON "public"."project_documents" USING "btree" ("project_id", "kind") WHERE ("sprint_id" IS NULL);



CREATE UNIQUE INDEX "project_documents_sprint_kind_uq" ON "public"."project_documents" USING "btree" ("sprint_id", "kind") WHERE ("sprint_id" IS NOT NULL);



CREATE INDEX "projects_assigned_ta_idx" ON "public"."projects" USING "btree" ("assigned_ta_id");



CREATE INDEX "projects_class_id_idx" ON "public"."projects" USING "btree" ("class_id");



CREATE INDEX "projects_created_by_idx" ON "public"."projects" USING "btree" ("created_by");



CREATE INDEX "scrum_comments_story_idx" ON "public"."scrum_comments" USING "btree" ("story_id", "created_at");



CREATE INDEX "scrum_comments_task_idx" ON "public"."scrum_comments" USING "btree" ("task_id", "created_at");



CREATE INDEX "scrum_repos_project_idx" ON "public"."scrum_repos" USING "btree" ("project_id");



CREATE INDEX "sprints_project_idx" ON "public"."sprints" USING "btree" ("project_id", "starts_at");



CREATE UNIQUE INDEX "sprints_project_sequence_uq" ON "public"."sprints" USING "btree" ("project_id", "sequence") WHERE ("sequence" IS NOT NULL);



CREATE INDEX "task_dependencies_depends_on_idx" ON "public"."task_dependencies" USING "btree" ("depends_on_task_id");



CREATE INDEX "task_dependencies_project_idx" ON "public"."task_dependencies" USING "btree" ("project_id");



CREATE INDEX "task_moves_task_idx" ON "public"."task_moves" USING "btree" ("task_id", "moved_at" DESC);



CREATE INDEX "tasks_project_status_idx" ON "public"."tasks" USING "btree" ("project_id", "status");



CREATE INDEX "tasks_story_idx" ON "public"."tasks" USING "btree" ("story_id");



CREATE INDEX "user_stories_project_rank_idx" ON "public"."user_stories" USING "btree" ("project_id", "sprint_id", "rank");



CREATE INDEX "user_stories_project_sprint_idx" ON "public"."user_stories" USING "btree" ("project_id", "sprint_id");



CREATE OR REPLACE TRIGGER "classes_owner_swap_channel" AFTER UPDATE OF "created_by" ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_classes_owner_swap"();



CREATE OR REPLACE TRIGGER "conversations_dm_participants" AFTER INSERT ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_dm_participants"();



CREATE OR REPLACE TRIGGER "messages_bump_last_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_conversation_last_message"();



CREATE OR REPLACE TRIGGER "profiles_role_sanitizer_trig" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_role_sanitizer"();



CREATE OR REPLACE TRIGGER "project_members_sync_channels" AFTER INSERT OR DELETE ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."trg_project_members_sync"();



CREATE OR REPLACE TRIGGER "projects_provision_channels" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."trg_projects_provision_channels"();



CREATE OR REPLACE TRIGGER "projects_ta_swap_channel" AFTER UPDATE OF "assigned_ta_id" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."trg_projects_ta_swap"();



CREATE OR REPLACE TRIGGER "task_moves_apply" BEFORE INSERT ON "public"."task_moves" FOR EACH ROW EXECUTE FUNCTION "public"."scrum_apply_task_move"();



CREATE OR REPLACE TRIGGER "tsrs_set_updated_at" BEFORE UPDATE ON "public"."TSRs" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_evaluatee_id_fkey" FOREIGN KEY ("evaluatee_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_draft_usage"
    ADD CONSTRAINT "ai_draft_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_daily"
    ADD CONSTRAINT "analytics_daily_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id");



ALTER TABLE ONLY "public"."conversation_deletes"
    ADD CONSTRAINT "conversation_deletes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_deletes"
    ADD CONSTRAINT "conversation_deletes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."edu_email_verifications"
    ADD CONSTRAINT "edu_email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_preferences"
    ADD CONSTRAINT "email_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."final_review_notes"
    ADD CONSTRAINT "final_review_notes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_review_notes"
    ADD CONSTRAINT "final_review_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_review_notes"
    ADD CONSTRAINT "final_review_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."final_review_scores"
    ADD CONSTRAINT "final_review_scores_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_review_scores"
    ADD CONSTRAINT "final_review_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_review_scores"
    ADD CONSTRAINT "final_review_scores_scored_by_fkey" FOREIGN KEY ("scored_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."final_review_scores"
    ADD CONSTRAINT "final_review_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_review_slots"
    ADD CONSTRAINT "final_review_slots_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."final_review_slots"
    ADD CONSTRAINT "final_review_slots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."final_review_slots"
    ADD CONSTRAINT "final_review_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."final_review_slots"
    ADD CONSTRAINT "final_review_slots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_peer_user_id_fkey" FOREIGN KEY ("peer_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mcp_authorizations"
    ADD CONSTRAINT "mcp_authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("client_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mcp_authorizations"
    ADD CONSTRAINT "mcp_authorizations_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_grants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mcp_authorizations"
    ADD CONSTRAINT "mcp_authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mcp_grants"
    ADD CONSTRAINT "mcp_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("client_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mcp_grants"
    ADD CONSTRAINT "mcp_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mcp_tokens"
    ADD CONSTRAINT "mcp_tokens_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_grants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_invites"
    ADD CONSTRAINT "pending_invites_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_document_revisions"
    ADD CONSTRAINT "project_document_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_document_revisions"
    ADD CONSTRAINT "project_document_revisions_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_document_revisions"
    ADD CONSTRAINT "project_document_revisions_saved_by_fkey" FOREIGN KEY ("saved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_ta_assignments"
    ADD CONSTRAINT "project_ta_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."project_ta_assignments"
    ADD CONSTRAINT "project_ta_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."project_ta_assignments"
    ADD CONSTRAINT "project_ta_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_ta_assignments"
    ADD CONSTRAINT "project_ta_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_assigned_ta_id_fkey" FOREIGN KEY ("assigned_ta_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_entries"
    ADD CONSTRAINT "roster_entries_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."roster_entries"
    ADD CONSTRAINT "roster_entries_matched_profile_id_fkey" FOREIGN KEY ("matched_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scrum_comments"
    ADD CONSTRAINT "scrum_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scrum_comments"
    ADD CONSTRAINT "scrum_comments_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."user_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scrum_comments"
    ADD CONSTRAINT "scrum_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scrum_counters"
    ADD CONSTRAINT "scrum_counters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scrum_repos"
    ADD CONSTRAINT "scrum_repos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sprint_burnup_days"
    ADD CONSTRAINT "sprint_burnup_days_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_moves"
    ADD CONSTRAINT "task_moves_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_moves"
    ADD CONSTRAINT "task_moves_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."user_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stories"
    ADD CONSTRAINT "user_stories_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_stories"
    ADD CONSTRAINT "user_stories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stories"
    ADD CONSTRAINT "user_stories_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stories"
    ADD CONSTRAINT "user_stories_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE SET NULL;



ALTER TABLE "public"."TSRs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_draft_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_deletes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_deletes_select_own" ON "public"."conversation_deletes" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_participants_select_own" ON "public"."conversation_participants" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."conversation_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_reads_select_own" ON "public"."conversation_reads" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_select_participant" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversations"."id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."edu_email_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_suppressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."final_review_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."final_review_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."final_review_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."institutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_form" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_team_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mcp_authorizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mcp_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mcp_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mcp_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_select_participant" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "messages"."conversation_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."pending_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."project_document_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_join_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_review_tas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_ta_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roster_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scrum_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scrum_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scrum_repos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sprint_burnup_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sprints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_dependencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_moves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_stories" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."analytics_conversations"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_conversations"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_counted_dm"("p_institution" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_counted_dm"("p_institution" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_live_tasks"("p_institution" "uuid", "p_class" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_live_tasks"("p_institution" "uuid", "p_class" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_rollup_day"("p_day" "date", "p_snapshot" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_rollup_day"("p_day" "date", "p_snapshot" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_rollup_range"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_rollup_range"("p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_scope_classes"("p_institution" "uuid", "p_class" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_scope_classes"("p_institution" "uuid", "p_class" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_scope_counts"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_scope_counts"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_scope_teams"("p_institution" "uuid", "p_class" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_scope_teams"("p_institution" "uuid", "p_class" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_scrum"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_scrum"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_trends"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_trends"("p_institution" "uuid", "p_class" "uuid", "p_from" "date", "p_to" "date", "p_prev_from" "date", "p_prev_to" "date", "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."analytics_user_roles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."analytics_user_roles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."book_final_review_slot"("p_slot" "uuid", "p_project" "uuid", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."book_final_review_slot"("p_slot" "uuid", "p_project" "uuid", "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_conversation_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_conversation_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_conversation_last_message"() TO "service_role";



GRANT ALL ON TABLE "public"."email_outbox" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_email_outbox"("p_limit" integer, "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_email_outbox"("p_limit" integer, "p_lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."document_create"("p_project_id" "uuid", "p_kind" "text", "p_sprint_id" "uuid", "p_body" "jsonb", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."document_create"("p_project_id" "uuid", "p_kind" "text", "p_sprint_id" "uuid", "p_body" "jsonb", "p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."document_finalize"("p_document_id" "uuid", "p_revision" integer, "p_snapshot" "jsonb", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."document_finalize"("p_document_id" "uuid", "p_revision" integer, "p_snapshot" "jsonb", "p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."document_save"("p_document_id" "uuid", "p_body" "jsonb", "p_user" "uuid", "p_source" "text", "p_base" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."document_save"("p_document_id" "uuid", "p_body" "jsonb", "p_user" "uuid", "p_source" "text", "p_base" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."messages_inbox"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."messages_inbox"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_inbox"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_role_sanitizer"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_role_sanitizer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_role_sanitizer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."provision_team_channels"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."provision_team_channels"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."provision_team_channels"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_document_revisions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_document_revisions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_final_review_slot"("p_project" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_final_review_slot"("p_project" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."scrum_apply_task_move"() TO "anon";
GRANT ALL ON FUNCTION "public"."scrum_apply_task_move"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."scrum_apply_task_move"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb", "p_burnup" "jsonb", "p_expected_story_seq" integer, "p_expected_task_seq" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scrum_fill_board"("p_project_id" "uuid", "p_reporter_id" "uuid", "p_sprints" "jsonb", "p_stories" "jsonb", "p_burnup" "jsonb", "p_expected_story_seq" integer, "p_expected_task_seq" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."scrum_next_key"("p_project_id" "uuid", "p_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."scrum_next_key"("p_project_id" "uuid", "p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."scrum_next_key"("p_project_id" "uuid", "p_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."scrum_set_story_order"("p_project_id" "uuid", "p_sprint_id" "uuid", "p_story_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scrum_set_story_order"("p_project_id" "uuid", "p_sprint_id" "uuid", "p_story_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_classes_owner_swap"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_classes_owner_swap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_classes_owner_swap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_dm_participants"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_dm_participants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_dm_participants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_project_members_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_project_members_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_project_members_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_projects_provision_channels"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_projects_provision_channels"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_projects_provision_channels"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_projects_ta_swap"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_projects_ta_swap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_projects_ta_swap"() TO "service_role";



GRANT ALL ON TABLE "public"."TSRs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_draft_usage" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_daily" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."class_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_deletes" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";
GRANT SELECT ON TABLE "public"."conversation_participants" TO "authenticated";



GRANT ALL ON TABLE "public"."conversation_reads" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "service_role";
GRANT SELECT ON TABLE "public"."conversations" TO "authenticated";



GRANT ALL ON TABLE "public"."edu_email_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."email_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."email_suppressions" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."final_review_notes" TO "service_role";



GRANT ALL ON TABLE "public"."final_review_scores" TO "service_role";



GRANT ALL ON TABLE "public"."final_review_slots" TO "service_role";



GRANT ALL ON TABLE "public"."institutions" TO "service_role";



GRANT ALL ON TABLE "public"."interest_form" TO "service_role";



GRANT ALL ON TABLE "public"."interest_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."interest_team_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."mcp_authorizations" TO "service_role";



GRANT ALL ON TABLE "public"."mcp_clients" TO "service_role";



GRANT ALL ON TABLE "public"."mcp_grants" TO "service_role";



GRANT ALL ON TABLE "public"."mcp_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT SELECT ON TABLE "public"."messages" TO "authenticated";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."pending_invites" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."project_document_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."project_documents" TO "service_role";



GRANT ALL ON TABLE "public"."project_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."project_review_tas" TO "service_role";



GRANT ALL ON TABLE "public"."project_ta_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."roster_entries" TO "service_role";



GRANT ALL ON TABLE "public"."scrum_comments" TO "service_role";



GRANT ALL ON TABLE "public"."scrum_counters" TO "service_role";



GRANT ALL ON TABLE "public"."scrum_repos" TO "service_role";



GRANT ALL ON TABLE "public"."sprint_burnup_days" TO "service_role";



GRANT ALL ON TABLE "public"."sprints" TO "service_role";



GRANT ALL ON TABLE "public"."task_dependencies" TO "service_role";



GRANT ALL ON TABLE "public"."task_moves" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_stories" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







