-- 2026-09-25 — the scrum tables follow "the browser has no table access" like every other table
--
-- STAGED, NOT APPLIED. Files in this directory are not run by anything; apply by hand
-- (Supabase SQL editor or the MCP apply_migration tool), AFTER 2026-08-12_scrum_board.sql
-- and 2026-08-21_scrum_repos.sql, on every database where those have run:
--   1. DEV  jfbagjjvryqcwxsyeyeg → both scrum migrations ran there on 2026-08-21, before
--      2026-09-21_lock_down_direct_table_access.sql, whose blanket REVOKE covered these
--      tables: checked 2026-09-25, all nine exist with RLS on and give anon and
--      authenticated nothing. On DEV this file only pins the two search_paths.
--   2. PROD yfezwtoeoexfksvbpxmi → run it straight after the two scrum migrations, in
--      the same session. There the lockdown ran first, so the scrum migrations' explicit
--      GRANT ALL would otherwise stand (see "Why").
--   3. record the apply dates here and regenerate supabase/schema.sql (not regenerated
--      since 2026-09-08, see supabase/README.md).
--
-- Applied: DEV ____-__-__   PROD ____-__-__
--
-- ── Why ──────────────────────────────────────────────────────────────────────────────────
-- 2026-09-21_lock_down_direct_table_access.sql revokes every client privilege on existing
-- tables and makes new tables start with none (ALTER DEFAULT PRIVILEGES). The scrum
-- migrations predate it and GRANT ALL to anon and authenticated explicitly, which a default
-- cannot undo, so on PROD they would reopen nine tables to the public anon key. RLS is on
-- with no policies, so no row is readable through them today; the revoke restores the
-- second layer the lockdown added. It matters most for scrum_repos, which stores
-- repository access tokens. The group messaging migration had the same problem, which is
-- why prod/2026-09-20_align_prod.sql re-runs the lockdown as its last step.
--
-- It also pins search_path on the two scrum functions (advisor lint 0011,
-- function_search_path_mutable). `public` matches 2026-09-08_perf_indexes_and_lints.sql
-- and keeps their unqualified table references working.
--
-- Safe to run on its own and more than once: tables that do not exist yet are skipped,
-- REVOKE and ALTER FUNCTION ... SET are idempotent, and the backend reaches every table
-- with the service-role key, which none of this touches.
--
-- CHECK — client privileges left on the scrum tables (expect no rows after applying):
--
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
--     AND table_name IN ('sprints', 'user_stories', 'tasks', 'task_moves', 'scrum_comments',
--                        'scrum_counters', 'sprint_burnup_days', 'ai_draft_usage',
--                        'scrum_repos')
--   ORDER BY table_name, grantee, privilege_type;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sprints', 'user_stories', 'tasks', 'task_moves', 'scrum_comments',
    'scrum_counters', 'sprint_burnup_days', 'ai_draft_usage', 'scrum_repos'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.scrum_next_key(uuid, text)') IS NOT NULL THEN
    ALTER FUNCTION public.scrum_next_key(uuid, text) SET search_path = public;
  END IF;
  IF to_regprocedure('public.scrum_apply_task_move()') IS NOT NULL THEN
    ALTER FUNCTION public.scrum_apply_task_move() SET search_path = public;
  END IF;
END
$$;
