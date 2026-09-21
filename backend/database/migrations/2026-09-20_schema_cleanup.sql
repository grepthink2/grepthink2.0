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
