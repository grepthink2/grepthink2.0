-- 2026-11-17 — prune old document revisions every day (pg_cron)
--
-- Applied by hand, DEV first, then PROD (nothing runs the files in this directory; the Applied line below
-- records each run), AFTER ../../2026-11/2026-11-17_project_documents.sql, which creates the function. Everything
-- the job needs is inside the database: no HTTP call, no secret, no Vault entry.
--
-- public.prune_document_revisions() keeps a document's head and finalized revisions and deletes the others once
-- its sprint ended 7 days ago (a sprint's document) or once its class's last day was 30 days ago (a project's).
-- It counts days in UTC, so the hour only decides when in the day it runs: 09:20 UTC, after the analytics
-- rollup at 09:00, is 01:20/02:20 in Santa Cruz.
--
-- Applied: DEV — pending   PROD — pending

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule(name, …) replaces a job of the same name, so this file can be re-run.
SELECT cron.schedule(
  'prune_document_revisions',
  '20 9 * * *',
  $cron$ SELECT public.prune_document_revisions(); $cron$
);

-- Check. Expected: the job, active, on '20 9 * * *'; after its first run, a run whose status is 'succeeded'.
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'prune_document_revisions';
SELECT d.status, d.return_message, d.end_time
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'prune_document_revisions'
 ORDER BY d.end_time DESC
 LIMIT 3;

-- Undo:
--   SELECT cron.unschedule('prune_document_revisions');
