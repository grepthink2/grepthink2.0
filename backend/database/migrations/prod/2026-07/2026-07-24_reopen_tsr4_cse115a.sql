-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ SUPERSEDED — NEVER APPLIED — DO NOT RUN
--    Superseded by 2026-07-25_reopen_tsr4_cse115a_all_1day.sql (applied
--    2026-07-25, close_date = 2026-07-26).
--
--    This file was merged to git (PR #169 → beta, PR #170 → main) but was
--    never executed against prod, which is exactly why the reopen it describes
--    never took effect. Running it NOW would set close_date back to
--    2026-07-25 and close TSR 4 a day early. Kept only as a record.
--
-- PROD data op — reopen "TSR 4" for 2026Su cse115a
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Why: student Dhaathri Vijay (dhvijay@ucsc.edu,
--      10a58d11-6d36-4e08-b7e6-fba1ea851140) needs to submit TSR 4 after the
--      window closed on 2026-07-21. A TSR's open/closed state is a CLASS-WIDE
--      property of the assignment row — there is NO per-student reopen anywhere
--      in the schema or API — so this re-opens TSR 4 for the ENTIRE class.
--      Coordinate with the instructor (rjullig@ucsc.edu) before applying.
--
-- Note: the close-date lockout is enforced only in the frontend
--       (frontend/src/features/app/pages/Assignments.tsx → resolveAssignmentState).
--       POST /api/tsrs (backend/app/tsr/controller.py) never checks the window,
--       so this UPDATE simply re-enables the greyed-out "Start / Edit" button.
--
-- Class:      "2026Su cse115a"  ca9b1627-bb0c-4a88-8e61-32341863033f
--             (instructor rjullig@ucsc.edu = 005adfbb-e43a-44f1-a3f7-94a99f952d2b)
-- Assignment: "TSR 4"           2b740ed5-0f45-4b5b-b742-9284de0fddb0
--             before: open_date 2026-07-19, close_date 2026-07-21, status 'publish'
--             after:  close_date 2026-07-25  (open_date & status unchanged)
--
-- Dates are date-only and the form is open through (and including) close_date,
-- so 2026-07-25 keeps TSR 4 open from today (2026-07-24) through Fri 2026-07-25.
-- Idempotent: re-running sets the same values; it never DELETEs.
-- Resolved against prod on 2026-07-24: exactly ONE "TSR 4" in this class;
-- Dhaathri is on team "AI Powered Stock Trading Platform" with 0 TSR 4 rows.

BEGIN;

UPDATE public.assignments
   SET close_date = DATE '2026-07-25',
       status     = 'publish'
 WHERE id        = '2b740ed5-0f45-4b5b-b742-9284de0fddb0'
   AND class_id  = 'ca9b1627-bb0c-4a88-8e61-32341863033f'
   AND "Title"   = 'TSR 4';

COMMIT;

-- ── Post-run verification (read-only) ───────────────────────────────────────
-- Expect one row: close_date = 2026-07-25, status = 'publish'.
--
-- SELECT id, "Title", open_date, close_date, status
--   FROM public.assignments
--  WHERE id = '2b740ed5-0f45-4b5b-b742-9284de0fddb0';
--
-- -- Dhaathri can now submit (stays 0 until she does):
-- SELECT count(*) AS her_tsr4_submissions
--   FROM public."TSRs"
--  WHERE assignment_id = '2b740ed5-0f45-4b5b-b742-9284de0fddb0'
--    AND evaluator_id  = '10a58d11-6d36-4e08-b7e6-fba1ea851140';
