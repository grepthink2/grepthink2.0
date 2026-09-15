# Refactor report — 2026-09-08 to 2026-09-14

Branch `claude/refactor-dependencies-performance-453545`, cut from `origin/beta` at `613e4d1`.
The ask: refactor the whole codebase for best practices, extensibility and maintainability,
upgrade dependencies, and fix performance bottlenecks, especially in database-driven code.
Decisions D1–D16 are in `specs/2026-09-08-codebase-refactor-design.md`; per-module findings
are in the four `reports/2026-09-08-audit-*.md` files.

## Outcome at a glance

| Measure | Before (`613e4d1`) | After |
|---|---|---|
| Backend tests | 177 | 570 |
| Frontend tests | 94 | 144 (26 files) |
| Backend lint | none configured; 942 ruff findings | `ruff check` + `ruff format --check` clean, in CI |
| Frontend lint | 14 errors, 28 warnings, not in CI | 0 findings with every React hooks rule an error, in CI |
| `npm audit` | 12 findings, 10 high | 0 |
| Main JS chunk | 761 kB min / 218 kB gzip | 247 kB min / 67 kB gzip |
| Supabase client-selection copies | 48 | 1 (`app.core.db.get_client`) |
| Instructor-check implementations | 5 variants (403 / 404 / `None`) | `app.core.authz` helpers: 404 for a missing resource, 403 for denied access |
| Client bundle secrets | every `SUPABASE_*` variable exposed | only `VITE_*` |
| `lib/api.ts` | 1,586 lines, errors lose the HTTP status | 30-line facade over 9 domain files; `ApiError` keeps status, detail and code |
| Database failures | a 500 with a per-function message, or a silent `None` | typed `DatabaseError`: 503, 409 or 500 with a stable `code` |

## Database round trips per request

Every `.execute()` is one HTTP round trip to PostgREST. "In N waves" means the reads inside a
wave run concurrently through `app.core.db.fan_out`, so latency follows the wave count. Each
row is pinned by a budget test (`assert fake.executes <= N`) against `tests/fake_supabase.py`.

| Module | Function | Before | After |
|---|---|---|---|
| staffing | `auto_assign` (60-student class) | ~486 | ~9 |
| staffing | `assign_user` | ~18 | ~7 |
| staffing | `unassign_user` | ~9 | ~5 |
| tas | `save_final_review_scores` (six-member team) | 17 | 6 |
| tas | `get_final_review_detail` | 8 sequential | 7 in 3 waves (6 for the instructor) |
| tas | `set_review_ta` | 6–7 | 4 |
| tas | `list_project_review_tas` / `list_project_tas` | 6 / 4 | 4 / 3 |
| attendance | `mark_all_present` (six members) | 17 | 4–5 |
| attendance | `upsert_attendance` | 7–8 | 4–5 |
| attendance | `get_ta_schedule` | 9–11 sequential | at most 6 in 3 waves |
| attendance | `get_team_attendance` | 6 | 5 in 3 waves |
| assignments | `get_assignments_for_class` (instructor) | 8 sequential | at most 8 in 2 waves |
| assignments | `update_tsr_entry` | 6 | 3 |
| assignments | `get_instructor_tsr_overview` | 7 (9 for a TA) | 6 in 3 waves |
| assignments | `get_feedback_overview` | 6 | 5 in 3 waves |
| projects | `instructor_add_member` | 8 | 3–5 |
| projects | `instructor_remove_member` | 6 | 3–4 |
| projects | six project-role endpoints | 7 + N | 3–4 |
| projects | `accept_join_request` (switching teams) | 13–17 | ~11 |
| projects | `request_to_join_project` (switching teams) | 9 (13) | 7 (11) |
| projects | `reject_join_request` | 6 | 3 |
| projects | `get_pending_team_invites_for_user` | 5 sequential | 3 in 1 wave |
| projects | `get_project_pending_invites` / `get_pending_join_requests` | 4 sequential | 2 in 1 wave |
| projects | `get_project_members` | 3 | 1 |
| messages | `has_shared_class` | 4 sequential | 2 in 1 wave |
| messages | `can_message` | 5 in 5 waves | 3 in 2 waves |
| messages | `list_contacts` | 5 sequential | 2 in 1 wave |
| messages | `send_message` to a user | 6 reads | 4 reads in 3 waves |
| classes | `bulk_invite_students` (up to 100 addresses) | 2 + up to 4 per address | 4 |
| classes | `invite_student_to_class` | 6 | 3 |
| classes | `add_manual_roster_student` | 5 | 4 |
| classes | roster upload, removing leavers from teams (3 students, 2 teams) | 21 | 8 |
| classes | `remove_student_from_class` / `leave_class` | 10 | 9 |
| classes | `get_class_roster` | 6 in 2 waves | 4 in 1 wave (5 for a student or TA) |
| classes | `get_class_students` / `get_class_projects_overview` | 5 in 2 waves | 3 in 1 wave (4 for a student or TA) |
| classes | `get_class_projects` | 5 in 3 waves | 2 in 1 wave (3 for a student or TA) |
| classes | `get_class_roster_timeline` | 6 sequential | 4 in 1 wave |
| classes | `get_class_turn_in_stats` | 5 sequential | 4 in 2 waves (3 when no team has members) |
| classes | `create_class` (worst case) | 8 | 4 |
| classes | `get_classes_for_user` (student) | 3 | 2 |

## Client request fan-outs removed

| Screen | Before | After |
|---|---|---|
| Student home | `getProjects()` and `getProjects(classId)` three times each, then one join-request list and one TSR list per team | each projects list once, one `incoming-join-requests`, one `my-submissions` |
| Requests modal | four calls plus one join-request list per team | three calls |
| Student Assignments | three sequential calls, then one call per TSR assignment and per feedback assignment | four calls in parallel |
| Instructor home | the full roster of every active class | one `attention-summary` |
| TA Meetings (student) | one sequential attendance request per team | none: `viewer_status` comes with the schedule |
| Final reviews route | three concurrent my-role requests | one, shared for 30 s |

New batch endpoints: `GET /api/assignments/my-submissions?class_id=` (at most 5 queries),
`GET /api/projects/incoming-join-requests?class_id=` (2 queries) and
`GET /api/classes/attention-summary` (1 query, however many classes).

## Errors and status codes

**Database failures are typed.** `app.core.db.get_client()` wraps the Supabase client, so a
request PostgREST rejects, or one that cannot reach the database, raises
`app.core.errors.DatabaseError` with the original exception chained. Our own bugs are never
translated. Because it derives from `HTTPException`, the controllers' existing
`except HTTPException: raise` clauses pass it through unchanged.

| Raised | Status | `code` |
|---|---|---|
| `DatabaseUnavailableError`: timeout, dropped connection, overload | 503 with `Retry-After` | `database_unavailable` |
| `DatabaseConflictError`: a unique key | 409 | `database_conflict` |
| `DatabaseError`: any other rejected request | 500 | `database_read_failed` or `database_write_failed` |
| Any other uncaught exception | 500 | `internal_error` |

**Not found versus not allowed.** A missing resource answers 404 and a denied caller answers
403, with one `detail` per condition from the constants in `app/core/authz.py`. The authz
helpers no longer take status arguments. Commit `3f603ed` lists every endpoint whose status or
text changed.

**Web client.** The UI takes the account's role from `GET /api/profiles/me` instead of sign-up
metadata, and `ApiError` exposes the backend's `code`.

## Bugs fixed along the way

- The Vite `envPrefix` could ship `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` to browsers.
- Six handlers put PostgREST error text in 500 responses; a global handler now logs and answers a fixed body.
- `save_final_review_scores` persisted the entries before an invalid one.
- Demoting a TA flipped the role before clearing their team and review links, so a failure left privileges attached.
- `request_to_join_project` removed the student from their team before rejecting the request, leaving them on no team.
- A scrum master's dashboard marked a deadline done as soon as any teammate submitted.
- `projects.num_members` drifted: removing a non-member decremented it. It is now derived from member rows.
- `assign_user`'s rollback could re-add a student without their role.
- The backend failed to start on hosts without a system time-zone database, and the term week rolled over at 5 pm Pacific on UTC hosts.
- A 422 validation error surfaced in the UI as "[object Object]".
- A roster upload could notify a student who was leaving a team about another student leaving it; only the teammates who stay are notified now.
- Two concurrent invites of the same student could fail the enrollment write; enrollment is now an upsert that leaves existing rows alone.
- Students never saw their instructor's email: the class list sent `instructor_email`, but the UI reads `teacher_email`.
- `queue_invite` and `cancel_invite` turned a dropped connection into a 500 before the retry decorator could see it.
- Inviting a blank address could match a profile whose email was an empty string.
- An account with no role in its sign-up metadata saw the student UI even when its profile role was instructor.
- A failed role lookup counted as "no role", so a database blip answered 403 instead of an error.
- The profile update answered its own 4xx errors as 500s.
- The same "not the class instructor" condition answered 403 on some endpoints and 404 on others, and a missing class sometimes answered 403.

## How this was verified

- Backend: full pytest suite and ruff on every commit; round-trip budgets per function.
- Frontend: `npm run lint`, `npm run build` (type check), `npx vitest run` on every commit.
- Every new PostgREST embed, foreign-key hint and filter shape was run read-only (`limit 1`)
  against the dev project (`jfbagjjvryqcwxsyeyeg`), because the test double cannot prove that
  PostgREST accepts relationship names. Production was not touched.
- Browser, signed out, on the dev server: landing page, the lazily loaded login page, and the
  redirect from `/app/home` to `/login`; no console or server errors.
- The database client adapter ran read-only against dev with real postgrest builders: selects,
  counts, `not_`, `maybe_single`, `single`, embeds with order and range, an RPC, and an unknown
  column and relation.
- Each React hooks lint fix was checked with temporary characterization tests run against the
  old and the new code, then deleted.
- Bundle sizes are from `npm run build` output.

## Not done, and why

- **Signed-in browser pass.** Nothing behind sign-in was exercised in a browser, because that
  needs a real account's credentials. Screens to click through before merging: Home (student
  and instructor), Assignments, Roster, Projects, TA Meetings, Final Reviews, Messages, and a
  create-class or assignment modal (lazy-loaded date picker).
- **Staged migration.** `backend/database/migrations/2026-09-08_perf_indexes_and_lints.sql` is
  not applied (no code depends on it). Apply on dev, then prod, then regenerate `supabase/schema.sql`.
- **Projects page roster call** stays: the membership chart counts unregistered and dropped
  roster rows that the projects overview does not return (the audit called it redundant).
- **Session token cache** in `apiRequest` not added: `supabase.auth.getSession()` reads the
  stored session and refreshes it only when expired, so a second cache would add staleness risk
  for little gain.
- **Behaviour edges found while fixing lint**, filed as separate tasks: after an assignment is
  deleted, the editor's Save and Cancel stay disabled on the next one; a failed seat change on
  Assign or Staffing, or a failed request action in the requests modal, clears its error before
  it shows.
- **Sign-out on a 401.** The backend verifies tokens with no clock leeway and answers 401 when it
  cannot fetch Supabase's signing keys. The web client signs out on a 401, so either edge logs a
  user out. Adding leeway and answering 503 for a key-fetch failure would close both.
- **Follow-ups noticed:** `messages.get_profile_roles` compares user ids as exact strings, so
  an upper-cased id skips the instructor-to-instructor rule; `notify_recipients` makes three
  round trips per recipient; `project_members` has no unique `(project_id, user_id)` constraint;
  incoming join requests match reviewer roles case-insensitively while accept/reject match
  exactly; Vite warns that `__dirname` in `vite.config.ts` will not work with the native config loader. `notifications.notify_team_member_dropped_from_roster` is now unused. The attention summary embeds every enrollment and roster row of an instructor's classes in one response; it was not measured against a very large roster.
- **Status policy edges:** `require_instructor` checks the profile role before any lookup, so a
  non-instructor gets 403 even for a missing class; `leave_class` answers 404 with the same text
  as the 403 "not enrolled" message; the settings `Profile` and `Portfolio` blocks are not
  rendered anywhere.
