-- Unify the operational TA role, and add the end-of-quarter reviewer model.
--
-- Two coupled changes:
--   1) Meetings, attendance, AND TSR review now all key off the SINGLE
--      projects.assigned_ta_id (the "assigned TA" runs the weekly meeting, takes
--      attendance, and reviews the team's TSRs). The project_ta_assignments
--      junction that used to gate TSR review is superseded and dropped. This
--      also removes the split that let a mentor TA see meetings but no TSR-review
--      teams (or vice versa).
--   2) NEW end-of-quarter "review" activity: each team is reviewed by 2 TAs =
--      the team's assigned TA (implicit reviewer #1, from assigned_ta_id) PLUS
--      one ADDITIONAL reviewer, stored in the new project_review_tas table. The
--      additional reviewer is self-appointed by a TA (only while the class's
--      review window is open) or set by the instructor (override, any time);
--      once appointed, only that TA (or the instructor) can release the slot.
--
-- RLS deliberately off (controllers enforce all authz via the service-role
-- client), matching the rest of the schema (see 2026-06-20_ta_management.sql).
--
-- ORDERING (expand/contract): apply this ONLY AFTER deploying the backend that
-- stops reading/writing project_ta_assignments (the TSR-review path now reads
-- projects.assigned_ta_id). Until that code is live, dropping the junction makes
-- the old .table('project_ta_assignments') selects return a PostgREST 400.
-- Same pattern as 2026-06-30_drop_legacy_project_meeting_columns.sql.

-- 1) Per-class end-of-quarter review window (instructor toggles open/closed).
--    Self-appointment of the additional reviewer is gated on this being true.
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS review_period_open boolean NOT NULL DEFAULT false;

-- 2) The team's ADDITIONAL (2nd) end-of-quarter reviewer. Reviewer #1 is always
--    the assigned TA (projects.assigned_ta_id) and is NOT stored here.
--    UNIQUE(project_id) caps it at one additional reviewer per team and makes
--    concurrent self-appointment race-safe (the loser hits the unique violation;
--    the controller re-reads and returns 409).
CREATE TABLE IF NOT EXISTS public.project_review_tas (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id    uuid NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
    project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES public.profiles(id),  -- self-appoint: = user_id; instructor override: instructor id
    claimed_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_review_tas_project_unique UNIQUE (project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_review_tas_project ON public.project_review_tas (project_id);
CREATE INDEX IF NOT EXISTS idx_project_review_tas_user    ON public.project_review_tas (user_id);
CREATE INDEX IF NOT EXISTS idx_project_review_tas_class   ON public.project_review_tas (class_id);
-- RLS on, no policies: service-role backend only (repo convention).
ALTER TABLE public.project_review_tas ENABLE ROW LEVEL SECURITY;

-- 3) Drop the superseded TSR-review junction. Safe once the rewired backend is
--    live (no readers/writers remain). Its FKs are outbound only (nothing points
--    at it), so no CASCADE is needed.
DROP TABLE IF EXISTS public.project_ta_assignments;
