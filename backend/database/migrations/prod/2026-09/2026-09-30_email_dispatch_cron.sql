-- 2026-09-30 — call the email dispatcher every minute (pg_cron + pg_net), and prune old rows
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD (DEV only if it
-- has a backend reachable from the internet; a local backend is not).
--
-- ⚠️  ORDER (supabase/README.md, "Email outbox and dispatch schedule"):
--     1. ../2026-09-30_email_outbox.sql and ../2026-09-30_email_preferences.sql are applied.
--     2. The outbox release is live. Until EMAIL_DISPATCH_SECRET is set, the API keeps
--        dispatching from inside its own process, and POST /api/email/dispatch answers 404.
--     3. Run THIS file with <dispatch-secret> (a long random string, e.g. `openssl rand -hex 32`)
--        and <api-base-url> (https://api.grepthink2.com, no trailing slash) filled in.
--     4. Set EMAIL_DISPATCH_SECRET to the same value in Vercel (backend project, Production)
--        and redeploy. From then on only this schedule dispatches.
--     Between 3 and 4 the calls answer 404 (net._http_response shows them); nothing is lost,
--     because the in-process loop still runs until step 4.
--
-- pg_net gives up on a request after timeout_milliseconds; 120 s covers the dispatcher's
-- EMAIL_DISPATCH_BUDGET_SECONDS (8 s) plus one slow send (up to ~25 s over HTTP, ~90 s over
-- SMTP), so a slow run is not recorded as a timeout. Before running this, confirm the backend
-- function's max duration is at least that long (DEPLOY.md, "Email delivery"). The secret stays
-- in Vault, not in cron.job. pg_cron never prunes cron.job_run_details itself, and this job adds
-- ~1 400 rows a day, so the last job below keeps a week of them.
--
-- Applied: PROD ____-__-__

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Once. To rotate later: SELECT vault.update_secret(
--   (SELECT id FROM vault.secrets WHERE name = 'email_dispatch_secret'), '<new-secret>');
SELECT vault.create_secret('<dispatch-secret>', 'email_dispatch_secret',
                           'Bearer token for POST /api/email/dispatch (EMAIL_DISPATCH_SECRET)');

SELECT cron.schedule(
  'email-dispatch',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := '<api-base-url>/api/email/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret
                                       FROM vault.decrypted_secrets
                                      WHERE name = 'email_dispatch_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

-- Sent, skipped and cancelled rows hold student addresses; keep them 90 days. Failed and
-- bounced rows stay until someone looks at them.
SELECT cron.schedule(
  'email-outbox-retention',
  '17 3 * * *',
  $cron$
  DELETE FROM public.email_outbox
   WHERE status IN ('sent', 'skipped', 'cancelled')
     AND updated_at < now() - interval '90 days';
  $cron$
);

-- pg_cron's own run log grows by one row per job run; keep a week of it.
SELECT cron.schedule(
  'cron-run-details-retention',
  '23 3 * * *',
  $cron$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  $cron$
);

-- Check. Expected: all three jobs active; after a minute or two, 200s from /api/email/dispatch.
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
SELECT id, status_code, left(content, 120) AS body, error_msg, created
  FROM net._http_response
 ORDER BY created DESC
 LIMIT 5;

-- Undo:
--   SELECT cron.unschedule('email-dispatch');
--   SELECT cron.unschedule('email-outbox-retention');
--   SELECT cron.unschedule('cron-run-details-retention');
