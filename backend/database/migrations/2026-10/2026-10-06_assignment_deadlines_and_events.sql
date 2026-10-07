-- 2026-10-06 — assignment deadlines as instants, a late-submission window, TSR edit timestamps,
--              and the events table
--
-- EXPAND, idempotent, one transaction. ⚠️  Apply BEFORE the release that ships sub-project A of
-- docs/superpowers/specs/2026-10-05-analytics-dashboard-design.md: that code reads due_at and
-- accept_until and writes events without feature-detecting them.
--
-- Applied: DEV 2026-10-06 (by Claude, via the Supabase connector)   PROD ____-__-__
--
-- ⚠️  ORDER: after 2026-09/2026-09-25_institutions.sql and 2026-09/2026-09-30_institution_timezones.sql
--     (the due_at backfill reads institutions.timezone; on a database without them this file fails
--     and rolls back as a whole). PROD had neither applied as of 2026-10-06.
--
-- ⚠️  GAP: apply this file in the same sitting as the release. Until the new backend is live, an
--     assignment created in between keeps due_at NULL (it would never close) and one whose
--     close_date is edited keeps a stale due_at. Re-running this file once after the release
--     repairs both: the due_at backfill rewrites every row whose due_at disagrees with its
--     close_date (the Check's stale_due_at must read 0 afterwards).
--
--   * assignments.due_at: the deadline instant — the first moment after close_date in the
--     school's time zone (institutions.timezone; America/Los_Angeles for a class without one).
--     Backfilled here for every row whose due_at disagrees with its close_date; the backend
--     derives it on create and on every change of close_date.
--   * assignments.accept_until: late-submission window. NULL = the assignment closes at due_at.
--     Once the deadline has passed the backend refuses to move close_date and the instructor
--     sets this instead, so the original deadline survives and late work is visible as late.
--   * "TSRs".updated_at: bumped by trigger on every UPDATE that changes something (TSR rows are
--     edited in place; created_at stays the first submission). Existing rows get
--     updated_at = created_at: edits made before this file ran cannot be recovered, so
--     "edited after the deadline" reads 0 for any date before it.
--   * events: product events the schema does not record (sign-ins, board views, TSR edits,
--     reopenings). actor/class/project are SET NULL on delete so counts survive deletions.
--     meta holds ids and short enums only. RLS on, no policies, no client privileges on the
--     table or its identity sequence.

BEGIN;

-- Fail fast if a lock is contended rather than queue live traffic behind the ALTERs.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS due_at       timestamptz;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS accept_until timestamptz;

-- Every row whose due_at disagrees with its close_date (NULL included): the first run, and a
-- re-run after the release for rows the old backend created or rescheduled in between.
UPDATE public.assignments a
   SET due_at = ((a.close_date + 1)::timestamp
                 AT TIME ZONE coalesce(i.timezone, 'America/Los_Angeles'))
  FROM public.classes c
  LEFT JOIN public.institutions i ON i.id = c.institution_id
 WHERE c.id = a.class_id AND a.close_date IS NOT NULL
   AND a.due_at IS DISTINCT FROM ((a.close_date + 1)::timestamp
                                  AT TIME ZONE coalesce(i.timezone, 'America/Los_Angeles'));

ALTER TABLE public."TSRs" ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Rows that existed before this file got the migration time from the DEFAULT. Make their last
-- edit their submission, or every old on-time TSR would read as "edited after its deadline".
-- now() is the transaction's start, the very instant the DEFAULT wrote, so this matches exactly
-- those rows — and nothing on a re-run.
UPDATE public."TSRs" SET updated_at = created_at WHERE updated_at = now();

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tsrs_set_updated_at ON public."TSRs";
CREATE TRIGGER tsrs_set_updated_at BEFORE UPDATE ON public."TSRs"
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  actor_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  class_id    uuid REFERENCES public.classes (id)  ON DELETE SET NULL,
  project_id  uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(meta) <= 2048)
);
CREATE INDEX IF NOT EXISTS events_kind_time_idx  ON public.events (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_class_time_idx ON public.events (class_id, occurred_at DESC)
  WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_actor_time_idx ON public.events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_project_time_idx ON public.events (project_id, occurred_at DESC)
  WHERE project_id IS NOT NULL;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.events_id_seq FROM anon, authenticated;

COMMIT;

-- Check. Expected right after applying, and again after the release (re-run the file first if
-- anything was created or rescheduled in between):
--   stale_due_at = 0   every assignment with a class and a close_date has the matching due_at
--   orphans = 0        assignments with a close_date but no class (legacy rows; they get no due_at
--                      because there is no school to take a zone from — fix by hand if any)
--   edited_rows = 0    ONLY right after the FIRST apply. On the prescribed re-run after the release
--                      it is legitimately > 0 (the old backend's TSR edits fired the trigger) and
--                      the repair below must NOT run
--   one row for the trigger; events_rls = t; no client grants on events; anon_seq = f and
--   auth_seq = f (no client privileges on the identity sequence either);
--   service_role_can_insert = t;
--   due_local = close_date + 1 at 00:00 for every sample row (the zone was applied).
SELECT count(*) AS stale_due_at FROM public.assignments a
  JOIN public.classes c ON c.id = a.class_id
  LEFT JOIN public.institutions i ON i.id = c.institution_id
 WHERE a.close_date IS NOT NULL
   AND a.due_at IS DISTINCT FROM ((a.close_date + 1)::timestamp
                                  AT TIME ZONE coalesce(i.timezone, 'America/Los_Angeles'));
SELECT count(*) AS orphans FROM public.assignments WHERE close_date IS NOT NULL AND class_id IS NULL;
SELECT count(*) AS edited_rows FROM public."TSRs" WHERE updated_at <> created_at;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public."TSRs"'::regclass AND tgname = 'tsrs_set_updated_at';
SELECT relrowsecurity AS events_rls FROM pg_class WHERE oid = 'public.events'::regclass;
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'events' AND grantee IN ('anon', 'authenticated');
SELECT has_sequence_privilege('anon', 'public.events_id_seq', 'USAGE')          AS anon_seq,
       has_sequence_privilege('authenticated', 'public.events_id_seq', 'USAGE') AS auth_seq;
SELECT has_table_privilege('service_role', 'public.events', 'INSERT') AS service_role_can_insert;
SELECT a.close_date,
       a.due_at AT TIME ZONE coalesce(i.timezone, 'America/Los_Angeles') AS due_local
  FROM public.assignments a
  JOIN public.classes c ON c.id = a.class_id
  LEFT JOIN public.institutions i ON i.id = c.institution_id
 WHERE a.due_at IS NOT NULL ORDER BY a.due_at DESC LIMIT 3;

-- If edited_rows > 0 RIGHT AFTER THE FIRST apply (never after the re-run), the file was not run
-- as one transaction (the DEFAULT and the backfill saw different now() values). Repair before
-- anyone edits a TSR, in one transaction with the trigger off (it would otherwise rewrite
-- updated_at to now()). Never run this later: it would erase real edit times.
--   BEGIN; ALTER TABLE public."TSRs" DISABLE TRIGGER tsrs_set_updated_at;
--   UPDATE public."TSRs" SET updated_at = created_at;
--   ALTER TABLE public."TSRs" ENABLE TRIGGER tsrs_set_updated_at; COMMIT;

-- Undo (revert the release first: the code reads these columns without feature detection):
--   DROP TRIGGER IF EXISTS tsrs_set_updated_at ON public."TSRs";
--   DROP FUNCTION IF EXISTS public.set_updated_at();
--   ALTER TABLE public."TSRs" DROP COLUMN IF EXISTS updated_at;
--   ALTER TABLE public.assignments DROP COLUMN IF EXISTS accept_until, DROP COLUMN IF EXISTS due_at;
--   DROP TABLE IF EXISTS public.events;
