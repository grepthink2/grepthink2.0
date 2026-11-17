-- 2026-11-17 — project documents: two tables, the functions that are their only writers, and what a
-- sprint's burnup snapshot remembers of its stories
--
-- A team keeps its end-of-term documents in GrepThink (app/documents): a sprint report for each sprint, and a
-- release summary and a test plan and report for the project. Every save is a revision; finalizing stamps the
-- head revision with the document's derived sections (what the board said), frozen, and every revision handed
-- in that way is kept.
--
-- Requires 2026-11-16_story_rank_and_criteria.sql: the documents read user_stories.rank and
-- acceptance_criteria by name.
--
--   * project_documents: one row per document. kind is one of five; sprint_plan and release_plan are kept for
--     later work, and the API refuses them for now. A sprint's kinds name their sprint and a project's kinds
--     name none (project_documents_sprint_shape); one partial unique index allows one document per sprint and
--     kind, another one per project and kind. head_revision is the newest revision's number. finalized_revision,
--     finalized_at and finalized_by say which revision was handed in last, when and by whom. status turns
--     'final' on the first finalize and never back: a later save leaves the document final at its finalized
--     revision.
--   * project_document_revisions: every save of a document, numbered from 1. body is what the team typed.
--     A revision that was handed in carries the derived sections finalize froze on it (snapshot), when
--     (finalized_at) and by whom (finalized_by); every other revision has NULL there. A snapshot, once written,
--     never changes. source says what wrote the revision: 'seed' (revision 1), 'edit', or 'import' and
--     'export' (kept for the sprint plan's round trip with the board, later work). The saver's and the
--     finalizer's foreign keys both point at profiles, so an embed names its own
--     (project_document_revisions_saved_by_fkey).
--   * document_create, document_save and document_finalize write both tables, each in one transaction. The
--     backend checks who may call them and validates the body first.
--       document_create inserts a draft whose head is revision 1 (source 'seed'). It takes no lock on the
--         document; a second document of the same sprint and kind, or of the same project and kind, fails on its
--         unique index with 23505 (the API's 409). A sprint that is not the project's raises P0002, and the
--         sprint it names is held (FOR KEY SHARE) until the insert commits.
--       document_save locks the document, adds revision head+1 and makes it the head. Given p_base (the revision
--         the saver started from) and a head that is not p_base, it also answers that head's number and who
--         saved it: the save replaced a revision the saver never saw. No such document raises P0002.
--       document_finalize locks the document and refuses with 23505 ("document changed", the API's 409) unless
--         p_revision is still the head. It writes p_snapshot, now() and p_user on that revision, makes the
--         document final at it and answers the revision. Asked to finalize the revision that is already the
--         finalized one, it changes nothing and answers NULL, so the caller knows it wrote nothing (and tells
--         nobody). No such document raises P0002.
--   * prune_document_revisions() deletes the revisions a document no longer needs, every one but its head and
--     the ones handed in: once its sprint ended 7 days ago (a sprint's document) or once its class's last day
--     of classes was 30 days ago (a project's; a class with no end_date keeps them all). Days are UTC dates.
--     ../prod/2026-11/2026-11-17_document_revisions_cron.sql runs it every day.
--   * sprint_burnup_days.stories: the stories a sprint held on that day, as a JSON array in board order of
--     {"id": uuid, "done": bool, "hours": int, "points": int | null}, one per live story: done when it had at
--     least one task and every task was done, hours the sum of its tasks' estimate hours (0 when none had any),
--     points the story's. The board writes it with every snapshot it takes (scrum.controller._snapshot_burnup_safe),
--     so a sprint report describes the sprint as it ended. Rows from before this file, and the rows the
--     connector's import writes (scrum_fill_board's p_burnup), keep NULL. sprint_burnup_days_stories_valid holds
--     it to NULL or an array. An earlier text of this file added story_ids and done_story_ids in its place (DEV
--     only); this text drops them where they exist.
--   * RLS on and no policies, and the browser roles get nothing (2026-09-21 lock-down). The four functions are
--     SECURITY INVOKER with search_path pinned, and executable by service_role only.
--
-- EXPAND, idempotent, one transaction: a re-run skips the tables, the columns and the indexes, drops each
-- CHECK and adds it again by name, replaces the functions, and drops the two columns of the earlier text, which
-- nothing reads or writes any more (they never reached PROD). Nothing reads the documents' tables before the
-- code that uses them deploys, and until this is applied the documents routes answer a database error while
-- everything else works: the board's snapshot writes its stories only where the column exists (it retries
-- without it), and the class schedule's check for documents skips them while the table is missing. Apply on
-- DEV before the branch is tested there, and on PROD before the release that ships it.
--
-- Applied: DEV 2026-11-17 (by Claude, via the Supabase connector, after a rolled-back rehearsal), the earlier
-- text with story_ids and done_story_ids: run this text there again   PROD — pending
--
-- PREFLIGHT (expect no rows. On a re-run, exactly the two tables, the sprint_burnup_days column stories (jsonb)
-- or, where only the earlier text ran, story_ids and done_story_ids (ARRAY), and the four functions, with the
-- arguments written below; anything else of these names means something else got there first: stop and look):
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('project_documents', 'project_document_revisions');
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'sprint_burnup_days'
--      AND column_name IN ('stories', 'story_ids', 'done_story_ids');
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN ('document_create', 'document_save', 'document_finalize', 'prune_document_revisions');

BEGIN;

-- Fail fast rather than queue live traffic: adding the foreign keys briefly locks projects, sprints and
-- profiles against writes, and the column changes lock sprint_burnup_days (no rewrite: the new column is
-- nullable with no default, a dropped one is only marked dropped, and the CHECK reads the table once).
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.project_documents (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid        NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  kind               text        NOT NULL,
  sprint_id          uuid        REFERENCES public.sprints (id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'draft',
  head_revision      integer     NOT NULL DEFAULT 0,
  finalized_revision integer,
  finalized_at       timestamptz,
  finalized_by       uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by         uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_kind_valid;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_kind_valid
  CHECK (kind IN ('sprint_plan', 'sprint_report', 'release_plan', 'release_summary', 'test_report'));
ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_status_valid;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_status_valid
  CHECK (status IN ('draft', 'final'));
ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_sprint_shape;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_sprint_shape
  CHECK ((kind IN ('sprint_plan', 'sprint_report')) = (sprint_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS project_documents_sprint_kind_uq
  ON public.project_documents (sprint_id, kind) WHERE sprint_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_documents_project_kind_uq
  ON public.project_documents (project_id, kind) WHERE sprint_id IS NULL;
-- A team's documents (its Documents tab, a class's list, the cascade from projects), and the cascades from
-- profiles. The sprint's unique index serves the cascade from sprints and the class schedule's check.
CREATE INDEX IF NOT EXISTS project_documents_project_idx ON public.project_documents (project_id);
CREATE INDEX IF NOT EXISTS project_documents_created_by_idx ON public.project_documents (created_by);
CREATE INDEX IF NOT EXISTS project_documents_finalized_by_idx ON public.project_documents (finalized_by);

CREATE TABLE IF NOT EXISTS public.project_document_revisions (
  document_id  uuid        NOT NULL REFERENCES public.project_documents (id) ON DELETE CASCADE,
  number       integer     NOT NULL,
  body         jsonb       NOT NULL,
  snapshot     jsonb,
  source       text        NOT NULL DEFAULT 'edit',
  saved_by     uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  saved_at     timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  PRIMARY KEY (document_id, number)
);

-- The two hand-in columns again, for a database that created the table from an earlier text of this file.
ALTER TABLE public.project_document_revisions ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.project_document_revisions ADD COLUMN IF NOT EXISTS finalized_by uuid
  REFERENCES public.profiles (id) ON DELETE SET NULL;
ALTER TABLE public.project_document_revisions DROP CONSTRAINT IF EXISTS project_document_revisions_number_valid;
ALTER TABLE public.project_document_revisions ADD CONSTRAINT project_document_revisions_number_valid
  CHECK (number >= 1);
ALTER TABLE public.project_document_revisions DROP CONSTRAINT IF EXISTS project_document_revisions_source_valid;
ALTER TABLE public.project_document_revisions ADD CONSTRAINT project_document_revisions_source_valid
  CHECK (source IN ('seed', 'edit', 'import', 'export'));
ALTER TABLE public.project_document_revisions DROP CONSTRAINT IF EXISTS project_document_revisions_size;
ALTER TABLE public.project_document_revisions ADD CONSTRAINT project_document_revisions_size
  CHECK (pg_column_size(body) <= 262144 AND (snapshot IS NULL OR pg_column_size(snapshot) <= 262144));

CREATE INDEX IF NOT EXISTS project_document_revisions_saved_by_idx
  ON public.project_document_revisions (saved_by);
CREATE INDEX IF NOT EXISTS project_document_revisions_finalized_by_idx
  ON public.project_document_revisions (finalized_by) WHERE finalized_by IS NOT NULL;

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_document_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_documents, public.project_document_revisions FROM anon, authenticated;
GRANT ALL ON public.project_documents, public.project_document_revisions TO service_role;

-- The stories a sprint held on a snapshot's day, with their numbers (see the header). NULL: not recorded.
ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS stories jsonb;
ALTER TABLE public.sprint_burnup_days DROP CONSTRAINT IF EXISTS sprint_burnup_days_stories_valid;
ALTER TABLE public.sprint_burnup_days ADD CONSTRAINT sprint_burnup_days_stories_valid
  CHECK (stories IS NULL OR jsonb_typeof(stories) = 'array');
-- The two arrays the earlier text added in its place (DEV only).
ALTER TABLE public.sprint_burnup_days DROP COLUMN IF EXISTS story_ids;
ALTER TABLE public.sprint_burnup_days DROP COLUMN IF EXISTS done_story_ids;

-- A new draft: the document, with revision 1 (source 'seed') as its head. Answers the document's id.
CREATE OR REPLACE FUNCTION public.document_create(
  p_project_id uuid,
  p_kind text,
  p_sprint_id uuid,
  p_body jsonb,
  p_user uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_sprint_id IS NOT NULL THEN
    -- The sprint must be the project's; held until commit, so it can't go between the check and the insert.
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

REVOKE ALL ON FUNCTION public.document_create(uuid, text, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_create(uuid, text, uuid, jsonb, uuid) TO service_role;

-- One save: revision head+1, now the head. overwrote_number and overwrote_by name the head it replaced when
-- the saver started from another revision (p_base), else they are NULL.
CREATE OR REPLACE FUNCTION public.document_save(
  p_document_id uuid,
  p_body jsonb,
  p_user uuid,
  p_source text,
  p_base integer
) RETURNS TABLE (number integer, overwrote_number integer, overwrote_by uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_head integer;
  v_head_by uuid;
BEGIN
  -- The lock queues two saves of one document, so each takes the next number.
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

REVOKE ALL ON FUNCTION public.document_save(uuid, jsonb, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_save(uuid, jsonb, uuid, text, integer) TO service_role;

-- Hands in the head revision: p_snapshot (the derived sections), now() and p_user go on it, and the document is
-- final at it. Answers the revision, or NULL when it was the finalized revision already (nothing written).
CREATE OR REPLACE FUNCTION public.document_finalize(
  p_document_id uuid,
  p_revision integer,
  p_snapshot jsonb,
  p_user uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_head integer;
  v_finalized integer;
BEGIN
  -- The lock holds saves back until this commits: no revision can follow the head between the check and the
  -- stamp, and of two finalizers of one head, the second finds it finalized.
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
    RETURN NULL;  -- final at this revision already: its snapshot stays as it was handed in
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

REVOKE ALL ON FUNCTION public.document_finalize(uuid, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_finalize(uuid, integer, jsonb, uuid) TO service_role;

-- Deletes the revisions no document needs any more (see the header) and answers how many. A hand-in (a
-- revision with a snapshot) is never deleted.
CREATE OR REPLACE FUNCTION public.prune_document_revisions()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.prune_document_revisions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_document_revisions() TO service_role;

COMMIT;

-- Check. Expected right after applying:
--   1. on project_documents: the primary key, four foreign keys (created_by, finalized_by, project_id,
--      sprint_id) and project_documents_kind_valid, _status_valid and _sprint_shape; on
--      project_document_revisions: the primary key (document_id, number), three foreign keys (document_id,
--      finalized_by, saved_by: project_document_revisions_saved_by_fkey among them) and
--      project_document_revisions_number_valid, _source_valid (seed, edit, import, export) and _size;
--   2. the indexes behind both primary keys, project_documents_sprint_kind_uq (UNIQUE, WHERE sprint_id IS NOT
--      NULL), project_documents_project_kind_uq (UNIQUE, WHERE sprint_id IS NULL), project_documents_project_idx,
--      _created_by_idx, _finalized_by_idx, project_document_revisions_saved_by_idx and _finalized_by_idx (WHERE
--      finalized_by IS NOT NULL);
--   3. sprint_burnup_days.stories: jsonb, nullable, no default, NULL on every row, held by
--      sprint_burnup_days_stories_valid (stories IS NULL OR jsonb_typeof(stories) = 'array'); no story_ids or
--      done_story_ids;
--   4. four functions, plpgsql, not SECURITY DEFINER, search_path=public, executable by service_role and by
--      neither anon nor authenticated;
--   5. RLS on both tables, no policies, no anon or authenticated grants, and no rows yet.
SELECT conrelid::regclass AS "table", conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid IN ('public.project_documents'::regclass, 'public.project_document_revisions'::regclass)
 ORDER BY 1, 2;
SELECT tablename, indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND tablename IN ('project_documents', 'project_document_revisions')
 ORDER BY tablename, indexname;
SELECT column_name, data_type, udt_name, column_default, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'sprint_burnup_days'
   AND column_name IN ('stories', 'story_ids', 'done_story_ids')
 ORDER BY column_name;
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
 WHERE conrelid = 'public.sprint_burnup_days'::regclass AND conname = 'sprint_burnup_days_stories_valid';
SELECT count(*) FILTER (WHERE stories IS NOT NULL) AS rows_with_stories FROM public.sprint_burnup_days;
SELECT p.oid::regprocedure AS function, l.lanname AS language, p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('document_create', 'document_save', 'document_finalize', 'prune_document_revisions')
 ORDER BY p.proname;
SELECT c.relname AS "table", c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies x WHERE x.schemaname = 'public' AND x.tablename = c.relname) AS policies,
       (SELECT count(*) FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = c.relname
           AND g.grantee IN ('anon', 'authenticated')) AS client_grants
  FROM pg_class c
 WHERE c.oid IN ('public.project_documents'::regclass, 'public.project_document_revisions'::regclass)
 ORDER BY 1;
SELECT (SELECT count(*) FROM public.project_documents) AS documents,
       (SELECT count(*) FROM public.project_document_revisions) AS revisions;

-- Rehearsal on DEV, rolled back (not part of the migration; run it by hand after applying, one statement at a
-- time). It takes the earliest-ending sprint, by ends_at then id, that has a team member, and acts as that
-- member. Expected:
--   1. document_create answers an id; a second sprint report for the same sprint fails with 23505;
--   2. a release summary with a sprint fails with P0002 when the sprint is another project's (any project's
--      first other sprint), and with 23514 (project_documents_sprint_shape) when it is this project's;
--   3. the first save, from revision 1, answers (2, NULL, NULL); a second one, also from revision 1, answers
--      (3, 2, the member's id);
--   4. a save of a document that does not exist fails with P0002;
--   5. finalizing revision 2, no longer the head, fails with 23505 "document changed";
--   6. finalizing revision 3 answers 3; the document is final at 3 with its finalizer set, and revision 3 alone
--      holds the snapshot {"frozen": 1}, with finalized_at and finalized_by set;
--   7. finalizing revision 3 again answers NULL and leaves the snapshot {"frozen": 1};
--   8. a save after that answers (4, NULL, NULL), and the document stays final at revision 3; finalizing 4
--      answers 4: the document is final at 4, and revision 3 keeps {"frozen": 1} and its finalized_at;
--   9. a save after that (5); then, with the sprint moved to end 8 days ago, prune_document_revisions()
--      answers at least 2, and the document keeps revisions 3 and 4 (handed in) and 5 (the head) only;
--  10. a burnup snapshot row takes a stories array and answers it, and an object there fails with 23514
--      (sprint_burnup_days_stories_valid).
--
--   BEGIN;
--   CREATE TEMP TABLE target ON COMMIT DROP AS
--     SELECT s.project_id, s.id AS sprint_id, m.user_id FROM public.sprints s
--       JOIN public.project_members m ON m.project_id = s.project_id
--      ORDER BY s.ends_at, s.id, m.user_id LIMIT 1;
--   CREATE TEMP TABLE doc ON COMMIT DROP AS
--     SELECT public.document_create(project_id, 'sprint_report', sprint_id, '{"stop": []}', user_id) AS id
--       FROM target;
--   SELECT id FROM doc;
--   SAVEPOINT refused;
--   SELECT public.document_create(project_id, 'sprint_report', sprint_id, '{}', user_id) FROM target;
--   ROLLBACK TO SAVEPOINT refused;
--   SELECT public.document_create(t.project_id, 'release_summary', s.id, '{}', t.user_id)
--     FROM target t JOIN public.sprints s ON s.project_id <> t.project_id LIMIT 1;
--   ROLLBACK TO SAVEPOINT refused;
--   SELECT public.document_create(project_id, 'release_summary', sprint_id, '{}', user_id) FROM target;
--   ROLLBACK TO SAVEPOINT refused;
--   SELECT * FROM public.document_save((SELECT id FROM doc), '{"stop": [1]}', (SELECT user_id FROM target), 'edit', 1);
--   SELECT * FROM public.document_save((SELECT id FROM doc), '{"stop": [2]}', (SELECT user_id FROM target), 'edit', 1);
--   SAVEPOINT saved;
--   SELECT * FROM public.document_save(gen_random_uuid(), '{}', NULL, 'edit', NULL);
--   ROLLBACK TO SAVEPOINT saved;
--   SELECT public.document_finalize((SELECT id FROM doc), 2, '{"frozen": 1}', (SELECT user_id FROM target));
--   ROLLBACK TO SAVEPOINT saved;
--   SELECT public.document_finalize((SELECT id FROM doc), 3, '{"frozen": 1}', (SELECT user_id FROM target));
--   SELECT status, head_revision, finalized_revision, finalized_by IS NOT NULL AS has_finalizer
--     FROM public.project_documents WHERE id = (SELECT id FROM doc);
--   SELECT number, source, snapshot, finalized_at IS NOT NULL AS handed_in, finalized_by
--     FROM public.project_document_revisions WHERE document_id = (SELECT id FROM doc) ORDER BY number;
--   SELECT public.document_finalize((SELECT id FROM doc), 3, '{"frozen": 2}', (SELECT user_id FROM target));
--   SELECT number, snapshot FROM public.project_document_revisions
--    WHERE document_id = (SELECT id FROM doc) AND number = 3;
--   SELECT * FROM public.document_save((SELECT id FROM doc), '{"stop": [3]}', (SELECT user_id FROM target), 'edit', 3);
--   SELECT status, head_revision, finalized_revision FROM public.project_documents WHERE id = (SELECT id FROM doc);
--   SELECT public.document_finalize((SELECT id FROM doc), 4, '{"frozen": 4}', (SELECT user_id FROM target));
--   SELECT number, snapshot, finalized_at IS NOT NULL AS handed_in FROM public.project_document_revisions
--    WHERE document_id = (SELECT id FROM doc) ORDER BY number;
--   SELECT * FROM public.document_save((SELECT id FROM doc), '{"stop": [5]}', (SELECT user_id FROM target), 'edit', 4);
--   UPDATE public.sprints
--      SET starts_at = (now() AT TIME ZONE 'UTC')::date - 14, ends_at = (now() AT TIME ZONE 'UTC')::date - 8
--    WHERE id = (SELECT sprint_id FROM target);
--   SELECT public.prune_document_revisions() AS pruned;
--   SELECT number FROM public.project_document_revisions WHERE document_id = (SELECT id FROM doc) ORDER BY number;
--   INSERT INTO public.sprint_burnup_days (sprint_id, day, scope_points, completed_points, stories)
--     SELECT sprint_id, (now() AT TIME ZONE 'UTC')::date, 0, 0,
--            jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'done', true, 'hours', 3, 'points', NULL))
--       FROM target
--   ON CONFLICT (sprint_id, day) DO UPDATE SET stories = excluded.stories
--   RETURNING stories;
--   SAVEPOINT shaped;
--   UPDATE public.sprint_burnup_days SET stories = '{"id": 1}'
--    WHERE sprint_id = (SELECT sprint_id FROM target) AND day = (now() AT TIME ZONE 'UTC')::date;
--   ROLLBACK TO SAVEPOINT shaped;
--   ROLLBACK;
