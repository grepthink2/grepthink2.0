-- ═══════════════════════════════════════════════════════════════════════════
-- PROD STAGING — Final-review scoring EXPAND      ⚠ NOT YET APPLIED TO PROD
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi). Additive + idempotent;
-- safe to run before or after the feat/final-review-scoring deploy.
-- ═══════════════════════════════════════════════════════════════════════════
-- Final-review scoring + the Review-TA notes form (digitizes the staff score
-- sheet and the per-team review-notes Google Doc).
--
--   * final_review_scores — one row per (project, student, scorer-role).
--     role='home' carries the Home TA's three category scores
--     (product/team/scrum); role='review'/'instructor' carry a single
--     overall. All scores 1.0–5.0 at 0.1 granularity (numeric(2,1)), plus an
--     optional per-student note. The score sheet is per-STUDENT (teams often
--     share one value, but per-student variance is real — see 2025F sheet).
--   * final_review_notes — one structured jsonb document per team (the
--     Review TA's worksheet: scope/demo/code/testing/contributions/scrum
--     docs/release docs/discussion/comments). Field keys live in the
--     frontend template (template_version tracks its evolution).
--
-- Purely additive (expand). RLS on, no policies: service-role backend only.

CREATE TABLE IF NOT EXISTS public.final_review_scores (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id    uuid NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
    project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role        text NOT NULL,
    product     numeric(2,1),
    team        numeric(2,1),
    scrum       numeric(2,1),
    overall     numeric(2,1),
    notes       text,
    scored_by   uuid REFERENCES public.profiles(id),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT final_review_scores_uniq UNIQUE (project_id, student_id, role),
    CONSTRAINT final_review_scores_role_valid CHECK (role IN ('home', 'review', 'instructor')),
    CONSTRAINT final_review_scores_bounds CHECK (
        (product IS NULL OR (product BETWEEN 1.0 AND 5.0)) AND
        (team    IS NULL OR (team    BETWEEN 1.0 AND 5.0)) AND
        (scrum   IS NULL OR (scrum   BETWEEN 1.0 AND 5.0)) AND
        (overall IS NULL OR (overall BETWEEN 1.0 AND 5.0))
    ),
    -- Home rows carry the three categories; review/instructor rows carry overall.
    CONSTRAINT final_review_scores_shape CHECK (
        (role = 'home'  AND overall IS NULL
             AND product IS NOT NULL AND team IS NOT NULL AND scrum IS NOT NULL)
        OR
        (role <> 'home' AND overall IS NOT NULL
             AND product IS NULL AND team IS NULL AND scrum IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_final_review_scores_project ON public.final_review_scores (project_id);
CREATE INDEX IF NOT EXISTS idx_final_review_scores_class   ON public.final_review_scores (class_id);
CREATE INDEX IF NOT EXISTS idx_final_review_scores_student ON public.final_review_scores (student_id);
ALTER TABLE public.final_review_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.final_review_notes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id         uuid NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
    project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    content          jsonb NOT NULL DEFAULT '{}'::jsonb,
    template_version int   NOT NULL DEFAULT 1,
    updated_by       uuid REFERENCES public.profiles(id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT final_review_notes_project_unique UNIQUE (project_id)
);
CREATE INDEX IF NOT EXISTS idx_final_review_notes_class ON public.final_review_notes (class_id);
ALTER TABLE public.final_review_notes ENABLE ROW LEVEL SECURITY;
