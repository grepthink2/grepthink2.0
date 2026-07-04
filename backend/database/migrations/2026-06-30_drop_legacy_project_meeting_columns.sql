-- Cleanup: drop the legacy per-project meeting slot columns.
--
-- projects.zoom_url / meeting_day / meeting_time held the single meeting slot in
-- the OLD attendance model. They are fully superseded by the generic `meetings`
-- table (2026-06-26_meetings.sql), where each team's day/time/zoom now live (and
-- a team can have several weekly slots). On PROD/DEV these columns are all NULL.
--
-- ORDERING (expand/contract): apply this ONLY AFTER deploying the backend that
-- stops selecting these columns (same commit removed them from
-- attendance.controller._load_project). Until that code is live, dropping the
-- columns makes the old `.select(... zoom_url, meeting_day, meeting_time ...)`
-- return a PostgREST "column does not exist" 400 and breaks attendance/meeting
-- editing. They were a dead select (never read), so the code change is behavior-
-- preserving; this drop is purely mechanical once it is deployed.
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS zoom_url,
  DROP COLUMN IF EXISTS meeting_day,
  DROP COLUMN IF EXISTS meeting_time;
