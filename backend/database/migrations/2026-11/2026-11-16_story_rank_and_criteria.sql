-- 2026-11-16 — stories get a priority order (rank) and a list of acceptance criteria
--
-- A team orders the stories of each sprint, and of its backlog, by priority, and writes each story's
-- acceptance criteria as a list on the story (app/scrum). The release plan, the release summary and the
-- test report build on both.
--
--   * user_stories.rank: a story's place in its sprint's list, or in the backlog's, 1 first. NULL for a
--     story nobody has ordered yet: a new story, and one that moves to another sprint or to the backlog
--     (update_story sets it back to NULL in the same write). The board lists stories by rank, NULLs last,
--     then by key.
--   * user_stories.acceptance_criteria: short statements, at most 20 (user_stories_criteria_valid). The API
--     also trims each one and holds it to 1–300 characters; the CHECK caps only the count.
--   * user_stories_project_rank_idx (project_id, sprint_id, rank): one list's stories in rank order.
--   * scrum_set_story_order(p_project_id, p_sprint_id, p_story_ids) orders one list of the project's stories:
--     one sprint's live stories, or the backlog when p_sprint_id is NULL (stories with no sprint, and legacy
--     archived ones whatever sprint they still name: the board's rule). It locks that list's stories in id
--     order, refuses with 23505 ("stories changed", the API's 409) unless p_story_ids are exactly those
--     stories, each once, and otherwise gives each its position as its rank (1 first) in one UPDATE and
--     answers how many it ranked. The check sits under the lock, so no story can leave or join the list
--     between the check and the write. PUT /api/projects/{project_id}/scrum/stories/order checks that the
--     caller is on the team and that the sprint is the project's before it calls this. It is the only writer
--     of a rank; update_story only puts one back to NULL.
--   * The function is SECURITY INVOKER and executable by service_role only: the browser roles get nothing
--     (2026-09-21 lock-down).
--
-- EXPAND, idempotent, one transaction: a re-run skips the columns and the index, drops the CHECK and adds
-- it again by name (an inline CHECK on ADD COLUMN IF NOT EXISTS would be skipped with its column on a
-- re-run), and replaces the function. Adding acceptance_criteria with a constant default rewrites no row.
-- Safe to apply before or after the code that uses it deploys. Until it is applied, the order route
-- answers a database error and a story write that names acceptance_criteria fails; every other request
-- works on either schema (the board reads stories with select *, and a story move names rank only when
-- the row it read has the column). Apply on DEV before the branch is tested there, and on PROD before the
-- release that ships it.
--
-- Applied: DEV 2026-11-16 (by Claude, via the Supabase connector, after a rolled-back rehearsal)
--          PROD — applied, verified 2026-11-19 (catalog check)
--
-- PREFLIGHT (expect no rows, or on a re-run exactly: acceptance_criteria ARRAY, rank integer, and the one
-- function public.scrum_set_story_order(uuid,uuid,uuid[]). A column of either name with another type, or a
-- function of that name with other arguments, means something else got there first: stop and look):
--
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'user_stories'
--      AND column_name IN ('rank', 'acceptance_criteria');
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'scrum_set_story_order';

BEGIN;

-- Fail fast if a lock is contended rather than queue live traffic behind the ALTERs, which lock
-- user_stories until COMMIT. Nothing is rewritten; the CHECK and the index read one table.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS rank integer;
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS acceptance_criteria text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_criteria_valid;
ALTER TABLE public.user_stories ADD CONSTRAINT user_stories_criteria_valid
  CHECK (cardinality(acceptance_criteria) <= 20);
CREATE INDEX IF NOT EXISTS user_stories_project_rank_idx ON public.user_stories (project_id, sprint_id, rank);

-- Orders one list: one sprint's live stories, or the backlog when p_sprint_id is NULL. Refuses (23505)
-- unless p_story_ids are exactly the list's stories, each once; then rank = position in p_story_ids.
CREATE OR REPLACE FUNCTION public.scrum_set_story_order(
  p_project_id uuid,
  p_sprint_id uuid,
  p_story_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.scrum_set_story_order(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrum_set_story_order(uuid, uuid, uuid[]) TO service_role;

COMMIT;

-- Check. Expected right after applying:
--   1. acceptance_criteria ARRAY (_text), default '{}'::text[], not nullable; rank integer, no default,
--      nullable;
--   2. user_stories_criteria_valid, CHECK ((cardinality(acceptance_criteria) <= 20));
--   3. one index, on (project_id, sprint_id, rank);
--   4. one function, scrum_set_story_order(uuid,uuid,uuid[]), plpgsql, not SECURITY DEFINER,
--      search_path=public, executable by service_role and by neither anon nor authenticated;
--   5. no story with a rank or a criterion yet.
SELECT column_name, data_type, udt_name, column_default, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_stories'
   AND column_name IN ('rank', 'acceptance_criteria')
 ORDER BY column_name;
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
 WHERE conrelid = 'public.user_stories'::regclass AND conname = 'user_stories_criteria_valid';
SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_stories_project_rank_idx';
SELECT p.oid::regprocedure AS function, l.lanname AS language, p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'scrum_set_story_order';
SELECT count(*) FILTER (WHERE rank IS NOT NULL) AS ranked,
       count(*) FILTER (WHERE cardinality(acceptance_criteria) > 0) AS with_criteria
  FROM public.user_stories;

-- Rehearsal on DEV, rolled back (not part of the migration; run it by hand after applying, one statement at
-- a time). It takes the first project, by id, whose backlog holds two or more stories. Expected:
--   1. its backlog in descending key order: set_count = expected, and the SELECT after it lists that
--      backlog ranked 1..n in that order;
--   2. the same list less its first story: ERROR 23505 "stories changed", and no rank changes;
--   3. the same list with a story of another project added: the same refusal.
--
--   BEGIN;
--   CREATE TEMP TABLE target ON COMMIT DROP AS
--     SELECT project_id, array_agg(id ORDER BY key DESC) AS ids FROM public.user_stories
--      WHERE sprint_id IS NULL OR archived_at IS NOT NULL
--      GROUP BY project_id HAVING count(*) >= 2 ORDER BY project_id LIMIT 1;
--   SELECT public.scrum_set_story_order(project_id, NULL, ids) AS set_count, cardinality(ids) AS expected
--     FROM target;
--   SELECT u.key, u.rank FROM public.user_stories u JOIN target t USING (project_id)
--    WHERE u.rank IS NOT NULL ORDER BY u.rank;
--   SAVEPOINT refused;
--   SELECT public.scrum_set_story_order(project_id, NULL, ids[2:]) FROM target;
--   ROLLBACK TO SAVEPOINT refused;
--   SELECT public.scrum_set_story_order(t.project_id, NULL, t.ids || s.id)
--     FROM target t JOIN public.user_stories s ON s.project_id <> t.project_id LIMIT 1;
--   ROLLBACK TO SAVEPOINT refused;
--   ROLLBACK;
