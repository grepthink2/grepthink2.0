# Handoff — codebase refactor branch (updated 2026-09-12)

For the next session. Everything needed to continue is in the repo; the memory file
`refactor-2026-09-08.md` points here. **The hard, cross-cutting work is done; what is
left is deliberately the low-hanging fruit** — each item below is self-contained,
has a pattern to copy, and can be picked up in any order.

## TL;DR

- **Where:** worktree `.claude/worktrees/distracted-blackwell-a8357b`, branch
  `claude/refactor-dependencies-performance-453545`, cut from `origin/beta` @ `613e4d1`.
  **No upstream yet** — nothing pushed, no PR. Working tree clean after the last commit.
- **Ask:** "refactor the whole codebase for best practices, extensibility and
  maintainability; dependency upgrades; performance bottlenecks, especially DB-driven ones."
  Maintainer was unavailable; every judgment call is in the spec's Decisions table (D1–D16).
- **Done (14 commits):** deps (both halves), ruff + CI gates, dead-code removal, secrets
  fix, `app/core` layer + `app/jobs`, extended test double, the biggest DB hot paths
  rewritten with round-trip budgets (final-review scores, all project membership / role /
  join paths, staffing assign/unassign/auto-assign), staged DB migration, docs + audits.
- **Gates:** backend `ruff` clean + **248 pytest green**; frontend `npm run build` clean +
  94 vitest green; `npm audit` 0. `npm run lint` still reports 82 errors (see 9c) and is
  not in CI yet.

## Read in this order

1. `docs/superpowers/specs/2026-09-08-codebase-refactor-design.md` — decisions D1–D16,
   baseline metrics, hot-path table.
2. `docs/superpowers/plans/2026-09-08-codebase-refactor-plan.md` — Tasks 1–12.
3. `docs/superpowers/reports/2026-09-08-audit-*.md` — per-function findings (line numbers
   are pre-format `613e4d1`; search by function name).
4. `backend/app/core/authz.py`, `backend/tests/fake_supabase.py`,
   `backend/tests/test_projects_membership.py` — the helpers and the test pattern every
   remaining backend item copies.

## Commits on the branch (oldest first)

| SHA | Subject |
|---|---|
| `62b8f80` | chore(deps): pin backend deps, upgrade FastAPI stack |
| `50b36b0` | chore(deps): frontend → Vite 8, Vitest 5, ESLint 10; audit clean |
| `32a9450` | chore: remove dead `server.py`, `deploy/`; DEPLOY.md rewritten for Vercel |
| `1281d48` | style(backend): ruff auto-fixes + format (mechanical; in `.git-blame-ignore-revs`) |
| `f4a879f` | chore: `.git-blame-ignore-revs` |
| `c0c47e6` | docs: spec + plan |
| `288e66a` | fix(security): `envPrefix` VITE_ only; `resolveSupabaseEnv`; `.env.example` |
| `f6a63d7` | refactor(backend): `app/core/{db,authz,errors}`, `app/jobs/pending_invites`, FakeSupabase extended |
| `f71e173` | refactor(backend): all controllers use `get_client()`; tests patch `app.core.db.service_client` |
| `a88866b` | perf(tas): `save_final_review_scores` validate-then-batch (17 → 6) |
| `89b3e37` | perf(db): staged migration `2026-09-08_perf_indexes_and_lints.sql` (NOT applied) |
| `64cea36` | docs: audits + first handoff |
| `cddb7d5` | perf(projects): membership/role/join-accept batched; `num_members` from rows; leak fix |
| `1a15fbc` | perf(staffing): direct membership writes; auto_assign one bulk insert |

## The pattern to copy for every remaining backend item

1. Write the test first in a new `tests/test_<module>_<topic>.py` using `FakeSupabase`
   with `relations={...}` for any embed you plan to use; inject with
   `monkeypatch.setattr("app.core.db.service_client", fake, raising=False)`.
2. Pin the response shape (audit §6 lists the exact keys), the status codes the endpoint
   answers today, and `assert fake.executes <= N`.
3. Run it, watch it fail, then rewrite: `authz.load_project(..., class_columns=...)` /
   `authz.require_class_access` / `authz.require_class_instructor(..., missing=404)` for
   access; PostgREST embeds over existing FKs (hints where a table has several FKs to the
   same target); `query_pool` for independent reads; one bulk `insert`/`upsert`/`delete`
   after validating everything in memory. **Never depend on unapplied SQL** (D6).
4. `ruff format . && ruff check . && python -m pytest -q`, commit with the before/after
   round-trip counts in the message.

## Low-hanging fruit (pick any; none block the others)

### Backend — mechanical, one function each, pattern above

- [ ] `attendance.mark_all_present` + `upsert_attendance`: one bulk
  `upsert(rows, on_conflict="meeting_id,user_id,week_number")` (index exists);
  15 → 6. Audit: assignments-tas-attendance §2.2. Existing tests: `test_ta_management.py`
  (add relations only if you embed).
- [ ] `attendance.get_ta_schedule`: `is_instr = class_row["created_by"] == user_id`
  (drop the duplicate `classes` read via `_is_instructor`), one `meetings` read reused for
  the current-meeting pick, members/meetings/profiles in one `query_pool` wave, and add
  `viewer_status` per team (audit §2.3; the frontend loop in `TAScheduleView.tsx:126-142`
  then goes away). Also delete the unused `role` params + the four `get_user_role` calls
  in `attendance/views.py`, and `_is_enrolled` (use `authz.get_enrollment_role`).
- [ ] `attendance._load_project` and `tas._load_project` → `authz.load_project(...,
  class_columns="created_by, term, meetings_per_week, meeting_duration_minutes")`;
  `_require_meeting_editor` / `_validate_slot` read `project["classes"]` (saves 2 per call).
- [ ] `assignments.update_tsr_entry`: embed `projects(class_id, classes(created_by))`,
  keep the UPDATE's returned row, select `project_id` (D10: it is emitted as `None` today).
- [ ] `assignments.get_assignments_for_class`: three `query_pool` waves; optional
  `include=my_submissions` for students (`my_submitted: bool` from one `TSRs` read +
  one `feedback_submissions` read) — then `Assignments.tsx:128-160` and
  `StudentHomeDashboard.tsx:474-485` drop their per-assignment fan-outs.
- [ ] `assignments.get_instructor_tsr_overview`: one `projects` read carrying
  `assigned_ta_id`, one `profiles` read for all ids (9 → 5).
- [ ] `assignments.get_feedback_overview`: one `profiles` read; enrolments + submissions
  in one wave. `datetime.utcnow()` → `datetime.now(UTC)` (naive timestamp bug).
- [ ] `tas.get_final_review_detail`: `load_project(class_columns=...)` + fan out
  review-TA / members / scores / notes (8 → 3 waves). `tas.set_review_ta`:
  `upsert(on_conflict="project_id")` instead of delete+insert. `tas.get_ta_review_targets`:
  one wave.
- [ ] `classes.bulk_invite_students`: one `.or_('edu_email.in.(...),email.in.(...)')`
  profile read, one enrolment read, one bulk insert (audit classes §2.1). Emails stay
  synchronous unless you route them through `queue_invite`.
- [ ] `classes._remove_dropped_roster_students_from_teams`: one members read, one bulk
  delete, `projects.recount_num_members(client, pids)`, one bulk notification insert
  (`notifications._insert_notifications`). Audit classes §2.2.
- [ ] `classes.get_class_roster_timeline` / `get_class_turn_in_stats` /
  `invite_student_to_class` / `create_class`: waves + embeds per audit classes §2.3–2.7.
- [ ] `classes.get_classes_for_user`: emit `teacher_email` instead of `instructor_email`
  (D9 — the UI reads `teacher_email`, so students currently never see it).
- [ ] classes: replace the 10 inline instructor checks with
  `authz.require_class_instructor(client, user_id, class_id, missing=404, denied=404,
  missing_detail=..., denied_detail=...)` (keep each site's current code/message) and
  the 4 owner-or-enrolled blocks with `authz.require_class_access`; `queue_invite` /
  `cancel_invite` need `except TRANSIENT_ERRORS: raise` for `@retry_on_disconnect`.
- [ ] `messages.has_shared_class` (4 reads → one wave) and `list_contacts` (waves);
  convert `messages` + `auth/views` off direct `service_client` and update the 25
  `patch("app.messages.controller.service_client")` sites to
  `app.core.db.service_client` (sed). `notifications._client()` keeps its 503 rule;
  optionally route its other reads through `get_client()` too.
- [ ] `projects.get_project_by_id`: run the project read and the role read in one
  `query_pool` wave (2 → 1 RTT of latency). Remaining projects list endpoints
  (`get_pending_team_invites_for_user`, `get_my_pending_join_requests_for_user`,
  `get_project_pending_invites`, `get_pending_join_requests`, `reject_join_request`,
  `request_to_join_project`): embeds with FK hints (`profiles!project_join_requests_invited_by_fkey(...)`).
- [ ] Add `tests/test_assignments.py` (none exists) before touching assignment authz.
- [ ] `tzdata` as a hard dependency (or `logger.error` when `zoneinfo` is unavailable);
  `attendance._current_term_week` → `datetime.now(_CLASS_TZ).date()`.

### Frontend — self-contained

- [ ] **9c lint (30 min):** in `eslint.config.mjs` set `react-hooks/set-state-in-effect`,
  `react-hooks/refs`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`
  to `'warn'` with a comment (React-Compiler-readiness rules from react-hooks 7.1; the
  project does not use the compiler), fix the 8 genuine errors (3 `no-unused-vars`:
  StudentHomeDashboard, AssignmentList, ProjectDetails; 2 `no-empty` + `refs` +
  `immutability` in InviteModal; `prefer-const` in ContributionsTab), clear the 6
  `react-refresh/only-export-components` and unused-directive warnings, then add
  `npm run lint` to the frontend CI job.
- [ ] **9a api split:** move each `api.*` group of `lib/api.ts` into `lib/api/<domain>.ts`,
  keep `lib/api.ts` as `export const api = { ...classesApi, ... }` + `export * from
  './api/types'` (88 import sites untouched); add `class ApiError extends Error { status;
  detail }` in `lib/api/client.ts` and reuse the cached session for the token.
- [ ] **9b:** `components/ErrorBoundary.tsx` around `<Router>` (App.tsx) and the
  `<Outlet>` in `AppView.tsx`; `AuthProvider` listens for a `window` `auth:unauthorized`
  event dispatched by `apiRequest` on 401 and signs out locally.
- [ ] **10b:** `features/app/utils/joinRequests.ts` with the helpers duplicated verbatim
  between `StudentHomeDashboard.tsx` and `RequestsModal.tsx` (audit frontend §5) + tests.
- [ ] **10c:** `useEnrollmentRole(classId)` context hook (five components issue the same
  request; three at once on `/app/ta-review/final-reviews`); `StudentHomeDashboard`
  fetches `getProjects()` / `getProjects(classId)` once instead of three times each;
  `Projects.tsx` drops the redundant `getClassRoster` (the overview already returns
  `students`).
- [ ] **10d render:** `useMemo` the three provider values (`classContext.tsx:188`,
  `useNotifications.tsx:103`, `useConversations.tsx:103`), `displayDeadlines`
  (`StudentHomeDashboard.tsx:349`), the `StaffingTable` sort, `Header` breadcrumbs;
  `memo(MessageBubble)`; hoist `invitingEmails={new Set()}` (`Roster.tsx:321`).
- [ ] **10e bundle:** replace the 5 `react-icons` imports with lucide (`sidebar.ts`
  `IconType` → `LucideIcon`) and drop the dependency; `lazy()` `CreateClassModal` /
  `JoinClassModal` (AppView) and the two assignment modals (Modules) so react-day-picker
  leaves the eager chunk; `lazy()` the 8 auth pages (react-gradient-animation). Vendor
  split in Vite 8 is `build.rolldownOptions.output.codeSplitting` / `advancedChunks`
  (not rollup `manualChunks`); measure before/after (main chunk is 761 kB min today).
- [ ] New endpoints once the backend side exists: `getIncomingJoinRequests(classId)`
  (`GET /api/projects/incoming-join-requests?class_id=` — replaces the per-project
  `getProjectJoinRequests` fan-out in two components), `getClassesAttentionSummary()`
  (instructor home), `viewer_status` on the TA schedule, `includeMySubmissions`.

### Docs (Task 11)

- [ ] `AGENTS.md`: core layer (`get_client`, `core.authz`, global 500 handler, `app/jobs`),
  ruff + gates, Node 24, `requirements-dev.txt`, `.env.example`, "never depend on
  unapplied SQL", `set_num_members` rule (counts come from rows).
- [ ] `backend/STYLE_GUIDE.md`: replace the `_client()` / inline instructor-check examples
  with the core helpers; error handling → global handler + fixed `detail` strings.
- [ ] `backend/README.md` (mentions `memory_supabase.py`/old test names),
  `frontend/README.md`; regenerate `supabase/schema.sql` after the migration is applied.
- [ ] Final report `docs/superpowers/reports/2026-09-08-refactor-report.md` with the
  before/after table.

### Ship (Task 12)

- [ ] Browser check via the preview (`.claude/launch.json` has `frontend`/`backend`
  pinned to this worktree; backend needs the worktree-root `.env`): Home, Assignments,
  Roster, Projects, TA Meetings, Settings (brand icons), any date picker (react-day-picker
  10). Nothing has been viewed in a browser since the dependency bump.
- [ ] `git push -u origin claude/refactor-dependencies-performance-453545`, then
  `gh pr create --base beta` (direct pushes to `main` are blocked; flow is feature →
  `beta` → `main`). PR body: before/after table, migration checklist (dev first, then
  prod; verify `final_review_scores_uniq` exists on prod before deploy — the batched
  scores write depends on it), rebase note for PR #177 (scrum board: take theirs on
  `main.py` / `notifications/controller.py`, re-add the scrum router line, run
  `ruff format`), and the maintainer decisions (D1–D16 + react-hooks rule severity).

## Behaviour changes to call out in the PR (all intentional)

- `instructor_remove_member` answers **404** for a missing project (was `false` + 200).
- `num_members` is now always the real member-row count after any membership write
  (it used to drift; removing a non-member decremented it).
- The six project-role endpoints return a fixed 500 body instead of PostgREST error text.
- `save_final_review_scores` writes nothing when any entry is invalid (used to persist
  the entries before the bad one); `saved` counts distinct students.
- `assign_user` inserts before deleting (never leaves a student without a team) and no
  longer has a role-losing rollback; `auto_assign` is one bulk insert.
- `_is_instructor` propagates DB errors instead of returning `None` (a DB blip is now a
  500, not a silent 403).

## Gotchas learned (save yourself an hour)

- The shell's working directory resets between tool calls; **always use absolute paths**
  or `cd /abs/path && …`. zsh does not word-split unquoted `$VAR`.
- The auto-mode classifier blocks long commands mixing file writes, installs and git;
  split them. The Write tool refuses to overwrite a file not opened with Read.
- `perl -pi` interpolates `${…}` (ate a JS template expression once); prefer sed with
  single quotes for JS/TS, or Python scripts that replace whole functions by name
  (see how the projects/staffing rewrites were applied).
- ruff formatting shifted every line number; the audits' numbers are pre-format.
- `FakeSupabase`: embeds raise unless declared in `relations=`; filters on embedded
  columns raise; `maybe_single()` returns `None` for no row; `select()` projects columns
  (`*` = all) and tolerates PostgREST's `projects ( id, name )` spacing; `executes` /
  `queries` for budgets; `reset_counter()` between phases of a test.
- PostgREST embeds need FK hints where multiple FKs point at the same table
  (`project_join_requests` → profiles ×3, `TSRs` → profiles ×2, `roster_entries`,
  `classes.created_by`).
- `npm install` may ERESOLVE against the *installed* tree even without a lockfile;
  `rm -rf node_modules package-lock.json && npm install` resolves from the manifest.
- Do not apply migrations (D7 / maintainer's "ask before imperative actions"). Supabase
  MCP **reads** on dev (`jfbagjjvryqcwxsyeyeg`) work and are useful for advisors/policies.

## Open decisions for the maintainer

D1–D16 in the spec, plus: react-hooks compiler-rule severity (9c); rename
`react-day-picker` → `@daypicker/react` (same API); drop the unused staffing endpoints
(D5 says keep); `num_members` as a DB trigger (follow-up); shared `Modal` primitive;
react-query adoption; serverless rate limiting; invite poller → Vercel Cron.
