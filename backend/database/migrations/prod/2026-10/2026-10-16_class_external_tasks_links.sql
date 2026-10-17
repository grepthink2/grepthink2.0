-- 2026-10-16 — PROD data: the live classes' "Tasks - External" links
--
-- ⚠️  ORDER: after 2026-10/2026-10-16_class_external_tasks_url.sql (the column and its CHECK).
--     The sidebar shows the links once the release carrying the column's code is live.
--
--   JOB-191        İstinye University (its only class)  -> https://job191.yeterly.ai/
--   2026F CSE115A  UC Santa Cruz, Fall                  -> https://tasks.grepthink2.com/cse115a
--
-- Each class is matched by id AND name, so neither UPDATE can write another class; each must
-- report UPDATE 1. Run ONCE: a re-run would undo any change an instructor has since made in
-- Class Settings.
--
-- Applied: PROD — pending

BEGIN;

UPDATE public.classes
   SET external_tasks_url = 'https://job191.yeterly.ai/'
 WHERE id = '15dcce4c-0daa-4195-bef2-966ec78c1222' AND name = 'JOB-191';

UPDATE public.classes
   SET external_tasks_url = 'https://tasks.grepthink2.com/cse115a'
 WHERE id = 'f93ee370-cc13-4389-bfa1-0dbcc02daaf7' AND name = '2026F CSE115A';

COMMIT;

-- Check: exactly these two classes have a link.
SELECT c.name, i.name AS school, c.external_tasks_url
  FROM public.classes c
  LEFT JOIN public.institutions i ON i.id = c.institution_id
 WHERE c.external_tasks_url IS NOT NULL
 ORDER BY c.name;
