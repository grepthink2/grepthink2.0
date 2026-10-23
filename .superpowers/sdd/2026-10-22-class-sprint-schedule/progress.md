# SDD ledger — plan: docs/superpowers/plans/2026-10-22-class-sprint-schedule.md
Spec: docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md (committed 9552e1d5 on feat/class-sprint-schedule, cut from origin/beta 50f65d16)
Workspace rule: the main checkout on feat/class-sprint-schedule, per the maintainer's established pipeline (the git-excluded harnesses and launch configs live here).
Ruling: implementers are Opus at max effort per the maintainer's instruction; per-task reviewers are fresh subagents (Opus for backend logic, Sonnet for mechanical diffs), the final whole-branch review Opus at max; my own harness check comes after — the maintainer's precedent had the review in this session, so I say so when handing over. Costs if wrong: a review they wanted from me came from a subagent; they can ask for a second look.
Ruling: DEV migrations are NOT applied by me; the maintainer is asked at the end (tests run on the fake). Costs if wrong: the signed-in DEV check waits a day.

## Pre-flight scan (2026-10-22)
| Tasks | Shared file / interface | Produced vs consumed | Finding |
| --- | --- | --- | --- |
| 1 ↔ 4,5,6,8 | new columns | migration adds classes.sprint_*, sprints.sequence, burnup hours; code reads them | consistent; the fake enforces no schema |
| 2 ↔ 3,5,6,7,8 | schedule.py | sprint_status, Schedule/from_class, sprint_windows, SPRINT_NAME, schedule_problem, schedule_end | signatures match every consumer |
| 3 ↔ 4 | scrum/controller.py get_board, get_summary, sprint rows | 3 adds _with_status; 4 changes burnup/_totals | sequential edits, no overlap in functions |
| 3 ↔ 5 | update_sprint / sprints rows | 3 drops status writes; 5 inserts without status | consistent |
| 4 ↔ 9,12 | BurnupOut fields | unit, units_available, tasks_without_points, hours_done/total | names identical in 9 and 12 |
| 5 ↔ 7,8 | ensure_project_sprints(client, *, project_id, project_name, schedule) | 7 passes name; 8 fans out per project with names | consistent; 8 pre-checks conflicts across teams before any write |
| 6 ↔ 8 | classes models/controller | 6 CreateClassRequest validator; 8 UpdateClassSprintsRequest + controller check | sequential; different models |
| 6,8 ↔ 9,10,11 | API fields and the PATCH contract | sprint_count/sprint_frequency/sprints_start_on; {message, class, teams, created, updated, deleted} | consistent |
| 10 ↔ 11 | utils/sprintSchedule.ts | 10 creates; 11 consumes scheduleEnd | consistent |
| 9 ↔ 12 | getScrumBoard(projectId, sprintId?, unit?) | 12 passes unit | consistent |
| each task | own text | tests vs code vs files | T2 test uses an inline __import__ for timedelta (style only); T4 leaves _sprint_progress's shape open; T7 names HTTPException only |
Ruling (T4): _sprint_progress(stories) keeps no unit parameter and returns tasks_done/total, points_done/total, hours_done/total; the client picks by burnup.unit. Costs if wrong: an extra field pair on the payload.
Ruling (T7): the sprint creation after a project insert catches Exception (not only HTTPException), logs at WARNING and continues, as _snapshot_burnup_safe does: a created project must never be reported as failed. Costs if wrong: a database outage hides behind a warning until the instructor's PATCH.
Ruling (T12): the unit toggle reuses the board's existing reload path (a skeleton flash is accepted); a smoother refetch is polish. Costs if wrong: a visible flash on toggle.

## Progress
Task 1: implementer DONE_WITH_CONCERNS at 1ef39881 (base 9552e1d5).
Ruling (T1): the brief's verification count of 5 was a plan miscount; 6 ADD COLUMN statements is right (3 classes + 1 sprints + 2 burnup). Costs if wrong: nothing.
Ruling (T1): adopt the tightened CHECK — the second branch gains `sprint_count IS NOT NULL AND sprint_frequency IS NOT NULL`, since a NULL in a CHECK passes and the spec's verbatim text accepted (NULL, 'weekly', date). The spec's Part 0 block is updated to match in the same fix commit. Costs if wrong: none; the API never writes a half-set schedule.
Task 1: pre-review fix dispatched (tightened CHECK + spec mirror).
Task 1: review at e3903fdd — spec ❌ one Important (plan-mandated): inline CHECK on sprints.sequence re-added on every re-run (ADD COLUMN IF NOT EXISTS lifts the CHECK into a separate AddConstraint). ⚠️ SQL never parsed here (first parse = the DEV apply, the maintainer's); headers cite later tasks' code (Task 13 re-checks); live shape checked against schema.sql only.
Ruling (T1): adopt the split — ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS sprints_sequence_check, ADD CONSTRAINT sprints_sequence_check — in the migration and the spec block together; the spec stays the authority and is updated in the same commit. Costs if wrong: a differently named constraint than the spec first wrote; nothing reads the name.
Task 1: fix round 1/5 dispatched to the original implementer (finding: idempotent sequence CHECK).
Task 1: fix round 1/5 — fix at 11a4ec78 (idempotent sequence CHECK, spec mirrored); scoped re-review running over e3903fdd..11a4ec78.
Task 1: fix round 1/5 (1 addressed, 0 open — idempotent sequence CHECK; commits e3903fdd..11a4ec78)
Task 1: minor (deferred): the report's cmp evidence line was an annotation, not raw output (the re-reviewer reproduced it independently).
Task 1: note for Task 13: migration headers cite later tasks' code; re-check them against the final code. Whether `ADD COLUMN IF NOT EXISTS … CHECK` duplicates the CHECK on PG 13+ is unverified; confirm on DEV before recording it anywhere as a gotcha.
Task 1: complete (commits 9552e1d5..11a4ec78, review clean after round 1)
Task 2: implementer dispatched (Opus max) at base 11a4ec78.
Task 2: implementer stopped by the controller mid-task at the maintainer's pause request; its two files (7 tests green, ruff clean) committed by the controller as f9c82755. NOT reviewed: resume at the Task 2 review (review package base 11a4ec78).
