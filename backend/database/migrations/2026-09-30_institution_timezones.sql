-- 2026-09-30 — institutions.timezone: the IANA zone a school's dates are in
--
-- EXPAND, idempotent, one transaction. Safe on either side of the code deploy: the backend
-- reads institutions with select("*") and uses America/Los_Angeles when the column is missing
-- or holds a name zoneinfo does not know (app/institutions/controller.py).
--
-- Applied: DEV 2026-09-30 (by Claude, via the Supabase connector)   PROD ____-__-__
--
-- ⚠️  ORDER: any time after 2026-09-25_institutions.sql and 2026-09-25_seed_istinye.sql.
--
--   * assignments.open_date / close_date are bare dates. "Due tomorrow" (a TSR reminder)
--     needs the school's zone: İstinye is 10–11 hours ahead of UC Santa Cruz.
--   * A maintainer adding a school sets its zone in the same insert (supabase/README.md,
--     "Institutions and class creation").

BEGIN;

ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Los_Angeles';

UPDATE public.institutions
   SET timezone = 'Europe/Istanbul'
 WHERE slug = 'istinye' AND timezone <> 'Europe/Istanbul';

COMMIT;

-- Check. Expected: istinye | Europe/Istanbul and ucsc | America/Los_Angeles.
SELECT slug, timezone FROM public.institutions ORDER BY slug;
