-- 2026-09-18 — PROD: messaging to the group model, plus realtime parity
--
-- STAGED, NOT APPLIED. Files in this directory are never run by anything. Run this on
-- PROD yfezwtoeoexfksvbpxmi before beta reaches main: the group messaging code needs
-- this schema, and it is what currently gates the beta → main merge.
--
-- NOTHING IS SCRAPPED. Dropping PROD's messaging data was authorised on 2026-09-18, but
-- it turns out not to be necessary: 2026-07-14_group_messaging.sql was written to upgrade
-- exactly the shape PROD is in, and it backfills participants from the existing DMs.
-- PROD holds 51 conversations, 162 messages, 102 conversation_reads and 6
-- conversation_deletes (measured 2026-09-18); all of it survives. The scrap-and-rebuild
-- path is in the appendix if you would rather start clean anyway.
--
-- PROD state measured 2026-09-18 — re-run the preflight rather than trusting this:
--   * conversations is the pre-group DM shape (id, user_a, user_b, created_at,
--     last_message_at). No type column, no project_id. 0 rows have a null user.
--   * conversation_participants does not exist, nor do messages_inbox or any of the
--     seven group messaging functions.
--   * RLS is already ON for conversations, messages, conversation_reads and
--     conversation_deletes, but the policies are DM-shaped while carrying the same
--     NAMES the group model uses — conversations_select_participant on PROD is
--     `auth.uid() = user_a OR auth.uid() = user_b`. Step 1 replaces them by name, which
--     is intended and is why it must run before anything else touches those policies.
--   * supabase_realtime publishes NOTHING on PROD. Dev publishes conversations, messages
--     and notifications, all with REPLICA IDENTITY FULL. No migration in the repo ever
--     captured the publication, which is how it drifted; step 2 closes it.
--   * Every column the migration reads exists on PROD (projects.assigned_ta_id,
--     projects.class_id, projects.name, classes.created_by, class_enrollments.*,
--     profiles.image_url/first_name/last_name/email/role), so provision_team_channels
--     runs and the messages_inbox body — a LANGUAGE sql function, validated against the
--     catalog at CREATE time — resolves.
--
-- Applied: PROD ____-__-__
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT — expect: has_type f, has_participants f, null_users 0, realtime_tables 0.
-- If has_type or has_participants is already t, step 1 has been run; it is idempotent,
-- so re-running is harmless, but check the verification block instead.
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns
--              WHERE table_schema='public' AND table_name='conversations' AND column_name='type') AS has_type,
--     to_regclass('public.conversation_participants') IS NOT NULL AS has_participants,
--     (SELECT count(*) FROM public.conversations WHERE user_a IS NULL OR user_b IS NULL) AS null_users,
--     (SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime') AS realtime_tables,
--     (SELECT count(*) FROM public.messages) AS messages_now;
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — run backend/database/migrations/2026-07-14_group_messaging.sql verbatim
-- ═════════════════════════════════════════════════════════════════════════════
--
-- It is idempotent. On PROD it will:
--   * add conversations.type (default 'dm', so all 51 existing rows become DMs) and
--     conversations.project_id, drop NOT NULL from user_a/user_b, and add the shape
--     CHECK — which every existing row already satisfies;
--   * create conversation_participants and backfill two rows per existing DM from
--     user_a/user_b, so the 162 messages stay reachable by their participants;
--   * create the provisioning and sync functions and their triggers, then call
--     provision_team_channels(id) for every project — giving each PROD project its
--     team_ta / team_instructor / team_members channels with members, the assigned TA
--     and the class owner seated;
--   * replace the four DM-shaped policies with the participant-shaped ones;
--   * create the messages_inbox RPC.
--
-- Nothing below repeats those statements — keeping one copy avoids drift.


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — realtime parity (run after step 1; not covered by any other migration)
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION
      'publication supabase_realtime does not exist on this database — create it (Supabase dashboard, Database → Replication) and re-run this step';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

-- Matches dev. Realtime delivers old-row data on update and delete only with FULL.
-- Setting it twice is a no-op.
ALTER TABLE public.conversations  REPLICA IDENTITY FULL;
ALTER TABLE public.messages       REPLICA IDENTITY FULL;
ALTER TABLE public.notifications  REPLICA IDENTITY FULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — verification (expected results in the comments)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   -- every DM has its two participants back (expect: 0 rows)
--   SELECT c.id FROM public.conversations c
--    WHERE c.type = 'dm'
--      AND (SELECT count(*) FROM public.conversation_participants p
--            WHERE p.conversation_id = c.id) <> 2;
--
--   -- every project got its three channels (expect: 0 rows)
--   SELECT p.id, p.name FROM public.projects p
--    WHERE (SELECT count(*) FROM public.conversations c WHERE c.project_id = p.id) <> 3;
--
--   -- the data is still there (expect: 162 messages, 51 dm conversations)
--   SELECT (SELECT count(*) FROM public.messages) AS messages,
--          (SELECT count(*) FROM public.conversations WHERE type='dm') AS dms;
--
--   -- policies are participant-shaped now (expect: each qual mentions conversation_participants)
--   SELECT tablename, policyname, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename IN ('conversations','messages','conversation_participants');
--
--   -- realtime (expect: conversations, messages, notifications)
--   SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY 1;
--
--   -- the inbox RPC resolves and answers (expect: no error)
--   SELECT count(*) FROM public.messages_inbox((SELECT id FROM public.profiles LIMIT 1));


-- ═════════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. backend/database/migrations/2026-09-08_perf_indexes_and_lints.sql becomes fully
--    applicable on PROD — parts C2 and D were waiting on exactly this. Run the whole
--    file and record the date in its header.
-- 2. Regenerate supabase/schema.sql.
-- 3. beta → main is no longer gated by the group messaging schema.


-- ═════════════════════════════════════════════════════════════════════════════
-- APPENDIX — scrap and rebuild (authorised 2026-09-18, but NOT required)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Same end state as step 1, minus the history: it destroys 162 messages, 51
-- conversations, 102 read markers and 6 hide markers. Only reach for it if the preflight
-- shows PROD has drifted further than this file describes and step 1 errors out.
--
--   DROP TABLE public.conversation_deletes,
--              public.conversation_reads,
--              public.messages,
--              public.conversations CASCADE;
--
-- then run, in this order, and finish with step 2 above:
--   backend/database/migrations/2026-04-23_messages.sql
--   backend/database/migrations/2026-04-26_conversation_deletes.sql
--   backend/database/migrations/2026-07-14_group_messaging.sql
--
-- (The CASCADE takes the policies, the messages_bump_last_message trigger and the
-- inbound foreign keys with it. Nothing outside messaging references these four tables
-- — verified on PROD 2026-09-18 — so the blast radius stops there.)
