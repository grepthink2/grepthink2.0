-- 2026-09-20 — bring PROD level with dev: one script, one transaction
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD
-- yfezwtoeoexfksvbpxmi. Assembled by concatenating the migration files named in each step,
-- verbatim, so every statement here is byte-identical to what dev has already run (steps
-- 2 and 8 exist only here and were run on dev on 2026-09-20 as a no-op and a check).
-- If a source file changes before this is applied, re-assemble rather than editing here.
--
-- How to run: paste the whole file into the Supabase SQL editor and run it once. Steps 1–7
-- sit inside an explicit BEGIN … COMMIT, so if any statement fails NOTHING is applied and
-- you can fix and re-run; every step is also idempotent. The last statement, after the
-- COMMIT, is a verification SELECT whose expected values are in its comments.
-- Alternatively, approve the Supabase MCP `apply_migration` tool for this project and
-- Claude applies the steps one by one, which also records them in the project's
-- migration history (the SQL editor does not).
--
-- Applied: PROD ____-__-__
--
-- ── What this does, and what it deliberately does not ─────────────────────────────
--   * NO TABLE IS DROPPED AND NO ROW IS DELETED. Dropping PROD's messaging data was
--     authorised on 2026-09-18 but is not needed: step 1 upgrades the existing DM-shaped
--     tables in place and backfills participants, so all 51 conversations, 162 messages,
--     102 read markers and 6 hide markers survive (counts measured 2026-09-20).
--   * Safe under the code PROD runs TODAY (`main`), not only under `beta`: main's DM code
--     filters conversations by user_a/user_b, so the new team channels (NULL/NULL) are
--     invisible to it, its inserts get type='dm' by default, and it never selects the
--     three projects columns dropped in step 5. Checked against origin/main 2026-09-20.
--   * Must run BEFORE beta reaches main — the group messaging code needs step 1.
--
-- ── PROD state measured 2026-09-20 ────────────────────────────────────────────────
--   * conversations is the pre-group DM shape (no type, no project_id); 0 rows have a
--     null user. conversation_participants, messages_inbox and the seven group messaging
--     functions do not exist.
--   * The four messaging policies are DM-shaped but carry the group model's NAMES
--     (conversations_select_participant is `auth.uid() = user_a OR auth.uid() = user_b`).
--     Step 1 replaces them by name, step 4 then rewrites them initplan-safe.
--   * supabase_realtime publishes ZERO tables, so live message and notification delivery
--     does not work on PROD today. Dev publishes conversations, messages and
--     notifications with REPLICA IDENTITY FULL. No file ever captured this. Step 2.
--   * handle_new_user is the pre-June version: it remaps instructor→'teacher' (the
--     sanitizer then forces 'student', and the backend corrects it within 60 s), has no
--     pinned search_path (security advisor WARN), and its existing-email branch UPDATEs
--     class_tas and project_ta_assignments, which no longer exist, so that branch can only
--     error. Step 3 installs the version dev has run since 2026-06-21.
--   * The six non-messaging RLS policies are identical to dev's, so step 4's rewrites
--     change evaluation cost, not meaning.
--   * projects.zoom_url / meeting_day / meeting_time: 0 non-null values in 15 rows.
--   * Enums user_role and term: 0 dependents. handle_auth_sync: wired to no trigger.
--   * All five unique indexes the upserts rely on are present.
--
-- ── Dashboard-only, cannot be scripted ───────────────────────────────────────────
--   * Authentication → Passwords → enable leaked-password protection (advisor WARN).
--
-- ── If step 1 ever fails because PROD drifted further ─────────────────────────────
--   The authorised fallback is scrap-and-rebuild, which destroys the messaging history:
--     DROP TABLE public.conversation_deletes, public.conversation_reads,
--                public.messages, public.conversations CASCADE;
--   then run 2026-04-23_messages.sql, 2026-04-26_conversation_deletes.sql and
--   2026-07-14_group_messaging.sql, then steps 2–7 below. Nothing outside messaging has
--   a foreign key into those four tables (verified), so the blast radius stops there.


BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — group messaging: upgrade the DM tables in place, backfill participants
--   source: 2026-07-14_group_messaging.sql (verbatim)
-- ═════════════════════════════════════════════════════════════════════════════

-- Group messaging: unified participants model.
-- Spec: docs/superpowers/specs/2026-07-14-group-messaging-and-design-system.md
-- Idempotent; applied manually via Supabase MCP on maintainer go-ahead.

-- ============ 1) conversations: type + project_id ============
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'dm';
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_valid;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_valid
  CHECK (type IN ('dm','team_ta','team_instructor','team_members'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE conversations ALTER COLUMN user_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_b DROP NOT NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_shape;
ALTER TABLE conversations ADD CONSTRAINT conversations_shape CHECK (
  (type = 'dm' AND user_a IS NOT NULL AND user_b IS NOT NULL AND project_id IS NULL)
  OR (type <> 'dm' AND project_id IS NOT NULL AND user_a IS NULL AND user_b IS NULL)
);

-- One channel of each kind per team. (Existing canonical-order CHECK and
-- UNIQUE(user_a,user_b) pass NULL-safely for team rows.)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_team_channel_uq
  ON conversations (project_id, type) WHERE type <> 'dm';
CREATE INDEX IF NOT EXISTS conversations_project_idx
  ON conversations (project_id) WHERE project_id IS NOT NULL;

-- ============ 2) participants ============
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('member','ta','instructor')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON conversation_participants (user_id);
GRANT ALL ON TABLE conversation_participants TO anon, authenticated, service_role;

-- ============ 3) keyset-pagination index ============
CREATE INDEX IF NOT EXISTS messages_conv_created_id_idx
  ON messages (conversation_id, created_at DESC, id DESC);

-- ============ 4) provisioning + sync ============
CREATE OR REPLACE FUNCTION provision_team_channels(p_project_id uuid)
RETURNS void AS $$
DECLARE
  v_class_owner uuid;
BEGIN
  INSERT INTO conversations (type, project_id)
  SELECT t, p_project_id
    FROM unnest(ARRAY['team_ta','team_instructor','team_members']) AS t
  ON CONFLICT (project_id, type) WHERE type <> 'dm' DO NOTHING;

  -- members into all three channels
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, pm.user_id, 'member'
    FROM conversations c
    JOIN project_members pm ON pm.project_id = p_project_id
   WHERE c.project_id = p_project_id AND c.type <> 'dm'
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- TA seat
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, p.assigned_ta_id, 'ta'
    FROM conversations c
    JOIN projects p ON p.id = p_project_id
   WHERE c.project_id = p_project_id AND c.type = 'team_ta'
     AND p.assigned_ta_id IS NOT NULL
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- instructor seat (class owner)
  SELECT cl.created_by INTO v_class_owner
    FROM projects p JOIN classes cl ON cl.id = p.class_id
   WHERE p.id = p_project_id;
  IF v_class_owner IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, v_class_owner, 'instructor'
      FROM conversations c
     WHERE c.project_id = p_project_id AND c.type = 'team_instructor'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_projects_provision_channels()
RETURNS trigger AS $$
BEGIN
  PERFORM provision_team_channels(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_provision_channels ON projects;
CREATE TRIGGER projects_provision_channels
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION trg_projects_provision_channels();

CREATE OR REPLACE FUNCTION trg_project_members_sync()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM provision_team_channels(NEW.project_id);
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.user_id, 'member'
      FROM conversations c
     WHERE c.project_id = NEW.project_id AND c.type <> 'dm'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = OLD.project_id AND c.type <> 'dm'
       AND cp.user_id = OLD.user_id AND cp.role = 'member';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_members_sync_channels ON project_members;
CREATE TRIGGER project_members_sync_channels
AFTER INSERT OR DELETE ON project_members
FOR EACH ROW EXECUTE FUNCTION trg_project_members_sync();

CREATE OR REPLACE FUNCTION trg_projects_ta_swap()
RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_ta_id IS DISTINCT FROM OLD.assigned_ta_id THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = NEW.id AND c.type = 'team_ta' AND cp.role = 'ta';
    IF NEW.assigned_ta_id IS NOT NULL THEN
      PERFORM provision_team_channels(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_ta_swap_channel ON projects;
CREATE TRIGGER projects_ta_swap_channel
AFTER UPDATE OF assigned_ta_id ON projects
FOR EACH ROW EXECUTE FUNCTION trg_projects_ta_swap();

CREATE OR REPLACE FUNCTION trg_classes_owner_swap()
RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    DELETE FROM conversation_participants cp
     USING conversations c, projects p
     WHERE cp.conversation_id = c.id AND c.type = 'team_instructor'
       AND c.project_id = p.id AND p.class_id = NEW.id AND cp.role = 'instructor';
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.created_by, 'instructor'
      FROM conversations c JOIN projects p ON p.id = c.project_id
     WHERE c.type = 'team_instructor' AND p.class_id = NEW.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS classes_owner_swap_channel ON classes;
CREATE TRIGGER classes_owner_swap_channel
AFTER UPDATE OF created_by ON classes
FOR EACH ROW EXECUTE FUNCTION trg_classes_owner_swap();

-- DM participant rows for every creation path (backend, manual, etc.)
CREATE OR REPLACE FUNCTION trg_dm_participants()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'dm' THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, NEW.user_a, 'member'), (NEW.id, NEW.user_b, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS conversations_dm_participants ON conversations;
CREATE TRIGGER conversations_dm_participants
AFTER INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION trg_dm_participants();

-- ============ 5) backfill ============
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT id, user_a, 'member' FROM conversations
 WHERE type = 'dm' AND user_a IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT id, user_b, 'member' FROM conversations
 WHERE type = 'dm' AND user_b IS NOT NULL
ON CONFLICT DO NOTHING;
SELECT provision_team_channels(id) FROM projects;

-- ============ 6) RLS (SELECT-only; writes stay service-role) ============
-- Belt-and-suspenders: policies are inert unless RLS is ENABLED on the table.
-- The live DB has these enabled already (advisor-verified), but the migration
-- must be self-sufficient — the frontend's unfiltered realtime subscription
-- relies on these policies scoping delivery per participant.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_participants_select_own ON conversation_participants;
-- NOTE: keep this policy self-reference-free (plain user_id check) —
-- a participants policy that queries participants recurses and errors.
CREATE POLICY conversation_participants_select_own ON conversation_participants
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS conversations_select_participant ON conversations;
CREATE POLICY conversations_select_participant ON conversations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversation_participants cp
     WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS messages_select_participant ON messages;
CREATE POLICY messages_select_participant ON messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversation_participants cp
     WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  ));

-- ============ 7) inbox RPC ============
CREATE OR REPLACE FUNCTION messages_inbox(p_user uuid)
RETURNS TABLE (
  id uuid, type text, project_id uuid, team_name text,
  created_at timestamptz, last_message_at timestamptz,
  unread_count bigint, my_last_read_at timestamptz,
  last_message jsonb, participants jsonb, can_send boolean
)
LANGUAGE sql STABLE AS $$
WITH my_convs AS (
  SELECT c.*
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.user_id = p_user
    LEFT JOIN conversation_deletes cd
      ON cd.conversation_id = c.id AND cd.user_id = p_user
   WHERE (cd.deleted_at IS NULL OR c.last_message_at > cd.deleted_at)
),
my_classes AS (
  SELECT class_id FROM class_enrollments WHERE user_id = p_user
  UNION
  SELECT id FROM classes WHERE created_by = p_user
)
SELECT
  c.id, c.type, c.project_id, p.name AS team_name,
  c.created_at, c.last_message_at,
  COALESCE(un.cnt, 0) AS unread_count,
  r.last_read_at AS my_last_read_at,
  lm.msg AS last_message,
  parts.arr AS participants,
  -- NOTE: mirrors can_message() in backend/app/messages/controller.py — that
  -- function is the authoritative send-time check; keep the two in sync.
  CASE
    WHEN c.type <> 'dm' THEN true
    ELSE (
      NOT (
        (SELECT role FROM profiles WHERE id = p_user) = 'instructor'
        AND (SELECT role FROM profiles WHERE id = other_id.uid) = 'instructor'
      )
      AND EXISTS (
        SELECT 1 FROM my_classes mc
         WHERE mc.class_id IN (
           SELECT class_id FROM class_enrollments WHERE user_id = other_id.uid
           UNION
           SELECT id FROM classes WHERE created_by = other_id.uid
         )
      )
    )
  END AS can_send
FROM my_convs c
LEFT JOIN projects p ON p.id = c.project_id
LEFT JOIN conversation_reads r
  ON r.conversation_id = c.id AND r.user_id = p_user
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM messages m
   WHERE m.conversation_id = c.id AND m.sender_id <> p_user
     AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
) un ON true
LEFT JOIN LATERAL (
  SELECT to_jsonb(x) AS msg FROM (
    SELECT m.id, m.sender_id, m.body, m.created_at
      FROM messages m WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) x
) lm ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', pr.id, 'role', cp.role, 'email', pr.email,
           'first_name', pr.first_name, 'last_name', pr.last_name,
           'image_url', pr.image_url, 'last_read_at', cr.last_read_at
         ) ORDER BY cp.role, pr.first_name) AS arr
    FROM conversation_participants cp
    JOIN profiles pr ON pr.id = cp.user_id
    LEFT JOIN conversation_reads cr
      ON cr.conversation_id = c.id AND cr.user_id = cp.user_id
   WHERE cp.conversation_id = c.id
) parts ON true
LEFT JOIN LATERAL (
  SELECT CASE WHEN c.type = 'dm' THEN
           CASE WHEN c.user_a = p_user THEN c.user_b ELSE c.user_a END
         END AS uid
) other_id ON true
WHERE
  (c.type = 'dm' AND c.last_message_at IS NOT NULL)
  OR c.type IN ('team_members','team_instructor')
  OR (c.type = 'team_ta' AND (
        c.last_message_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM conversation_participants tp
                    WHERE tp.conversation_id = c.id AND tp.role = 'ta')))
ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
LIMIT 200;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — realtime: publish the three tables the client subscribes to
--   source: this file — captured from dev 2026-09-18, in no other migration
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION
      'publication supabase_realtime does not exist on this database — create it (Supabase dashboard, Database → Replication) and re-run';
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

-- Matches dev. Realtime carries old-row data on update and delete only with FULL.
ALTER TABLE public.conversations  REPLICA IDENTITY FULL;
ALTER TABLE public.messages       REPLICA IDENTITY FULL;
ALTER TABLE public.notifications  REPLICA IDENTITY FULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — handle_new_user: the version dev has run since June
--   source: 2026-06-21_fix_instructor_role_trigger.sql (verbatim)
-- ═════════════════════════════════════════════════════════════════════════════

-- Fix: Supabase's handle_new_user trigger was defaulting role to 'student'
-- regardless of the role set in user_metadata during signUp(). Instructors
-- ended up with role='student' in the profiles table because the trigger
-- fired before /api/create-user could insert the correct value, and
-- create-user is INSERT-only (returns 409 if a row already exists).
--
-- This migration updates the trigger function to read the role from
-- raw_user_meta_data->>'role' (set via options.data in supabase.auth.signUp),
-- falling back to 'student' if absent or invalid.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  _role := new.raw_user_meta_data->>'role';
  IF _role NOT IN ('student', 'instructor') THEN
    _role := 'student';
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, _role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 4 — indexes, duplicate-index cleanup, initplan-safe policies, search_path
--   source: 2026-09-08_perf_indexes_and_lints.sql (verbatim)
-- ═════════════════════════════════════════════════════════════════════════════

-- 2026-09-08 — indexes, duplicate-index cleanup, RLS initplan fix, function search_path
--
-- STAGED, NOT APPLIED. Files in this directory are not run by anything;
-- apply by hand (Supabase SQL editor or the MCP apply_migration tool):
--   1. DEV  jfbagjjvryqcwxsyeyeg  → run the whole file, then re-run the
--      Performance/Security advisors
--   2. PROD yfezwtoeoexfksvbpxmi  → run the preflight below FIRST and apply only the
--      parts whose objects exist there. PROD trails DEV by several migrations, and the
--      SQL editor wraps a pasted script in a single transaction: one "relation does not
--      exist" aborts the whole file, including the parts that would have applied.
--      IF NOT EXISTS / IF EXISTS do not save you here — they guard the index or the
--      policy, not the table underneath it.
--      Measured on PROD 2026-09-18: parts A, B, C1 and E apply as-is. Part C2 and part D
--      do not — PROD has messages, conversations, conversation_reads and
--      conversation_deletes, but no conversation_participants and none of the group
--      messaging functions. Re-run the preflight rather than trusting this line.
--      prod/2026-09-20_align_prod.sql runs the group messaging migration first (in place,
--      no data lost) and then this whole file, so on PROD use that bundle rather than
--      applying parts of this file on their own.
--   3. record the apply dates here and regenerate supabase/schema.sql
--
-- Nothing in the application code depends on this file: it only makes existing queries
-- cheaper and clears advisor findings. The parts below are independent and may be
-- applied separately, in any order, whenever their migration reaches an environment.
--
-- Applied: DEV 2026-09-20 (recorded as `perf_indexes_and_lints`)   PROD ____-__-__
--
-- Everything is idempotent (IF NOT EXISTS / IF EXISTS / CREATE OR REPLACE-style
-- policy recreation), so re-running is harmless. Tables added by the scrum-board
-- branch (tasks, user_stories, task_moves, scrum_comments, scrum_repos, …) are
-- deliberately NOT touched here — their indexes belong to that branch's migration.
--
-- Source of the findings: Supabase Performance + Security advisors on DEV,
-- 2026-09-08 (32 unindexed foreign keys, 2 duplicate index pairs, 11 policies
-- re-evaluating auth.uid() per row, 13 functions with a mutable search_path), and
-- pg_stat_user_tables showing e.g. project_members at 1,319 seq scans / 0 index scans.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT — which parts can this database take? Run both queries; skip any part
-- whose objects come back `f`.
--
--   SELECT v.part, v.obj, to_regclass('public.' || v.obj) IS NOT NULL AS present
--   FROM (VALUES
--     ('A','project_members'),('A','project_join_requests'),('A','"TSRs"'),
--     ('A','roster_entries'),('A','assignments'),('A','class_enrollments'),
--     ('A','profiles'),('A','classes'),('A','projects'),
--     ('B','feedback_submissions'),('B','notifications'),('B','pending_invites'),
--     ('B','attendance'),('B','meetings'),('B','final_review_notes'),
--     ('B','final_review_scores'),('B','project_review_tas'),
--     ('C1','messages'),('C1','conversation_reads'),('C1','conversation_deletes'),
--     ('C2','conversation_participants'),('C2','conversations')
--   ) AS v(part, obj) ORDER BY 3, 1, 2;
--
--   SELECT v.part, v.fn, EXISTS (
--            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public' AND p.proname = v.fn
--          ) AS present
--   FROM (VALUES
--     ('C1','bump_conversation_last_message'),
--     ('D','provision_team_channels'),('D','trg_projects_provision_channels'),
--     ('D','trg_project_members_sync'),('D','trg_projects_ta_swap'),
--     ('D','trg_classes_owner_swap'),('D','trg_dm_participants'),('D','messages_inbox'),
--     ('E','custom_access_token_hook'),('E','profiles_role_sanitizer'),('E','handle_auth_sync')
--   ) AS v(part, fn) ORDER BY 3, 1, 2;
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- PART A — core schema (present in every environment)
-- ═════════════════════════════════════════════════════════════════════════════

-- A1) Indexes on the foreign-key columns the application actually filters by.
--     (Plain CREATE INDEX: the tables are small enough that the brief lock is
--     irrelevant; use CONCURRENTLY outside a transaction if that ever changes.)

-- project_members: every project read, team roster, num_members recount
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members (project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id    ON public.project_members (user_id);

-- project_join_requests: per-project review lists, per-user pending lists
CREATE INDEX IF NOT EXISTS idx_project_join_requests_project_id  ON public.project_join_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_project_join_requests_user_id     ON public.project_join_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_project_join_requests_invited_by  ON public.project_join_requests (invited_by);
CREATE INDEX IF NOT EXISTS idx_project_join_requests_reviewer_id ON public.project_join_requests (reviewer_id);

-- TSRs: per-assignment overviews, per-project views, per-evaluator/evaluatee reads
CREATE INDEX IF NOT EXISTS idx_tsrs_assignment_id ON public."TSRs" (assignment_id);
CREATE INDEX IF NOT EXISTS idx_tsrs_project_id    ON public."TSRs" (project_id);
CREATE INDEX IF NOT EXISTS idx_tsrs_evaluator_id  ON public."TSRs" (evaluator_id);
CREATE INDEX IF NOT EXISTS idx_tsrs_evaluatee_id  ON public."TSRs" (evaluatee_id);

-- roster_entries: every roster read is by class (course_id); matched-profile joins
CREATE INDEX IF NOT EXISTS idx_roster_entries_course_id          ON public.roster_entries (course_id);
CREATE INDEX IF NOT EXISTS idx_roster_entries_matched_profile_id ON public.roster_entries (matched_profile_id);

-- assignments: listed per class on every class page
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON public.assignments (class_id);

-- A2) Duplicate / redundant indexes (advisor: duplicate_index; idx_profiles_id
--     duplicates the primary key).
DROP INDEX IF EXISTS public.idx_class_enrollments_class_id;  -- same as class_enrollments_class_id_idx
DROP INDEX IF EXISTS public.idx_class_enrollments_user_id;   -- same as class_enrollments_user_id_idx
DROP INDEX IF EXISTS public.idx_profiles_id;                 -- same as profiles_pkey

-- A3) RLS policies: wrap auth.uid() in a scalar subquery so Postgres evaluates it
--     once per statement instead of once per row (advisor: auth_rls_initplan).
--     Definitions are byte-for-byte the current DEV policies with only that change.
DROP POLICY IF EXISTS "Creators can manage classes" ON public.classes;
CREATE POLICY "Creators can manage classes" ON public.classes
  FOR ALL USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Project creators can manage" ON public.projects;
CREATE POLICY "Project creators can manage" ON public.projects
  FOR ALL USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);


-- ═════════════════════════════════════════════════════════════════════════════
-- PART B — feature tables added after the base schema (notifications 2026-06-17,
-- feedback_submissions 06-19, TA management 06-20, meetings 06-26, pending_invites
-- 06-23, review TAs 07-05, final reviews 07-21/07-24)
-- ═════════════════════════════════════════════════════════════════════════════

-- feedback_submissions: (assignment_id) exists; per-student lookups do not
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_student_id ON public.feedback_submissions (student_id);

-- scheduled invites (poller filters by send_at/sent/cancelled — partial index exists;
-- the class FK is used by the instructor's queue listing)
CREATE INDEX IF NOT EXISTS idx_pending_invites_class_id ON public.pending_invites (class_id);

-- attendance / meetings / final reviews — FK columns used in joins and ON DELETE checks
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by            ON public.attendance (marked_by);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by             ON public.meetings (created_by);
CREATE INDEX IF NOT EXISTS idx_final_review_notes_updated_by   ON public.final_review_notes (updated_by);
CREATE INDEX IF NOT EXISTS idx_final_review_scores_scored_by   ON public.final_review_scores (scored_by);
CREATE INDEX IF NOT EXISTS idx_project_review_tas_assigned_by  ON public.project_review_tas (assigned_by);

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = (SELECT auth.uid()));


-- ═════════════════════════════════════════════════════════════════════════════
-- PART C1 — messaging tables that PROD already has (2026-04-23_messages.sql,
-- 2026-04-26_conversation_deletes.sql)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_messages_sender_id            ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reads_user_id    ON public.conversation_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_deletes_user_id  ON public.conversation_deletes (user_id);

DROP POLICY IF EXISTS conversation_reads_select_own ON public.conversation_reads;
CREATE POLICY conversation_reads_select_own ON public.conversation_reads
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversation_deletes_select_own ON public.conversation_deletes;
CREATE POLICY conversation_deletes_select_own ON public.conversation_deletes
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Pin search_path (advisor: function_search_path_mutable). `public` matches what
-- handle_new_user already uses and keeps the unqualified table references working.
ALTER FUNCTION public.bump_conversation_last_message()           SET search_path = public;


-- ═════════════════════════════════════════════════════════════════════════════
-- PART C2 — policies whose USING clause reads conversation_participants, which
-- PROD does not have (2026-09-18). Creating a policy that references a missing
-- table fails, so these wait for the messaging migration to reach the target.
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS conversation_participants_select_own ON public.conversation_participants;
CREATE POLICY conversation_participants_select_own ON public.conversation_participants
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversations_select_participant ON public.conversations;
CREATE POLICY conversations_select_participant ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = (SELECT auth.uid())
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- PART D — group messaging (2026-07-14_group_messaging.sql; NOT on PROD as of
-- 2026-09-14). search_path only; see the note in Part C.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.provision_team_channels(p_project_id uuid) SET search_path = public;
ALTER FUNCTION public.trg_projects_provision_channels()          SET search_path = public;
ALTER FUNCTION public.trg_project_members_sync()                 SET search_path = public;
ALTER FUNCTION public.trg_projects_ta_swap()                     SET search_path = public;
ALTER FUNCTION public.trg_classes_owner_swap()                   SET search_path = public;
ALTER FUNCTION public.trg_dm_participants()                      SET search_path = public;
ALTER FUNCTION public.messages_inbox(p_user uuid)                SET search_path = public;


-- ═════════════════════════════════════════════════════════════════════════════
-- PART E — auth glue (supabase/auth_glue.sql). search_path only.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.custom_access_token_hook(event jsonb)     SET search_path = public;
ALTER FUNCTION public.profiles_role_sanitizer()                  SET search_path = public;
ALTER FUNCTION public.handle_auth_sync()                         SET search_path = public;  -- dead, but still flagged


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification after applying (expect: 0 rows for the first two, 0 findings in
-- the advisors for unindexed_foreign_keys on the tables above, duplicate_index,
-- auth_rls_initplan, function_search_path_mutable):
--
--   SELECT indexname FROM pg_indexes WHERE schemaname='public'
--     AND indexname IN ('idx_class_enrollments_class_id','idx_class_enrollments_user_id','idx_profiles_id');
--   SELECT policyname FROM pg_policies WHERE schemaname='public' AND qual ~ 'auth\.uid\(\)' AND qual !~ 'SELECT auth\.uid';
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 — drop the three all-NULL legacy projects columns
--   source: 2026-06-30_drop_legacy_project_meeting_columns.sql (verbatim)
-- ═════════════════════════════════════════════════════════════════════════════

-- Cleanup: drop the legacy per-project meeting slot columns.
--
-- projects.zoom_url / meeting_day / meeting_time held the single meeting slot in
-- the OLD attendance model. They are fully superseded by the generic `meetings`
-- table (2026-06-26_meetings.sql), where each team's day/time/zoom now live (and
-- a team can have several weekly slots). On PROD/DEV these columns are all NULL.
--
-- ORDERING (expand/contract): apply this ONLY AFTER deploying the backend that
-- stops selecting these columns (same commit removed them from
-- attendance.controller._load_project). Until that code is live, dropping the
-- columns makes the old `.select(... zoom_url, meeting_day, meeting_time ...)`
-- return a PostgREST "column does not exist" 400 and breaks attendance/meeting
-- editing. They were a dead select (never read), so the code change is behavior-
-- preserving; this drop is purely mechanical once it is deployed.
-- Applied: DEV 2026-09-20   PROD ____-__-__ (queued in prod/2026-09-20_align_prod.sql).
-- Re-verified 2026-09-20: 0 non-null values in all three columns on both databases, and
-- neither `main` nor `beta` selects them from `projects`.
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS zoom_url,
  DROP COLUMN IF EXISTS meeting_day,
  DROP COLUMN IF EXISTS meeting_time;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 6 — drop the dead function, the unused enums and the redundant index
--   source: 2026-09-20_schema_cleanup.sql (verbatim)
-- ═════════════════════════════════════════════════════════════════════════════

-- 2026-09-20 — drop schema objects nothing uses
--
-- Verified on DEV and PROD on 2026-09-20, and against the code on both `main` (what PROD
-- runs) and `beta`. Nothing here holds data: no table is dropped and no row is deleted.
-- Idempotent.
--
-- Applied: DEV 2026-09-20 (recorded as `schema_cleanup` and
-- `drop_legacy_project_meeting_columns` in the project's migration history)
--          PROD ____-__-__  (queued in prod/2026-09-20_align_prod.sql)
--
-- Companion: 2026-06-30_drop_legacy_project_meeting_columns.sql was staged since June and
-- applied alongside this file. projects.zoom_url / meeting_day / meeting_time were NULL in
-- every row on both databases and neither branch selects them from `projects`.

-- 1) handle_auth_sync(): wired to no trigger on either database, and its body inserts a
--    `display_name` column that profiles has never had, so it could not run if it were.
--    It was also SECURITY DEFINER, which is the wrong thing to leave lying around.
DROP FUNCTION IF EXISTS public.handle_auth_sync();

-- 2) Enum types no column, function or other object depends on (pg_depend: 0 dependents
--    each). profiles.role is TEXT with a CHECK; classes.term is TEXT. Plain DROP TYPE, not
--    CASCADE, so Postgres refuses if that ever stops being true.
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.term;

-- 3) messages_conv_created_idx (conversation_id, created_at DESC) is a strict prefix of
--    messages_conv_created_id_idx (conversation_id, created_at DESC, id DESC), which the
--    group messaging migration added for keyset pagination. Every query the short index
--    could serve, the long one serves; keeping both only taxes message inserts. Guarded so
--    this is a no-op on a database that has not had group messaging applied yet.
DO $$
BEGIN
  IF to_regclass('public.messages_conv_created_id_idx') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.messages_conv_created_idx;
  END IF;
END
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 7 — stop exposing the RLS guard over PostgREST
--   source: 2026-09-20_rls_auto_enable_guard.sql — the REVOKE only
-- ═════════════════════════════════════════════════════════════════════════════

-- PROD already has rls_auto_enable() and the ensure_rls event trigger, byte-identical to
-- 2026-09-20_rls_auto_enable_guard.sql; only the grant differs. Event triggers fire
-- without an EXECUTE check (proven on dev with a scratch table), so this does not disarm
-- the guard — it only stops exposing a SECURITY DEFINER function over PostgREST.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;


COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 8 — verification — read the one row this returns against the comments
--   source: this file
-- ═════════════════════════════════════════════════════════════════════════════

SELECT
  (SELECT count(*) FROM public.messages)                                     AS messages,                 -- ≥ 162: nothing lost
  (SELECT count(*) FROM public.conversations WHERE type = 'dm')              AS dm_conversations,         -- ≥ 51
  (SELECT count(*) FROM public.conversations WHERE type <> 'dm')
    = 3 * (SELECT count(*) FROM public.projects)                             AS three_channels_per_project, -- t
  (SELECT count(*) FROM public.conversations c
    WHERE c.type = 'dm'
      AND (SELECT count(*) FROM public.conversation_participants p
            WHERE p.conversation_id = c.id) <> 2)                            AS dms_missing_participants, -- 0
  (SELECT count(*) FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename IN ('conversations','messages','notifications'))         AS realtime_tables,          -- 3
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND qual ~ 'auth\.uid\(\)'
      AND qual !~ 'SELECT auth\.uid')                                       AS per_row_policies,         -- 0
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('idx_class_enrollments_class_id','idx_class_enrollments_user_id',
                        'idx_profiles_id','messages_conv_created_idx'))      AS redundant_indexes,        -- 0
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_auth_sync')           AS dead_function,            -- 0
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname IN ('user_role','term'))        AS dead_enums,               -- 0
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects'
      AND column_name IN ('zoom_url','meeting_day','meeting_time'))          AS legacy_columns,           -- 0
  -- Function bodies byte-identical to dev's (md5 of prosrc, first 8 hex):
  (SELECT string_agg(p.proname || '#' || left(md5(p.prosrc), 8), ' ' ORDER BY p.proname)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('handle_new_user','messages_inbox','provision_team_channels',
                        'trg_classes_owner_swap','trg_dm_participants',
                        'trg_project_members_sync','trg_projects_provision_channels',
                        'trg_projects_ta_swap'))                             AS function_hashes;
  -- expect: handle_new_user#c9cb2fb0 messages_inbox#a434e227 provision_team_channels#a526cc5d
  --         trg_classes_owner_swap#05ecc808 trg_dm_participants#96d8bc42
  --         trg_project_members_sync#600c9df4 trg_projects_provision_channels#454f4a80
  --         trg_projects_ta_swap#99d53c52
