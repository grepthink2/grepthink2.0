-- ============================================================================
-- GrepThink 2.0 — Storage buckets + policies (run in PROD SQL editor).
--
-- Captured live from DEV on 2026-06-18. The frontend uploads avatars/logos
-- directly to these buckets with the user's token, so they're required.
-- A `supabase db dump --schema public` does NOT include the storage schema,
-- which is why this is a separate file.
--
-- Cleaned vs dev: dropped 3 orphaned policies that referenced a non-existent
-- `avatars` bucket, and de-duplicated a redundant authenticated-SELECT on
-- `project` (public read already covers it). Behavior is otherwise identical.
-- ============================================================================

-- Buckets (all public: objects are readable via their public URL).
insert into storage.buckets (id, name, public)
values ('class',   'class',   true),
       ('profile', 'profile', true),
       ('project', 'project', true)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase in every project; we just
-- add policies. (The `class` bucket intentionally has none — class images are
-- uploaded server-side via the service role; public URL reads still work.)

-- profile bucket: anyone can read; a user may write only under their own uid/ folder.
create policy "profile_public_read" on storage.objects
  for select to public using (bucket_id = 'profile');
create policy "profile_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "profile_update_own" on storage.objects
  for update to authenticated
  using      (bucket_id = 'profile' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'profile' and (storage.foldername(name))[1] = (auth.uid())::text);

-- project bucket: public read; any authenticated user may upload/update logos.
create policy "project_public_read" on storage.objects
  for select to public using (bucket_id = 'project');
create policy "project_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'project');
create policy "project_update_authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'project');
