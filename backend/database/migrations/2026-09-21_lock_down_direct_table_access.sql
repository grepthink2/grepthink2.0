-- 2026-09-21 — the browser may read what Realtime delivers to it, and nothing else
--
-- SAFE TO RUN ON ITS OWN, ON ANY ENVIRONMENT, AT ANY TIME, AND URGENT ON PROD. It does not
-- depend on any other migration (tables that do not exist yet are skipped), it is idempotent,
-- and it changes nothing the application does: the backend reaches every table with the
-- service-role key, which none of this touches. prod/2026-09-20_align_prod.sql runs it again
-- as its last step, because the group messaging migration re-grants ALL on one table.
--
-- Applied: DEV ____-__-__   PROD ____-__-__
-- Rehearsed on dev 2026-09-21 inside a transaction that was rolled back, then tested as a
-- signed-in student while it was in effect: changing their own role, creating a class,
-- reading profiles and writing a message were all denied; their own conversations stayed
-- readable, other people's conversations and notifications did not; a table created
-- afterwards had no client privileges. Dev is a shared database, so applying it for real
-- is the maintainer's call.
--
-- ── Why ────────────────────────────────────────────────────────────────────────────────────
-- The security model is "RLS on every table, the browser never touches a table". Two things
-- quietly contradicted it, and together they were exploitable with nothing but the public
-- anon key that ships in the client bundle:
--
--   * Supabase grants ALL on every new public table to `anon` and `authenticated`. RLS was
--     the only thing standing between a signed-in user and every table.
--   * Four early policies let RLS pass for writes:
--       profiles_update_own          no column limit, so a student could set their own
--                                    `role` to 'instructor', and the backend authorises by it
--       profiles_insert_own          same, at insert
--       "Creators can manage classes" FOR ALL: any user could insert a class naming themselves
--                                    creator, including one reusing a real class's join code
--       "Project creators can manage" FOR ALL: same for a project, in any class
--     Reproduced on dev under PROD's grants, inside a rolled-back transaction, 2026-09-21.
--     Dev had already lost the grants on `profiles` by hand, which is why it was never seen.
--
-- ── What the browser actually needs ────────────────────────────────────────────────────────
-- Auth and Storage (neither is in this schema; the storage policies reference no public
-- table) and Realtime `postgres_changes` on `messages` and `notifications` (`main` also
-- subscribes to `conversations`). Realtime decides who may see a row by running the table's
-- SELECT policy as the subscriber, which needs SELECT on the table and on anything the
-- policy reads: the messaging policies read `conversation_participants` (and, on a database
-- that has not had group messaging yet, `conversations`).
--
-- To let the browser read another table later: add a SELECT policy scoped by auth.uid() AND
-- `GRANT SELECT ON public.<table> TO authenticated`. Neither alone does anything, which is
-- the point.

-- 1) The write policies. `profiles_select_own` (read-only, own row) stays; with no SELECT
--    grant it is inert until someone deliberately grants it.
DROP POLICY IF EXISTS "Creators can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Project creators can manage" ON public.projects;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- 2) Table privileges: nothing for anon, read-only on the Realtime tables for authenticated.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['messages', 'conversations', 'conversation_participants', 'notifications']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END
$$;

-- ...and tables created from now on start with no client privileges at all, instead of ALL.
-- (Migrations run as `postgres`; `service_role` keeps its default grants.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- 3) A join code identifies exactly one class. Every code on dev and PROD is already eight
--    upper-case letters and digits with no duplicates (checked 2026-09-21); this keeps it so,
--    whatever the case, now that the API matches codes exactly instead of with ILIKE.
CREATE UNIQUE INDEX IF NOT EXISTS classes_course_code_upper_uq
  ON public.classes (upper(course_code));

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Verification (expect: first query returns only SELECT rows for `authenticated` on the four
-- Realtime tables and nothing for `anon`; second returns 0 rows; third returns 1 row):
--
--   SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
--    GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND cmd <> 'SELECT';
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND indexname = 'classes_course_code_upper_uq';
-- ─────────────────────────────────────────────────────────────────────────────────────────
