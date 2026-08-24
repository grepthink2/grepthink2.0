-- ═══════════════════════════════════════════════════════════════════════════
-- PROD STAGING — Performance hygiene (FK indexes + RLS initplan)
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)   ⚠ NOT YET APPLIED
-- ═══════════════════════════════════════════════════════════════════════════
-- Identical to backend/database/migrations/2026-08-21_perf_fk_indexes_rls_initplan.sql
-- (the DO block auto-detects that prod lacks conversation_participants and fixes
-- the pair-based messaging policies). Purely additive/idempotent; safe anytime.
-- NOTE: re-run this file after the group-messaging migration eventually applies
-- to prod, so the participant-based policies also get the (select auth.uid()) form.

-- Performance hygiene from the 2026-08-21 PROD advisor pass:
--   1) Covering indexes for unindexed FKs on real query paths (authz membership
--      checks, TSR/class/roster reads, messaging read-marks). Audit-only columns
--      (marked_by, created_by, scored_by, updated_by, assigned_by, invited_by)
--      are deliberately NOT indexed — they never appear in WHERE clauses.
--   2) Drop the duplicate class_enrollments indexes (idx_* twins of *_idx).
--   3) RLS initplan fix: wrap auth.uid() as (select auth.uid()) in all policies
--      so it evaluates once per query, not once per row (matters for Realtime
--      delivery scoping on messages/notifications as rows grow).
-- Messaging policies branch on conversation_participants existence so this file
-- is correct on BOTH dev (group messaging applied) and prod (not yet applied).
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.

-- ============ 1) FK covering indexes ============
CREATE INDEX IF NOT EXISTS project_members_project_id_idx ON project_members (project_id);
CREATE INDEX IF NOT EXISTS project_members_user_id_idx    ON project_members (user_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx         ON messages (sender_id);
CREATE INDEX IF NOT EXISTS tsrs_project_id_idx            ON "TSRs" (project_id);
CREATE INDEX IF NOT EXISTS tsrs_evaluator_id_idx          ON "TSRs" (evaluator_id);
CREATE INDEX IF NOT EXISTS tsrs_evaluatee_id_idx          ON "TSRs" (evaluatee_id);
CREATE INDEX IF NOT EXISTS tsrs_assignment_id_idx         ON "TSRs" (assignment_id);
CREATE INDEX IF NOT EXISTS assignments_class_id_idx       ON assignments (class_id);
CREATE INDEX IF NOT EXISTS roster_entries_course_id_idx   ON roster_entries (course_id);
CREATE INDEX IF NOT EXISTS roster_entries_matched_profile_id_idx ON roster_entries (matched_profile_id);
CREATE INDEX IF NOT EXISTS conversation_reads_user_id_idx   ON conversation_reads (user_id);
CREATE INDEX IF NOT EXISTS conversation_deletes_user_id_idx ON conversation_deletes (user_id);
CREATE INDEX IF NOT EXISTS project_join_requests_project_id_idx  ON project_join_requests (project_id);
CREATE INDEX IF NOT EXISTS project_join_requests_user_id_idx     ON project_join_requests (user_id);
CREATE INDEX IF NOT EXISTS project_join_requests_reviewer_id_idx ON project_join_requests (reviewer_id);
CREATE INDEX IF NOT EXISTS pending_invites_class_id_idx    ON pending_invites (class_id);
CREATE INDEX IF NOT EXISTS feedback_submissions_student_id_idx ON feedback_submissions (student_id);

-- ============ 2) duplicate indexes (keep the <table>_<col>_idx pair) ============
DROP INDEX IF EXISTS idx_class_enrollments_class_id;
DROP INDEX IF EXISTS idx_class_enrollments_user_id;

-- ============ 3) RLS initplan: (select auth.uid()) everywhere ============
-- Identical on dev and prod:
DROP POLICY IF EXISTS "Creators can manage classes" ON classes;
CREATE POLICY "Creators can manage classes" ON classes
  FOR ALL USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Project creators can manage" ON projects;
CREATE POLICY "Project creators can manage" ON projects
  FOR ALL USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS conversation_reads_select_own ON conversation_reads;
CREATE POLICY conversation_reads_select_own ON conversation_reads
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS conversation_deletes_select_own ON conversation_deletes;
CREATE POLICY conversation_deletes_select_own ON conversation_deletes
  FOR SELECT USING (user_id = (select auth.uid()));

-- Messaging policies differ by world: participant-based where group messaging is
-- applied (dev), user_a/user_b pair-based where it is not (prod today). When the
-- group-messaging migration later applies to prod, re-run this file afterwards.
DO $$
BEGIN
  IF to_regclass('public.conversation_participants') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS conversations_select_participant ON conversations';
    EXECUTE $p$CREATE POLICY conversations_select_participant ON conversations
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversations.id
          AND cp.user_id = (select auth.uid())))$p$;

    EXECUTE 'DROP POLICY IF EXISTS messages_select_participant ON messages';
    EXECUTE $p$CREATE POLICY messages_select_participant ON messages
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.user_id = (select auth.uid())))$p$;

    EXECUTE 'DROP POLICY IF EXISTS conversation_participants_select_own ON conversation_participants';
    EXECUTE $p$CREATE POLICY conversation_participants_select_own ON conversation_participants
      FOR SELECT USING (user_id = (select auth.uid()))$p$;
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS conversations_select_participant ON conversations';
    EXECUTE $p$CREATE POLICY conversations_select_participant ON conversations
      FOR SELECT USING (((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b))$p$;

    EXECUTE 'DROP POLICY IF EXISTS messages_select_participant ON messages';
    EXECUTE $p$CREATE POLICY messages_select_participant ON messages
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = messages.conversation_id
          AND (((select auth.uid()) = c.user_a) OR ((select auth.uid()) = c.user_b))))$p$;
  END IF;
END $$;
