# Codebase Refactor: Best Practices, Dependency Upgrades, DB-Driven Performance — Design Spec

**Date:** 2026-09-08
**Branch:** `claude/refactor-dependencies-performance-453545` (cut from `origin/beta` @ `613e4d1`)
**Status:** Executed autonomously. The maintainer asked for "a worktree of the latest branch,
refactor the whole codebase for best practices, extensibility and maintainability, dependency
upgrades, and performance bottlenecks especially for data-driven segments from the DB" and was
not available for clarifying questions. Every judgment call is recorded in the Decisions table
so it can be reversed cheaply.

## Goals

1. **Dependency upgrades**, reproducibly pinned, on both halves of the monorepo.
2. **Best practices / maintainability / extensibility**: consistent tooling (formatter + linter +
   CI gates), shared cross-cutting helpers instead of copy-paste, dead code removed, contracts
   documented, secrets kept out of the client bundle.
3. **Performance**, with the emphasis on the request paths that fan out into many Supabase
   round trips (PostgREST over HTTP — every `.execute()` is a network call) and on the database
   itself (missing indexes, duplicate indexes, RLS initplan re-evaluation).

## Non-goals (explicitly out of scope)

- Product behaviour changes. Response shapes are preserved; the two exceptions are documented
  bug fixes (see Decisions D9, D10).
- Applying database migrations. Nothing in this branch is applied to the dev or prod Supabase
  projects; SQL is staged under `backend/database/migrations/` for the maintainer (the repo's
  standing rule: staged SQL is not applied by merging).
- Moving authorization from Python into RLS policies. The service-role + Python-authz model is
  kept; helpers are unified, semantics unchanged.
- Adopting a client data-fetching library (react-query/swr). Consolidation is done with the
  existing Context pattern plus new backend endpoints that remove per-item fan-outs.
- Replacing the twelve hand-rolled modal shells with one primitive (visual-regression risk;
  recorded as follow-up).
- TypeScript 6/7 (typescript-eslint 8.x pins `typescript <6.1`; TS 7 is the native compiler).
- Serverless-safe rate limiting and a cron replacement for the in-process invite poller (infra
  work; recorded as follow-up).

## Baseline (measured 2026-09-08 on `613e4d1`)

| Area | Measurement |
|---|---|
| Backend | 13,980 LOC in `backend/app`, 2,853 LOC tests, **177 tests green**; five controllers over 1,000 lines (classes 2,243; projects 1,989; staffing 1,319; assignments 1,103; tas 1,051) |
| Backend deps | `requirements.txt` fully unpinned; fastapi 0.137.1 / starlette 1.3.1 / uvicorn 0.49 installed |
| Backend lint | no linter configured; ruff census 942 findings (528 line-length, 158 pre-3.10 `Optional[]`, 100 `raise` without `from`, 61 import order, 14 late imports, 5 unused imports); 83 of 104 files not formatter-clean |
| Backend patterns | 48 copies of `service_client if service_client else supabase`; 6 `_client()` helpers; 5 distinct "is class instructor" implementations returning 403/404/`None`; 360 `HTTPException` sites, 107 of them 500s; 6 `print()` + 6 handlers leaking `str(e)` into the response body |
| Frontend | 32,159 LOC ts/tsx + 23,224 LOC scss, 345 files, **94 vitest green**, `tsc -b && vite build` clean |
| Frontend deps | 12 `npm audit` findings (10 high: react-router open-redirect/XSS, undici, ws); `vite` aliased to `rolldown-vite@7.2.5`; vitest 3, eslint 9, jsdom 29 |
| Frontend lint | `npm run lint` fails: 14 errors, 28 warnings; not run in CI |
| Frontend bundle | main chunk 761 kB min / 218 kB gzip: react-dom 175, app code 145, supabase 148, date-fns 46, react-day-picker 39 (eager, for a closed-by-default modal), react-router 39, react-icons 10 (11 barrels for ~14 glyphs); `React.memo` used once in the codebase; no `ErrorBoundary` |
| API client | `lib/api.ts` 1,586 lines / 207 methods, hand-maintained; fetch wrapper discards HTTP status, no abort, no 401 handling; `supabase.auth.getSession()` awaited per request |
| DB (dev advisor) | 32 unindexed foreign keys (incl. `project_members.project_id/user_id`, `project_join_requests.*`, `TSRs.*`, `roster_entries.*`, `assignments.class_id`), 2 duplicate index pairs on `class_enrollments`, redundant `idx_profiles_id`, 11 RLS policies re-evaluating `auth.uid()` per row, 13 functions with mutable `search_path`; `project_members`: 1,319 seq scans / 0 index scans |
| Schema-as-code | `supabase/schema.sql` last regenerated 2026-07-27; missing `meetings`, `conversation_participants`, `pending_invites`, and the group-messaging columns on `conversations` |
| Secrets | `vite.config.ts` exposes every `SUPABASE_*` env var to the client bundle (`envPrefix`), so a build env containing `SUPABASE_SERVICE_ROLE_KEY` ships it to browsers |

### Hot paths (round trips per request today → target)

| Endpoint / function | Today | Target | Mechanism |
|---|---|---|---|
| `staffing.auto_assign` (60 placements) | ~486 sequential | ~8 | bulk insert + one recount |
| `classes.bulk_invite_students` (100 emails) | ~400 + 100 SMTP | 4 + emails via queue | `.in_()` profile lookup, bulk enrol insert |
| `classes._remove_dropped_roster_students_from_teams` (30 drops) | 90–270 | ~6 | one members read, one bulk delete, one bulk notify |
| `staffing.assign_user` | ~18 | ~5 | direct membership delete/insert, single recount |
| `staffing.submit_form` | ~20 | ~9 | `.in_()` project validation, return local payload |
| `projects.accept_join_request` | 13–17 | ~5 | embedded request→project→class read |
| `tas.save_final_review_scores` (6 members) | ~15 | 6 | validate first, one `upsert` + one `delete` (unique key exists) |
| `attendance.mark_all_present` (6 members) | ~15 | 6 | one bulk `upsert` on `(meeting_id,user_id,week_number)` |
| `attendance.get_ta_schedule` | 11 serial | 8 in 4 waves | drop duplicate class/meetings reads, `query_pool` fan-out |
| `projects.instructor_add_member` | 8 | 3 | embedded `projects→classes` read, one members read |
| `assignments.get_assignments_for_class` (instructor) | 8 serial | 8 in 3 waves | `query_pool` |
| `projects.get_projects_for_user` | 5 serial | 2 | embedded `project_members` |
| `classes.get_class_roster_timeline` | 6 serial | 2 waves | `query_pool` + embeds |
| `projects.get_project_members` | 3 | 1 | embedded `profiles` |
| Student `/app/home` (client) | ~14 requests, 6 duplicates | ~8 | shared project data, one join-request endpoint |
| `TAScheduleView` per-team attendance (client) | N sequential requests | 1 | viewer status returned inline by the schedule endpoint |

## Decisions (maintainer unavailable — these are the assumptions)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Python formatter/linter | **ruff** (`pyproject.toml`), ruff defaults incl. double quotes, one **isolated mechanical commit** listed in `.git-blame-ignore-revs`; CI runs `ruff check` + `ruff format --check` | Zero-config for future contributors; blame stays useful; the commit is skippable in review |
| D2 | Node baseline | **Node 24** in CI + `engines.node >= 22.12` | vitest 5 / jsdom 30 / jest-dom 7 require ≥ 22.12; Node 20 is EOL |
| D3 | Vite | **`vite@8`** replaces the `rolldown-vite@7.2.5` alias | Vite 8 is the rolldown-based GA line; `@vitejs/plugin-react@6` targets it |
| D4 | Dead code | **Remove** `backend/server.py` (dead, insecure monolith duplicating live routes), `backend/database/client.py` (only importer was server.py), `deploy.sh`, `deploy/` (scrapped VM2 path); **rewrite** `DEPLOY.md` for the Vercel reality; keep Docker files | Recorded maintainer direction (2026-06-30) that never landed; each removal is its own revertable commit |
| D5 | Unused-but-routed endpoints (`staffing.submit_interest`, `pref_by_student`, `pref_by_project`, `get_project_availability`, `assignments.get_tsr_responses_about_user`, `tas.list_project_review_tas`) | **Keep**; no behavioural edits beyond the mechanical passes | The instructor interest-form views are a known unexposed feature, not abandoned code |
| D6 | New DB objects (RPCs, triggers) in code paths | **None.** All query batching uses PostgREST features that work on the current schema (`.in_()`, embedded selects over existing FKs, bulk `insert`/`upsert` on existing unique keys) | Migrations are not applied by merging; code must not depend on unapplied SQL |
| D7 | DB migration | One staged file: missing FK indexes on tables the app filters by, drop the 2 duplicate + 1 redundant index, `(select auth.uid())` in the 11 RLS policies, `SET search_path` on the 13 functions. Scrum-board tables (PR #177) excluded | Advisor-backed; safe to apply any time, independent of code |
| D8 | HTTP status codes for "not the instructor" (403 vs 404 per module) | **Preserve per endpoint** via a shared helper with explicit `missing=`/`denied=` arguments | No client or test behaviour change; unification is a one-line change later |
| D9 | `get_classes` student path emits `instructor_email`, frontend reads `teacher_email` | Emit **`teacher_email`** | Bug: students never saw the instructor's email |
| D10 | `update_tsr_entry` returns `project_id: null` | Return the real `project_id` (select it) | Bug: same serializer, inconsistent shape |
| D11 | Error responses | Global `Exception` handler → `{"detail": "Internal server error"}` + `logger.exception` with method/path/user; remove the 6 `detail=str(e)` leaks; keep per-function handlers where they add ids to logs | Stops leaking PostgREST/SQL text to browsers; one place to add request ids later |
| D12 | Invite poller (`main._process_pending_invites`) | Move to `app/jobs/pending_invites.py`; interval configurable (`PENDING_INVITES_POLL_SECONDS`, default unchanged at 5) | main.py becomes app wiring only; serverless caveat documented |
| D13 | `api.ts` | Split into `lib/api/` domain modules; `lib/api.ts` re-exports the merged `api` object and every type, so the 88 import sites are untouched | Mechanical, zero-risk, reviewable per domain |
| D14 | Secrets in bundle | `envPrefix: ['VITE_']` only; client reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (fallback `VITE_SUPABASE_KEY`) | Root `.env` already defines both; removes the leak |
| D15 | react-icons | Remove the dependency (5 files → lucide-react); the two brand marks lucide 1.x dropped (`Linkedin`, `Github`) become local inline SVG components | One icon system; fewer eager barrels |
| D16 | Format churn vs. open PR #177 | Accept; document the rebase recipe in the PR | Mechanical conflicts resolve by re-running `ruff format` |

## Architecture

### Backend

```
backend/app/
  core/                      # NEW cross-cutting layer (no FastAPI routes)
    db.py                    # get_client(): service role, else anon; query_pool + retry re-exported
    authz.py                 # load_class / is_class_instructor / require_class_instructor(missing=, denied=)
                             # get_enrollment_role / require_class_access / load_project(with class embed)
                             # require_project_role — replaces 5 instructor checks, 3 enrollment checks,
                             # 2 _load_project copies, 4 inline "owner-or-enrolled" blocks
    errors.py                # install_exception_handlers(app); ApiError helpers
  jobs/pending_invites.py    # the poller, moved out of main.py
  main.py                    # wiring only: middleware, handlers, routers, lifespan
  <feature>/{url,views,controller,models}.py   # unchanged layout
backend/database/migrations/2026-09-08_perf_indexes_and_lints.sql   # staged, not applied
```

Controllers keep their public function names and return shapes. Query batching rules:

- Independent reads go through `query_pool` in waves (already the house pattern in classes/staffing).
- Related rows come back in one call via PostgREST embeds over existing FKs, disambiguated with
  `!<fk_name>` where a table has several FKs to the same target (`project_join_requests`,
  `TSRs`, `roster_entries`).
- Per-row writes become one bulk `insert`/`upsert`/`delete` with `.in_()`; validation happens
  before the first write so a bad row can no longer leave a partial result.
- The `num_members` counter keeps its current semantics but the decrement becomes conditional
  on a row actually being deleted (fixes the drift bug); a trigger-based replacement is staged
  as a recommendation, not code.

### Frontend

```
frontend/src/
  lib/api/                   # NEW: client.ts (apiRequest/apiUpload/ApiError with status) + one module per domain
  lib/api.ts                 # re-exports `api` + types (unchanged import surface)
  components/ErrorBoundary.tsx        # NEW; wraps the app shell and the route outlet
  components/icons/BrandIcons.tsx     # NEW; LinkedinIcon, GithubIcon
  features/app/hooks/useEnrollmentRole.ts   # NEW: one request per class, shared by 5 consumers
  features/app/utils/joinRequests.ts        # NEW: helpers shared by StudentHomeDashboard + RequestsModal
  vite.config.ts             # envPrefix fix, vendor manualChunks, lazy-loaded modals/auth pages
```

New backend endpoints that remove client-side fan-outs (all additive):

| Endpoint | Replaces |
|---|---|
| `GET /api/projects/incoming-join-requests?class_id=` | per-project `getProjectJoinRequests` fan-out in two components |
| `GET /api/classes/{id}/assignments?include=my_submissions` (`my_submitted` flag per assignment) | per-assignment `getMyAssignmentTsrs` / `getMyFeedback` fan-outs |
| `viewer_status` on `get_ta_schedule` teams | per-team `getTeamAttendance` loop |
| `GET /api/classes/attention-summary` | per-class full-roster download on the instructor home |

### Data flow / error handling

- Backend: dependency layer unchanged (`require_user` / `require_instructor`); unexpected
  exceptions reach one handler that logs with context and returns a fixed 500 body; transient
  httpx disconnects propagate to `@retry_on_disconnect` because the shared helper re-raises them.
- Frontend: `ApiError` carries `status`; a 401 dispatches `auth:unauthorized` so the shell can
  send the user to `/login`; `ErrorBoundary` renders a recoverable panel instead of a blank page.

## Testing

- Backend gate: `.venv/bin/python -m pytest` (177 existing + new). New tests use a
  recording fake client (`tests/fake_supabase.py`, extended with `.upsert`, `.limit`, `.or_`,
  `.is_`, embedded-select emulation for one-level embeds, and an execute counter) so each
  rewritten hot path asserts **both** the preserved response shape **and** an upper bound on
  round trips (`assert fake.executes <= N`) — the regression guard for the N+1 fixes.
- Frontend gate: `npm run build && npm run lint && npx vitest run`; new unit tests for the
  shared join-request helpers, `ApiError`, `useEnrollmentRole`, and `ErrorBoundary`.
- Preview verification of the running app against the dev database for the changed screens.

## Rollout

- One PR onto `beta`, commits in this order: backend deps → frontend deps → ruff mechanical →
  secrets fix → backend core + dead-code removal → backend perf (per module) → DB migration
  (staged) → frontend api split + error boundary + lint → frontend perf → docs.
- Migration checklist for the maintainer: apply `2026-09-08_perf_indexes_and_lints.sql` to dev,
  re-run the performance advisor, then apply to prod at deploy time; regenerate
  `supabase/schema.sql` (`npx supabase db dump`).
- Rebase note for PR #177: take the incoming side for `main.py` / `notifications/controller.py`
  conflicts, re-add the scrum router line, run `ruff format`.

## Follow-ups recorded, not done

Shared `Modal` primitive; react-query adoption; `num_members` as a DB trigger; serverless rate
limiting (shared store + `X-Forwarded-For`); invite poller → Vercel Cron; `tzdata` hard
dependency for `zoneinfo`; `test_assignments.py` coverage for the authorization matrix;
`Assign`/`Staffing` write fan-outs as batch endpoints; virtualized roster table.
