-- 2026-09-20 — keep "RLS on every public table" true without anyone remembering to
--
-- The security model (supabase/README.md) is: RLS enabled on every table, the backend
-- reaches tables with the service-role key, and the public anon key is denied by default.
-- A table created by plain SQL does NOT get RLS, so one forgotten ALTER TABLE exposes it
-- to anyone holding the anon key, which ships in the client bundle. That is not
-- hypothetical: dev needed a manual `enable_rls_on_meetings` fix on 2026-08-20.
--
-- PROD already had this guard (someone added it by hand; it was in no file). Dev did not.
-- This file makes it part of the schema. It also stops exposing the function over
-- PostgREST: as created it was SECURITY DEFINER and executable by anon and authenticated,
-- which the security advisor flags (lints 0028 and 0029). It returns `event_trigger`, so a
-- direct call errors anyway, but there is no reason to leave the grant. Event triggers
-- fire without an EXECUTE check, so the revoke does not disarm the guard — verified on dev
-- by creating a scratch table after the revoke and reading back relrowsecurity = true.
--
-- Applied: DEV 2026-09-20 (function + trigger + revoke; recorded as `rls_auto_enable_guard`)
--          PROD ____-__-__  (needs only the REVOKE — the function and trigger are already
--          there, byte-identical; queued in prod/2026-09-20_align_prod.sql)

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
