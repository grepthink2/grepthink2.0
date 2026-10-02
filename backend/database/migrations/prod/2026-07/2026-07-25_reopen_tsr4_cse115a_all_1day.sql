-- ═══════════════════════════════════════════════════════════════════════════
-- PROD data op — reopen "TSR 4" for 2026Su cse115a, class-wide, +1 day
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)
-- ✅ APPLIED to prod 2026-07-25 ~10:35 PDT. Verified: 1 row, close_date=2026-07-26.
-- ═══════════════════════════════════════════════════════════════════════════
-- Supersedes 2026-07-24_reopen_tsr4_cse115a.sql, which was committed and merged
-- (PR #169 → beta, PR #170 → main) but NEVER EXECUTED against prod. Merging a
-- staged SQL file into git does not run it — that is precisely why the earlier
-- reopen "did not work" for Dhaathri Vijay: prod still held close_date
-- 2026-07-21, so the UI kept every student on "Closed".
--   ⚠ DO NOT run the 2026-07-24 file now — it would set close_date back to
--     2026-07-25 and close the form a day early. It is marked superseded.
--
-- Why: reopen TSR 4 for ALL students in the class for one more day. At the time
--      of the fix 7 of 74 team-assigned students had not submitted TSR 4
--      (67 had). TSR open/close is a CLASS-WIDE property of the assignment row
--      — there is no per-student reopen in the schema or API.
--
-- Class:      "2026Su cse115a"  ca9b1627-bb0c-4a88-8e61-32341863033f
--             (instructor rjullig@ucsc.edu = 005adfbb-e43a-44f1-a3f7-94a99f952d2b)
-- Assignment: "TSR 4"           2b740ed5-0f45-4b5b-b742-9284de0fddb0
--             before: open_date 2026-07-19, close_date 2026-07-21, status 'publish'
--             after:  close_date 2026-07-26  (open_date & status unchanged)
--
-- close_date is date-only and INCLUSIVE — the form stays open through the whole
-- of close_date — so 2026-07-26 keeps TSR 4 open from Sat 2026-07-25 through
-- end of Sun 2026-07-26, then it closes on its own. No follow-up needed.
--
-- Note: the close-date lockout is enforced only in the frontend
--       (frontend/src/features/app/pages/Assignments.tsx → resolveAssignmentState).
--       POST /api/tsrs (backend/app/tsr/controller.py) never checks the window,
--       so this UPDATE simply re-enables the greyed-out "Start / Edit" button.
--
-- Idempotent: re-running sets the same values; it never DELETEs. Targets exactly
-- one row (id + class_id + Title all pinned).

BEGIN;

UPDATE public.assignments
   SET close_date = DATE '2026-07-26',
       status     = 'publish'
 WHERE id        = '2b740ed5-0f45-4b5b-b742-9284de0fddb0'
   AND class_id  = 'ca9b1627-bb0c-4a88-8e61-32341863033f'
   AND "Title"   = 'TSR 4';

COMMIT;

-- ── Post-run verification (read-only) ───────────────────────────────────────
-- Replays the frontend gate. Expect TSR 4 => 'OPEN (start/edit)' while
-- TSR 1-3 stay 'CLOSED' (untouched).
--
-- WITH t AS (SELECT to_char(now() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD') AS today)
-- SELECT a."Title", a.open_date, a.close_date, a.status,
--        CASE
--          WHEN t.today < to_char(a.open_date,'YYYY-MM-DD')  THEN 'opens_later'
--          WHEN to_char(a.close_date,'YYYY-MM-DD') < t.today THEN 'CLOSED'
--          ELSE 'OPEN (start/edit)'
--        END AS student_sees
--   FROM public.assignments a, t
--  WHERE a.class_id = 'ca9b1627-bb0c-4a88-8e61-32341863033f'
--  ORDER BY a."Title";
--
-- -- Who still owes TSR 4 (was 7 of 74 at time of fix):
-- SELECT p.email
--   FROM public.class_enrollments ce
--   JOIN public.profiles p ON p.id = ce.user_id
--  WHERE ce.class_id = 'ca9b1627-bb0c-4a88-8e61-32341863033f'
--    AND ce.enrollment_role = 'student'
--    AND ce.user_id IN (SELECT pm.user_id FROM public.project_members pm
--                         JOIN public.projects pr ON pr.id = pm.project_id
--                        WHERE pr.class_id = 'ca9b1627-bb0c-4a88-8e61-32341863033f')
--    AND ce.user_id NOT IN (SELECT evaluator_id FROM public."TSRs"
--                            WHERE assignment_id = '2b740ed5-0f45-4b5b-b742-9284de0fddb0');
