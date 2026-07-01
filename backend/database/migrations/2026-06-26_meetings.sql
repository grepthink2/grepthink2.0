-- Generic meetings model — the foundation for the TA-meeting schedule today and
-- an ad-hoc / calendar system later.
--
-- A `meetings` row is a scheduled meeting for a team: either a WEEKLY recurring
-- slot (day_of_week + start_time, recurs every term week) or a ONE-OFF / ad-hoc
-- meeting (scheduled_at). A team can have several weekly meetings at distinct
-- times (e.g. summer CSE115A: Meeting 1 Tue 09:00, Meeting 2 Thu 09:30).
-- Replaces the single projects.meeting_day/meeting_time slot.
--
-- Attendance now references the meeting it was taken for (meeting_id), instead
-- of the old (project, week, meeting_in_week) tuple. No real meeting/attendance
-- data exists yet, so the cutover is clean.
--
-- RLS deliberately off (controllers enforce permissions).

CREATE TABLE IF NOT EXISTS meetings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id         uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,  -- team; NULL reserved for class-wide
    title            text,
    cadence          text NOT NULL DEFAULT 'weekly',                  -- 'weekly' | 'once'
    day_of_week      text,                                            -- weekly: lowercase weekday
    start_time       time,                                            -- weekly: wall-clock time
    scheduled_at     timestamptz,                                     -- once: absolute start
    duration_minutes int  NOT NULL DEFAULT 30,
    sequence         int  NOT NULL DEFAULT 1,                         -- order of a team's weekly meets (1,2,…)
    location         text,
    zoom_url         text,
    created_by       uuid REFERENCES profiles(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT meetings_cadence_valid CHECK (cadence IN ('weekly','once')),
    CONSTRAINT meetings_seq_positive  CHECK (sequence >= 1),
    CONSTRAINT meetings_day_valid CHECK (
        day_of_week IS NULL OR lower(day_of_week) IN
        ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
    ),
    -- A weekly meeting may exist as an unscheduled slot (day/time filled in
    -- later); a one-off needs a concrete start.
    CONSTRAINT meetings_shape CHECK (
        cadence = 'weekly' OR (cadence = 'once' AND scheduled_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS meetings_class_idx   ON meetings (class_id);
CREATE INDEX IF NOT EXISTS meetings_project_idx ON meetings (project_id);
-- One weekly slot per (team, sequence). Ad-hoc ('once') rows are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS meetings_project_seq_uniq
    ON meetings (project_id, sequence) WHERE cadence = 'weekly';

-- ── Attendance: repoint to a meeting ────────────────────────────────────────
-- Clear any stale per-week attendance (no production meeting data exists yet),
-- then move the natural key from (project,user,week,meeting_in_week) to
-- (meeting,user,week). project_id is kept denormalized for convenient filtering.
DELETE FROM attendance;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_unique_slot;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_meeting_in_week_positive;
ALTER TABLE attendance DROP COLUMN IF EXISTS meeting_in_week;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_meeting_slot_uniq
    ON attendance (meeting_id, user_id, week_number);
CREATE INDEX IF NOT EXISTS attendance_meeting_idx ON attendance (meeting_id, week_number);
