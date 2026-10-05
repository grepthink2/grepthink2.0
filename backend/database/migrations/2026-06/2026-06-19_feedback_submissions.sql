-- feedback_submissions: per-student, per-assignment GrepThink end-of-term feedback
--
-- Assignment must have assignment_type = 'feedback' and status = 'publish' before
-- students can submit. Backend enforces this in controller.submit_feedback.
-- The UNIQUE constraint enables upsert (students can edit before close_date).

CREATE TABLE feedback_submissions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       uuid NOT NULL REFERENCES assignments(id),
    student_id          uuid NOT NULL REFERENCES profiles(id),
    q1_liked            text NOT NULL,
    q2_frustrating      text NOT NULL,
    q3_missing_feature  text NOT NULL,
    q4_bugs             text NOT NULL,
    q5_suggestions      text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT feedback_submissions_unique UNIQUE (assignment_id, student_id)
);

CREATE INDEX idx_feedback_submissions_assignment ON feedback_submissions (assignment_id);
