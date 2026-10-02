-- Unify class-TA designation onto class_enrollments.enrollment_role.
--
-- The attendance module (PR #133) originally stored class TAs in a separate
-- `class_tas` table, parallel to the tas module's class_enrollments.enrollment_role.
-- That split meant a TA designated via "TA Meetings" was invisible to "TA Review"
-- (and vice versa). The attendance controller now reads/writes enrollment_role
-- (the single source of truth), so `class_tas` is no longer used.
--
-- KEPT (intentionally): projects.assigned_ta_id is the per-project "meeting TA"
-- (runs the weekly meeting + takes attendance) — a distinct role from
-- project_ta_assignments (the TSR "review TA"). Both now draw from the one
-- class-TA pool (enrollment_role). This migration does NOT touch either.
--
-- Idempotent + safe: the backfill is a no-op when class_tas is empty, and the
-- DROP uses IF EXISTS. (Verified empty in dev + prod before applying.)

-- 1) Backfill: promote any user who was a class_tas TA to enrollment_role='ta'
--    on their existing enrollment.
UPDATE public.class_enrollments AS ce
SET enrollment_role = 'ta'
FROM public.class_tas AS ct
WHERE ce.class_id = ct.class_id
  AND ce.user_id = ct.user_id
  AND ce.enrollment_role IS DISTINCT FROM 'ta';

-- 2) Drop the now-unused table (its indexes, FKs, and policies drop with it).
DROP TABLE IF EXISTS public.class_tas;
