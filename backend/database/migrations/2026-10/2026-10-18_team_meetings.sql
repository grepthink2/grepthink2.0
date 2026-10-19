-- 2026-10-18 — meetings: a second kind of row, the team meeting
--
-- A team's Product Owner records one-off meetings (sprint planning, a demo rehearsal) that show up on
-- the team's and the class's calendars. They are `meetings` rows next to the weekly TA-meeting slots,
-- told apart by `kind`. Attendance for one is `attendance` rows with its `meeting_id`, the team's
-- `project_id` and `week_number` = the term week the meeting falls in; `attendance` does not change.
--
-- EXPAND, idempotent, one transaction. ⚠️  Apply on a database BEFORE the code that reads or writes the
-- new columns runs against it: on PROD, before beta is merged into main. The code before it never names
-- them (a TA slot takes kind = 'ta_meeting' from the DEFAULT) and every `meetings` read in
-- app/attendance filters `cadence = 'weekly'`, so applying this early is safe.
--
-- Applied: DEV — pending   PROD — pending
--
--   * kind: 'ta_meeting' (every row that exists today) | 'team_meeting'.
--   * note: free text, at most 500 characters.
--   * meetings_team_meeting_shape: a team meeting is a one-off (cadence = 'once'; meetings_shape already
--     requires a scheduled_at for those) of a team (project_id set), with a title of 1–80 characters and
--     a length in 15-minute steps from 15 to 240 minutes. The API offers a shorter list of lengths; this
--     is the outer fence. `title IS NOT NULL` is spelled out because a CHECK passes on NULL: without it a
--     team meeting with no title at all would satisfy the BETWEEN.
--   * Length caps, for every kind: note 500, location 120, zoom_url 500. The API holds team meetings to
--     them; the caps keep a direct write honest. Nothing writes `location` yet, and the TA Zoom link
--     (PATCH /api/projects/{project_id}/meeting) had no cap before this file.
--   * created_by: ON DELETE SET NULL. It had no delete rule, so removing the account of anyone who had
--     created a meeting (a TA who opened a weekly slot, a Product Owner) was refused by the database.
--     The meeting stays; only its author is forgotten.
--   * meetings_project_once_idx: a team's one-off meetings in time order (the team's calendar, the
--     class's calendar). A query uses it only when it says `cadence = 'once'` (`kind = 'team_meeting'`
--     alone does not imply that). The weekly slots keep meetings_project_seq_uniq.
--
-- PREFLIGHT (expect 0 on every database; a longer value makes ADD CONSTRAINT fail and the file roll
-- back as a whole):
--
--   SELECT count(*) FROM public.meetings WHERE char_length(location) > 120 OR char_length(zoom_url) > 500;

BEGIN;

-- Fail fast if a lock is contended rather than queue live traffic behind the ALTERs. (Adding the
-- foreign key below also takes a short SHARE ROW EXCLUSIVE lock on profiles.)
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ta_meeting';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_kind_valid;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_kind_valid
  CHECK (kind IN ('ta_meeting', 'team_meeting'));

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_team_meeting_shape;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_team_meeting_shape CHECK (
  kind <> 'team_meeting'
  OR (cadence = 'once'
      AND project_id IS NOT NULL
      AND title IS NOT NULL AND char_length(btrim(title)) BETWEEN 1 AND 80
      AND duration_minutes % 15 = 0
      AND duration_minutes BETWEEN 15 AND 240)
);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_note_length;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_note_length
  CHECK (note IS NULL OR char_length(note) <= 500);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_location_length;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_location_length
  CHECK (location IS NULL OR char_length(location) <= 120);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_zoom_url_length;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_zoom_url_length
  CHECK (zoom_url IS NULL OR char_length(zoom_url) <= 500);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_created_by_fkey;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meetings_project_once_idx
  ON public.meetings (project_id, scheduled_at) WHERE cadence = 'once';

COMMIT;

-- Check. Expected right after applying:
--   1. thirteen constraints: meetings_cadence_valid, meetings_class_id_fkey, meetings_created_by_fkey,
--      meetings_day_valid, meetings_kind_valid, meetings_location_length, meetings_note_length,
--      meetings_pkey, meetings_project_id_fkey, meetings_seq_positive, meetings_shape,
--      meetings_team_meeting_shape, meetings_zoom_url_length;
--   2. the foreign key reads: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
--   3. kind: text, NOT NULL, default 'ta_meeting'::text; note: text, nullable;
--   4. one index, a partial one on (project_id, scheduled_at) WHERE cadence = 'once';
--   5. no team_meeting row yet; every existing row is a ta_meeting.
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint WHERE conrelid = 'public.meetings'::regclass ORDER BY conname;
SELECT pg_get_constraintdef(oid) AS created_by_fkey
  FROM pg_constraint WHERE conrelid = 'public.meetings'::regclass AND conname = 'meetings_created_by_fkey';
SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name IN ('kind', 'note')
 ORDER BY column_name;
SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'meetings_project_once_idx';
SELECT kind, cadence, count(*) AS rows FROM public.meetings GROUP BY 1, 2 ORDER BY 1, 2;
