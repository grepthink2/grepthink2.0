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
--   * scrum_set_story_order(p_project_id, p_story_ids): one UPDATE gives every listed story of the project
--     its position in p_story_ids as its rank (1 first) and answers how many stories it set; an id of
--     another project is not touched. It trusts its caller: PUT /api/projects/{project_id}/scrum/stories/order
--     checks that the caller is on the team and that the ids are exactly the live stories of one sprint, or
--     of the backlog (409 otherwise), before it calls this. It is the only writer of a rank; update_story
--     only puts one back to NULL.
--   * Executable by service_role only: the browser roles get nothing (2026-09-21 lock-down).
--
-- EXPAND, idempotent, one transaction: a re-run skips the columns and the index, drops the CHECK and adds
-- it again by name (an inline CHECK on ADD COLUMN IF NOT EXISTS would be skipped with its column on a
-- re-run), and replaces the function. Adding acceptance_criteria with a constant default rewrites no row.
-- Safe to apply before or after the code that uses it deploys. Until it is applied, the order route
-- answers a database error and a story write that names acceptance_criteria fails; every other request
-- works on either schema (the board reads stories with select *, and a story move clears a rank only
-- when the story has one). Apply on DEV before the branch is tested there, and on PROD before the release
-- that ships it.
--
-- Applied: DEV — pending   PROD — pending
--
-- PREFLIGHT (expect no rows, or on a re-run exactly: acceptance_criteria ARRAY, rank integer, and the one
-- function public.scrum_set_story_order(uuid,uuid[]). A column of either name with another type, or a
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

-- One statement orders a whole list: rank = position in p_story_ids. Stories of another project
-- are not touched.
CREATE OR REPLACE FUNCTION public.scrum_set_story_order(p_project_id uuid, p_story_ids uuid[])
RETURNS integer LANGUAGE sql SET search_path = public AS $$
  WITH ordered AS (SELECT id, ord FROM unnest(p_story_ids) WITH ORDINALITY AS t(id, ord)),
  done AS (
    UPDATE user_stories s SET rank = o.ord::integer
      FROM ordered o WHERE s.id = o.id AND s.project_id = p_project_id
    RETURNING 1)
  SELECT count(*)::integer FROM done;
$$;

REVOKE ALL ON FUNCTION public.scrum_set_story_order(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrum_set_story_order(uuid, uuid[]) TO service_role;

COMMIT;

-- Check. Expected right after applying:
--   1. acceptance_criteria ARRAY (_text), default '{}'::text[], not nullable; rank integer, no default,
--      nullable;
--   2. user_stories_criteria_valid, CHECK ((cardinality(acceptance_criteria) <= 20));
--   3. one index, on (project_id, sprint_id, rank);
--   4. one function, scrum_set_story_order(uuid,uuid[]), not SECURITY DEFINER, search_path=public,
--      executable by service_role and by neither anon nor authenticated;
--   5. no story with a rank or a criterion yet.
SELECT column_name, data_type, udt_name, column_default, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_stories'
   AND column_name IN ('rank', 'acceptance_criteria')
 ORDER BY column_name;
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
 WHERE conrelid = 'public.user_stories'::regclass AND conname = 'user_stories_criteria_valid';
SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_stories_project_rank_idx';
SELECT p.oid::regprocedure AS function, p.prosecdef AS security_definer, p.proconfig AS settings,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'scrum_set_story_order';
SELECT count(*) FILTER (WHERE rank IS NOT NULL) AS ranked,
       count(*) FILTER (WHERE cardinality(acceptance_criteria) > 0) AS with_criteria
  FROM public.user_stories;

-- Rehearsal on DEV, rolled back (not part of the migration; run it by hand after applying). It orders
-- one project's backlog by key, descending, with a story of another project appended to the list.
-- Expected: set_count equals expected (the other project's story is not touched), and the last SELECT
-- lists that backlog only, ranked 1..n in that order:
--
--   BEGIN;
--   WITH target AS (
--     SELECT project_id, array_agg(id ORDER BY key DESC) AS ids FROM public.user_stories
--      WHERE sprint_id IS NULL AND archived_at IS NULL
--      GROUP BY project_id HAVING count(*) >= 2 LIMIT 1),
--   stranger AS (
--     SELECT s.id FROM public.user_stories s, target t WHERE s.project_id <> t.project_id LIMIT 1)
--   SELECT public.scrum_set_story_order(t.project_id, t.ids || ARRAY(SELECT id FROM stranger)) AS set_count,
--          cardinality(t.ids) AS expected
--     FROM target t;
--   SELECT project_id, key, rank FROM public.user_stories WHERE rank IS NOT NULL ORDER BY project_id, rank;
--   ROLLBACK;
