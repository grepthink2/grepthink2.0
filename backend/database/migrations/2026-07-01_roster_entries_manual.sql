-- Support manually-added roster rows that survive CSV re-uploads.
-- `is_manual` flags rows created via the "Add Student" instructor action
-- (as opposed to rows parsed from an uploaded roster CSV). Roster re-upload
-- only replaces non-manual rows, so manually added students are never lost.

ALTER TABLE public.roster_entries
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;
