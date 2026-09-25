-- 2026-09-25 — let Scott create classes (PROD only)
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD.
--
-- ⚠️  ORDER: run only AFTER the per-class-roles release is live on PROD (beta → main deployed).
--     On the code PROD runs before that release, an instructor account sees only the classes it
--     created, so Scott's UCSC TA classes would disappear from their class list.
--     And only AFTER ../2026-09-25_institutions.sql and ../2026-09-25_seed_istinye.sql are
--     applied on PROD: a class Scott creates before them cannot be given İstinye, and the
--     institutions backfill would label it UC Santa Cruz.
--
-- profiles.role now means only "may create classes". The classes Scott TAs keep working through
-- their class_enrollments rows. The backend caches roles, so this takes effect within 60 seconds
-- of running — Scott should reload the app after that to see Create Class.
--
-- Replace every <scott-login-email> in this file (twice below, plus the check) with the email of
-- Scott's GrepThink account, then run the whole file. It changes at most one row and rolls back
-- otherwise.
--
-- Applied: PROD ____-__-__

BEGIN;

UPDATE public.profiles
   SET role = 'instructor'
 WHERE lower(email) = lower('<scott-login-email>')
   AND role = 'student';

-- If this raises, the transaction rolls back and nothing was changed — but in the SQL editor
-- the read-only check query below does not run either, so the counts are in the message itself.
DO $$
DECLARE
  instructor_count int;
  total_count int;
BEGIN
  SELECT count(*) FILTER (WHERE role = 'instructor'), count(*)
    INTO instructor_count, total_count
    FROM public.profiles
   WHERE lower(email) = lower('<scott-login-email>');

  IF instructor_count <> 1 THEN
    RAISE EXCEPTION
      'expected exactly one instructor profile for that email; found % instructor profile(s) '
      'among % profile(s) with that email; nothing was changed',
      instructor_count, total_count;
  END IF;
END $$;

COMMIT;

-- Check: Scott is an instructor and still holds their UCSC enrollments (enrollment_role = 'ta').
SELECT p.email, p.role, c.name AS class, e.enrollment_role
  FROM public.profiles p
  LEFT JOIN public.class_enrollments e ON e.user_id = p.id
  LEFT JOIN public.classes c ON c.id = e.class_id
 WHERE lower(p.email) = lower('<scott-login-email>');
