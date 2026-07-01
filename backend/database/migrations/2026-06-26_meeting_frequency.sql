-- TA meeting cadence + per-meeting attendance.
--
-- Adds a class-level meeting frequency (meetings_per_week) and per-meeting
-- duration (instructor-settable), and tracks attendance per meeting within a
-- week instead of once per week. Existing attendance rows become "meeting 1",
-- so this is backward-compatible.
--
-- RLS deliberately off (controllers enforce permissions).

-- 1) Class-level cadence. Default = the existing behaviour (1 meeting/week,
--    45 min). CSE115A Summer runs twice a week at 30 min (see backfill below).
ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS meetings_per_week        int NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS meeting_duration_minutes int NOT NULL DEFAULT 45;

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_meetings_per_week_valid;
ALTER TABLE classes
    ADD CONSTRAINT classes_meetings_per_week_valid CHECK (meetings_per_week BETWEEN 1 AND 7);

-- 2) Attendance is now one row per (team, person, week, meeting-in-week).
ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS meeting_in_week int NOT NULL DEFAULT 1;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_meeting_in_week_positive;
ALTER TABLE attendance
    ADD CONSTRAINT attendance_meeting_in_week_positive CHECK (meeting_in_week >= 1);

-- Widen the natural key from (project,user,week) to include the meeting index.
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_unique_slot;
ALTER TABLE attendance
    ADD CONSTRAINT attendance_unique_slot UNIQUE (project_id, user_id, week_number, meeting_in_week);

CREATE INDEX IF NOT EXISTS attendance_project_week_meeting_idx
    ON attendance (project_id, week_number, meeting_in_week);

-- 3) Backfill: Summer CSE115A meets twice a week, 30 min each (60/wk total).
--    Everyone else keeps the 1x/45 default. Instructors can change this later.
UPDATE classes
   SET meetings_per_week = 2, meeting_duration_minutes = 30
 WHERE lower(coalesce(term, '')) = 'summer'
   AND name ILIKE '%115a%';
