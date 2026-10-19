-- 2026-10-18 — PROD data: the live classes' last day of classes (classes.end_date)
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD.
--
-- ⚠️  ORDER: after 2026-10/2026-10-18_class_end_dates.sql (the column and its CHECK). That file
--     must be on PROD BEFORE the release that carries the code: without the column,
--     GET /api/classes fails for every account. This one may run before or after the release,
--     because the code before it never reads the column. TA Meetings counts its weeks from the
--     last day once both are in place.
--
--   2026F CSE115A   UC Santa Cruz, Fall    -> 2026-12-04  (instruction ends; finals Dec 7-11)
--   JOB-191         İstinye University     -> 2026-12-18  (classes end; finals Dec 19-29)
--   2026Su cse115a  UC Santa Cruz, Summer  -> left NULL, on purpose. The class is over and its TA
--     Meetings weeks stay the fixed 6 they are today. A last day would replace that count with
--     ((end - start) / 7) + 1, which comes out below 6 for a session shorter than that and would
--     hide the week-6 attendance already recorded (the rows stay in the table, but TA Meetings
--     could no longer open that week).
--
-- Each class is matched by id AND name, so neither UPDATE can write another class; each must
-- report UPDATE 1. Run ONCE: a re-run would undo any change an instructor has since made in Class
-- Settings.
--
-- Three parts. Run 1 on its own and read it; run 2 and 3 only when both rows show a start_date.
--
-- Applied: PROD — pending


-- ── 1. Preview (read-only) ─────────────────────────────────────────────────────────────────────
-- new_weeks is what TA Meetings will count after part 2: ((end - start) / 7) + 1, whole days and
-- integer division, the same rule as the app. current_weeks is the fixed length the term's name
-- gives today (10 for Fall, Winter and Spring; 6 for any other term). A row with an empty
-- start_date did not match on id AND name: stop, and do not run part 2.
SELECT v.name AS class,
       c.start_date,
       v.proposed_end_date,
       ((v.proposed_end_date - c.start_date) / 7) + 1 AS new_weeks,
       CASE
         WHEN c.id IS NULL THEN NULL
         WHEN lower(btrim(c.term)) IN ('fall', 'winter', 'spring') THEN 10
         ELSE 6
       END AS current_weeks
  FROM (VALUES ('f93ee370-cc13-4389-bfa1-0dbcc02daaf7'::uuid, '2026F CSE115A', DATE '2026-12-04'),
               ('15dcce4c-0daa-4195-bef2-966ec78c1222'::uuid, 'JOB-191',       DATE '2026-12-18')
       ) AS v(id, name, proposed_end_date)
  LEFT JOIN public.classes c ON c.id = v.id AND c.name = v.name
 ORDER BY v.proposed_end_date;


-- ── 2. The change ──────────────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE public.classes
   SET end_date = '2026-12-04'
 WHERE id = 'f93ee370-cc13-4389-bfa1-0dbcc02daaf7' AND name = '2026F CSE115A';

UPDATE public.classes
   SET end_date = '2026-12-18'
 WHERE id = '15dcce4c-0daa-4195-bef2-966ec78c1222' AND name = 'JOB-191';

COMMIT;


-- ── 3. Check (read-only) ───────────────────────────────────────────────────────────────────────
-- Every class with its school: exactly the two classes above have an end_date, and
-- 2026Su cse115a still has none and keeps the weeks it has today. ta_meeting_weeks is what TA
-- Meetings now counts (the same rule as part 1).
SELECT c.name,
       i.name AS school,
       c.start_date,
       c.end_date,
       CASE
         WHEN c.start_date IS NOT NULL AND c.end_date IS NOT NULL
           THEN ((c.end_date - c.start_date) / 7) + 1
         WHEN lower(btrim(c.term)) IN ('fall', 'winter', 'spring') THEN 10
         ELSE 6
       END AS ta_meeting_weeks
  FROM public.classes c
  LEFT JOIN public.institutions i ON i.id = c.institution_id
 ORDER BY i.name, c.start_date, c.name;
