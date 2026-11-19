-- 2026-11-18 — class_enrollments.can_extend_deadlines: a TA the instructor lets open late windows
--
-- A late window is an assignment's class-wide accept_until, the time until which submissions are
-- still accepted after its deadline. The class instructor sets it from Modules. With this flag on
-- their enrollment, a TA of the class may set, move or remove it too, on the class's TSR
-- assignments (PUT /api/assignments/{assignment_id}/late-window). The instructor turns it on and off
-- per TA from TA Management (PATCH /api/tas/classes/{class_id}/tas/{ta_user_id}). It is off for
-- every TA, those enrolled before this migration included, until the instructor turns it on.
--
-- The permission belongs to the TA role, so class_enrollments_extend_requires_ta refuses it on any
-- row whose enrollment_role is not 'ta'. Demoting a TA writes enrollment_role = 'student' and
-- can_extend_deadlines = false in one update, so the CHECK never trips there; promoting leaves the
-- flag false. No grant: the browser never reads this column (the backend does, with the service
-- role).
--
-- EXPAND, idempotent: a re-run skips the column, then drops the CHECK and adds it again by name.
-- Adding a column with a constant default rewrites no row, and every row passes the CHECK. Apply
-- on a database BEFORE the code that uses the column runs against it: without the column, the
-- TA list in TA Management (GET /api/tas/classes/{class_id}), TA Review's
-- GET /api/tas/classes/{class_id}/review-targets, demoting a TA, and both new routes fail. The
-- code before it never reads the column, so applying this early is safe.
--
-- Applied: DEV — 2026-11-18   PROD — pending

ALTER TABLE public.class_enrollments
  ADD COLUMN IF NOT EXISTS can_extend_deadlines boolean NOT NULL DEFAULT false;
ALTER TABLE public.class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_extend_requires_ta;
ALTER TABLE public.class_enrollments
  ADD CONSTRAINT class_enrollments_extend_requires_ta
  CHECK (enrollment_role = 'ta' OR NOT can_extend_deadlines);
