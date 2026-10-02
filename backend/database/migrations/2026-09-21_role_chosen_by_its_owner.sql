-- 2026-09-21 — a profile's role stays empty until its owner picks one
--
-- ⚠️  NOT AN EXPAND. Apply AFTER the code from the auth-hardening PR is live on the environment
-- (PROD: after beta → main has deployed). Deliberately NOT part of prod/2026-09-20_align_prod.sql.
--     new code + old trigger  → works exactly as before (Google signups silently become students)
--     old code + new trigger  → a first-time Google signup cannot finish: the old create-user
--                               answers 409 for the role-less row and the old role picker
--                               shows that as an error.
-- Idempotent.
--
-- Applied: DEV 2026-09-23   PROD ____-__-__ (only after the release that carries #179 is live)
-- Rehearsed on dev 2026-09-21 inside a rolled-back transaction, through the real trigger on
-- auth.users: a signup with no role in its metadata (Google) and one with a made-up role both
-- got role NULL, a password signup as instructor got 'instructor', the first
-- `UPDATE … WHERE role IS NULL` changed one row and the second changed none, and writing
-- role = 'teacher' produced NULL rather than 'student'.
--
-- A Google signup carries no role. handle_new_user inserted NULL, and profiles_role_sanitizer
-- turned NULL into 'student' on the way in, so every Google user was a student before they
-- ever saw the role picker: /api/login-check never answered role = null, which made the picker
-- unreachable after Google sign-in (nobody could become an instructor that way) and the
-- "no account, please sign up first" check on Google *login* dead code.
--
-- Now the row is created with no role. The app sends a role-less user to /select, and
-- POST /api/create-user writes the chosen role once (UPDATE … WHERE role IS NULL). A password
-- signup is unchanged: the form sends the role in the user metadata and the trigger stores it.
-- profiles.role is already nullable and its CHECK passes NULL, so no column change is needed.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  _role := new.raw_user_meta_data->>'role';
  IF _role IS NULL OR _role NOT IN ('student', 'instructor') THEN
    _role := NULL;  -- chosen by the user on /select
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, _role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- The sanitizer still never lets an unknown role through; it just stops inventing one.
CREATE OR REPLACE FUNCTION public.profiles_role_sanitizer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.role is not null and not (new.role = any (array['instructor', 'student'])) then
      new.role := null;
    end if;
  end if;
  return new;
end;
$$;
