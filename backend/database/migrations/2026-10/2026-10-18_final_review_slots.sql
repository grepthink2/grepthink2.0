-- 2026-10-18 — final-review slots: the instructor posts one-hour slots and each team books one
--
-- Adds final_review_slots and two functions the backend calls over .rpc(), so that booking and
-- releasing a slot each happen in one transaction. Python decides who may call them; the functions keep
-- projects.final_review_at (the one place a team's review time lives) in step with the slots.
--
-- Booking rules: one team per slot and one slot per team. A team moves only to a free slot: its old slot
-- is freed and its Review TA (project_review_tas) is dropped. A first booking keeps the Review TA; a
-- release drops it.
--
-- EXPAND, idempotent, one transaction.
--
-- Applied: DEV — pending   PROD — pending (apply before the release that ships the slot API)

BEGIN;

-- Fail fast rather than queue live traffic: creating the foreign keys briefly locks classes, projects
-- and profiles against writes.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.final_review_slots (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         uuid        NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  starts_at        timestamptz NOT NULL,
  duration_minutes integer     NOT NULL DEFAULT 60,
  project_id       uuid        REFERENCES public.projects (id) ON DELETE SET NULL,
  booked_by        uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  booked_at        timestamptz,
  created_by       uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.final_review_slots DROP CONSTRAINT IF EXISTS final_review_slots_duration_valid;
ALTER TABLE public.final_review_slots ADD CONSTRAINT final_review_slots_duration_valid
  CHECK (duration_minutes = 60);

-- One slot per start time in a class. Its index also serves lookups by class_id.
ALTER TABLE public.final_review_slots DROP CONSTRAINT IF EXISTS final_review_slots_class_start_uniq;
ALTER TABLE public.final_review_slots ADD CONSTRAINT final_review_slots_class_start_uniq
  UNIQUE (class_id, starts_at);

-- A team holds at most one slot.
CREATE UNIQUE INDEX IF NOT EXISTS final_review_slots_project_uniq
  ON public.final_review_slots (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_review_slots_booked_by  ON public.final_review_slots (booked_by);
CREATE INDEX IF NOT EXISTS idx_final_review_slots_created_by ON public.final_review_slots (created_by);

ALTER TABLE public.final_review_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.final_review_slots FROM anon, authenticated;

-- Books p_slot for team p_project, or moves the team to it. Returns
--   'not_found'   no such slot, or the team is not in the slot's class
--   'slot_taken'  another team holds the slot
--   'booked'      the team now holds the slot, or already did (then nothing changes)
--   'moved'       the team gave up its other slot for this one
-- The row lock queues two teams racing for one slot, and the second gets 'slot_taken'. One team booking
-- two slots at once trips final_review_slots_project_uniq: one call fails with 23505 (the API's 409).
CREATE OR REPLACE FUNCTION public.book_final_review_slot(p_slot uuid, p_project uuid, p_actor uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_starts_at timestamptz;
  v_holder    uuid;
  v_freed     integer;
BEGIN
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

REVOKE ALL ON FUNCTION public.book_final_review_slot(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_final_review_slot(uuid, uuid, uuid) TO service_role;

-- Frees the team's slot, clears its final_review_at and drops its Review TA, then returns true. Returns
-- false, changing nothing, when the team held no slot.
CREATE OR REPLACE FUNCTION public.release_final_review_slot(p_project uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_freed integer;
BEGIN
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

REVOKE ALL ON FUNCTION public.release_final_review_slot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_final_review_slot(uuid) TO service_role;

COMMIT;

-- Check. Expected right after applying:
--   1. seven constraints: final_review_slots_booked_by_fkey, final_review_slots_class_id_fkey,
--      final_review_slots_class_start_uniq, final_review_slots_created_by_fkey,
--      final_review_slots_duration_valid, final_review_slots_pkey, final_review_slots_project_id_fkey;
--   2. five indexes: the two behind the primary and unique keys, final_review_slots_project_uniq
--      (UNIQUE, WHERE project_id IS NOT NULL), idx_final_review_slots_booked_by and
--      idx_final_review_slots_created_by;
--   3. both functions with search_path=public, executable by service_role and not by anon or
--      authenticated;
--   4. RLS on, no policies, no anon / authenticated grants, and no rows yet.
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.final_review_slots'::regclass AND contype IN ('p', 'u', 'f', 'c')
 ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'final_review_slots'
 ORDER BY indexname;
SELECT p.proname, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role_can_execute
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('book_final_review_slot', 'release_final_review_slot')
 ORDER BY p.proname;
SELECT c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'final_review_slots') AS policies,
       (SELECT count(*) FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public' AND g.table_name = 'final_review_slots'
           AND g.grantee IN ('anon', 'authenticated')) AS client_grants,
       (SELECT count(*) FROM public.final_review_slots) AS slot_rows
  FROM pg_class c
 WHERE c.oid = 'public.final_review_slots'::regclass;
