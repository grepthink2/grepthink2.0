-- 2026-10-02 — deleting a project cascades all the way down
--
-- Idempotent, one transaction, safe on either side of a deploy: no code changes with it.
--
-- Applied: DEV 2026-10-02 (MCP apply_migration)   PROD ____-__-__
--
-- Why: on PROD, DELETE /api/projects/{id} failed on 2026-09-30 with "update or delete on table
-- conversations violates foreign key constraint conversation_reads_conversation_id_fkey"
-- (Sentry PYTHON-FASTAPI-4), and the user saw "Could not save your changes". A project's team
-- conversation cascades from the project (conversations.project_id, 2026-07-14), but three of
-- the conversation's children had no delete rule, so Postgres refused the cascade as soon as
-- the conversation had been read, hidden or written to. Two direct children of projects had the
-- same gap and are not cleaned up by _delete_project_dependencies, so they would have produced
-- the next failure: attendance, and project_ta_assignments (DEV only; PROD's 2026-07-21 final
-- reviews contract dropped that table, and this file skips a table that does not exist).
--
-- What: ON DELETE CASCADE on the five foreign keys below, each one dropped and re-added under its
-- existing name. A row that already cascades is left alone, so the file can run twice. Checked
-- 2026-10-02 with a recursive walk of every foreign key reachable from projects through CASCADE
-- rules: these are the only ones that block, on DEV and on PROD. interest_form has no rule
-- either, but the controller deletes its rows first, so it is left as it is.
--
-- CHECK (expect every row to say 'c'):
--
--   SELECT conrelid::regclass AS child, conname, confdeltype
--   FROM pg_constraint
--   WHERE conname IN ('conversation_reads_conversation_id_fkey',
--                     'conversation_deletes_conversation_id_fkey',
--                     'messages_conversation_id_fkey',
--                     'attendance_project_id_fkey',
--                     'project_ta_assignments_project_id_fkey')
--   ORDER BY 1;

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('conversation_reads',     'conversation_reads_conversation_id_fkey',   'conversation_id', 'conversations'),
      ('conversation_deletes',   'conversation_deletes_conversation_id_fkey', 'conversation_id', 'conversations'),
      ('messages',               'messages_conversation_id_fkey',             'conversation_id', 'conversations'),
      ('attendance',             'attendance_project_id_fkey',                'project_id',      'projects'),
      ('project_ta_assignments', 'project_ta_assignments_project_id_fkey',    'project_id',      'projects')
    ) AS t(child, conname, col, parent)
  LOOP
    IF to_regclass('public.' || fk.child) IS NULL THEN
      RAISE NOTICE '%: table does not exist here, skipped', fk.child;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk.conname
        AND conrelid = ('public.' || fk.child)::regclass
        AND confdeltype = 'c'
    ) THEN
      RAISE NOTICE '%: already cascades, skipped', fk.conname;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', fk.child, fk.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE CASCADE',
      fk.child, fk.conname, fk.col, fk.parent
    );
  END LOOP;
END
$$;
