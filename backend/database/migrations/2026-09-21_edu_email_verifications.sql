-- 2026-09-21 — pending .edu verification codes move out of process memory
--
-- EXPAND: apply BEFORE deploying the code that uses it (the verify-edu-email flow answers 500
-- without this table); harmless to older code, which never looks at it. Idempotent.
--
-- Applied: DEV ____-__-__   PROD ____-__-__ (queued in prod/2026-09-20_align_prod.sql)
-- Rehearsed on dev 2026-09-21 inside a rolled-back transaction: the upsert keeps one row per
-- user, and the conditional attempt claim updates one row the first time and none the second.
--
-- The roster is matched to accounts by email, and `profiles.edu_email` wins over the login
-- email, so whoever holds an address there owns that student's roster row. It used to be
-- writable through PATCH /api/profiles/me with no proof of ownership; it is now written only
-- by verify_edu_email, after a code emailed to the address comes back.
--
-- The codes lived in a module-level dict, which cannot work on serverless (the instance that
-- checks a code is rarely the one that issued it) and had no limit on guesses. One row per
-- user: a new code replaces the old one. The code itself is never stored, only
-- sha256(user_id:edu_email:code); `attempts` is claimed with a conditional UPDATE before each
-- comparison, so five attempts means five comparisons however requests are timed.
CREATE TABLE IF NOT EXISTS public.edu_email_verifications (
  user_id      uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  edu_email    text        NOT NULL,
  code_hash    text        NOT NULL,
  attempts     integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at   timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Service role only: RLS on with no policy, and no client privileges even where the
-- 2026-09-21 lockdown has not run yet.
ALTER TABLE public.edu_email_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edu_email_verifications FROM anon, authenticated;
