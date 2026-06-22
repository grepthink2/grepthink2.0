-- TA Management feature — per-class TA designation, assigned project TA,
-- project meeting/Zoom metadata, and per-week attendance.
-- Spec: docs/superpowers/specs/2026-06-20-ta-management-design.md
--
-- RLS deliberately NOT enabled (matches 2026-04-23_messages.sql) — controllers
-- enforce all permissions. Adding RLS is a tracked follow-up (CODE_REVIEW.md #4).

-- 1) Per-class TA designation (junction). A row means user_id is a TA for class_id.
--    TA-ness is additive to being an enrolled student; it is NOT a profiles.role,
--    and a TA need not be a member of any project.
CREATE TABLE class_tas (
    class_id    uuid NOT NULL REFERENCES classes(id),
    user_id     uuid NOT NULL REFERENCES profiles(id),
    created_by  uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, user_id)
);

CREATE INDEX class_tas_user_idx  ON class_tas (user_id);
CREATE INDEX class_tas_class_idx ON class_tas (class_id);

-- 2) Project meeting / Zoom metadata + assigned TA.
--    meeting_time is a human display string ("2:00–2:30 PM"); meeting_day is a
--    lowercase weekday used for ordering the weekly schedule.
ALTER TABLE projects
    ADD COLUMN assigned_ta_id uuid REFERENCES profiles(id),
    ADD COLUMN zoom_url       text,
    ADD COLUMN meeting_day    text,
    ADD COLUMN meeting_time   text;

ALTER TABLE projects
    ADD CONSTRAINT projects_meeting_day_valid
    CHECK (
        meeting_day IS NULL OR lower(meeting_day) IN
        ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
    );

CREATE INDEX projects_assigned_ta_idx ON projects (assigned_ta_id);

-- 3) Attendance, keyed by (project, user, term week number 1..N).
--    project_id is part of the UNIQUE key, so a person in multiple projects
--    gets independent attendance rows per project for the same week.
CREATE TABLE attendance (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects(id),
    user_id      uuid NOT NULL REFERENCES profiles(id),
    week_number  int  NOT NULL,
    status       text NOT NULL,
    marked_by    uuid REFERENCES profiles(id),
    marked_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_week_positive CHECK (week_number >= 1),
    CONSTRAINT attendance_status_valid  CHECK (status IN ('present','late','absent')),
    CONSTRAINT attendance_unique_slot   UNIQUE (project_id, user_id, week_number)
);

CREATE INDEX attendance_project_week_idx ON attendance (project_id, week_number);
CREATE INDEX attendance_user_idx         ON attendance (user_id);
