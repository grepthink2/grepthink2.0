-- 2026-10-22 — sprint_burnup_days.scope_hours and completed_hours: the burnup in hours
--
-- The scrum board's burnup draws in task hours or task points, so a day's snapshot keeps both units:
-- scope_hours is the sum of estimate_hours over the sprint's tasks that day and completed_hours the
-- same sum over its done tasks, next to scope_points and completed_points. A task without hours counts
-- zero.
--
-- EXPAND, idempotent, one transaction. ⚠️  Apply on a database BEFORE the code that reads or writes the
-- new columns runs against it: on PROD, before beta is merged into main. Without them that code fails
-- on the scrum board (GET /api/projects/{project_id}/scrum/board reads them), and its daily snapshot,
-- which only logs a failure, records nothing. The code before it never names them: its snapshot upsert
-- writes the points columns only, so a row it inserts gets 0 hours and a row it updates keeps its
-- hours. Applying this early is safe. Independent of 2026-10-22_class_sprint_schedule.sql: either may
-- run first.
--
-- Applied: DEV — pending   PROD — pending
--
--   * scope_hours, completed_hours: integer, NOT NULL DEFAULT 0. A constant default adds the columns
--     without rewriting the table.
--   * Snapshots from before this file read 0 hours. In hours, the board takes a snapshot with 0 hours
--     beside nonzero points as a day without a snapshot; in points every snapshot counts
--     (app/scrum/burnup.py holds_unit).

BEGIN;

-- Fail fast if the lock is contended rather than queue live traffic behind the ALTERs. They only
-- change the catalog: a constant default needs no rewrite.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS scope_hours     integer NOT NULL DEFAULT 0;
ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS completed_hours integer NOT NULL DEFAULT 0;

COMMIT;

-- Check. Expected right after applying:
--   1. scope_hours and completed_hours: integer, NOT NULL, default 0;
--   2. no snapshot with hours yet: every existing row reads 0.
SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'sprint_burnup_days'
   AND column_name IN ('scope_hours', 'completed_hours')
 ORDER BY column_name;
SELECT count(*) AS snapshots,
       count(*) FILTER (WHERE scope_hours <> 0 OR completed_hours <> 0) AS snapshots_with_hours
  FROM public.sprint_burnup_days;
