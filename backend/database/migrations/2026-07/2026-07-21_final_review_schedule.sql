-- Final Reviews schedule: WHEN/WHERE on top of the review model
-- (2026-07-05_review_tas_and_unify_tsr.sql stores WHO reviews each team).
--
--   * classes.review_zoom_url — the ONE shared Zoom room every final review in
--     the class happens in (a default room, instructor-set).
--   * projects.final_review_at — the team's single end-of-quarter review slot.
--     Deliberately a scalar column, NOT a cadence='once' `meetings` row: final
--     reviews take no attendance (attendance FKs onto meetings), the Zoom room
--     is class-level rather than per-meeting, and `meetings` has no purpose
--     discriminator, so a one-off row would bleed into the weekly TA-schedule
--     queries.
--
-- Purely additive (expand phase) — safe to apply before or after the backend
-- that reads it is deployed. RLS stays as-is (service-role controllers enforce
-- all authz).

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS review_zoom_url text;

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS final_review_at timestamptz;

-- The schedule read orders by slot time within a class.
CREATE INDEX IF NOT EXISTS idx_projects_final_review_at
    ON public.projects (class_id, final_review_at);
