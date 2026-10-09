-- 2026-10-07 — nightly analytics rollup and events retention (pg_cron)
--
-- Applied by hand, DEV first, then PROD (nothing runs the files in this directory; the Applied line below
-- records each run), AFTER ../../2026-10/2026-10-07_analytics.sql. Everything the jobs need is inside the
-- database: no HTTP call, no secret, no Vault entry (unlike ../2026-09/2026-09-30_email_dispatch_cron.sql).
--
-- 09:00 UTC is 01:00/02:00 in Santa Cruz and 12:00 in Istanbul (spec Q-B1): "yesterday" (current_date
-- - 1 in UTC) is a complete calendar day in both zones. The Istanbul board snapshot is therefore taken
-- at midday; the Trends card's definition says so.
--
-- Applied: DEV 2026-10-08 (by Claude, via the Supabase connector)   PROD 2026-10-09 (by the maintainer)

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule(name, …) replaces a job of the same name, so this file can be re-run.
SELECT cron.schedule(
  'analytics-rollup',
  '0 9 * * *',
  $cron$ SELECT public.analytics_rollup_day(current_date - 1, true); $cron$
);

-- Spec Q-A2: events are kept 365 days.
SELECT cron.schedule(
  'events-retention',
  '41 3 * * *',
  $cron$ DELETE FROM public.events WHERE occurred_at < now() - interval '365 days'; $cron$
);

-- pg_cron's own run log grows by one row per job run; keep a week of it (the email cron file
-- schedules the same job under the same name; whichever runs later simply replaces it).
SELECT cron.schedule(
  'cron-run-details-retention',
  '23 3 * * *',
  $cron$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'; $cron$
);

-- Check. Expected: the three jobs active; after the first 09:00 UTC run, max(day) = yesterday.
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
SELECT max(day) AS last_rolled_up_day FROM public.analytics_daily;

-- Undo:
--   SELECT cron.unschedule('analytics-rollup');
--   SELECT cron.unschedule('events-retention');
--   -- leave cron-run-details-retention if the email schedule is live
