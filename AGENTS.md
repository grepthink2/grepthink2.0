# AGENTS.md — GrepThink 2.0

Team-project management platform for the UCSC **CSE 115 series** (Software Engineering).
Students join teams and submit team self-reviews (TSRs); instructors run classes,
rosters, and project teams; TAs run weekly meetings + take attendance and review
TSRs. This is the v2 rebuild of [grepthink.com](https://www.grepthink.com).

**Intended course model** (product intent, see caveat): **115A** = personal
projects, students form their own teams; **115B/C** = sponsored projects, the
professor creates teams and assigns students.
⚠️ **This A-vs-B/C distinction is NOT encoded yet** — there is no course-type field
on `classes`, `can_students_make_project` is unused, and students can
self-create / self-join projects in any class. Treat it as a goal, not a guarantee.

## How to work in this repo (read this first)

These rules come from the maintainer. They take precedence over the defaults of any process skill
or plugin, such as superpowers' brainstorming, writing-plans, subagent-driven-development and
test-driven-development. Use a skill when the size of the change calls for one, but follow the
review shape below, not the skill's own.

**Size the process to the change.**
- **Small, well-understood change** (a fix or edit in a file or two, copy or style tweaks, config or
  dependency bumps, git chores): no spec and no plan. Make the change, run the gates for the side you
  touched, and open a pull request.
- **Feature, or a change across several files or layers:**
  1. Agree a spec with the maintainer, committed under `docs/superpowers/specs/`.
  2. Write a plan. It stays local: `docs/superpowers/plans/` is gitignored.
  3. Implement it with one implementer, yourself or one subagent.
  4. Run one whole-branch review, and fix what it finds before the pull request. Don't review after
     every task.
- **Review a single task on its own** only for SQL functions and migrations, authorization checks,
  and anything that can lose or corrupt data.
- **A failure whose cause you don't know:** reproduce it before changing code.
- **What to ask about:** ask the maintainer before anything that touches PROD and before merging.
  Decide everything else yourself, and say what you decided in the pull request.

**Verify before you claim.**
- The gates are the coverage variants under "Before you commit". CI runs the same ones on every pull
  request into `beta` or `main`.
- A frontend test that times out on a busy machine proves nothing. Rerun the failing files alone,
  and let CI decide.
- Tests that depend on the clock or a time zone:
  - pin the clock (`app.assignments.deadlines.now_utc` in the backend, fake timers in the frontend);
  - use fixed-offset zones (`Etc/GMT+8`), never a real zone whose daylight-time rules can change.
- The backend's test double (`backend/tests/fake_supabase.py`) enforces no constraints and serializes
  nothing. A change to SQL, constraints or PostgREST behaviour needs a check against DEV, inside a
  transaction that rolls back or with the test data cleaned up. Never use PROD for this.

**Traps that have caught agents here.**
- **Shared working directory:** batched shell calls share one, so a `cd` in one call leaks into the
  next. Use absolute paths, `git -C`, `npm --prefix` or a subshell.
- **zsh:** the shell does not split an unquoted `$VAR` into words, and `${VAR}` needs its braces
  before a `:`.
- **Stale worktrees:** a new worktree can start far behind `beta`. Check
  `git merge-base HEAD origin/beta`, and start new work from `origin/beta`
  (`git switch --no-track -c <branch> origin/beta`).
- **Escape sequences:** a tool that writes files can turn a typed backslash-u escape (a backslash,
  `u`, four hex digits) into the raw character. Build such escapes in code, and scan the branch's diff
  for invisible characters (Unicode categories Cf and Cc) before a pull request.
- **`git stash`** is shared by every worktree of this repo. Set work aside with a commit instead.
- **Plans, ledgers and review notes** stay out of the repo. Code, comments and commit messages never
  cite them (no plan, task or ruling ids): say what the code does.
- **Old response shapes move on touch.** When you change an endpoint that still answers
  `{"message": …, "<resource>": …}`, move it to the current shape (`backend/STYLE_GUIDE.md`,
  "Response Format") in the same pull request, with its client method and tests.

**Keep the loop short.**
- Read the one area doc your change needs (the table below), not all of them.
- While you work, run the tests of the files you touch. Run the full gates once before the pull
  request, and again only if code changed after that run.
- Brief a subagent with paths (the spec, the plan, its area doc), not pasted text; it loads this file
  itself. Review its diff, not its transcript.
- A change to an agreed spec is a dated amendment in that spec, not a new spec.
- This file holds what every change needs. Knowledge about one area goes in `docs/agents/`, updated in
  the pull request that changes the behaviour. Leave version numbers to `package.json` and
  `requirements*.txt`.

## Read before you touch

| You are changing | Read first |
| --- | --- |
| Anything under `backend/` | [docs/agents/backend.md](docs/agents/backend.md): authorization, batching, errors, routes and the client, SQL, rate limits, email, events |
| Anything under `frontend/` | [docs/agents/frontend.md](docs/agents/frontend.md): the shared UI kit, oxlint and TypeScript 7, the entry chunk, Vitest, local harnesses |
| The scrum board or its MCP connector | [docs/agents/scrum.md](docs/agents/scrum.md): sprints, status, burnup, move-in, connector tokens |
| A team's project documents (sprint reports, release summary, test plan and report) | [docs/agents/documents.md](docs/agents/documents.md): the kinds registry, revisions, finalize, who may |
| Attendance, TAs, meetings, final reviews, deadlines, the schedule, any date | [docs/agents/meetings-and-time.md](docs/agents/meetings-and-time.md) |
| A release, or the Supabase, Vercel or Cloudflare CLI | [docs/agents/release-and-ops.md](docs/agents/release-and-ops.md) |
| Sign-up, login, email verification | `AUTH.md` |
| Deploys, environments, applying migrations | `DEPLOY.md` |
| A design import | `design/PORTING.md` |

## Rules for every change

- **Authorization is in Python.** Controllers use the service role, which bypasses Row-Level Security:
  check membership or ownership on every read and write.
- **Never depend on unapplied SQL.** Migrations are applied by hand, DEV first; merging applies nothing.
- **PROD is the maintainer's.** No PROD read, write, deploy or DNS change without being asked.
- **Never run bare `supabase`, `vercel` or their `login`:** use `scripts/supabase.sh`, `scripts/vercel.sh`
  and `scripts/cloudflare.sh`.
- **Secrets stay server-side,** and identity columns (`profiles.email`, `edu_email`, `role`) never come
  from a request body.
- **Sentry and logs:** keep names, emails, grades and review text out of exception and log messages;
  log ids.
- **A new or changed route** moves its client method (`frontend/src/lib/api/<domain>.ts`) and its entry
  in the agent catalog in the same pull request.
- **Times:** store instants, compute calendar boundaries in the school's zone, show the viewer's zone.
- **Frontend UI** comes from `frontend/src/components/`; the first download must not grow.

## Tech stack

| Layer     | Technology                                  |
| --------- | ------------------------------------------- |
| Frontend  | React 19, TypeScript 7, Vite 8 (rolldown)   |
| Styling   | SCSS + design tokens (`src/styles/`), lucide-react icons |
| Routing   | React Router DOM v7                         |
| State     | React Context (auth, class, preview, conversations, notifications) |
| Backend   | Python 3.12 FastAPI + Uvicorn, slowapi (rate limiting) |
| Database  | Supabase (managed PostgreSQL) through supabase-py / PostgREST |
| Auth      | Supabase Auth (JWT); PyJWT verification (HS256 + ES256) |
| Tests     | pytest + `tests/fake_supabase.py` (backend), Vitest 5 + Testing Library (frontend) |
| Lint      | ruff check + format (backend), oxlint (pinned exactly) + `lint:design` (frontend) |
| Coverage  | pytest-cov (`backend/.coveragerc`: branch, `fail_under`), @vitest/coverage-v8 (`vite.config.ts` thresholds), Codecov |
| Tooling   | Node 24 in CI (`engines` >= 22.12), `backend/requirements-dev.txt` |

## Directory structure

```
backend/app/<feature>/{url,views,controller,models}.py   # one module per feature
  health auth classes institutions projects assignments tsr staffing
  messages profiles contact issues notifications tas attendance team_meetings stats outbox scrum analytics search schedule mcp documents
  core/db.py         # get_client() (database failures raise DatabaseError), fan_out()
  core/authz.py      # class and project access checks shared by controllers
  core/errors.py     # DatabaseError types and handlers; error bodies carry "detail" and "code"
  core/sentry.py     # optional Sentry reporting (SENTRY_DSN): event scrubbing, delivery before the response
  core/events.py     # record(kind, ...) → events table; DB failures never raise; ids and enums only in meta
  analytics/         # per-institution dashboard: SQL functions (RPC) + nightly analytics_daily rollup
  schedule/          # GET /api/schedule: a caller's items in one class (TA meetings expanded per week), by lens
  mcp/               # scrum board MCP connector at /mcp (mcp SDK): tools, its own OAuth server, fill controller
  documents/         # a team's documents: kinds registry, revisions, finalize with a frozen snapshot, Markdown
  outbox/             # email outbox: enqueue, dispatcher, kinds, preferences, Maileroo webhook
  jobs/email_dispatch.py  # in-process dispatch loop, only while EMAIL_DISPATCH_SECRET is unset
  utils/email_transport.py  # Maileroo HTTP API or SMTP; transient vs permanent errors
  main.py            # app wiring: CORS, security headers, rate limiter, routers
  config.py          # settings from the repo-root .env
  dependencies.py    # require_user / require_instructor (JWT verify)
  database/client.py # supabase (anon) + service_client (service role, bypasses RLS)
backend/database/migrations/<YYYY-MM>/       # per-change SQL by month, applied by hand (merging never applies it)
backend/database/migrations/prod/<YYYY-MM>/  # PROD-only bundles and data fixes, same rule
backend/tests/                      # pytest: conftest mints HS256 JWTs; fake_supabase.py is the DB double

frontend/src/
  features/<area>/{pages,components,hooks,config}/   # auth, app, classes, messages...
  features/releases/  # release notes: notes/<version>.md (the newest = package.json's version), parser, version,
                      # seenStore + useWhatsNew (the per-browser dot), WhatsNewModal (its feed is a lazy chunk)
  features/schedule/  # schedule model + rows; Home's schedule card, the week from today (HomeScheduleCard lazy-loads
                      # HomeSchedule and ScheduleAgenda, so the entry chunk has none of it); /app/schedule redirects to Home
  lib/api.ts          # facade: assembles `api` from lib/api/<domain>.ts and re-exports types
  lib/api/client.ts   # apiRequest / apiUpload: auth header, preview guard, ApiError, 401 event
  lib/auth.tsx        # AuthContext / useAuth (signs out locally on auth:unauthorized)
  lib/classContext.tsx# selected-class state
  lib/institutions.ts   # useInstitutions(): the public schools list, fetched once
  lib/schoolEmail.ts   # isSchoolEmail(): .edu or an institution domain
  lib/lazyModal.ts    # load a heavy modal's code the first time it opens
  lib/openClassSelector.ts # openClassSelector(): the shell opens its class selector (NoClassSelected)
  components/         # the shared UI kit (what it holds and its rules: docs/agents/frontend.md)
  styles/             # design tokens (@use '@styles/index.scss' as *)
  App.tsx             # router config: lazy routes, ErrorBoundary
frontend/public/      # served at site root (llms.txt, .well-known/grepthink-actions.json)

docs/agents/          # area rules and gotchas, routed from "Read before you touch"
docs/superpowers/specs/  # agreed designs, one per feature

supabase/             # schema.sql + auth_glue.sql + storage.sql (DDL-as-code)
design/               # Claude Design export (design system); replace it wholesale on each
                      # import, then port `git diff design/` per design/PORTING.md
```

## Architecture

- **Backend module = url + views + controller + models.** `url.py` registers routes
  (functional `router.post('/x')(views.fn)`); `views.py` handles request/response;
  `controller.py` holds business logic + **authorization checks**; `models.py` is Pydantic.
- **Data access and errors (backend):** batch round trips, authorize with `app.core.authz`, raise
  `HTTPException` with a fixed `detail`. Details in `docs/agents/backend.md`.
- **Auth flow:** Supabase `signUp`/`signInWithPassword`/Google OAuth on the frontend
  → frontend calls `POST /api/create-user` to provision the `profiles` row → JWT in
  cookies → every API call sends `Authorization: Bearer <jwt>` → backend verifies via
  `require_user` / `require_instructor`.
- **Frontend** dev server proxies `/api` to the backend (`uvicorn app.main:app`).

## Roles
- **Account** (`profiles.role`): `instructor` | `student`. It decides who may create a class
  (`POST /api/classes` through `require_instructor`; `useAuth().canCreateClasses` in the web
  client), and it is never used for a class decision, in the backend or the UI. Its other readers
  are account-level: joining a class checks that a role has been chosen, `/api/login-check`
  returns it, the roster-email reminder (`needs_roster_email`) asks student accounts only, the
  sidebar shows the Analytics link only when `canCreateClasses` (the backend decides access, so a
  maintainer on a student account opens `/app/analytics` directly), and the web client falls back
  on it when no class is selected (Home's dashboard, the sidebar while the classes load).
- **Class-scoped** (every other decision): instructor = `classes.created_by`; **TA** =
  `class_enrollments.enrollment_role = 'ta'` (single source of truth — see TA gotcha); student =
  any other enrollment. One account can hold a different role in each class. `GET /api/classes`
  returns `my_role` for every class; the web client reads it with `useSelectedClassRole()` /
  `useClassRole(classId)` from `lib/classContext.tsx`.
- **Project-scoped** (`project_members.role`): `owner` | `product owner` | `scrum master` | `admin` | `member`.
- **Institutions**: every class belongs to a maintainer-seeded `institutions` row
  (`classes.institution_id`). Its `email_domains`, plus any `.edu`, decide what counts as a school
  email (`app/institutions/controller.py` `is_school_email`, mirrored by `lib/schoolEmail.ts`).

## Vocabulary
Use these words in code, copy, comments and the agent catalog:
- **Slot**: a scheduled time. It means a final-review slot (`final_review_slots`, posted by the
  instructor and booked by a team) or a TA's weekly meeting slot (`meetings`, `kind = 'ta_meeting'`).
  A team's review time is `projects.final_review_at`.
- **Meeting TA** (`projects.assigned_ta_id`, runs the weekly meeting) and **Review TA**
  (`project_review_tas`, the team's second final reviewer). Never call the Review TA's place a
  "slot": say "Review TA", or "seat" in comments.
- **TA meeting** (weekly, `kind = 'ta_meeting'`) and **team meeting** (one-off,
  `kind = 'team_meeting'`, scheduled by the team's Product Owner).
- **Product Owner** in prose and copy; `product owner` is the stored `project_members.role` value.
- **Late window**: the class-wide `accept_until` after a deadline, opened by the instructor or a TA
  with `class_enrollments.can_extend_deadlines` (`PUT /api/assignments/{id}/late-window`). Never
  "extension": that word is kept for a per-student grant, which does not exist.
- **Catalog roles** (`frontend/public/.well-known/grepthink-actions.json`, each action's `role`; join
  alternatives with `|`): `public` (no sign-in), `any` (any signed-in user), `student`, `ta` (a class
  TA), `meeting-ta` (the team's meeting TA), `instructor` (the class instructor), `project-member`,
  `owner`, `product owner`, `scrum master`, `admin`.

## Run / test
```bash
# Backend (Python 3.12 venv at backend/.venv; CI runs 3.12)
cd backend && .venv/bin/pip install -r requirements-dev.txt   # runtime + test/lint tools
.venv/bin/ruff format . && .venv/bin/ruff check .             # lint gate
.venv/bin/python -m pytest                  # no network: conftest stubs SUPABASE_* env
.venv/bin/python -m pytest --cov            # same, plus coverage (.coveragerc: branch, fail_under)
.venv/bin/python run.py                     # serve on :5001 (needs the real repo-root .env; its reloader, watchfiles, comes with requirements-dev.txt)

# Frontend (Node 24)
cd frontend && npm ci
npm run dev                                 # Vite dev server on :5173 (proxies /api)
npm run lint                                # oxlint: any finding fails (the react-hooks and React Compiler rules are errors)
npm run build                               # tsc -b && vite build  (the typecheck gate)
npx vitest run                              # unit + component tests
npm run test:coverage                       # same, plus coverage (thresholds in vite.config.ts)
```

## API surface
Routers are registered in `app/main.py` under these prefixes: `/api` (auth: `login-check`,
`create-user`, `check-email`, `check-user-exists`), `/api/classes`, `/api/institutions`, `/api/projects`, `/api/assignments`,
`/api/tsrs`, `/api/staffing`, `/api/messages`, `/api/profiles`, `/api/contact`,
`/api/issues` (public issue form → GitHub issue), `/api/notifications`, `/api/tas`, `/api/stats`, `/api/analytics` (scope, dashboard), `/api/email`
(outbox dispatch, Maileroo webhook, unsubscribe, email preferences), `/api/scrum` +
`/api/projects/{id}/scrum` (scrum board), `/api/projects/{project_id}/meetings` (a team's one-off
meetings), `/api/search` (`index`), `/api/schedule` (a caller's items in one class for a range), `/api/projects/{project_id}/documents`,
`/api/documents` and `/api/classes/{class_id}/documents` (a team's project documents), plus attendance routes under `/api`. Outside `/api`: `/mcp` (the scrum
board MCP connector, `app/mcp`), its OAuth metadata (`/.well-known/oauth-protected-resource/mcp`,
`/.well-known/oauth-authorization-server`) and its OAuth endpoints (`/register`, `/authorize`, `/token`, `/revoke`).
The full agent-facing action catalog (method, params, role) lives at
`frontend/public/.well-known/grepthink-actions.json`.

## Path aliases (frontend)
`@/`→`src/`, `@features/`→`src/features/`, `@components/`→`src/components/`,
`@assets/`→`src/assets/`, `@styles/`→`src/styles/`.

## Before you commit
- Backend: `.venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/python -m pytest --cov` (all green,
  coverage above `.coveragerc`'s `fail_under`).
- Frontend: `npm run lint && npm run lint:design && npm run build && npm run test:coverage` (no lint findings,
  all green, thresholds met).
- New backend route → add the matching method to `frontend/src/lib/api/<domain>.ts`, and an entry in the
  agent catalog.
- New migration → `backend/database/migrations/<YYYY-MM>/<YYYY-MM-DD>_<name>.sql`, in the folder for its
  month; update `supabase/schema.sql` once it is applied (CI warns on a pull request that adds a
  migration without touching the snapshot). Label the pull request `needs-prod-sql`, and remove the
  label once the SQL is applied on PROD.
- CI (`.github/workflows/test.yml`) runs the same gates with coverage on every pull request into
  `beta` or `main`. The thresholds (`backend/.coveragerc` `fail_under`, `frontend/vite.config.ts`
  `coverage.thresholds`) only ever go up.
- Open a pull request into `beta` and fill in `.github/PULL_REQUEST_TEMPLATE.md` (what changed, how
  it was verified). Never push to `main`: it takes merge-commit pull requests from `beta` with green
  checks only (`.github/rulesets/main.json`).
