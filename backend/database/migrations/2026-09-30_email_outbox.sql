-- 2026-09-30 — email outbox: every non-interactive email is a row a dispatcher delivers
--
-- EXPAND, idempotent, one transaction. Safe on either side of the code deploy: until this file
-- runs, the backend sends invites directly, the way it did before the outbox (app/outbox/
-- controller.py treats the missing table as "not migrated yet").
--
-- Applied: DEV 2026-09-30 (by Claude, via the Supabase connector)   PROD ____-__-__
--
-- ⚠️  ORDER: this file (with 2026-09-30_email_preferences.sql) BEFORE the release that ships
--     the outbox, then prod/2026-09-30_email_dispatch_cron.sql AFTER that release is live. See
--     supabase/README.md, "Email outbox and dispatch schedule".
--
--   * email_outbox: one row per recipient. `status` moves pending → sending → sent, or back
--     to pending with a later next_attempt_at after a temporary failure, or to failed (gave up
--     or the address was rejected), skipped (suppressed, opted out, no longer relevant),
--     bounced (Maileroo reported it) or cancelled. `dedupe_key` makes a producer that runs
--     twice (a scheduled invite job, a reminder job) queue each email once.
--   * claim_email_outbox(p_limit, p_lease_seconds): hands a dispatcher up to p_limit due rows,
--     leased to it for p_lease_seconds. SKIP LOCKED keeps two dispatchers off the same row; a
--     row whose lease ran out (its dispatcher died) is due again. Service role only.
--   * RLS on with no policies and no client privileges: only the service role reads it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  text        NOT NULL,
  to_email              text        NOT NULL,
  user_id               uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  class_id              uuid        REFERENCES public.classes (id) ON DELETE CASCADE,
  batch_id              uuid,
  created_by            uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  payload               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key            text,
  status                text        NOT NULL DEFAULT 'pending',
  attempts              integer     NOT NULL DEFAULT 0,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  locked_until          timestamptz,
  last_error            text,
  provider_reference_id text,
  sent_at               timestamptz,
  delivered_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_dedupe_key_key UNIQUE (dedupe_key),
  CONSTRAINT email_outbox_status_check CHECK
    (status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'bounced', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_due
  ON public.email_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_outbox_lease
  ON public.email_outbox (locked_until) WHERE status = 'sending';
CREATE INDEX IF NOT EXISTS idx_email_outbox_reference
  ON public.email_outbox (provider_reference_id) WHERE provider_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_outbox_batch
  ON public.email_outbox (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_outbox_class_id ON public.email_outbox (class_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_user_id ON public.email_outbox (user_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created_by ON public.email_outbox (created_by);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_email_outbox(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.email_outbox
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.email_outbox o
     SET status       = 'sending',
         attempts     = o.attempts + 1,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         updated_at   = now()
   WHERE o.id IN (
     SELECT id
       FROM public.email_outbox
      WHERE (status = 'pending' AND next_attempt_at <= now())
         OR (status = 'sending' AND locked_until < now())
      ORDER BY next_attempt_at
      LIMIT greatest(p_limit, 0)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(integer, integer) TO service_role;

COMMIT;

-- Check. Expected: 0 rows, the function listed once, and no client privileges on either.
SELECT count(*) AS outbox_rows FROM public.email_outbox;
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
  FROM pg_proc p
 WHERE p.proname = 'claim_email_outbox';
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'email_outbox'
   AND grantee IN ('anon', 'authenticated');
