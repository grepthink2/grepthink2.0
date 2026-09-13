-- 2026-09-08 — indexes, duplicate-index cleanup, RLS initplan fix, function search_path
--
-- STAGED, NOT APPLIED. Files in this directory are not run by anything;
-- apply by hand (Supabase SQL editor or the MCP apply_migration tool):
--   1. DEV  jfbagjjvryqcwxsyeyeg  → run, then re-run the Performance/Security advisors
--   2. PROD yfezwtoeoexfksvbpxmi  → run at deploy time (safe at any time: nothing in
--      the application code depends on this file; it only makes existing queries
--      cheaper and clears advisor findings)
--   3. record the apply dates here and regenerate supabase/schema.sql
--
-- Applied: DEV ____-__-__   PROD ____-__-__
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Indexes on the foreign-key columns the application actually filters by.
--    (Plain CREATE INDEX: the tables are small enough that the brief lock is
--    irrelevant; use CONCURRENTLY outside a transaction if that ever changes.)
-- ─────────────────────────────────────────────────────────────────────────────

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

-- feedback_submissions: (assignment_id) exists; per-student lookups do not
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_student_id ON public.feedback_submissions (student_id);

-- messaging
CREATE INDEX IF NOT EXISTS idx_messages_sender_id            ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reads_user_id    ON public.conversation_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_deletes_user_id  ON public.conversation_deletes (user_id);

-- scheduled invites (poller filters by send_at/sent/cancelled — partial index exists;
-- the class FK is used by the instructor's queue listing)
CREATE INDEX IF NOT EXISTS idx_pending_invites_class_id ON public.pending_invites (class_id);

-- attendance / meetings / final reviews — FK columns used in joins and ON DELETE checks
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by            ON public.attendance (marked_by);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by             ON public.meetings (created_by);
CREATE INDEX IF NOT EXISTS idx_final_review_notes_updated_by   ON public.final_review_notes (updated_by);
CREATE INDEX IF NOT EXISTS idx_final_review_scores_scored_by   ON public.final_review_scores (scored_by);
CREATE INDEX IF NOT EXISTS idx_project_review_tas_assigned_by  ON public.project_review_tas (assigned_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Duplicate / redundant indexes (advisor: duplicate_index; idx_profiles_id
--    duplicates the primary key).
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_class_enrollments_class_id;  -- same as class_enrollments_class_id_idx
DROP INDEX IF EXISTS public.idx_class_enrollments_user_id;   -- same as class_enrollments_user_id_idx
DROP INDEX IF EXISTS public.idx_profiles_id;                 -- same as profiles_pkey

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS policies: wrap auth.uid() in a scalar subquery so Postgres evaluates it
--    once per statement instead of once per row (advisor: auth_rls_initplan).
--    Definitions are byte-for-byte the current DEV policies with only that change.
-- ─────────────────────────────────────────────────────────────────────────────
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

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversation_participants_select_own ON public.conversation_participants;
CREATE POLICY conversation_participants_select_own ON public.conversation_participants
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversation_reads_select_own ON public.conversation_reads;
CREATE POLICY conversation_reads_select_own ON public.conversation_reads
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversation_deletes_select_own ON public.conversation_deletes;
CREATE POLICY conversation_deletes_select_own ON public.conversation_deletes
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Pin search_path on the functions the security advisor flags
--    (function_search_path_mutable). `public` matches what handle_new_user already
--    uses and keeps the unqualified table references in these bodies working.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.custom_access_token_hook(event jsonb)     SET search_path = public;
ALTER FUNCTION public.provision_team_channels(p_project_id uuid) SET search_path = public;
ALTER FUNCTION public.trg_projects_provision_channels()          SET search_path = public;
ALTER FUNCTION public.trg_project_members_sync()                 SET search_path = public;
ALTER FUNCTION public.trg_projects_ta_swap()                     SET search_path = public;
ALTER FUNCTION public.trg_classes_owner_swap()                   SET search_path = public;
ALTER FUNCTION public.trg_dm_participants()                      SET search_path = public;
ALTER FUNCTION public.messages_inbox(p_user uuid)                SET search_path = public;
ALTER FUNCTION public.bump_conversation_last_message()           SET search_path = public;
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
