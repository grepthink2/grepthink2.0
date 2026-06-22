-- Fix: roster_entries_matched_profile_id_fkey had no ON DELETE behavior,
-- blocking profile row deletions. Setting ON DELETE SET NULL so that
-- deleting a profile nullifies the matched_profile_id on any roster entry
-- rather than blocking the delete or cascade-deleting the entry.

ALTER TABLE public.roster_entries
  DROP CONSTRAINT roster_entries_matched_profile_id_fkey;

ALTER TABLE public.roster_entries
  ADD CONSTRAINT roster_entries_matched_profile_id_fkey
  FOREIGN KEY (matched_profile_id)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;
