# Home schedule and the week agenda — design

Date: 2026-11-09. Follows `2026-10-18-schedule-sources-and-calendar-feed-design.md`, which left the
schedule endpoint and the Today's Schedule port as a follow-up. The look and behaviour are already
designed: `design/design_handoff_schedule/README.md` and `NOTES.md` (2026-10-17) are binding for
layout, states, copy, keyboard, time zones and the phone layout. This document decides what that
handoff left open and what this round builds.

## Intent

The Today's Schedule card on Home still shows "Class events and deadlines will appear here." The
data it was waiting for now exists: weekly TA meetings, a team's one-off meetings, final-review
slots, assignment deadlines and sprints. A person opening Home should see what they have today in
the class they are looking at, join a meeting from there when it is time, and open the week.

## Goals

- `GET /api/schedule`: one request that answers a person's schedule items in one class for a range.
- The compact Today's Schedule card, fed by it, on the student Home (students and TAs share it) and
  on the instructor Home.
- The `/app/schedule` week agenda, reached from the card's "See week" and from the sidebar.

## Non-goals (this round)

- Lectures and office hours. Next round: a TA posts their own office hours; lectures need a table and
  instructor screens.
- A unified instructor view across every class they teach, with TA meetings in it. Next round. This
  round the instructor's schedule has no TA meetings.
- "Add to your calendar". The link stays hidden until the calendar feed (Piece D) ships.
- Inline "Mark attendance" and "Set time" on a row, and a TA-meeting row expanding into
  `MeetingCard` (my call: the handoff draws the expansion, and it can follow once the list is live).
- Team meetings in TAs' and instructors' schedules (already a follow-up in the October design).
- Cancelled meetings and "Time TBD" rows: nothing stores a cancellation, and a TA meeting with no day
  or time has no day to list under. Neither is sent (my call).
- Any new table or migration.

## Anti-goals

- A second source of truth for meeting times, deadlines or attendance. The endpoint reads what the
  feature modules already store and computes nothing they would disagree with.
- An endpoint that answers for anyone but the caller, or for a class the caller is not in.
- Home's first download growing by the whole agenda. The agenda page is a lazy route.

## Decisions made with the maintainer (2026-11-09)

1. Scope: the card and the agenda.
2. Homes: the student Home (TAs see their TA items there) and the instructor Home.
3. Kinds in: TA meetings, team meetings, final reviews, assignment deadlines, sprint edges. Out:
   lectures and office hours.
4. One class: the class selected in the sidebar. Nearly every student is in one class. The agenda's
   class select from the handoff is not built.
5. Sprint edges: a student sees their own team's sprints; staff see the class's sprint schedule, one
   rule per edge rather than one per team.
6. Instructor's TA meetings: not this round (see Non-goals).
7. "Add to your calendar": hidden until Piece D.
8. Staff actions on a row go to the TA Meetings page.
9. "View class as student": the card and the agenda show their empty state with a note that the
   schedule is not part of the preview, and make no request.

## The endpoint

`GET /api/schedule?class_id=<uuid>&from=<instant>&to=<instant>`, signed in (`require_user`).

- `from` and `to` are ISO instants with an offset, `from < to`, at most 42 days apart; 422 otherwise.
  The client asks for the range it shows in the viewer's zone (a day for the card plus enough to
  find the next day with something, see "The card"; a week for the agenda).
- Access: the class's instructor or anyone enrolled in it (`app.core.authz`); 403 otherwise, 404 for
  no such class. The caller's lens is their role in that class: `instructor`, `ta` or `student`.
- Answers `{ "lens": ..., "items": [...] }` in the current response shape, items in the handoff's
  `ScheduleItemData` shape with snake_case keys; the client maps them. `status` is not sent: the
  client derives upcoming, live and past from the clock.
- An item is sent when it overlaps the range: a timed item when its start is before `to` and its end
  after `from`; a sprint edge or all-day item when its day, in the school's zone, touches the range.
- New module `backend/app/schedule/` (`url`, `views`, `controller`, `models`), registered in
  `app/main.py`; a client method in `frontend/src/lib/api/schedule.ts`; an entry in the agent catalog
  with role `any`.
- Cost: the reads run through `fan_out`; a test pins the round trips per lens (aim for 3 waves or
  fewer). No rate limit beyond the app's defaults (my call: it is one cheap read per page view).

### What each lens gets

| Kind | Student | TA | Instructor |
|---|---|---|---|
| TA meeting | their team's | the teams they are assigned to (`projects.assigned_ta_id`) | none |
| Team meeting | their team's | none | none |
| Final review | their team's, once it holds a slot | where they are Home TA or Review TA | every team with a slot |
| Deadline | the class's published assignments | same | same |
| Sprint edge | their team's sprints | the class's sprint schedule | the class's sprint schedule |

A student on no team gets deadlines only. A student on two teams in the class gets both teams' items.

### Where each kind comes from

- **TA meeting.** `meetings` rows with `kind = 'ta_meeting'` and `cadence = 'weekly'` (keep that
  filter: TA code never reads team rows), expanded into dated occurrences: each `day_of_week` at
  `start_time` in the school's zone. Bounds, as in the October design: from the later of the class's
  `start_date` and the day the slot was created (in the school's zone), so a slot set in week 4 shows
  no earlier meetings, through the term's last day (`terms.term_last_day`: `end_date`, else the
  term's fixed week count). A class with no `start_date` sends no TA meetings: attendance has no week
  to key them to. Length is the class's `meeting_duration_minutes`, the value the instructor sets,
  else the slot's `duration_minutes` (my call). `zoom_url` and `location` come from the slot; the host is the team's assigned TA (`you` when that is the caller);
  `recurrence_label` "Weekly · Tue"; `meeting_index` and `meetings_per_week` when the class meets more
  than once a week. Past occurrences
  carry attendance: the caller's own status for a student, `{present, total}` for a TA, using the
  week numbering `app/attendance` already uses. Reuse its helpers; do not re-derive the term week.
- **Team meeting.** `meetings` rows with `kind = 'team_meeting'`: `scheduled_at`, `duration_minutes`,
  `title`, `location`, `zoom_url`, `note`; the host is `created_by`, role "Organizer"; `scope` team.
- **Final review.** `projects.final_review_at` (read only; its one writer is the slot booking),
  60 minutes as in the October design, the class's `review_zoom_url`, reviewers = the Home TA
  (`assigned_ta_id`) and the Review TA (`project_review_tas`), `you` on the caller.
- **Deadline.** Published assignments in the class, title "<assignment title> due". `due_at` is the
  first moment after the closing day, which the app shows as 11:59 PM of that day
  (`dateUtils.formatDeadline`). The item's instant is `due_at` minus one minute, so a TSR due Friday
  lists under Friday, last in the day, as the handoff expects (my call). The endpoint sends
  `assignment_id` and `assignment_type`, never a path; the client builds the link (my call):
  a student's goes to `/app/assignments/:id`, a TA's to `/app/ta-review/:id` for a TSR only (TA Review
  lists TSRs, so a TA's other deadlines have no link), an instructor's to
  `/app/modules/tsr/:id` or `/app/modules/feedback/:id`, and an instructor's interest form has no
  link. Drafts are never sent. A student sees a deadline whether or not they have submitted (my
  call).
- **Sprint edge.** Student: their team's `sprints.starts_at` and `ends_at`, each an all-day edge
  labelled with the sprint's name. Staff: the windows `app.scrum.schedule.sprint_windows` gives for the
  class's `sprint_count`, `sprint_frequency` and `sprints_start_on`, labelled "Sprint N"; none when
  the class has no sprint schedule.

All calendar arithmetic is in the school's zone (`institution_timezone()`), and instants go out as
ISO strings with an offset, as AGENTS.md "Times" says.

## The card

- Port what is missing from `design/components/schedule/`: `ScheduleList` (compact and agenda
  variants), `ScheduleDivider`, the Now line, the list's states and footer. `scheduleModel.ts`,
  `ScheduleItem`, `ScheduleDayHeader`, `ScheduleIcon`, `schedule.scss` and `lib/useNow.ts` exist;
  extend them where the handoff asks and the port left something out.
- A `useSchedule(classId, from, to)` hook in `features/schedule` loads the items, keeps the last
  answer on screen while the next loads, and exposes loading, error and retry.
- Student Home: the list replaces the placeholder in the existing card (the card header stays the
  page's; the handoff's NOTES 13). Instructor Home: a new "Today's Schedule" card in the aside
  column, above the class list (my call on placement).
- Compact behaviour is the handoff's: today's items with the Now line, at most 5 then "+n more
  today"; when today is empty, "Nothing scheduled today" and a peek at the next day that has
  something, up to 3 rows. The card asks for today through the next 14 days in one request and
  peeks within that (my call). With nothing in 14 days it shows the current empty-state copy,
  verbatim: "Class events and deadlines will appear here."
- Footer: the zone note when the viewer's zone differs from the school's, and "See week" linking to
  `/app/schedule`. No "Add to your calendar".
- Join Zoom appears as the primary action inside the join window, as designed. For staff, a live or
  past TA meeting shows "Mark attendance" as a link to `/app/ta-meetings` (my call: plain link, not
  the callback the design emits).
- No class selected: the card keeps its empty state. Preview: empty state plus one line, "The
  schedule isn't part of the student preview."
- The campus zone comes from `useSchoolTimezone(class.institution.id)` and is passed in; no default.

## The agenda

- `/app/schedule`, a lazy route, for all three roles: add it to `sidebar.ts` (icon `CalendarDays`,
  label "Schedule") and `routePermissions.ts`.
- The handoff's agenda: week switcher, range label, zone note, kind chips, sticky day headers, sprint
  rules, Now line on today, phone layout. One request per week shown. No class select; the page
  follows the sidebar's class and has a "no class selected" state (`NoClassSelected`).
- `?day=YYYY-MM-DD` opens the week containing that day, scrolled to it. "+n more today" on the card
  links there with today's date.
- Chips are multi-select over the five kinds this round sends; "Nothing matches these filters" with
  Clear filters, as designed. Use the kit's `FilterChip` (the handoff's own chip class predates it).

## Order and pull requests

1. **Endpoint and card**: `app/schedule`, the client method, the catalog entry, `ScheduleList`
   compact, both Homes. "See week" is hidden in this PR.
2. **Agenda**: the route, the sidebar entry, `ScheduleList` agenda, and "See week" and "+n more
   today" turned on.

Neither needs SQL. Each runs the gates in AGENTS.md "Before you commit". After PR 1, check every file
`index.html` loads: Home is in the entry chunk, so the card's code lands there, and the PR says by how
much.

## Testing

- Backend: per lens, what is sent and what is not (another team's meeting, a draft assignment, a
  team without a slot), range edges, a class with no end date, the round-trip budget; access in
  `tests/test_authz_status_policy.py`. Pin the clock and use fixed-offset zones. The TA-meeting
  expansion and the embeds are checked once against DEV, read-only (the fake proves no relations).
- Frontend: the list's states with fake timers (today with a live item, empty today with a peek,
  nothing in range, error and retry, another zone), both Homes, the agenda's week switch, chips and
  `?day=`, and preview making no request.
- A local harness of both Homes and the agenda for the visual check; not committed.

## Left to the builder

- Module layout inside `app/schedule`, the exact response field names, and how much of the
  attendance and final-review read code is shared rather than called.
- How `ScheduleList` is split so the agenda's toolbar is not in Home's chunk.
- Whether the Home card and the agenda share one cached answer when their ranges overlap.

## Follow-ups (not in this design)

TA-posted office hours; lectures; the unified instructor schedule across classes, with TA meetings;
"Add to your calendar" (Piece D); inline attendance and Set time; `MeetingCard` expansion; team
meetings for staff; cancelled and TBD items; the Final Reviews page's missing campus time.
