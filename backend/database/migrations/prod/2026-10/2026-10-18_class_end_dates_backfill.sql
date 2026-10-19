-- 2026-10-18 — PROD data: the live classes' last day of classes (classes.end_date)
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD.
--
-- ⚠️  ORDER: run this right after 2026-10/2026-10-18_class_end_dates.sql (the column and its
--     CHECK), and BEFORE the release that carries the code. That file must be on PROD before the
--     release anyway: without the column, GET /api/classes fails for every account. Run before the
--     release, this one means TA Meetings counts the right weeks from the first request: until a
--     class has its last day it keeps the fixed 10 weeks (6 outside Fall, Winter and Spring). The
--     code before the release never reads the column, so running it early is safe. Run after the
--     release it still works, but an instructor may have set a day by then (see UPDATE 0 below).
--
--   2026F CSE115A   UC Santa Cruz, Fall    -> 2026-12-04  (instruction ends; finals Dec 7-11)
--   JOB-191         İstinye University     -> 2026-12-18  (classes end; finals Dec 19-29)
--   2026Su cse115a  UC Santa Cruz, Summer  -> left NULL, on purpose. The class is over and its TA
--     Meetings weeks stay the fixed 6 they are today. A last day would replace that count with
--     ((end - start) / 7) + 1, which comes out below 6 for a session shorter than that and would
--     hide the week-6 attendance already recorded (the rows stay in the table, but TA Meetings
--     could no longer open that week).
--
-- Expected new_weeks in part 1: 11 for 2026F CSE115A when it starts on Thursday Sep 24 (71 days
-- from Sep 24 to Dec 4), and 13 for JOB-191 when it starts on Monday Sep 21 (88 days to Dec 18).
-- Part 1 shows each class's start_date: if one differs, work out its weeks before running part 2.
--
-- Each class is matched by id AND name, so neither UPDATE can write another class, and each fills
-- only an EMPTY end_date (AND end_date IS NULL). Each reports UPDATE 1. UPDATE 0 means the class
-- already has a last day, set in Class Settings or by an earlier run: nothing was changed, and
-- part 3 shows the day it has. So a re-run can never undo a change an instructor has made.
--
-- Three parts. Run 1 on its own and read it; run 2 and 3 only when both rows show matched = true
-- and a start_date.
--
-- Applied: PROD — pending


-- ── 1. Preview (read-only) ─────────────────────────────────────────────────────────────────────
-- matched is false for a row that found no class on id AND name: stop, and do not run part 2.
-- current_end_date is the last day the class has now. Part 2 fills only an empty one, so a row
-- with a day here is left as it is (UPDATE 0) and its new_weeks does not apply.
-- new_weeks is what TA Meetings will count after part 2: ((end - start) / 7) + 1, whole days and
-- integer division, the same rule as the app. A matched class with an empty start_date shows no
-- new_weeks: it has no first week to count from, so it keeps the fixed length.
-- current_weeks is the fixed length the term's name gives today (10 for Fall, Winter and Spring;
-- 6 for any other term).
SELECT v.name AS class,
       (c.id IS NOT NULL) AS matched,
       c.start_date,
       c.end_date AS current_end_date,
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
 WHERE id = 'f93ee370-cc13-4389-bfa1-0dbcc02daaf7' AND name = '2026F CSE115A'
   AND end_date IS NULL;

UPDATE public.classes
   SET end_date = '2026-12-18'
 WHERE id = '15dcce4c-0daa-4195-bef2-966ec78c1222' AND name = 'JOB-191'
   AND end_date IS NULL;

COMMIT;


-- ── 3. Check (read-only) ───────────────────────────────────────────────────────────────────────
-- Every class with its school: 2026F CSE115A and JOB-191 have the end_date set above (a class
-- created, or changed in Class Settings, since then may have one too), and 2026Su cse115a still
-- has none and keeps the weeks it has today. ta_meeting_weeks is what TA Meetings now counts (the
-- same rule as part 1).
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
