# Handoff — codebase refactor branch (2026-09-09)

For the next session (Claude Opus 5 or whoever picks this up). Everything needed to
continue is in the repo; the memory file `refactor-2026-09-08.md` points here.

## TL;DR

- **Where:** worktree `.claude/worktrees/distracted-blackwell-a8357b`, branch
  `claude/refactor-dependencies-performance-453545`, cut from `origin/beta` @ `613e4d1`.
  **No upstream yet** — nothing pushed, no PR. Working tree clean after the last commit.
- **Ask:** "refactor the whole codebase for best practices, extensibility and
  maintainability; dependency upgrades; performance bottlenecks, especially DB-driven ones."
  Maintainer was unavailable; every judgment call is in the spec's Decisions table (D1–D16).
- **Done:** deps (both halves), ruff, dead-code removal, secrets fix, backend core layer,
  test double, one exemplar N+1 rewrite, staged DB migration, docs. 12 commits.
- **Next:** plan Task 7 (per-module perf rewrites, biggest wins first), Task 9 (api split,
  ErrorBoundary, lint), Task 10 (frontend N+1 endpoints + bundle), Task 11 (docs), Task 12
  (push + PR onto `beta`).

## Read in this order

1. `docs/superpowers/specs/2026-09-08-codebase-refactor-design.md` — goals, baseline
   metrics, hot-path table, decisions D1–D16, architecture.
2. `docs/superpowers/plans/2026-09-08-codebase-refactor-plan.md` — Tasks 1–12 with files,
   mechanisms, budgets. Tasks 1–6 and 8 are done (Task 8 = staged only).
3. `docs/superpowers/reports/2026-09-08-audit-{classes,projects-staffing,
   assignments-tas-attendance,frontend}.md` — per-function findings with line numbers
   (pre-format commit `613e4d1`; search by function name in the current tree).
4. `AGENTS.md`, `backend/STYLE_GUIDE.md` — house conventions (both still need the Task 11
   updates for the core layer).

## Commits on the branch (oldest first)

| SHA | Subject | Verified by |
|---|---|---|
| `62b8f80` | chore(deps): pin backend deps, upgrade FastAPI stack | 177 pytest |
| `50b36b0` | chore(deps): frontend → Vite 8, Vitest 5, ESLint 10; audit clean | build + 94 vitest, `npm audit` 0 |
| `32a9450` | chore: remove dead `server.py`, `database/client.py`, `deploy.sh`, `deploy/`; DEPLOY.md rewritten | pytest |
| `1281d48` | style(backend): ruff auto-fixes + format (mechanical) | pytest unchanged |
| `f4a879f` | chore: `.git-blame-ignore-revs` | — |
| `c0c47e6` | docs: spec + plan | — |
| `288e66a` | fix(security): `envPrefix` VITE_ only; `resolveSupabaseEnv`; `.env.example` | vitest + bundle grep (service key absent, anon key present) |
| `f6a63d7` | refactor(backend): `app/core/{db,authz,errors}`, `app/jobs/pending_invites`, FakeSupabase extended | 208 pytest |
| `f71e173` | refactor(backend): all controllers use `get_client()`; tests patch `app.core.db.service_client` | 208 pytest |
| `a88866b` | perf(tas): `save_final_review_scores` validate-then-batch (17 → 6 round trips) | 213 pytest incl. budget tests |
| `89b3e37` | perf(db): staged migration `2026-09-08_perf_indexes_and_lints.sql` (NOT applied) | — |
| (this) | docs: audits + handoff | — |

## Gate status right now

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/python -m pytest -q   # 213 passed
cd frontend && npm run build && npx vitest run                                                       # clean, 94 passed
cd frontend && npm run lint      # 82 errors / 28 warnings — NOT in CI yet (see Task 9c below)
```

CI (`.github/workflows/test.yml`) now runs Node 24, `pip install -r requirements-dev.txt`,
`ruff check`, `ruff format --check`, pytest, build, `lint:design`, vitest. It will be green
on this branch. `npm run lint` is deliberately not in CI until 9c lands.

## What is NOT done yet (in recommended order)

### Task 7 — backend perf rewrites (the core of the "DB-driven bottlenecks" ask)

Pattern to copy: commit `a88866b` + `backend/tests/test_final_review_scores_batching.py`.
Rules: validate in pure code first, then one bulk write; embeds over existing FKs
(`select("id, project_members(user_id, role)")`, hints where a table has several FKs to
the same target: `profiles!project_join_requests_invited_by_fkey(...)`); independent reads
in `query_pool` waves; **never depend on unapplied SQL** (D6); preserve response shapes
(documented in each audit §6) and each endpoint's status codes; add a `fake.executes <= N`
test per rewritten function. Priority by impact:

1. `staffing.auto_assign`, `assign_user`, `unassign_user` (audit projects-staffing §2.1–2)
   — unblock by first slimming `projects.instructor_add_member` to 3 queries (§2.5) and
   making `_increment_project_num_members(-1)` conditional on a deleted row.
2. `classes.bulk_invite_students`, `_remove_dropped_roster_students_from_teams`,
   `get_class_roster_timeline`, `invite_student_to_class`, `_purge_student_from_class`,
   `get_class_turn_in_stats`, `create_class` (audit classes §2) + replace the 10 inline
   instructor checks / 4 owner-or-enrolled blocks with `core.authz` (keep 404 vs 403 per
   call site) + emit `teacher_email` (D9).
3. `projects.get_projects_for_user`, `get_project_members`, `get_project_by_id`,
   `accept_join_request`, `_leave_current_project_in_class` (+ move
   `_notify_product_owners_of_departure` into notifications), the six `assign_*/remove_*`
   role functions — **and delete their six `print()` + `detail=str(e)` leaks** (highest
   severity, smallest diff).
4. `attendance.mark_all_present` / `upsert_attendance` (bulk upsert on
   `attendance_meeting_slot_uniq`), `get_ta_schedule` (dedupe reads, waves, add
   `viewer_status`), `load_project(class_columns=...)` for the duplicate class reads, drop
   the unused `role` params, tz fixes.
5. `assignments.get_assignments_for_class` (waves + `include=my_submissions`),
   `update_tsr_entry` (embed, no re-select, real `project_id` — D10),
   `get_instructor_tsr_overview`, `get_feedback_overview`; replace naive `utcnow()`.
6. `tas.get_final_review_detail` (embed + wave), `set_review_ta` (upsert),
   `get_ta_review_targets` (wave).
7. `messages.has_shared_class` / `list_contacts` waves; convert `messages` and `auth/views`
   off direct `service_client` (update the 25 `patch("app.messages.controller.service_client")`
   sites to `app.core.db.service_client` with sed); `notifications._client()` keeps its
   503 semantics on purpose.

Also worth doing while there: hoist `staffing`'s lazy `app.projects.controller` imports
(no cycle exists); `attendance` imports the private `projects._is_instructor` — switch to
`core.authz.is_class_instructor`; write `tests/test_assignments.py` before touching
assignment authorization (none exists).

### Task 9 — frontend api client, error handling, lint

- 9a: split `lib/api.ts` (1,586 lines, 207 methods) into `lib/api/{client,<domain>}.ts`
  with `lib/api.ts` as a facade (D13). Add `ApiError { status, detail }`, a cached token
  getter, and a 401 → `window.dispatchEvent(new CustomEvent('auth:unauthorized'))` hook.
- 9b: `components/ErrorBoundary.tsx` around `<Router>` and the `AppView` `<Outlet>`;
  `AuthProvider` listens for `auth:unauthorized`.
- 9c: ESLint 10 findings (`npx eslint . -f json` breakdown): 58 `react-hooks/set-state-in-effect`
  (42 files), 11 `react-hooks/refs`, 5 `react-hooks/immutability`, 1
  `react-hooks/preserve-manual-memoization` — all React-Compiler-readiness rules that
  react-hooks 7.1 promoted to errors; the project does not use the compiler. Recommended:
  set those four rules to `warn` in `eslint.config.mjs` with a comment, fix the 8 genuine
  errors (3 `no-unused-vars`: StudentHomeDashboard, AssignmentList, ProjectDetails; 2
  `no-empty` + 1 `refs` + 1 `immutability` in InviteModal; `prefer-const` in
  ContributionsTab; `triple-slash-reference` already removed from vite.config.ts), fix the
  6 `react-refresh/only-export-components` + unused-directive warnings, then add
  `npm run lint` to CI.

### Task 10 — frontend performance

- 10a: wire the new endpoints (`GET /api/projects/incoming-join-requests?class_id=`,
  `getAssignments(classId, {includeMySubmissions})`, `viewer_status` on the TA schedule,
  `GET /api/classes/attention-summary`) — backend side written TDD in Task 7.
- 10b: `features/app/utils/joinRequests.ts` shared by StudentHomeDashboard + RequestsModal.
- 10c: `useEnrollmentRole(classId)` context; load `getProjects()` once per dashboard.
- 10d: memoise the three provider values, `displayDeadlines`, StaffingTable sort, Header
  breadcrumbs; `memo(MessageBubble)`; hoist `new Set()` in `Roster.tsx:321`.
- 10e: drop `react-icons` (5 files; `sidebar.ts` `IconType` → `LucideIcon`), lazy-load
  CreateClassModal/JoinClassModal/assignment modals and the auth pages, vendor split. Vite 8
  uses `build.rolldownOptions.output.codeSplitting` / `advancedChunks`, not rollup's
  `manualChunks` (check `node_modules/vite/dist/node/index.d.ts`). Measure with the
  sourcemap script idea in the audit (before: main chunk 761 kB).

### Task 11 — docs

- `AGENTS.md`: core layer (`get_client`, `core.authz` helpers, global 500 handler),
  `app/jobs`, ruff + gates, Node 24, `requirements-dev.txt`, `lib/api/` layout, the
  "never depend on unapplied SQL" rule, `.env.example`. Remove the stale "No test suite"
  wording if present.
- `backend/STYLE_GUIDE.md`: replace `_client()` / inline instructor-check examples with the
  core helpers; error-handling section → global handler.
- `backend/README.md` (also mentions `memory_supabase.py`/old test names), `frontend/README.md`.
- `supabase/schema.sql` is stale (missing `meetings`, `conversation_participants`,
  `pending_invites`, conversations columns) — regenerate with `npx supabase db dump`
  after the migration is applied, or note it.
- Final report: `docs/superpowers/reports/2026-09-08-refactor-report.md` with before/after.

### Task 12 — push + PR

`git push -u origin claude/refactor-dependencies-performance-453545` then
`gh pr create --base beta` (direct pushes to `main` are blocked by the auto-mode classifier;
the team flow is feature → `beta` → `main`). PR body: summary, before/after table, the
migration checklist (dev first, then prod; verify `final_review_scores_uniq` exists on prod
before deploy — the batched scores write depends on it), rebase note for PR #177
(scrum board: take theirs on `main.py` / `notifications/controller.py`, re-add the scrum
router line, run `ruff format`), and the list of maintainer decisions (D1–D16 + the
react-hooks rule severity choice).

## Things that were verified, and things that were not

Verified: all gates above; bundle no longer contains the service-role key or JWT secret
(checked by value); `npm audit` 0; react-day-picker 10 type-checks with the existing
`DayPicker` props and its CSS classes still exist except `.rdp-weekdays` (override
adjusted). **Not verified in a browser yet:** the date picker's look under v10, the
Settings/Portfolio brand icons, and any page after the dependency bump — run the preview
(`.claude/launch.json` has `frontend`/`backend` entries pinned to this worktree; backend
needs the worktree-root `.env`) and click through Home, Assignments, Roster, Projects, TA
Meetings, Settings before the PR.

## Gotchas learned this session (save yourself an hour)

- The shell's working directory resets between tool calls; **always use absolute paths**
  or `cd /abs/path && …` in every command.
- zsh does not word-split unquoted `$VAR` — use literal lists in `for` loops.
- The auto-mode classifier blocks long commands that mix file writes, installs and git
  operations; split them (Write tool for files, separate Bash calls for install/commit).
- The Write tool refuses to overwrite a file you have not opened with the Read tool.
- `perl -pi` interpolates `${…}` — it ate a JS template expression once; use sed with
  single quotes for JS/TS edits containing `${}`.
- ruff formatting shifted every line number; the audits' numbers are pre-format.
- `FakeSupabase`: embeds raise unless declared in `relations=`; filters on embedded
  columns raise; `maybe_single()` returns `None` for no row; `select()` projects columns
  (`*` = all); `executes`/`queries` for budgets. Tests inject it with
  `monkeypatch.setattr("app.core.db.service_client", fake, raising=False)`.
- PostgREST embeds need FK hints where multiple FKs point at the same table
  (`project_join_requests` → profiles ×3, `TSRs` → profiles ×2, `roster_entries`,
  `classes.created_by`).
- `npm install` may ERESOLVE against the *installed* tree even without a lockfile; a
  clean `rm -rf node_modules package-lock.json && npm install` from the manifest resolves.
- Do not apply migrations (D7 / maintainer's "ask before imperative actions"). Supabase
  MCP **reads** on dev (`jfbagjjvryqcwxsyeyeg`) work and are useful for advisors/policies.

## Open decisions for the maintainer

D1–D16 in the spec, plus: react-hooks compiler-rule severity (9c); whether to rename
`react-day-picker` to its new package name `@daypicker/react` (same API, not done);
whether to drop the unused staffing endpoints (D5 says keep); `num_members` as a DB
trigger (follow-up); shared `Modal` primitive (follow-up); react-query adoption (follow-up).
