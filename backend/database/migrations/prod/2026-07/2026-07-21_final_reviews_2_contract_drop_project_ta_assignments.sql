-- ═══════════════════════════════════════════════════════════════════════════
-- PROD STAGING 2/3 — Final Reviews CONTRACT phase        ⚠ DO NOT RUN EARLY
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)   ⚠ NOT YET APPLIED
-- ═══════════════════════════════════════════════════════════════════════════
-- Drops the superseded TSR-review junction. The pre-feat/final-reviews backend
-- still SELECTs project_ta_assignments on the TSR-review path — running this
-- while that code serves traffic turns those selects into PostgREST 400s.
--
-- Preconditions (all must hold):
--   1. 1/3 (expand) has been applied.
--   2. The feat/final-reviews backend is deployed everywhere (Vercel PROD) and
--      no old instances/local runs point at this database.
--
-- The junction's FKs are outbound only (nothing references it), so a plain
-- DROP suffices. Same pattern as 2026-06-30_drop_legacy_project_meeting_columns.sql.

DROP TABLE IF EXISTS public.project_ta_assignments;
