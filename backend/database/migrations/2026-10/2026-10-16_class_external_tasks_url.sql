-- 2026-10-16 — classes.external_tasks_url: a class's "Tasks - External" link
--
-- The class's task board elsewhere. Everyone in the class (instructor, TAs, students) sees it as
-- a "Tasks - External" item at the end of the sidebar's Coursework group, opening in a new tab;
-- NULL hides the item. The instructor sets it in Create Class and changes or removes it in Class
-- Settings (PATCH /api/classes/{class_id}/external-tasks-url).
--
-- EXPAND, idempotent. ⚠️  Apply BEFORE the release that ships this column's code: GET /api/classes
-- selects it by name for enrolled students and TAs, so without it their class list fails. The
-- old code never reads it, so running this early is safe.
--
-- Only an http(s) address with a host, at most 2048 characters (the API's cap, MAX_EXTERNAL_TASKS_
-- URL_LENGTH in app/classes/models.py): the web client renders the value as a link's href, so a
-- javascript: or data: URL must never be stored, by the API or by hand. Everything the API accepts
-- passes this CHECK.
--
-- Applied: DEV 2026-10-16 (by Claude, via the Supabase connector; every DEV class then got
--          https://example.org)   PROD — pending

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS external_tasks_url text;

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_external_tasks_url_valid;
ALTER TABLE public.classes ADD CONSTRAINT classes_external_tasks_url_valid CHECK (
  external_tasks_url IS NULL
  OR (length(external_tasks_url) <= 2048
      AND external_tasks_url ~* '^https?://[^/?#[:space:]]+[^[:space:]]*$')
);
