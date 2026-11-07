-- 2026-11-05 — scrum_fill_board imports finished work: task statuses, backdated moves, a rebuilt burnup
--
-- The scrum board MCP connector (app/mcp) lets a team that already runs sprints elsewhere move its board in,
-- finished work included. Spec: docs/superpowers/specs/2026-10-30-connector-import-finished-work-design.md.
--
--   * user_stories.imported_at: set on every story the connector writes during a team's move-in, NULL
--     otherwise. Stories with it set don't count toward the 3 that close the move-in, and a sprint's chart
--     says it includes imported work when one arrived on or after the sprint's first day.
--   * Three new arguments, p_burnup and the two expected counters, and so a new signature. The backend calls by
--     argument name, so a backend ahead of this file fails loudly instead of importing done tasks as To do.
--   * Like the four-argument function, this trusts its caller: the backend authorizes (team member), validates
--     every field and computes the dates and the burnup rows, because the school's zone lives there.
--   * Each story object may carry imported_at, and each task object status and moved_at. Tasks are inserted at
--     To do; one not at To do gets one task_moves row, and the existing trigger (scrum_apply_task_move) sets its
--     status, moved_by and moved_at, so it looks as if the team had moved it that day.
--   * p_burnup: [{sprint_id | sprint_ref, day, scope_points, completed_points, scope_hours, completed_hours}].
--     Each sprint it names has its saved sprint_burnup_days rows replaced by the given ones. A failure rolls back
--     the whole batch. A ref that names no sprint of the batch, or an id that is not a sprint of this project,
--     raises.
--   * p_expected_story_seq, p_expected_task_seq: the project's scrum_counters as the backend read them before it
--     read the work the rows are computed from. With rows to write, a different value raises 23505 (the API's
--     409), because a batch or an add since then would be missing from those rows. Holding the counter row's lock
--     makes the check and the write one step, so two overlapping imports can't overwrite each other's chart.
--     Without rows they are ignored.
--   * Returns what the four-argument function returned, with each task's status.
--   * Executable by service_role only: the browser roles get nothing (2026-09-21 lock-down).
--
-- CREATE OR REPLACE with new arguments leaves the four-argument function in place, so a deployed backend
-- keeps working. After the code that calls this one is live on PROD, drop it:
--   DROP FUNCTION public.scrum_fill_board(uuid, uuid, jsonb, jsonb);
--
-- Idempotent. Apply before the code that calls it deploys.
--
-- Applied: DEV 2026-11-05 (by Claude, via the Supabase CLI)   PROD pending

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE OR REPLACE FUNCTION public.scrum_fill_board(
  p_project_id uuid,
  p_reporter_id uuid,
  p_sprints jsonb,
  p_stories jsonb,
  p_burnup jsonb,
  p_expected_story_seq integer,
  p_expected_task_seq integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
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

REVOKE ALL ON FUNCTION public.scrum_fill_board(uuid, uuid, jsonb, jsonb, jsonb, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrum_fill_board(uuid, uuid, jsonb, jsonb, jsonb, integer, integer) TO service_role;

COMMIT;
