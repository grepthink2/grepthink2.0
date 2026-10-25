-- 2026-10-25 — RLS: connected-app tokens read nothing directly
--
-- Supabase's OAuth server (enabled for the scrum board MCP connector) issues access tokens to apps
-- that act for a user, such as Claude or ChatGPT. Such a token is an ordinary Supabase JWT plus a
-- `client_id` claim, so without this file it could read, straight from PostgREST or Realtime, every
-- row the user's own browser session can: their messages, conversations, notifications and profile.
-- Apps go through the backend instead, which accepts their tokens only on /mcp
-- (app/dependencies.py `is_app_token`).
--
--   * public.is_first_party_session(): true for a site session (no `client_id`), false for an app's
--     token. Called as `(select public.is_first_party_session())` so the planner evaluates it once
--     per query, like `(select auth.uid())`.
--   * Every policy in `public` (all SELECT-only since 2026-09-21_lock_down_direct_table_access.sql)
--     gets `AND (select public.is_first_party_session())`. The quals below are the ones live on DEV
--     on 2026-10-25; PROD matched them on 2026-10-24.
--   * The closing check refuses to commit if any policy in `public` still lacks the helper, so a
--     policy that exists on one database and not the snapshot cannot slip past.
--
-- A later surface that should let an app read a table directly changes that one policy; the
-- default stays deny.
--
-- One transaction, idempotent (ALTER POLICY replaces the qual). Safe to apply before or after the
-- code: site sessions carry no `client_id`, so nothing they see changes.
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

ALTER POLICY conversation_deletes_select_own ON public.conversation_deletes
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_first_party_session()));

ALTER POLICY conversation_participants_select_own ON public.conversation_participants
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_first_party_session()));

ALTER POLICY conversation_reads_select_own ON public.conversation_reads
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_first_party_session()));

ALTER POLICY conversations_select_participant ON public.conversations
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id AND cp.user_id = (SELECT auth.uid())
    )
    AND (SELECT public.is_first_party_session())
  );

ALTER POLICY messages_select_participant ON public.messages
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = (SELECT auth.uid())
    )
    AND (SELECT public.is_first_party_session())
  );

ALTER POLICY notifications_select_own ON public.notifications
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_first_party_session()));

ALTER POLICY profiles_select_own ON public.profiles
  USING ((SELECT auth.uid()) = id AND (SELECT public.is_first_party_session()));

DO $$
DECLARE unfenced text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
    INTO unfenced
    FROM pg_policies
   WHERE schemaname = 'public'
     AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%is_first_party_session%';
  IF unfenced IS NOT NULL THEN
    RAISE EXCEPTION 'policies without is_first_party_session(): %', unfenced;
  END IF;
END $$;

COMMIT;
