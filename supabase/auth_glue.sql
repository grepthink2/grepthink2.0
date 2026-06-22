-- ============================================================================
-- GrepThink 2.0 — AUTH GLUE (the cross-schema bits a `db dump --schema public`
-- does NOT capture). Run in a fresh PROD project AFTER schema.sql, then run
-- storage.sql, then do the DASHBOARD steps in §5 below.
--
-- Captured live from DEV (jfbagjjvryqcwxsyeyeg) on 2026-06-18 via the Supabase
-- MCP. Without these, signups succeed but no `profiles` row is created, JWTs
-- carry no role, and uploads fail.
-- ============================================================================

-- 1) Profile-creation trigger on auth.users. handle_new_user() itself is in the
--    public schema (created by schema.sql); only this trigger is missed by a
--    public-only dump.
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ⚠️ KNOWN INCONSISTENCY (decide before mirroring): handle_new_user() maps
--    'instructor'->'teacher', then profiles_role_sanitizer forces any role not
--    in ('instructor','student') back to 'student' — so a trigger-created
--    instructor lands as 'student' (the backend POST /api/create-user fixes it
--    afterward via service role). handle_auth_sync() is dead (inserts a
--    non-existent `display_name` column, not wired). For a clean prod, consider
--    dropping the 'instructor'->'teacher' remap. Mirror as-is for parity.

-- 2) Access-token hook grants — REQUIRED for the Custom Access Token hook (§5a)
--    to run. Mirrors dev exactly (supabase_auth_admin may execute; clients may not).
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- 3) Safety net: ensure RLS is ON for every base table in public. New tables
--    created via SQL do NOT auto-enable RLS, so this guarantees the prod tables
--    are locked to the service-role backend (idempotent — safe to re-run).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 4) OPTIONAL security hardening (from the prod security advisor; safe here).
-- NOTE: must include PUBLIC — Postgres grants EXECUTE to PUBLIC by default, so
-- revoking only anon/authenticated leaves them callable via the PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_auth_sync() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user()                SET search_path = public;
ALTER FUNCTION public.handle_auth_sync()               SET search_path = public;
ALTER FUNCTION public.custom_access_token_hook(jsonb)  SET search_path = public;
ALTER FUNCTION public.profiles_role_sanitizer()        SET search_path = public;
ALTER FUNCTION public.bump_conversation_last_message() SET search_path = public;

-- ============================================================================
-- 5) DASHBOARD-ONLY steps (no SQL — do these in the PROD project UI):
--
--   a. Authentication → Hooks → "Customize Access Token (JWT) Claims" →
--      enable → Postgres → schema `public`, function `custom_access_token_hook`.
--      (The §2 grants above must already be applied.)
--   b. Storage → run supabase/storage.sql (buckets `class`/`profile`/`project`
--      + policies). Buckets/policies can't come from a public-schema dump.
--   c. Authentication → URL Configuration →
--        Site URL:      https://2262-cse115b-02.be.ucsc.edu
--        Redirect URLs: https://2262-cse115b-02.be.ucsc.edu/**
--   d. Authentication → Providers → Google (the app uses signInWithOAuth):
--        add the OAuth client ID/secret and add Supabase's callback to the
--        Google console. Skip only if Google sign-in is unused in prod.
--   e. Authentication → Email/Passwords → enable "Leaked password protection".
--   f. (If using .edu verification emails) Project Settings → Auth → SMTP, or
--      set SMTP_* in the VM .env — see DEPLOY.md §3.
-- ============================================================================
