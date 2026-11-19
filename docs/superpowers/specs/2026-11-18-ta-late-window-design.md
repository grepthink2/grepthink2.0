# TA Late Windows — Design Spec

**Date:** 2026-11-18
**Base:** `origin/beta` at `90453797` (release 0.95.0; code references below are to that head). New work
branches from it.
**Status:** draft for the maintainer's approval. Decisions marked ⚑ are mine; the others are the
maintainer's (2026-11-18, two rounds). Nothing is built.

## The ask

A TA asked whether a student's TSR can be accepted after the deadline. Today only the class instructor
can, and only by opening the class-wide **late window** (`assignments.accept_until`) from Modules. Let
the instructor hand that power to chosen TAs, from the TA Management hub, and let a TA open the window
from the page where they review TSRs. Mark late submissions so reviewers can see them.

## What exists today

- One gate decides whether a submission is accepted: `_require_window_open`
  (`backend/app/assignments/controller.py:34`), called by `create_tsr`, `update_tsr_entry` and
  `submit_feedback`. Open from the start of `open_date` until `accept_until` when set, else `due_at`.
  The web client mirrors it in `frontend/src/features/app/utils/assignmentState.ts`.
- The only writer of `accept_until` is `PATCH /api/assignments/{id}` (`update_assignment`), behind
  `_require_class_instructor`. It records an `assignment_reopened` event with the actor when a window is
  set or moved, nothing when one is removed. Catalog role: `instructor`.
- A TA is `class_enrollments.enrollment_role = 'ta'`; there is no per-TA permission anywhere.
  `demote_ta` clears the TA's `assigned_ta_id` teams and Review-TA rows before flipping the role.
- TA Management (`frontend/src/features/app/pages/TAManagement.tsx`) lists each TA as a `ta-card` with
  the teams they oversee. TA Review (`pages/TAReview.tsx`) loads `GET /api/tas/classes/{id}/review-targets`
  (the TA's teams plus the class's TSR assignments), offers an assignment `<select>`, and renders
  `components/TSRS/TSRView` for the chosen one.
- `TSRs.updated_at` already exists (trigger `tsrs_set_updated_at`, migration 2026-10-06), and every TSR
  entry the overview returns carries `submitted_at` (the row's `created_at`) and `updated_at`. The
  student's own form already says "Submitted after the deadline"; reviewers see nothing.
- Students already see "Late submissions until …" under the due date while a window is open.

## Decisions

Maintainer's, unless marked ⚑.

| # | Decision |
| --- | --- |
| 1 | **No per-student extensions.** The permission lets a TA set, move or remove the class-wide late window. |
| 2 | A permitted TA may do so for **any TSR assignment in the class**, not only for the teams they oversee. |
| 3 | **TSR assignments only.** Post Feedback and the Project Interest Form stay instructor-only (see "Later"). |
| 4 | Submissions after `due_at` are **flagged late to reviewers** (the window stays class-wide). |
| 5 | The window must be **later than the current deadline**; a **published** assignment only; no hard cap, the UI **warns past 14 days** after the deadline. ⚑ on "published only": today PATCH lets the instructor set a window on a draft; the new route refuses it for both roles, PATCH is left as it is. |
| 6 | A permitted TA may **remove or shorten** a window too. Anything already submitted stays. |
| 7 | **Storage:** `class_enrollments.can_extend_deadlines boolean NOT NULL DEFAULT false`, a CHECK tying it to `enrollment_role = 'ta'`; demote clears it. One boolean now; a second per-TA option is the moment to generalise. |
| 8 | **Default off** for every TA, existing ones included; the instructor opts each in from TA Management. On PROD the maintainer turns it on for one TA by hand (a data fix, not a repo file: it would name a person). |
| 9 | **Audit:** the existing `assignment_reopened` event (actor, class, assignment, new window). No reason field. ⚑ Removing a window records a new `late_window_removed` event so the trail is complete. |
| 10 | **Counts, not a list:** the TA's row in TA Management shows how many late windows that TA has opened. |
| 11 | **Students are told** by an in-app notification when a window opens or moves. No email. Clicking it opens the class's Assignments page. |
| 12 | **Placement:** permission toggle on the TA's card in TA Management; the instructor's own control stays in the Modules assignment editor; the TA opens a window from TA Review; students keep "Late submissions until …". |
| 13 | **Write path B:** a new route `PUT /api/assignments/{id}/late-window`, callable by the instructor or a permitted TA, sharing its validation with `update_assignment`. PATCH stays instructor-only and unchanged. |

## Goals, non-goals, anti-goals

**Goals.** A permitted TA accepts a late TSR without the instructor; the instructor sees who may and how
often they have; students learn a window opened; reviewers see which TSRs came in late.

**Non-goals.** Per-student or per-team extensions; a reason field; email; a class-level "all TAs may"
switch; TAs editing any other assignment field; TA windows on Post Feedback or the Interest Form;
analytics.

**Anti-goals.** A TA who can change a title, a date or publish state through the new route. A TA
without the flag who can open a window. A student who sees "Closed" while the server would accept
(mirror drift). A student's name, email or review text in an event, a log line or a notification's
`meta`.

## Approaches considered

- **A. Widen `PATCH /api/assignments/{id}`** with a TA branch that accepts only `accept_until` /
  `clear_accept_until` on `tsr` assignments. One writer, but a field-allowlist branch inside the module's
  largest controller, and a catalog role `instructor|ta` on a route that is mostly instructor-only.
- **B. New route `PUT /api/assignments/{id}/late-window`** with a body of one field, one authorization
  rule, and the validation extracted from `update_assignment` into a helper both use. Two routes can
  write `accept_until`, each with a clear rule. **Chosen:** the new permission's blast radius is one small
  function that gets its own review.
- *Per-student extensions* (a new table keyed by student and assignment) were laid out and rejected by
  the maintainer: a class-wide window is enough for this course.

## Design

### Data

Migration `backend/database/migrations/2026-11/2026-11-18_ta_late_window_permission.sql`, idempotent:

```sql
ALTER TABLE public.class_enrollments
  ADD COLUMN IF NOT EXISTS can_extend_deadlines boolean NOT NULL DEFAULT false;
ALTER TABLE public.class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_extend_requires_ta;
ALTER TABLE public.class_enrollments
  ADD CONSTRAINT class_enrollments_extend_requires_ta
  CHECK (enrollment_role = 'ta' OR NOT can_extend_deadlines);
```

`supabase/schema.sql` gets the column and constraint once the migration is applied on DEV. No new table.
No client grant: the browser never reads this column.

`demote_ta` writes `{"enrollment_role": "student", "can_extend_deadlines": false}` in its one existing
update so the CHECK never trips. `promote_to_ta` leaves the flag false.

The test double enforces no constraints: the CHECK is verified on DEV, inside a transaction that rolls
back (an UPDATE that sets the flag on a student row must fail).

### Authorization

A helper in `backend/app/core/authz.py` (⚑ name: `require_late_window_access(client, user_id,
class_id) -> dict`) returns the class row when the user created the class, or holds an enrollment with
`enrollment_role = 'ta'` and `can_extend_deadlines = true`; otherwise 403 with a fixed detail (⚑
`"Only the instructor or a TA with permission may change the late window"`). It reads the class and the
enrollment concurrently (`fan_out`); a missing class is 404 `CLASS_NOT_FOUND`. This helper, the migration
and the two write controllers below get a review of their own before the whole-branch review.

### Route: the late window

`PUT /api/assignments/{assignment_id}/late-window`, body `{"accept_until": <datetime with offset> | null}`.
`null` removes the window. Catalog role `instructor|ta`. In order:

1. Load the assignment (404 `"Assignment not found"`), then `require_late_window_access` on its class.
2. A TA (not the instructor) on an assignment whose `assignment_type` is not `tsr`: 403 (⚑ `"TAs may
   change the late window of TSR assignments only"`).
3. `status != 'publish'`: 400 (⚑ `"Only a published assignment can take a late window"`).
4. Setting: no `due_at` → 400 `NO_DEADLINE_TO_EXTEND`; `accept_until <= due_at` → 400
   `ACCEPT_UNTIL_BEFORE_DEADLINE`; equal to the current value → no write, no event, 200. Otherwise write
   `accept_until`, record `assignment_reopened` (as `update_assignment` does: actor, class,
   `assignment_id`, `accept_until`, `after_deadline`), and notify (below).
5. Removing: no current window → 200, nothing written; otherwise write `null` and record
   `late_window_removed` (actor, class, `assignment_id`; no other meta).

The validation in step 4 is the block `update_assignment` runs today (`controller.py:303-338`),
extracted into one helper both call so the two writers cannot drift. The response is the updated
assignment row in the current response shape (`backend/STYLE_GUIDE.md`, "Response Format"); the client
method returns it typed as `ApiAssignment`.

Round trips, to pin in the test (`fan_out` counts one per read): class + enrollment (2, fanned out) +
assignment (1) + write (1) + notification reads (2, fanned out: enrolled students and this assignment's
evaluators) + notification insert (1). ⚑ The response is the bare row: PATCH's extra `tsrs` key is not
reproduced here.

### Notification

⚑ Type `late_window_opened` (added to `NOTIFICATION_TYPES`; the table has no CHECK on `type`). Sent on set
or move, from the shared helper so the instructor's PATCH sends it too, to every student enrollment in
the class (`enrollment_role = 'student'`) with no `TSRs` row as `evaluator_id` for that assignment. Title
"Late submissions open for <Title>", body "You can submit until <time> (<campus zone>)", rendered in the
school's zone (`institution_timezone`), `entity_type = 'class'`, `entity_id` the **class** (the
assignment id goes nowhere: the student's Assignments page shows every TSR of the class). One bulk
insert through `_insert_notifications`, best effort, after the write. Nothing is sent when a window is
removed or shortened (⚑ the student's page already shows the change), nor when PATCH sets a window on a
draft (⚑ students cannot see a draft). `ApiNotification['type']` in `lib/api/types.ts` gains the new
member in PR 1 so the client accepts the row.

**Clicking it** (maintainer's call) lands on that class's Assignments page, `/app/assignments`. The
Header's `notificationPath()` (`features/app/components/Layout/Header.tsx`) today routes conversations,
projects, finalized documents and the roster notices, and nothing else; the roster notices carry the class
in `entity_id` and switch the selected class before navigating (`isRosterNotice`). `late_window_opened`
follows that pattern: a class-switching notice whose path is `/app/assignments`. Until PR 3 lands the
notification reads fine and clicking it does nothing, which is today's behaviour for any unrouted type.

### Route: the permission

`PATCH /api/tas/classes/{class_id}/tas/{user_id}`, body `{"can_extend_deadlines": bool}`, instructor only
(`_require_class_instructor`). The target must hold a `ta` enrollment in that class (400 `"User is not a
TA in this class"`). Writes the flag; returns `{"user_id", "can_extend_deadlines"}`. Catalog role
`instructor`.

### Payloads that grow

- `GET /api/tas/classes/{class_id}` (`list_class_tas`): each TA gains `can_extend_deadlines` and
  `late_windows_opened` — the count of `assignment_reopened` events with that `actor_id` and this
  `class_id`. One more read in the existing details `fan_out` (events in `.in_("actor_id", ta_ids)`,
  counted in memory). The instructor's own windows are not counted anywhere.
- `GET /api/tas/classes/{class_id}/review-targets`: `can_extend_deadlines` for the caller, and the
  assignments select widens to `id, Title, open_date, close_date, due_at, accept_until, status,
  assignment_type` so TA Review can show the current window without another call.

### Instructor UI — TA Management

On each `ta-card`: a `Toggle` (kit) labelled "Can open late windows", and beside it the count, "3 late
windows opened" ("none yet" at zero). Flipping it calls the permission route and updates the card in
place; the existing `runAction` error handling applies. `ApiClassTA` gains the two fields.

### TA UI — TA Review

Under the assignment `<select>`, a window line for the chosen assignment: "Deadline <due_at>" and
either "Late submissions until <accept_until>" or "No late window". Times in the viewer's zone, campus
time beside them when it differs (`scheduleModel.ts` `zoneDiffers` / `viewerZone`).

When `can_extend_deadlines` is true, a button "Accept late submissions…" opens a small `Modal` (kit)
with one date-and-time field reusing the Modules editor's picker and its `pickerTextToIso` /
`toPickerText` helpers, a non-blocking `Alert` when the chosen time is more than 14 days after the
deadline, Save, and — when a window exists — "Remove late window" behind an `InlineConfirm`. Save calls
the late-window route and refreshes the window line. The control is absent, not disabled, without the
flag. ⚑ Today the page shows the assignment `<select>` only when the TA oversees a team; with the flag
the window line and button render whether or not the TA has teams, since the permission is class-wide.

Sketch:

```
TSR Assignment  [ TSR 3            v ]
Deadline Nov 14, 11:59 PM · Late submissions until Nov 16, 5:00 PM     [Accept late submissions…]
```

### Reviewer late badge

In `TSRView` (TA Review and the instructor's overview, which share it): a `Badge` on each entry whose
`submitted_at >= assignment.due_at`, status `tsr.late` → "Late"; ⚑ an entry submitted on time but with
`updated_at >= due_at` gets `tsr.edited_late` → "Edited late". Both statuses go in
`components/Badge/badgeStatus.ts`. Pure frontend: the overview payload already carries `assignment.due_at`,
`submitted_at` and `updated_at`.

### Client, catalog, docs

- `frontend/src/lib/api/assignments.ts`: `setAssignmentLateWindow(assignmentId, acceptUntil: string |
  null)`. The TA domain file: `setTALateWindowPermission(classId, userId, canExtend)`. `apiFacade.test.ts`
  guards name clashes; `check_api_client.py` checks both against the routes and the catalog.
- Catalog (`frontend/public/.well-known/grepthink-actions.json`): `set_late_window` (`PUT`, role
  `instructor|ta`, `uiRoute` `/app/ta-review`, note on the rules above), `set_ta_late_window_permission`
  (`PATCH`, role `instructor`, `uiRoute` `/app/ta-management`); `update_assignment`'s note points TAs
  to `set_late_window`; `list_class_tas`'s response note mentions the two new fields.
- `AGENTS.md` Vocabulary: **Late window** — the class-wide `accept_until` after a deadline, opened by the
  instructor or a TA with `can_extend_deadlines`. Never "extension": that word is kept for a per-student
  grant, which does not exist.

## Constraints

- Service-role writes: every new route carries its own check in Python; RLS protects nothing.
- Match identifiers with `eq`; validate the body before any write.
- Migrations are applied by hand, DEV then PROD; code must run on the live schema. A PostgREST read of
  `can_extend_deadlines` before the column exists fails: PR 1 does not merge to `beta` before the
  migration is on DEV, and the release PR waits for PROD (label `needs-prod-sql`).
- `supabase/schema.sql` is updated in PR 1; CI warns otherwise.
- No names, emails or review text in events, logs or notification `meta`.
- Tests pin the clock (`deadlines.now_utc`) and the round-trip budget (`FakeSupabase.executes`).

## Plan shape

| PR | Branch | Contents | Reviews |
| --- | --- | --- | --- |
| 1 | `feat/ta-late-window-backend` | migration + `schema.sql`; authz helper; late-window route with the extracted validation, events and notification; permission route; `demote_ta`; `list_class_tas` and `review-targets` payloads; client methods; catalog; `AGENTS.md` vocabulary; tests | single-task reviews of the migration, the authz helper and both write controllers; then whole-branch |
| 2 | `feat/ta-late-window-instructor-ui` | TA Management toggle and count | whole-branch |
| 3 | `feat/ta-late-window-ta-ui` | TA Review window line and modal; reviewer late badges; the Header routes `late_window_opened` to the class's Assignments page | whole-branch |

⚑ The badge and the Header branch ride in PR 3 rather than PRs of their own: neither needs SQL, the
badge lives in the component the TA UI touches, and the Header branch is a few lines beside
`isRosterNotice`. PR 3 is "TA and student UI". PRs 2 and 3 are independent of each other and both depend on PR 1's merge. One Opus
implementer per PR.

Release order: migration on DEV → PR 1 verified against DEV → PRs merge to `beta` → migration on PROD →
release → the maintainer sets the flag for the one TA on PROD by hand.

## Later (noted, not planned)

- TA late windows on Post Feedback and the Project Interest Form: drop the `tsr` check in step 2.
- Per-student extensions, if a class-wide window proves too blunt.
- An email on window open (an outbox kind with a preference category).
- A second per-TA option: replace the boolean with a permission set.

## Left to the builder

- Exact names of the helper, constants and files; the shape of the extracted validation helper.
- The modal's layout within the sketch above; whether the picker needs a time component beyond what
  the Modules editor already offers.
- Copy for the notification body's time format.
- Test data for the DEV CHECK verification.
