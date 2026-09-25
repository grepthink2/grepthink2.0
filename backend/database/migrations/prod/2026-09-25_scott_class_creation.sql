-- 2026-09-25 — let Scott create classes (PROD only)
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD.
--
-- ⚠️  ORDER: run only AFTER the per-class-roles release is live on PROD (beta → main deployed).
--     On the code PROD runs before that release, an instructor account sees only the classes it
--     created, so Scott's UCSC TA classes would disappear from their class list.
--
-- profiles.role now means only "may create classes". The classes Scott TAs keep working through
-- their class_enrollments rows. The backend caches roles, so this takes effect within 60 seconds.
--
-- Replace <scott-login-email> (twice below, plus the check) with the email of Scott's GrepThink
-- account, then run the whole file. It changes at most one row and rolls back otherwise.
--
-- Applied: PROD ____-__-__

BEGIN;

UPDATE public.profiles
   SET role = 'instructor'
 WHERE lower(email) = lower('<scott-login-email>')
   AND role = 'student';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles
       WHERE lower(email) = lower('<scott-login-email>') AND role = 'instructor') <> 1 THEN
    RAISE EXCEPTION 'expected exactly one instructor profile for that email; nothing was changed';
  END IF;
END $$;

COMMIT;

-- Check: Scott is an instructor and still holds their UCSC enrollments (enrollment_role = 'ta').
SELECT p.email, p.role, c.name AS class, e.enrollment_role
  FROM public.profiles p
  LEFT JOIN public.class_enrollments e ON e.user_id = p.id
  LEFT JOIN public.classes c ON c.id = e.class_id
 WHERE lower(p.email) = lower('<scott-login-email>');
