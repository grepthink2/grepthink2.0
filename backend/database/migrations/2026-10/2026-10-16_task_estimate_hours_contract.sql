-- Task estimates become whole hours (1–15). Contract step: drops the legacy free-text estimates.
--
-- ⚠ Run only after the code from this change (tasks.estimate_hours, spec
-- docs/superpowers/specs/2026-10-16-scrum-task-hours-design.md) is live on the same environment:
-- it stops reading and writing these columns, while the code before it writes them on every story
-- and task save. 2026-10-16_task_estimate_hours.sql (the expand step) runs first.
--
-- No re-conversion first (spec D6): a "4h" the old code wrote after the expand ran is dropped, and
-- an estimate someone cleared in the new editor can never come back.
ALTER TABLE public.tasks DROP COLUMN IF EXISTS time_estimate;
ALTER TABLE public.user_stories DROP COLUMN IF EXISTS time_estimate;
