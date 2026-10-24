# Schedule sources and the calendar feed — design (2026-10-18)

Status: approved by the maintainer on 2026-10-18, with the changes recorded below. Design handoffs this
builds on (already in `design/`): `design_handoff_schedule/` (Schedule layer, kind palette, time-zone
rule, data contract) and `design_handoff_team_meetings/` (Edit Project → Meetings tab, project-page
card). The final-review sign-up screens are being designed in Claude Design; their handoff will land
later as `design_handoff_final_review_signup/`.

## Intent

Students live in their own calendars (Google, Apple, Outlook), not in GrepThink. The goal is that a
student who adds one private GrepThink link sees, in the calendar they already use, every meeting
GrepThink knows about for their team: the weekly TA meeting, the meetings their team schedules for
itself, and their final review. TAs get the meetings they run and the reviews they sit on; instructors
get every final review.

Getting there needs four pieces of data that GrepThink either gets wrong today or doesn't have:

1. **When a class ends.** Nothing stores it. The code guesses the term length from the term name
   (10 weeks, or 6 for anything that isn't Fall/Winter/Spring), so a weekly TA meeting has no honest
   last date. UCSC's summer sessions are actually 5, 5, 8 or 10 weeks.
2. **Team meetings.** Teams can't record their own one-off meetings at all.
3. **Final review times that teams choose.** Today the instructor types each team's time; the
   instructor's real process is to post a list of times and let each team sign up.
4. **The feed itself.**

## Goals

- A class has a real last day of classes, and TA-meeting weeks come from it.
- A team's Product Owner can add, edit and delete the team's one-off meetings; every member sees them;
  the data model can record attendance for them.
- The instructor posts 1-hour final-review slots; each team's Product Owner books one; teams can move
  to a free slot; TAs sign up to review a team once it has a slot.
- One private calendar link per person that covers all their active classes, safe to reset or turn off.

## Non-goals (this round)

- The Today's Schedule card and the `/app/schedule` agenda (the Schedule handoff). The data built here
  feeds them later through a `GET /api/schedule` endpoint that is not part of this design.
- Screens and permissions for marking attendance at team meetings (the data model supports it; who
  marks it and where is a follow-up with its own design pass).
- Lectures and office hours (no data model yet), holiday skipping for weekly meetings, assignment
  deadlines or sprints in the feed, notifications of any kind, recurring team meetings.
- Reading a person's Google Calendar (no Google OAuth).

## Anti-goals

- A feed that shows something the person can't see in GrepThink, or anything from a team or class they
  don't belong to. The feed URL is unauthenticated, so its authorization is the whole security model.
- Breaking existing attendance history: weeks that already have attendance must keep their numbers.
- Two sources of truth for a team's final-review time.

## Decisions made with the maintainer

- End dates: a real end date per class (not a week count). Backfill PROD for the two current classes.
- Weekly TA meetings: 1 or 2 per week is enough (2 was the summer CSE115A norm).
- Final reviews last 1 hour.
- Team meetings live in project settings; only the Product Owner can change them; empty by default.
  They reuse the existing `meetings` table, and their attendance fits the existing `attendance` table.
- Final reviews: the instructor posts slots and each team signs up. Only the Product Owner books. A team
  can move to another slot only if that slot is free (its old slot is released), like the review-TA
  sign-up. No "your review is booked" notification.
- **One sign-up switch** for the class. TAs can sign up to review a team only after the team has a slot.
  When a team releases or moves its slot, its Review TA is dropped.
- The instructor's per-team time field is removed right away; nobody reviews for about six weeks.
- Everyone in the class sees which slots are booked and by which team.
- The feed: students get TA meetings, team meetings and their final review; TAs get the TA meetings
  they run and the final reviews they sit on; instructors get **final reviews only**.
- Once a team has a slot, its members see the time, both reviewers' names and the shared Zoom link, in
  the app and in their calendar.
- The whole Settings view gets a Claude Design pass later; the calendar section follows the existing
  Settings layout until then.

## Calls approved by the maintainer

1. Create Class asks for "Last day of classes" as a required field with no suggested date.
2. TA Meetings computes "today" in the school's time zone (fixed inside the end-date work); the scrum
   board's hard-coded Pacific day boundary is a follow-up.
3. Strict Product Owner rule: teams the instructor created can't add meetings or book a slot until
   someone is made Product Owner.
4. The instructor can place, move or release any team at any time.
5. The calendar link can be copied again later and Reset replaces it; a copy of the database alone
   can't produce working links.
6. Each TA meeting is its own calendar event, from the week its time was first set through the class
   end date.

---

## Piece A — Class end dates

### Data
- `classes.end_date date NULL`, CHECK `end_date IS NULL OR start_date IS NULL OR end_date >= start_date`.
- Meaning: the **last day of classes** (before finals). Finals don't extend TA meetings; final reviews
  are explicit times and are not bounded by it.

### Behavior
- **Term weeks** (attendance module): when `end_date` is set,
  `total_weeks = ((end_date - start_date).days // 7) + 1` — the same 7-day blocks from `start_date`
  that `_current_term_week` already uses. When it is NULL, the legacy term-name rule stays (10, or 6).
  `_current_term_week` and attendance validation read this one helper.
- "Today" for the class is computed in the **school's** zone (`institutions.timezone` through
  `app/institutions/controller.py` `institution_timezone()`), replacing the hard-coded Pacific
  `_CLASS_TZ` in `app/attendance/controller.py` (the "current meeting" pick too).
- Clean-ups in the same module: the attendance module imports the classes module's private term
  constants (`_FULL_TERM_NAMES`, `_FULL_TSR_COUNT`, `_SUMMER_TSR_COUNT`); move the term rules to one
  small shared helper. Delete the unused `_term_max_weeks()` (only tests call it; it returns the TSR
  count under a "weeks" name) and its tests.
- TSR auto-generation keeps its term-based count (5 or 3, overridable) — out of scope.

### API and UI
- `CreateClassRequest` gains optional `end_date` (older clients keep working). The Create Class form
  asks for "Last day of classes" as a required field with the hint "Before finals week".
- `PATCH /api/classes/{class_id}/end-date` (class instructor only), following the existing
  `/external-tasks-url` pattern; Class Settings gets the field.
- `GET /api/classes` and the class detail include `end_date` (add it to `_ENROLLED_CLASS_COLUMNS`: it is
  not a setting students must not see).
- TA Meetings' meetings-per-week picker offers 1 and 2 (a class already set higher keeps showing its
  value). The backend keeps accepting 1–7.

### Rollout
- `backend/database/migrations/2026-10/2026-10-18_class_end_dates.sql` (EXPAND, idempotent). DEV: apply.
- `backend/database/migrations/prod/2026-10/2026-10-18_class_end_dates_backfill.sql` (staged for the
  maintainer), matched by id **and** name like the 10-16 links script:
  - `2026F CSE115A` (`f93ee370-cc13-4389-bfa1-0dbcc02daaf7`, UCSC) → `2026-12-04`
    (UCSC Fall 2026: instruction Sept 24 – Dec 4, finals Dec 7–11).
  - `JOB-191` (`15dcce4c-0daa-4195-bef2-966ec78c1222`, İstinye) → `2026-12-18`
    (İstinye Fall 2026–27 undergraduate: classes Sept 21 – Dec 18, finals Dec 19–29).
  - `2026Su cse115a` stays NULL: an end date could change its week count and hide recorded week-6
    attendance.
  - The script's check query prints each class's `start_date`, `end_date` and the resulting week
    count, so the maintainer sees the effect before committing (a Thursday Sept 24 start gives 11
    blocks — today the 10-week cap files a Thursday team's 11th meeting under week 10).
- `supabase/schema.sql` updated once applied.

---

## Piece B — Team meetings

Builds `design_handoff_team_meetings/` as specified (Meetings tab for the Product Owner, the
project-page card, inline form, validation copy, states, time-zone rule).

### Data — the existing `meetings` table
Team meetings are `meetings` rows with `kind = 'team_meeting'`, `cadence = 'once'`, `project_id` set,
`scheduled_at` = the start, `duration_minutes`, `title`, `location`, `zoom_url`, `created_by`. EXPAND
migration on `meetings`:
- `kind text NOT NULL DEFAULT 'ta_meeting'`, CHECK `kind IN ('ta_meeting', 'team_meeting')` (every
  existing row is a TA slot).
- `note text NULL`.
- CHECKs for team meetings: `cadence = 'once'`, `project_id` and `title` not null, title 1–80, duration
  in 15-minute steps from 15 to 240, note ≤ 500, location ≤ 120, zoom_url ≤ 500.
- `created_by` re-pointed to `ON DELETE SET NULL` (today it has no delete rule, which would block
  deleting a profile that created any meeting — TA slots included).
- An index on `(project_id, scheduled_at) WHERE cadence = 'once'`.

Why this is safe: only `app/attendance/controller.py` reads `meetings`, and every read filters
`cadence = 'weekly'`; nothing in SQL (functions, analytics) reads it. TA code paths never see team rows.

### Attendance for team meetings (data model only)
A team meeting's attendance is `attendance` rows with its `meeting_id`, the team's `project_id`, and
`week_number` = the class term week the meeting falls in (clamped to 1..total weeks). The existing
unique key `(meeting_id, user_id, week_number)` and the PostgREST upsert keep working with no change
to `attendance`. Reads for a team meeting go by `meeting_id`. Who marks it and the screens are a
follow-up (non-goal above); this piece only documents the rule and tests that a team meeting row
doesn't disturb TA attendance.

### Authorization (Python, service role)
- Read: members of the project, the class instructor, and the team's assigned TA.
- Write (create, edit, delete): **only** members whose `project_members.role = 'product owner'`.
  Instructor-created teams have no Product Owner until one is assigned in Edit Project → Team; until
  then nobody can add meetings.
- Validation (server mirrors the handoff's copy rules): title required ≤ 80, start required, no past
  start on create (edits may keep a past start), duration in the allowed set, Zoom an http/https URL,
  note ≤ 500.

### Endpoints
`GET /api/projects/{project_id}/meetings`, `POST /api/projects/{project_id}/meetings`,
`PATCH /api/projects/{project_id}/meetings/{meeting_id}`,
`DELETE /api/projects/{project_id}/meetings/{meeting_id}` — every write also checks the row is a
`team_meeting` of that project. Plus `frontend/src/lib/api/projects.ts` methods and actions-catalog
entries.

### UI
- Port `TeamMeetingsList` / `TeamMeetingForm` / `TeamMeetingsModel` per the handoff.
- The card renders `ScheduleItem` (compact) and `ScheduleDayHeader`, so this piece also ports that
  subset of the Schedule layer (components, the `--gt-sched-*` tokens it reads, the model helpers it
  uses). The rest of the Schedule layer waits for the schedule endpoint.
- `EditProjectModal` gains the Meetings tab only for the Product Owner (Done-footer rule from the
  handoff's NOTES #2; the Esc `stopPropagation` rule from its open questions).

---

## Piece C — Final-review slot sign-up

The data and API now; the screens follow the Claude Design handoff (C2).

### Data
- `final_review_slots`: `id`, `class_id → classes on delete cascade`, `starts_at timestamptz not null`,
  `duration_minutes int not null default 60`, `project_id uuid null → projects on delete set null`,
  `booked_by uuid null → profiles on delete set null`, `booked_at timestamptz null`, `created_by`
  (`on delete set null`), `created_at`. UNIQUE `(class_id, starts_at)`; UNIQUE
  `(project_id) WHERE project_id IS NOT NULL` (a team holds at most one slot).
- **One switch:** the existing `classes.review_period_open` ("Sign-ups open") governs both team booking
  and TA reviewer sign-up. No new column.
- `projects.final_review_at` stays the one place a team's review time lives (the Final Reviews page,
  scoring and detail views already read it). Booking writes it; releasing clears it; nothing else writes
  it once the per-team time field is gone.

### Booking (atomic)
A SQL function `book_final_review_slot(p_slot uuid, p_project uuid, p_actor uuid)`, called over
`.rpc()`, in one transaction: claim the slot only if `project_id IS NULL` (row lock), release any
other slot the team holds, set `projects.final_review_at = starts_at`, delete the team's
`project_review_tas` row when this is a move, and return the outcome
(`booked` | `moved` | `slot_taken` | `not_found`). A matching `release_final_review_slot(p_project)`
frees the slot, clears `final_review_at` and deletes the team's `project_review_tas` row. Python
decides **who** may call them (the repo's rule: authorization is in Python); the functions only
guarantee no two teams share a slot, a team never holds two, and a moved or released team never keeps
a Review TA who signed up for the old time.

### Rules
- Product Owner of the team: book / move / release, only while sign-ups are open.
- Class instructor: create slots (a list of start times, 60 minutes each), delete a free slot, open or
  close sign-ups, assign or move any team to a free slot, release any booking — any time. A move or
  release by the instructor also drops the Review TA *(applied to every slot change, including a Review
  TA the instructor appointed — they can re-appoint)*.
- TAs: sign up to review a team (`set_review_ta`) only while sign-ups are open **and** the team holds a
  slot; release as today. They see the whole board.
- Everyone in the class (students included): sees every slot with the team that booked it. A member of a
  team that holds a slot also gets its time, both reviewers' names and the shared Zoom link.
- The shared Zoom room stays out of the general class read (`_ENROLLED_CLASS_COLUMNS` unchanged): a
  student gets it only through their own team's booking.
- **Removed now:** the instructor's per-team time field — `POST /api/tas/projects/{id}/review-time`, the
  date-time inputs on the Final Reviews page, the `setFinalReviewTime` client method, its catalog entry
  and tests. Until C2 ships, the page shows each team's booked time read-only. Existing
  `final_review_at` values (the finished summer class) are kept as history.

### Endpoints (under `/api/tas`, the module that owns final reviews)
`GET /classes/{id}/review-slots` (shape depends on the caller), `POST /classes/{id}/review-slots`
(bulk create), `DELETE /review-slots/{slot_id}`, `POST /review-slots/{slot_id}/book` (Product Owner for
their own team; instructor with `project_id`), `POST /projects/{project_id}/review-slot/release`. The
switch stays `POST /classes/{id}/review-window`. API client methods + catalog entries.

---

## Piece D — The calendar feed

### Link and token
- `calendar_feeds`: `user_id uuid pk → profiles on delete cascade`, `nonce text not null`,
  `created_at`, `last_fetched_at timestamptz null`. RLS on, no grants.
- Token `<user_id>.<signature>`, the signature being unpadded URL-safe base64 of
  HMAC-SHA256(key, `calendar-feed:v1:<user_id>:<nonce>`). Key: `CALENDAR_FEED_SECRET`, else derived
  from `SUPABASE_JWT_SECRET` with the label `grepthink/calendar-feed/v1` — the unsubscribe-token
  pattern in `app/outbox/preferences.py`.
- `GET /api/calendar/feed` → `{ enabled, path, last_fetched_at }`; `POST /api/calendar/feed` creates or
  resets (new nonce, old link dies); `DELETE /api/calendar/feed` turns it off (row deleted).
- `GET /api/calendar/{token}.ics` — public. Exact-match lookup by user id, `compare_digest` on the
  signature, 404 for anything wrong (never says why). Rate-limited per token. `text/calendar;
  charset=utf-8`, `Cache-Control: private, max-age=300`. `last_fetched_at` is written at most once an
  hour.
- The token sits in a URL path: keep it out of Sentry events (extend `app/core/sentry.py` scrubbing to
  this route) and out of our own logs. Vercel's request logs will contain it; that is accepted.

### What it contains (all classes with `status = 'active'` the person belongs to)
- **Student** (member of team T): T's weekly TA meetings, T's team meetings, and T's final review once
  T holds a slot, with the time, both reviewers' names and the shared Zoom link.
- **TA**: weekly TA meetings of teams where they are `assigned_ta_id`; final reviews where they are the
  Home TA (assigned) or the Review TA (`project_review_tas`).
- **Instructor** (`classes.created_by`): every booked final review in the class, and nothing else.
- One person can hold different roles in different classes; the feed is the union.

### Events
- Each TA-meeting occurrence is its own `VEVENT` (the Schedule handoff's "instances, not rules"):
  for every weekly slot with a day and a time, every matching weekday from the later of the class's
  `start_date` and the day the slot was created, through `end_date` (or the legacy week count when
  `end_date` is NULL). Start time in the school's zone, converted to UTC; length = the class's
  `meeting_duration_minutes`. UID `ta-<meeting_id>-<YYYYMMDD>@grepthink2.com`. Summary
  "TA meeting · <team>"; Zoom in LOCATION and URL; class and TA in DESCRIPTION.
- Team meeting: UID `team-meeting-<id>@grepthink2.com`, summary = title, LOCATION = room or Zoom,
  DESCRIPTION = team, note, Zoom.
- Final review: UID `final-review-<project_id>@grepthink2.com`, 60 minutes, summary
  "Final review · <team>", the shared Zoom room in LOCATION and URL, both reviewers in DESCRIPTION
  (the same for students and staff).
- All times in UTC (no VTIMEZONE needed); `DTSTAMP`, `LAST-MODIFIED` from `updated_at` where it exists;
  calendar name "GrepThink"; `REFRESH-INTERVAL;VALUE=DURATION:PT6H` and `X-PUBLISHED-TTL:PT6H` as
  hints (Google ignores them and refreshes on its own schedule, often hours).
- Library: `icalendar` (pin the current release in `requirements.txt`; check it on Python 3.12).

### UI
- Settings, next to Email preferences: "Calendar subscription". Off → "Create calendar link". On → the
  URL (read-only) with Copy, one line each for Google (website: Other calendars → From URL), Apple
  (File → New Calendar Subscription) and Outlook (Add calendar → Subscribe from web), "Last checked by
  your calendar app: 2 hours ago" (or "Not checked yet"), Reset link (confirm: the old link stops
  working) and Turn off (confirm). Existing Settings patterns; the Settings-wide Claude Design pass
  restyles it later.

---

## Order and pull requests

1. **A — class end dates** (small; unblocks honest TA-meeting dates).
2. **B — team meetings** (backend + UI from the handoff + the Schedule subset).
3. **C1 — slot sign-up backend**, including the removal of the per-team time field (can run alongside
   B; different module).
4. **D — calendar feed** (reads A, B and C1's data; ships after their migrations are applied).
5. **C2 — slot sign-up screens** once `design_handoff_final_review_signup/` lands.

Each PR: migrations in `migrations/2026-10/`, PROD scripts staged in `migrations/prod/2026-10/` and
applied by the maintainer **before** the release that needs them, `schema.sql` after applying, API
client + catalog entries, backend tests with round-trip budgets, `ruff`, `pytest`, `npm run lint`,
`lint:design`, `npm run build`, `vitest`.

## Left to the builder

- Exact SQL of the booking functions and their error codes; module layout inside `app/tas` and the new
  `app/calendar_feed` (don't name a package `calendar`: it shadows the standard library).
- Whether to record product events (`app/core/events.py`) for feed created/reset; keep `meta` to ids.
- Response shapes beyond what the handoffs fix, and how the frontend caches feed status.

## Follow-ups (not in this design)

The `GET /api/schedule` endpoint and the Today's Schedule / agenda port; marking attendance at team
meetings (who and where); lectures and office hours; skipping holidays (a per-occurrence cancel); the
scrum board's hard-coded Pacific day boundary (`app/scrum/controller.py` `_LA_TZ`); team meetings in
TAs' views; deadlines and sprints in the feed.
