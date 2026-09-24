# Codebase Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the design in `docs/superpowers/specs/2026-09-08-codebase-refactor-design.md`: pinned/upgraded dependencies, a shared backend core, N+1 removal on the DB-driven paths, a staged index migration, a split API client with error handling, and CI gates that keep it that way.

**Architecture:** Backend keeps the `url/views/controller/models` module layout; cross-cutting helpers move to `app/core/` and background work to `app/jobs/`. Controllers preserve their public names and response shapes; query batching uses only PostgREST features available on the current schema (`.in_()`, FK embeds, bulk `insert/upsert/delete`, `query_pool` waves). Frontend keeps Context state; `lib/api.ts` becomes a facade over `lib/api/` domain modules; new backend endpoints replace client-side per-item fan-outs.

**Tech Stack:** Python 3.11+/FastAPI 0.141/supabase-py 2.31/pytest 9/ruff 0.16; React 19/TypeScript 5.9/Vite 8/Vitest 5/ESLint 10; Supabase Postgres.

**Gates (run from the named directory):**
- backend: `cd backend && .venv/bin/python -m pytest -q` and `.venv/bin/ruff check . && .venv/bin/ruff format --check .`
- frontend: `cd frontend && npm run build && npm run lint && npx vitest run`

**Conventions:** one commit per task (or sub-task), message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; never depend on unapplied SQL; response shapes unchanged unless the task says otherwise.

---

## Task 1: Backend dependencies — DONE (`62b8f80`)

Pinned `requirements.txt`, added `requirements-dev.txt` (pytest, httpx2, ruff), `pyproject.toml` (pytest + ruff config), CI installs the dev file. 177 tests green.

## Task 2: Frontend dependencies

**Files:** `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/components/icons/BrandIcons.tsx` (new), `frontend/src/features/app/pages/Settings.tsx`, `frontend/src/features/app/components/Settings/Blocks/Portfolio.tsx`, `frontend/src/features/app/components/Fields/DatePickerField.tsx`, `frontend/src/features/app/components/Fields/DatePickerField.scss`, `.github/workflows/test.yml`, `.nvmrc` (new)

- [ ] Replace the `vite: npm:rolldown-vite@7.2.5` alias/override with `vite@^8.2.2`; bump `@vitejs/plugin-react@^6`, `vitest@^5`, `@vitest/coverage-v8@^5`, `jsdom@^30`, `@testing-library/jest-dom@^7`, `eslint@^10`, `@eslint/js@^10`, `globals@^17`, `typescript-eslint@^8.70`, `eslint-plugin-react-hooks@^7.1`, `eslint-plugin-react-refresh@^0.5`, `sass@^1.104`, `@types/*` minors; runtime: `react@^19.2.8`, `react-router-dom@^7.18.3` (fixes the audit findings), `@supabase/supabase-js@^2.116`, `lucide-react@^1.43`, `react-day-picker@^10`, `recharts@^3.10`, `date-fns@^4.4`. Keep `typescript ~5.9.3` (typescript-eslint peer range).
- [ ] `engines.node >= 22.12.0`; `.nvmrc` = `24`; CI `node-version: 24`.
- [ ] lucide 1.x dropped `Linkedin`/`Github`: add `BrandIcons.tsx` (`LinkedinIcon`, `GithubIcon`, lucide-compatible props) and swap the two import sites.
- [ ] react-day-picker 10: stylesheet moved to `react-day-picker/style.css`; `.rdp-weekdays` wrapper class gone → override `.rdp-weekday` directly.
- [ ] Verify: `npm audit` reports 0 vulnerabilities; `npm run build`; `npx vitest run` (94 tests); `npm run lint` runs under ESLint 10 (errors fixed in Task 9c).
- [ ] Commit: `chore(deps): upgrade frontend to Vite 8, Vitest 5, ESLint 10; fix audit findings`.

## Task 3: Ruff mechanical pass + CI lint gates

**Files:** every `backend/app/**/*.py` and `backend/tests/**/*.py`, `backend/app/main.py` (imports hoisted), `.git-blame-ignore-revs` (new), `.github/workflows/test.yml`

- [ ] `cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .` (auto-fixes: import order, `Optional[X]`→`X | None`, unused imports, whitespace).
- [ ] Hand-fix what `--fix` leaves: hoist the router imports in `main.py` above the app object (E402); `SIM103`/`SIM105` simplifications only where they don't change behaviour.
- [ ] Run `pytest` — must still be 177 green (formatting cannot change behaviour; if a test fails, the fix was not mechanical — revert that hunk).
- [ ] Commit `style(backend): apply ruff format + auto-fixes (mechanical)`; write its SHA into `.git-blame-ignore-revs` in a second tiny commit.
- [ ] CI: add `ruff check .` and `ruff format --check .` steps to the backend job.

## Task 4: Secrets out of the client bundle

**Files:** `frontend/vite.config.ts`, `frontend/src/lib/supabaseClient.ts`, `frontend/src/test/setup.ts`, `.env.example` (new, repo root)

- [ ] Test first (`frontend/src/lib/__tests__/supabaseEnv.test.ts`): assert `resolveSupabaseEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'k' })` → `{url:'u', anonKey:'k'}` and that a `SUPABASE_SERVICE_ROLE_KEY` key is never read (the resolver only looks at `VITE_` names). Extract `resolveSupabaseEnv(env)` from `supabaseClient.ts` so it is testable.
- [ ] `envPrefix: ['VITE_']` only. Client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (fallback `VITE_SUPABASE_KEY`). Remove the `import.meta.env.SUPABASE_*` fallbacks.
- [ ] `.env.example` documents every variable both halves read (backend: `SUPABASE_URL/KEY/SERVICE_ROLE_KEY/JWT_SECRET/JWK_JSON`, `CORS_ORIGINS`, `FRONTEND_URL`, SMTP; frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`).
- [ ] Verify with a production build: `grep -l "service_role" dist/assets/*.js` returns nothing even when the root `.env` contains the service key.
- [ ] Commit `fix(security): stop exposing SUPABASE_* env vars to the client bundle`.

## Task 5: Backend core layer + dead code removal

**Files (new):** `backend/app/core/__init__.py`, `backend/app/core/db.py`, `backend/app/core/authz.py`, `backend/app/core/errors.py`, `backend/app/jobs/__init__.py`, `backend/app/jobs/pending_invites.py`, `backend/tests/test_core_authz.py`, `backend/tests/test_core_errors.py`
**Files (modified):** `backend/app/main.py`, `backend/app/config.py` (`PENDING_INVITES_POLL_SECONDS`), every controller's `_client()` / `service_client if service_client else supabase` site (mechanical replacement with `get_client()`)
**Files (deleted):** `backend/server.py`, `backend/database/client.py`, `backend/database/__init__.py`, `deploy.sh`, `deploy/` ; **rewritten:** `DEPLOY.md`

`core/db.py`:
```python
"""Single place to obtain the Supabase client and the query fan-out pool."""
from app.database.client import (  # re-exported so feature modules import one thing
    _TRANSIENT_HTTPX_ERRORS as TRANSIENT_ERRORS,
    query_pool,
    retry_on_disconnect,
    service_client,
    supabase,
)

def get_client():
    """Service-role client when configured (bypasses RLS), else the anon client."""
    return service_client if service_client is not None else supabase
```

`core/authz.py` (semantics preserved; status codes are parameters):
```python
def load_class(client, class_id, columns="id, created_by") -> dict | None
def is_class_instructor(client, user_id, class_id) -> bool          # never returns None
def require_class_instructor(client, user_id, class_id, *, missing=404, denied=403,
                             missing_detail=..., denied_detail=...) -> dict   # returns the row
def get_enrollment_role(client, class_id, user_id) -> str | None      # 'student' | 'ta' | None
def require_class_access(client, user_id, class_id, *, status=403, detail=...) -> dict
    # instructor OR enrolled; returns {"class": row, "is_instructor": bool, "enrollment_role": ...}
def load_project(client, project_id, *, columns=..., with_class=False) -> dict   # 404 if missing
def project_role(client, project_id, user_id) -> str | None
def require_project_role(client, project_id, user_id, allowed: tuple[str, ...], *, detail=...) -> str
```

`core/errors.py`: `install_exception_handlers(app)` registering an `Exception` handler that logs `method path user_agent` with `logger.exception` and returns `JSONResponse(500, {"detail": "Internal server error"})`; `HTTPException` untouched.

- [ ] Tests first (`test_core_authz.py` with `FakeSupabase`): instructor → True; non-instructor → False; missing class → `missing` status; `require_class_access` for owner, enrolled student, TA, stranger.
- [ ] Tests (`test_core_errors.py`): a route that raises `RuntimeError` returns 500 with the fixed body and no exception text.
- [ ] Implement; move the poller to `app/jobs/pending_invites.py` (`run_forever(interval)`), wire in `main.py` lifespan; `main.py` becomes wiring only.
- [ ] Replace the 48 client-selection idioms with `get_client()` (sed + review); delete the per-module `_client()` helpers where they only did this.
- [ ] Delete the dead files; rewrite `DEPLOY.md` (Vercel projects, env vars, migration checklist, Docker fallback); update `README.md` link text.
- [ ] Gates green; commit in three parts: `refactor(backend): add app.core (db, authz, errors) and app.jobs`, `refactor(backend): route client selection through core.db.get_client`, `chore: remove dead server.py/deploy scripts; rewrite DEPLOY.md for Vercel`.

## Task 6: Test harness for round-trip budgets

**Files:** `backend/tests/fake_supabase.py`, `backend/tests/test_fake_supabase.py` (new), `backend/tests/conftest.py` (remove the dead `mem` fixture)

- [ ] Extend `FakeSupabase`: `.upsert(rows, on_conflict=...)`, `.limit(n)`, `.single()/.maybe_single()`, `.or_(expr)` for `col.eq.v` / `col.in.(a,b)` disjunctions, `.is_(col, 'null')`, `.not_.is_`, `.order(col, desc=)`, `.rpc(name, params)` (registry of callables), `count='exact'`, **embedded selects**: `FakeSupabase(relations={("projects","project_members"): ("id","project_id"), ...})` so `select("id, project_members(user_id, role)")` nests child rows; `select("..., classes(created_by)")` for parent embeds; `executes` counter and `queries` log.
- [ ] Tests for each builder method plus one embed each way.
- [ ] Commit `test(backend): extend FakeSupabase with upsert/embeds/rpc and a round-trip counter`.

## Task 7: Backend performance (one commit per sub-task; each guarded by a shape test + `assert fake.executes <= N`)

### 7a `app/classes/controller.py`
- [ ] `bulk_invite_students`: one `.or_('edu_email.in.(...),email.in.(...)')` profile read, one enrolment read, one bulk insert; per-email results unchanged. Budget: 4 + email sends.
- [ ] `_remove_dropped_roster_students_from_teams`: one members read, one bulk delete, decrement per affected project (conditional), one bulk notifications insert. Budget: ≤ 6.
- [ ] `invite_student_to_class`: class+instructor in one embed (`profiles!classes_created_by_fkey`), single profile lookup via `.or_`, insert guarded by the unique key. Budget: 3.
- [ ] `get_class_roster_timeline`: two `query_pool` waves; shape unchanged (8 keys). Budget: 6 queries / 2 waves.
- [ ] `get_class_turn_in_stats`: wave 1 (class, assignments, projects+members embed), wave 2 TSRs; skip the TSR query when there are no teams. 
- [ ] `get_classes_for_user`: emit `teacher_email` (D9), fold the enrolled-count read into the wave.
- [ ] `_purge_student_from_class`: delete returns the affected rows; conditional decrements; two independent deletes in one wave.
- [ ] `create_class`: check five candidate codes with one `.in_()`.
- [ ] Replace the 10 inline instructor checks with `require_class_instructor` (status codes preserved per call site) and the 4 owner-or-enrolled blocks with `require_class_access`; `queue_invite`/`cancel_invite` re-raise `TRANSIENT_ERRORS` so `@retry_on_disconnect` works.

### 7b `app/projects/controller.py`
- [ ] `get_projects_for_user`: authz via `require_class_access`; one `projects` read with `project_members(user_id, role)` embedded. Budget: 2.
- [ ] `get_project_members` / `get_project_by_id`: one embedded read each (`project_members(..., profiles(...))`). Budget: 1.
- [ ] `instructor_add_member`: `projects(..., classes(created_by))` embed + one `project_members` read for `[requester, target]`; keep the three return shapes. Budget: 3 + writes.
- [ ] `accept_join_request`: request→project→class embed, one members read, then writes. Budget: ≤ 5.
- [ ] `_leave_current_project_in_class` + `_notify_product_owners_of_departure`: bulk delete, one PO read, one bulk notification insert (moved to `notifications.controller.notify_member_departure`).
- [ ] `assign_product_owner`/`assign_scrum_master`/`assign_admin`/`remove_*`: one project embed, one members read, one `update ... neq(target)` instead of a loop; replace the six `print()` + `detail=str(e)` handlers with `logger.exception` + fixed detail.
- [ ] `get_pending_team_invites_for_user`, `get_my_pending_join_requests_for_user`, `get_project_pending_invites`, `get_pending_join_requests`: embeds with FK hints (`profiles!project_join_requests_invited_by_fkey`).
- [ ] `_increment_project_num_members(-1)` only when the delete removed a row; `delete_project` calls `_is_instructor` once.

### 7c `app/staffing/controller.py`
- [ ] `auto_assign`: decide placements in memory, one bulk `project_members` insert, one recount read + per-project `num_members` updates; scrum-master auto-pick per project in the same pass. Budget: ≤ 8 (+1 per touched project).
- [ ] `assign_user` / `unassign_user`: one membership read, one delete, one insert, recount; rollback keeps the original role.
- [ ] `submit_form`: `.in_()` validation of ranked projects; return the payload built locally instead of re-reading.
- [ ] `_get_projects_user_is_in(client, class_id, user_id, projects=None)` accepts the already-loaded projects.
- [ ] Hoist the lazy `app.projects.controller` imports to module scope (no cycle exists).

### 7d `app/tas/controller.py`
- [ ] `save_final_review_scores`: validate every entry first, then one `delete().in_(student_id)` for cleared rows and one `upsert(on_conflict="project_id,student_id,role")`. Budget: 6.
- [ ] `_load_project` → `core.authz.load_project(with_class=True)`; `get_final_review_detail` fans out review-TA/members/scores/notes in one wave.
- [ ] `set_review_ta`: `upsert(on_conflict="project_id")` instead of delete+insert.
- [ ] `get_ta_review_targets`: one wave.

### 7e `app/attendance/controller.py`
- [ ] `mark_all_present` / `upsert_attendance`: one bulk `upsert(on_conflict="meeting_id,user_id,week_number")`. Budget: 6.
- [ ] `get_ta_schedule`: `is_instr = class_row["created_by"] == user_id`; one `meetings` read reused for current-meeting selection; members/meetings/profiles in one wave; add `viewer_status` per team (the caller's own attendance status, `'unmarked'` when absent) so the client loop goes away. Additive key; `ApiTeamMeeting` gains `viewer_status?`.
- [ ] Drop the unused `role` parameters and the four `get_user_role` calls in `views.py`; `_current_term_week` uses `datetime.now(_CLASS_TZ).date()`; delete `_is_enrolled` (use `get_enrollment_role`).

### 7f `app/assignments/controller.py`
- [ ] `get_assignments_for_class`: three `query_pool` waves; optional `include=my_submissions` (student path) adds `my_submitted: bool` per assignment from one `TSRs` read (`evaluator_id = user`) and one `feedback_submissions` read. Budget: ≤ 5 for students.
- [ ] `update_tsr_entry`: embedded `projects(class_id, classes(created_by))` read, keep the UPDATE's returned row, select `project_id` (D10). Budget: 3.
- [ ] `get_instructor_tsr_overview`: one `projects` read carrying `assigned_ta_id`, one `profiles` read for all ids. Budget: 5.
- [ ] `get_feedback_overview`: one `profiles` read; enrolments + submissions in one wave.
- [ ] `datetime.utcnow()` → `datetime.now(timezone.utc)`.

### 7g `app/messages`, `app/notifications`, `app/profiles`
- [ ] `has_shared_class`: the four reads run as one wave; `list_contacts`: owned+enrolled in one wave, peers in one wave.
- [ ] `ensure_roster_upload_notifications`: one `roster_entries` read for all classes (`.in_('course_id', ids)`), one existing-notifications read, then per-class writes only where state changed.

## Task 8: Staged DB migration

**Files:** `backend/database/migrations/2026-09-08_perf_indexes_and_lints.sql` (new), `supabase/README.md` (note), `DEPLOY.md` (checklist)

- [ ] `CREATE INDEX IF NOT EXISTS` for: `project_members(project_id)`, `project_members(user_id)`, `project_join_requests(project_id)`, `(user_id)`, `(invited_by)`, `(reviewer_id)`, `"TSRs"(assignment_id)`, `(project_id)`, `(evaluator_id)`, `(evaluatee_id)`, `roster_entries(course_id)`, `(matched_profile_id)`, `assignments(class_id)`, `feedback_submissions(student_id)`, `messages(sender_id)`, `conversation_reads(user_id)`, `conversation_deletes(user_id)`, `pending_invites(class_id)`, `attendance(marked_by)`, `meetings(created_by)`, `final_review_notes(updated_by)`, `final_review_scores(scored_by)`, `project_review_tas(assigned_by)`.
- [ ] `DROP INDEX IF EXISTS idx_class_enrollments_class_id, idx_class_enrollments_user_id, idx_profiles_id` (duplicates / redundant with the PK).
- [ ] Recreate the 11 flagged RLS policies with `(select auth.uid())`.
- [ ] `ALTER FUNCTION ... SET search_path = public` for the 13 flagged functions (excluding scrum-board ones, which belong to PR #177's migration).
- [ ] Header comment: idempotent, safe any time, apply to dev then prod, re-run the advisor after.
- [ ] Commit `perf(db): stage index/RLS/search_path migration (not applied)`.

## Task 9: Frontend API client, error handling, lint

### 9a Split `lib/api.ts`
**Files:** `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/{auth,classes,projects,assignments,tsrs,staffing,messages,profiles,tas,attendance,notifications,contact,stats}.ts`, `frontend/src/lib/api/types.ts` (shared types), `frontend/src/lib/api.ts` (facade)
- [ ] `client.ts`: `apiRequest`, `apiUpload`, `class ApiError extends Error { status; detail }`, a token getter that reuses the cached session; 401 dispatches `window.dispatchEvent(new CustomEvent('auth:unauthorized'))`.
- [ ] Move each `api.*` group verbatim into its module (exported as `const classesApi = {...}` etc.); `lib/api.ts` = `export const api = { ...authApi, ...classesApi, ... }` + `export * from './api/types'`.
- [ ] Test (`lib/__tests__/apiClient.test.ts`): non-OK response with `{detail}` → `ApiError` with `status`; 204 → `undefined`; preview read-only blocks writes.
- [ ] `npm run build` proves every import site still resolves. Commit.

### 9b Error boundary + unauthorized handling
**Files:** `frontend/src/components/ErrorBoundary.tsx` (+ test), `frontend/src/App.tsx`, `frontend/src/features/app/AppView.tsx`, `frontend/src/lib/auth.tsx`
- [ ] `ErrorBoundary` renders a "Something went wrong — Reload" panel with the error message in dev; wraps `<Router>` and the `<Outlet>` in `AppView`.
- [ ] `AuthProvider` listens for `auth:unauthorized` → `supabase.auth.signOut({scope:'local'})` so `ProtectedRoute` redirects.
- [ ] Commit.

### 9c ESLint 10 clean + CI
**Files:** the files ESLint reports; `frontend/vite.config.ts`; `.github/workflows/test.yml`
- [ ] Fix the 14 errors (`react-hooks/set-state-in-effect` cases by deriving state or moving to event handlers; `triple-slash-reference` → `import type`), and the fast-refresh/unused-directive warnings.
- [ ] Add `npm run lint` to the frontend CI job. Commit.

## Task 10: Frontend performance

- [ ] **10a Endpoints wired:** `getIncomingJoinRequests(classId)` (backend `GET /api/projects/incoming-join-requests`), `getAssignments(classId, {includeMySubmissions:true})`, `viewer_status` on the TA schedule, `getClassesAttentionSummary()` (backend `GET /api/classes/attention-summary`). Backend endpoints written TDD in their modules (tests assert shape + budget).
- [ ] **10b Shared helpers:** `features/app/utils/joinRequests.ts` (`JOIN_REVIEW_ROLES`, `canReviewJoinRequests`, `initialsFromEmail`, `displayNameFromEmail`, `avatarBgFromEmail`, `formatAwaitingMeta`, `formatRequestedMeta`, row types) with tests; `StudentHomeDashboard` and `RequestsModal` import them.
- [ ] **10c `useEnrollmentRole(classId)`** context hook (one request per class) used by Sidebar, RequireReviewAccess, FinalReviews, TAMeetings, ProjectView; `StudentHomeDashboard` loads `getProjects()` / `getProjects(classId)` once and shares via state; `Projects.tsx` drops the redundant `getClassRoster` call.
- [ ] **10d Render:** memoize the three context provider values (`classContext`, `useNotifications`, `useConversations`); `useMemo` for `displayDeadlines`, `StaffingTable` sort, `Header` breadcrumbs/unread filter; `memo(MessageBubble)`, `memo(RosterList row)`; hoist the `new Set()` prop in `Roster.tsx`.
- [ ] **10e Bundle:** remove `react-icons` (map the 5 files to lucide equivalents, `IconType` → `LucideIcon`), lazy-load `CreateClassModal`/`JoinClassModal`/assignment modals and the auth pages, `build.rollupOptions.output.manualChunks` = `react-vendor`, `supabase`, `date-fns`. Record before/after sizes in the PR.
- [ ] One commit per sub-task; gates green after each.

## Task 11: Documentation + memory

- [ ] `AGENTS.md`: core layer, `get_client()`, authz helpers, ruff/CI gates, Node 24, `lib/api/` layout, "no unapplied-SQL dependencies" rule.
- [ ] `backend/STYLE_GUIDE.md`: replace the `_client()` and inline-instructor-check examples with the core helpers; error-handling section reflects the global handler.
- [ ] `backend/README.md`, `frontend/README.md`, `README.md`: install/test commands, lint commands.
- [ ] `docs/superpowers/reports/2026-09-08-refactor-audit.md`: the audit findings, what changed, measured before/after, follow-ups.
- [ ] Memory: update `deployment.md` (deletions landed), `backend-test-harness.md` (fake client features, ruff), new `refactor-2026-09-08.md`.

## Task 12: Final verification + PR

- [ ] Full gates both halves; `npm audit` clean; `ruff` clean.
- [ ] Preview verification (dev DB): student home, assignments, roster, projects, TA schedule, settings (brand icons), date picker; check console/network for errors and confirm reduced request counts on the changed screens.
- [ ] Push branch, open PR onto `beta` with: summary, migration checklist, rebase note for #177, before/after tables.

---

## Self-review

- Spec coverage: D1→T3, D2/D3→T2, D4→T5, D5→(no task, by design), D6→T7 rule, D7→T8, D8→T5/T7, D9→7a, D10→7f, D11→T5, D12→T5, D13→9a, D14→T4, D15→T2/10e, D16→T12 PR note. Hot-path table rows all map to a 7x bullet or 10a.
- Placeholders: none; each bullet names the file, the mechanism, and the budget.
- Type consistency: `get_client()` (T5) is the name used in T7; `require_class_access` returns a dict with `class`, `is_instructor`, `enrollment_role` (used in 7a/7b); `viewer_status` (7e) matches `ApiTeamMeeting.viewer_status` (10a); `ApiError` (9a) is what 9b listens for.
