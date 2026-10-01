-- 2026-09-30 — email preferences (per category) and suppressions (addresses not to email)
--
-- EXPAND, idempotent, one transaction. Safe on either side of the code deploy: until this file
-- runs, the backend treats every category as on and no address as suppressed, and the
-- preference endpoints answer 503 for writes (app/outbox/preferences.py).
--
-- Applied: DEV 2026-09-30 (by Claude, via the Supabase connector)   PROD ____-__-__
--
-- ⚠️  ORDER: with 2026-09-30_email_outbox.sql, before the release that ships the outbox.
--
--   * email_preferences (user_id, category, enabled): a row only when someone changed a
--     category; no row means the category's default (on). Categories are named in code
--     (app/outbox/preferences.py CATEGORIES), so a new category needs no migration.
--     Transactional email (class invites, verification codes) has no category and is always
--     sent.
--   * email_suppressions (email, reason): addresses the outbox must not email, fed by
--     Maileroo webhooks: `bounced` (permanent delivery failure), `rejected` (Maileroo refused
--     it), `complained` (marked as spam). Stored lower-cased. A maintainer deletes a row to
--     allow an address again.
--   * RLS on with no policies and no client privileges: only the service role reads them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category   text        NOT NULL,
  enabled    boolean     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_preferences FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email      text        PRIMARY KEY,
  reason     text        NOT NULL,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_reason_check CHECK (reason IN ('bounced', 'rejected', 'complained')),
  CONSTRAINT email_suppressions_email_lower CHECK (email = lower(email))
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_suppressions FROM anon, authenticated;

COMMIT;

-- Check. Expected: two rows of 0, and no client privileges.
SELECT (SELECT count(*) FROM public.email_preferences)  AS preferences,
       (SELECT count(*) FROM public.email_suppressions) AS suppressions;
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('email_preferences', 'email_suppressions')
   AND grantee IN ('anon', 'authenticated');
