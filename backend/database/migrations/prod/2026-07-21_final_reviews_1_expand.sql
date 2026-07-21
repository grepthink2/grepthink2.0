-- ═══════════════════════════════════════════════════════════════════════════
-- PROD STAGING 1/3 — Final Reviews EXPAND phase          (safe to run anytime)
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)   ⚠ NOT YET APPLIED
-- ═══════════════════════════════════════════════════════════════════════════
-- Combined expand phase of:
--   * 2026-07-05_review_tas_and_unify_tsr.sql  (review model — WHO reviews)
--   * 2026-07-21_final_review_schedule.sql     (schedule — WHEN/WHERE)
-- Purely additive and idempotent; the deployed backend ignores the new
-- columns/table until feat/final-reviews ships. The DROP of
-- project_ta_assignments is NOT here — see 2/3 (contract).
--
-- Run order:  1) this file   2) deploy the feat/final-reviews backend
--             3) 3/3 seed    4) 2/3 contract (only once old code is drained)

-- Per-class end-of-quarter review window (gates TA self-appointment).
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS review_period_open boolean NOT NULL DEFAULT false;

-- The ONE shared Zoom room every final review in a class happens in.
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS review_zoom_url text;

-- Each team's single final-review slot (no attendance is taken for these,
-- hence a scalar column rather than a cadence='once' meetings row).
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS final_review_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_final_review_at
    ON public.projects (class_id, final_review_at);

-- The team's ADDITIONAL (2nd) end-of-quarter reviewer. Reviewer #1 is always
-- the Home TA (projects.assigned_ta_id) and is NOT stored here.
-- UNIQUE(project_id) caps it at one additional reviewer per team and makes
-- concurrent self-appointment race-safe.
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
