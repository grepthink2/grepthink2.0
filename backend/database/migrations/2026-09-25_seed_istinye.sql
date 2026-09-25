-- 2026-09-25 — add İstinye University
--
-- DATA, idempotent. Requires 2026-09-25_institutions.sql. Run on DEV and PROD. The app picks the
-- new school up within about ten minutes (the backend's five-minute cache plus the browser's).
--
-- Before running: confirm with Scott that istinye.edu.tr is the base domain of İstinye addresses.
-- Subdomains (for example stu.istinye.edu.tr) already match, so list base domains only.
--
-- Applied: DEV ____-__-__   PROD ____-__-__

INSERT INTO public.institutions (name, slug, email_domains)
VALUES ('İstinye University', 'istinye', '{istinye.edu.tr}')
ON CONFLICT (slug) DO NOTHING;

-- Check. Expected: istinye | İstinye University | istinye.edu.tr
SELECT slug, name, array_to_string(email_domains, ', ') AS email_domains
  FROM public.institutions
 WHERE slug = 'istinye';
