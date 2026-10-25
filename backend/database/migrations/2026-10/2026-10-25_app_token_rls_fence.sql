-- 2026-10-25 — RLS: connected-app tokens read and write nothing directly
--
-- Supabase's OAuth server (enabled for the scrum board MCP connector) issues access tokens to apps
-- that act for a user, such as Claude or ChatGPT. Such a token is an ordinary Supabase JWT plus a
-- `client_id` claim, so without this file it could do, straight against PostgREST, Realtime or
-- Storage, everything the user's own browser session can: read their messages, conversations,
-- notifications and profile, and upload or replace avatars and project logos. Apps go through the
-- backend instead, which accepts their tokens only on /mcp (app/dependencies.py `is_app_token`).
--
--   * public.is_first_party_session(): true for a site session or an anonymous request (no
--     `client_id`), false for an app's token.
--   * A RESTRICTIVE policy `app_tokens_denied` on every table that has policies, in `public` and on
--     `storage.objects`. Postgres ANDs a restrictive policy into every permissive one for every
--     command, so the existing policies keep their names and quals (DEV and PROD name the Storage
--     ones differently) and a permissive policy added later is fenced too.
--   * The closing check refuses to commit if a table in `public` or `storage` has a permissive
--     policy and no `app_tokens_denied`, so a table with policies on one database and not the
--     other cannot slip past.
--
-- A later surface that should let an app reach a table directly drops that table's fence; the
-- default stays deny.
--
-- One transaction, idempotent. Safe to apply before or after the code: site sessions carry no
-- `client_id`, so nothing they see or do changes.
--
-- Applied: DEV — pending   PROD — pending

BEGIN;

CREATE OR REPLACE FUNCTION public.is_first_party_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'client_id', '') = ''
$$;

REVOKE ALL ON FUNCTION public.is_first_party_session() FROM public;
GRANT EXECUTE ON FUNCTION public.is_first_party_session() TO anon, authenticated, service_role;

DO $$
DECLARE t regclass;
BEGIN
  FOR t IN
    SELECT DISTINCT format('%I.%I', schemaname, tablename)::regclass
      FROM pg_policies
     WHERE schemaname IN ('public', 'storage') AND permissive = 'PERMISSIVE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_tokens_denied ON %s', t);
    EXECUTE format(
      'CREATE POLICY app_tokens_denied ON %s AS RESTRICTIVE FOR ALL TO public '
      'USING ((SELECT public.is_first_party_session())) '
      'WITH CHECK ((SELECT public.is_first_party_session()))',
      t
    );
  END LOOP;
END $$;

DO $$
DECLARE unfenced text;
BEGIN
  SELECT string_agg(DISTINCT p.schemaname || '.' || p.tablename, ', ')
    INTO unfenced
    FROM pg_policies p
   WHERE p.schemaname IN ('public', 'storage')
     AND p.permissive = 'PERMISSIVE'
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies f
        WHERE f.schemaname = p.schemaname AND f.tablename = p.tablename
          AND f.policyname = 'app_tokens_denied' AND f.permissive = 'RESTRICTIVE'
     );
  IF unfenced IS NOT NULL THEN
    RAISE EXCEPTION 'tables with policies but no app_tokens_denied: %', unfenced;
  END IF;
END $$;

COMMIT;
