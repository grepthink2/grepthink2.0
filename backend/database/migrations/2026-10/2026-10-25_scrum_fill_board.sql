-- 2026-10-25 — scrum_fill_board: add a batch of sprints, stories and tasks in one transaction
--
-- The scrum board MCP connector (app/mcp) lets a team member's AI assistant add a whole plan to the
-- board at once. Adding it row by row costs a `scrum_next_key` round trip per story and task, and a
-- failure halfway would leave half a plan on the board. This function writes the batch in one
-- transaction: everything lands, or nothing does.
--
--   * Trusts its caller. The backend authorizes (team member) and validates every field (points on
--     the project's scale, assignees on the team, sprints of this project and not completed, tags,
--     lengths) before calling it. The table CHECKs still hold as the outer fence.
--   * Keys: one UPDATE advances `scrum_counters` by the batch's counts, so the batch takes the next
--     consecutive numbers, `US-<n>` and `GT-<n>`, in input order. It takes the same row lock
--     `scrum_next_key` does, so a concurrent single add waits and then numbers after the batch.
--   * Sprints are created `planned` (the column default). A story names its sprint by `sprint_ref`
--     (a new sprint in this batch) or `sprint_id` (an existing one), or neither (backlog). A ref
--     that names no sprint of the batch, or an id that is not a sprint of this project, raises: the
--     backend checked both, so either means the board changed in between. Whether a sprint has
--     ended is the backend's to say (from its dates, in the school's zone): `sprints.status` is
--     never read.
--   * A JSON null `tasks` or `tags` counts as an empty list.
--   * Returns `{"sprints": [{ref, id, name}], "stories": [{id, key, title, sprint_id,
--     tasks: [{id, key, title}]}]}`.
--   * Executable by service_role only: the browser roles get nothing (2026-09-21 lock-down).
--
-- p_sprints: [{ref, name, starts_at, ends_at}]
-- p_stories: [{title, description_md, points, assignee_id, sprint_ref, sprint_id,
--              tasks: [{title, description_md, points, estimate_hours, assignee_id, tags}]}]
--
-- Idempotent (CREATE OR REPLACE). Nothing calls it until the backend that does is deployed.
--
-- Applied: DEV 2026-10-27 (by Claude, via psql)   PROD — pending

BEGIN;

CREATE OR REPLACE FUNCTION public.scrum_fill_board(
  p_project_id uuid,
  p_reporter_id uuid,
  p_sprints jsonb,
  p_stories jsonb
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

REVOKE ALL ON FUNCTION public.scrum_fill_board(uuid, uuid, jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrum_fill_board(uuid, uuid, jsonb, jsonb) TO service_role;

COMMIT;
