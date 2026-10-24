-- 2026-10-18 — classes.end_date: a class's last day of classes
--
-- The last day of classes, before finals week. TA meetings run from start_date through it: their
-- week count is ((end_date - start_date) days // 7) + 1, instead of the fixed length the term's
-- name gave (10 weeks for Fall/Winter/Spring, 6 for anything else). NULL keeps that fixed length,
-- so every class behaves as it does today until its last day is set. The instructor sets it in
-- Create Class and changes it in Class Settings (PATCH /api/classes/{class_id}/end-date).
--
-- EXPAND, idempotent. ⚠️  Apply on a database BEFORE the code that uses the column runs against it:
-- on PROD, before beta is merged into main. Without the column, that code fails on:
--   - GET /api/classes, for EVERY account (its enrolled-classes read names the column), which
--     leaves the whole app without its classes;
--   - POST /api/classes/join;
--   - the TA Meetings routes (GET /api/classes/{class_id}/ta-schedule, with /mine and /my-team,
--     and the projects' assign-ta, meeting and attendance routes), whose class read names it;
--   - POST /api/classes with a last day, and PATCH /api/classes/{class_id}/end-date.
-- The code before it never reads the column, so applying this early is safe.
--
-- The CHECK keeps a last day inside the term: not before the first week of term, and not more than
-- 370 days after it (the end of week 53, within a year: app/classes/terms.py MAX_TERM_WEEKS), so a
-- typo in the year can't stretch TA Meetings across years. A class with no start_date has nothing
-- to count from or to fall before. The API refuses the same first, 422 when a class is created and
-- 400 when its last day is changed, so a bad day never reaches the CHECK as a 500. Every existing
-- row passes on PROD: the new column is NULL.
--
-- Where a class may already have a last day (DEV), look for one the bound would refuse before
-- running the last statement, which fails on such a row:
--   SELECT id, name, start_date, end_date FROM public.classes WHERE end_date > start_date + 370;
--
-- Applied: DEV 2026-10-18 (by Claude, via the Supabase connector), with the CHECK as end_date >=
--          start_date alone; the controller re-applies this file on DEV to add the 370-day bound
--          (the CHECK is dropped and added again)   PROD — pending

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_end_date_after_start;
ALTER TABLE public.classes ADD CONSTRAINT classes_end_date_after_start CHECK (
  end_date IS NULL OR start_date IS NULL
  OR (end_date >= start_date AND end_date <= start_date + 370)
);
