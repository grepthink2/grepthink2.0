-- 2026-10-22 — class sprint schedule: three classes columns and sprints.sequence
--
-- A class's sprints come from one schedule its instructor sets: how many (sprint_count), how often
-- (sprint_frequency: weekly, biweekly or monthly) and the day the first one starts (sprints_start_on).
-- Every team in the class gets the same sprints, "Sprint 1" to "Sprint N", when the team is created
-- and again whenever the instructor changes the schedule (PATCH /api/classes/{class_id}/sprints).
-- Their dates are arithmetic on the three values (app/scrum/schedule.py), and sprints.sequence ties
-- each such sprint to its place in the schedule.
--
-- EXPAND, idempotent, one transaction. ⚠️  Apply on a database BEFORE the code that reads or writes the
-- new columns runs against it: on PROD, before beta is merged into main. Among the requests that name
-- them: creating a class (POST /api/classes); creating a team (POST /api/projects reads its class's
-- schedule, so without the columns no team can be created); the class's sprint and last-day settings
-- (PATCH /api/classes/{class_id}/sprints and /end-date). The code before it never names them (a sprint
-- made through POST /api/projects/{project_id}/scrum/sprints leaves sequence NULL), so applying this
-- early is safe. Independent of 2026-10-22_burnup_hours.sql: either may run first.
--
-- Applied: DEV — pending   PROD — pending
--
--   * classes_sprint_schedule_valid: no schedule (all three NULL: every class that exists today, until
--     its instructor sets one), or a count of 1–20, one of the three frequencies and a start day.
--     As written it also passes a start day with a NULL count or frequency: a CHECK passes on NULL,
--     and the second branch is NULL rather than false then. The API always writes the three together.
--   * Fitting the dates to the class is the API's rule, not the CHECK's: it refuses a first sprint that
--     starts before start_date or a last one that ends after end_date (422), and a last day of classes
--     before the last sprint ends (409).
--   * sprints.sequence: k for the sprint the schedule made as "Sprint k", 1 or more (the column's CHECK,
--     which Postgres names sprints_sequence_check); NULL for a sprint made any other way, which the
--     schedule never touches.
--   * sprints_project_sequence_uq: one sprint per team and k. Partial: NULL-sequence sprints stay
--     outside it, any number per team.
--
-- PREFLIGHT (expect 0; where the column has never existed the query fails instead, with column
-- "sequence" does not exist, which is just as good. A count above 0 means sprints were numbered by
-- hand: two of one team's with the same number make the unique index fail and the file roll back as
-- a whole):
--
--   SELECT count(*) FROM public.sprints WHERE sequence IS NOT NULL;

BEGIN;

-- Fail fast if a lock is contended rather than queue live traffic behind the ALTERs, which lock classes
-- and sprints until COMMIT. Nothing is rewritten (the new columns are nullable with no default); the
-- CHECKs and the unique index read two small tables.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sprint_count     smallint;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sprint_frequency text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sprints_start_on date;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_sprint_schedule_valid;
ALTER TABLE public.classes ADD CONSTRAINT classes_sprint_schedule_valid CHECK (
  (sprint_count IS NULL AND sprint_frequency IS NULL AND sprints_start_on IS NULL)
  OR (sprint_count BETWEEN 1 AND 20
      AND sprint_frequency IN ('weekly', 'biweekly', 'monthly')
      AND sprints_start_on IS NOT NULL)
);
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS sequence smallint CHECK (sequence IS NULL OR sequence >= 1);
CREATE UNIQUE INDEX IF NOT EXISTS sprints_project_sequence_uq ON public.sprints (project_id, sequence)
  WHERE sequence IS NOT NULL;

COMMIT;

-- Check. Expected right after applying:
--   1. classes.sprint_count smallint, classes.sprint_frequency text, classes.sprints_start_on date and
--      sprints.sequence smallint, each nullable with no default;
--   2. classes_sprint_schedule_valid as above, and exactly one CHECK on sprints that names sequence:
--      sprints_sequence_check, CHECK (sequence IS NULL OR sequence >= 1);
--   3. one index, a unique partial one on (project_id, sequence) WHERE sequence IS NOT NULL;
--   4. no class with any of the three set and no sprint with a sequence yet.
SELECT table_name, column_name, data_type, column_default, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'classes'
         AND column_name IN ('sprint_count', 'sprint_frequency', 'sprints_start_on'))
        OR (table_name = 'sprints' AND column_name = 'sequence'))
 ORDER BY table_name, column_name;
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE (conrelid = 'public.classes'::regclass AND conname = 'classes_sprint_schedule_valid')
    OR (conrelid = 'public.sprints'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%sequence%')
 ORDER BY conname;
SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'sprints_project_sequence_uq';
SELECT (SELECT count(*) FROM public.classes
         WHERE sprint_count IS NOT NULL OR sprint_frequency IS NOT NULL
            OR sprints_start_on IS NOT NULL) AS classes_with_schedule,
       (SELECT count(*) FROM public.sprints WHERE sequence IS NOT NULL) AS sprints_with_sequence;
