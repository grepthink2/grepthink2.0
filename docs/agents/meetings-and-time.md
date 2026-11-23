# Meetings, TAs, deadlines and time zones

Read this before changing attendance, TA assignment, team meetings, final reviews, assignments' deadlines, the schedule, or anything that computes or shows a date.

- **Two project-TA roles (by design):** `projects.assigned_ta_id` = the team's *Meeting TA*
  (runs the weekly meeting, takes attendance and reviews the team's TSRs; set through
  `app/attendance`). `project_review_tas` = the *Review TA*, the second end-of-quarter reviewer (at
  most one per team; `app/tas`), a different class TA than the Meeting TA, who is reviewer #1 and is
  not stored there. Both draw from the one class-TA pool (`enrollment_role`). **Class-TA designation is unified** —
  designating via TA Management or TA Meetings writes the same `enrollment_role`
  (the legacy `class_tas` table was removed).
- **`meetings` holds two kinds of row.** `kind = 'ta_meeting'` is a TA's weekly slot
  (`app/attendance`); `kind = 'team_meeting'` is a team's one-off meeting (`app/team_meetings`,
  written by the team's Product Owner). TA code filters `cadence = 'weekly'`, team-meeting code
  filters `kind = 'team_meeting'`, and a CHECK (`meetings_team_meeting_shape`) ties `team_meeting`
  to `cadence = 'once'`, so the weekly filter never sees a team row. TA code must never read team
  rows: keep `cadence = 'weekly'` on every new TA query.
- **`projects.final_review_at` has one writer.** Only the SQL functions `book_final_review_slot`
  and `release_final_review_slot` set it, called over `.rpc()` from `app/tas/review_slots.py`, so
  a team's time moves with its slot in one transaction. Never update it directly.
  `classes.review_period_open` ("Sign-ups open") is the one switch for team booking and TA
  reviewer sign-up, and a TA self-appoints as Review TA only once the team holds a slot.
- **Deadlines are instants.** `assignments.due_at` (first moment after `close_date` in the school's
  zone, derived by the backend) is the deadline; `accept_until` is a late window. A TA the instructor
  has granted `can_extend_deadlines` may set it too, on TSR assignments, through
  `PUT /api/assignments/{id}/late-window`: the instructor from TA Management's switch, the TA from
  TA Review, whose window line ("Deadline … · Late submissions until …" or "No late window") and
  "Accept late submissions…" dialog (`components/TAReview/LateWindowModal.tsx`) show for every TSR
  assignment of the class once the TA has the permission, teams or not. Reviewers see a `tsr.late`
  badge on a TSR submitted at or after `due_at` and `tsr.edited_late` on one saved again after it
  (any save after the deadline counts, a reviewer's correction too) (`TSRS/tsrLateStatus.ts`).
  After a published assignment's `due_at` passes, moving
  `close_date` or unpublishing is refused (400): set `accept_until`. A draft can always be
  rescheduled. `create_tsr`, `update_tsr_entry` (students) and `submit_feedback` enforce the window
  (403 `"This assignment is not open yet"` / `"This assignment is closed"`).
  `app.assignments.deadlines` holds the arithmetic and the clock (`now_utc`, patched in tests).
- **Times: store instants, compute in the school's zone, show in the viewer's.**
  - The database holds `timestamptz` instants.
  - Calendar boundaries (a day, a term week, a deadline's `due_at`, the scrum board's burnup day) are
    computed in the school's zone: `institutions.timezone`, read through
    `app.institutions.controller.institution_timezone()`. A controller with no class row at hand embeds
    `classes(institution_id)` in a read it makes anyway: scrum's `_board_access` does, and answers the
    project's `institution_id` along with the caller's access.
  - The web client shows times in the viewer's zone, with the campus time beside them when the two
    differ (`features/schedule/scheduleModel.ts` `zoneDiffers` / `viewerZone`,
    `TeamMeetings/teamMeetingsModel.ts` `campusTimeOf`, `lib/dateUtils.ts` `formatInstantIn` for a
    date-and-time on another zone's clock). The campus zone is the class's school's, from
    `useSchoolTimezone(class.institution.id)` (`lib/institutions.ts`), and the components and helpers
    that show campus time take it as an argument, with no default of their own. `SCHOOL_ZONE`
    (`lib/schoolZone.ts`, Pacific) is only that hook's last resort, when no school's zone is known, and
    `viewerZone()`'s when the browser cannot say where it is.
  - Known exception, still to fix: the Final Reviews page shows the browser's zone with no campus time.
