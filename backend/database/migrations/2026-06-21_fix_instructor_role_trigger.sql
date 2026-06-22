-- Fix: Supabase's handle_new_user trigger was defaulting role to 'student'
-- regardless of the role set in user_metadata during signUp(). Instructors
-- ended up with role='student' in the profiles table because the trigger
-- fired before /api/create-user could insert the correct value, and
-- create-user is INSERT-only (returns 409 if a row already exists).
--
-- This migration updates the trigger function to read the role from
-- raw_user_meta_data->>'role' (set via options.data in supabase.auth.signUp),
-- falling back to 'student' if absent or invalid.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  _role := new.raw_user_meta_data->>'role';
  IF _role NOT IN ('student', 'instructor') THEN
    _role := 'student';
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, _role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
