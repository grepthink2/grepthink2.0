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
- Vitest keeps compiled modules on disk (`frontend/node_modules/.vitest-cache`), and that cache misses
  a change to a Sass partial: a stylesheet that `@use`s the partial keeps its old CSS. After changing a
  partial, run `npx vitest --clearCache` in `frontend/` before trusting a test that reads styles. CI
  starts from a clean install.
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
- **Local preview pages** (`frontend/<name>-mock.html` and their entry file in `frontend/src/`) stay
  local:
  - list them in `.git/info/exclude`;
  - never commit them;
  - move them out before switching to a branch that lacks what they import, or lint and build fail
    there.
- **Plans, ledgers and review notes** stay out of the repo. Code, comments and commit messages never
  cite them (no plan, task or ruling ids): say what the code does.
- **Old response shapes move on touch.** When you change an endpoint that still answers
  `{"message": …, "<resource>": …}`, move it to the current shape (`backend/STYLE_GUIDE.md`,
  "Response Format") in the same pull request, with its client method and tests.

## Tech stack

| Layer     | Technology                                  |
| --------- | ------------------------------------------- |
| Frontend  | React 19, TypeScript 5.9, Vite 8 (rolldown) |
| Styling   | SCSS + design tokens (`src/styles/`), lucide-react icons |
| Routing   | React Router DOM v7                         |
| State     | React Context (auth, class, preview, conversations, notifications) |
| Backend   | Python 3.12 FastAPI + Uvicorn, slowapi (rate limiting) |
| Database  | Supabase (managed PostgreSQL) through supabase-py / PostgREST |
| Auth      | Supabase Auth (JWT); PyJWT verification (HS256 + ES256) |
| Tests     | pytest + `tests/fake_supabase.py` (backend), Vitest 5 + Testing Library (frontend) |
| Lint      | ruff check + format (backend), ESLint 10 + `lint:design` (frontend) |
| Coverage  | pytest-cov (`backend/.coveragerc`: branch, `fail_under`), @vitest/coverage-v8 (`vite.config.ts` thresholds), Codecov |
| Tooling   | Node 24 in CI (`engines` >= 22.12), `backend/requirements-dev.txt` |

## Directory structure

```
backend/app/<feature>/{url,views,controller,models}.py   # one module per feature
  health auth classes institutions projects assignments tsr staffing
  messages profiles contact issues notifications tas attendance team_meetings stats outbox scrum analytics search
  core/db.py         # get_client() (database failures raise DatabaseError), fan_out()
  core/authz.py      # class and project access checks shared by controllers
  core/errors.py     # DatabaseError types and handlers; error bodies carry "detail" and "code"
  core/sentry.py     # optional Sentry reporting (SENTRY_DSN): event scrubbing, delivery before the response
  core/events.py     # record(kind, ...) → events table; DB failures never raise; ids and enums only in meta
  analytics/         # per-institution dashboard: SQL functions (RPC) + nightly analytics_daily rollup
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
  lib/api.ts          # facade: assembles `api` from lib/api/<domain>.ts and re-exports types
  lib/api/client.ts   # apiRequest / apiUpload: auth header, preview guard, ApiError, 401 event
  lib/auth.tsx        # AuthContext / useAuth (signs out locally on auth:unauthorized)
  lib/classContext.tsx# selected-class state
  lib/institutions.ts   # useInstitutions(): the public schools list, fetched once
  lib/schoolEmail.ts   # isSchoolEmail(): .edu or an institution domain
  lib/lazyModal.ts    # load a heavy modal's code the first time it opens
  components/         # shared UI (Button, IconButton, Spinner, the fields from FieldShell to DatePickerField,
                      # Slider, Skeleton, ErrorBoundary, Popover, Menu, Tooltip, Toast, Markdown)
  styles/             # design tokens (@use '@styles/index.scss' as *)
  App.tsx             # router config: lazy routes, ErrorBoundary
frontend/public/      # served at site root (llms.txt, .well-known/grepthink-actions.json)

supabase/             # schema.sql + auth_glue.sql + storage.sql (DDL-as-code)
design/               # Claude Design export (design system); replace it wholesale on each
                      # import, then port `git diff design/` per design/PORTING.md
```

## Architecture

- **Backend module = url + views + controller + models.** `url.py` registers routes
  (functional `router.post('/x')(views.fn)`); `views.py` handles request/response;
  `controller.py` holds business logic + **authorization checks**; `models.py` is Pydantic.
- **Data access (backend).** Controllers take the client from `app.core.db.get_client()` and
  authorize with `app.core.authz`. Every `.execute()` is a network round trip, so batch:
  embed related rows over foreign keys (`projects(class_id, classes(created_by))`, with
  `!fk_name` hints where a table has several FKs to one target), use `.in_()` instead of
  per-row loops, run independent reads with `fan_out({...})`, and validate everything in
  memory before one bulk `insert` / `upsert` / `delete`. Tests pin a round-trip budget with
  `FakeSupabase.executes`. `backend/STYLE_GUIDE.md` has the details.
- **Errors.** Raise `HTTPException` with a fixed `detail`; a failed database request raises
  `DatabaseError` (503 unavailable, 409 conflict, 500 read or write failure, each with a `code`),
  and `app/core/errors.py` logs anything else uncaught and answers
  `{"detail": "Internal server error", "code": "internal_error"}`. In the web client a failed
  call throws `ApiError` (status, detail and the backend's `code`), and a 401 signs the user out
  locally.
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
- **Catalog roles** (`frontend/public/.well-known/grepthink-actions.json`, each action's `role`; join
  alternatives with `|`): `public` (no sign-in), `any` (any signed-in user), `student`, `ta` (a class
  TA), `meeting-ta` (the team's meeting TA), `instructor` (the class instructor), `project-member`,
  `owner`, `product owner`, `admin`.

## Run / test
```bash
# Backend (Python 3.12 venv at backend/.venv; CI runs 3.12)
cd backend && .venv/bin/pip install -r requirements-dev.txt   # runtime + test/lint tools
.venv/bin/ruff format . && .venv/bin/ruff check .             # lint gate
.venv/bin/python -m pytest                  # no network: conftest stubs SUPABASE_* env
.venv/bin/python -m pytest --cov            # same, plus coverage (.coveragerc: branch, fail_under)
.venv/bin/python run.py                     # serve on :5001 (needs the real repo-root .env)

# Frontend (Node 24)
cd frontend && npm ci
npm run dev                                 # Vite dev server on :5173 (proxies /api)
npm run lint                                # ESLint: any finding fails (react-hooks rules are errors)
npm run build                               # tsc -b && vite build  (the typecheck gate)
npx vitest run                              # unit + component tests
npm run test:coverage                       # same, plus coverage (thresholds in vite.config.ts)
```

## Supabase, Vercel and Cloudflare CLIs: always use the project profiles
Run the CLI as `scripts/supabase.sh dev|prod <supabase args>`. Never run bare `supabase`, and
never run `supabase login`: login keeps its token in the macOS keychain, and after that every
call from another process (an editor terminal, an agent) asks for the keychain password. The
script reads a personal access token from `.supabase/access-token` (create it once with
`scripts/supabase.sh token`). It links each environment in its own working directory, so
`--linked` means the environment you named. `.supabase/` is gitignored and lives in the main
checkout, and every worktree shares it. `db dump` needs a running Docker. Dumps hold student
data, so write them outside the repo. The Supabase MCP connector reaches both projects too;
in Claude Code's auto mode, calls to PROD need the maintainer's approval.

The same goes for Vercel: `scripts/vercel.sh frontend|backend <vercel args>` (once:
`scripts/vercel.sh token`), never bare `vercel` and never `vercel login`. The token lives in
`.vercel/global/auth.json`, a repo-local global config (`--global-config`), so your
account-wide login is never used. Each project is linked under `.vercel/<frontend|backend>`.
The script refuses deploys (PROD deploys by merging to `main`). Use it for what the Vercel
connector cannot do: `env ls production`, `logs`, `rollback`.

DNS for `grepthink2.com` lives in Cloudflare, not Vercel: `scripts/cloudflare.sh verify | dns ls |
dns add | dns rm | get` (once: `scripts/cloudflare.sh token`). It takes an account API token
(Zone → DNS → Edit and Zone → Zone → Read on that zone; it refuses the Global API Key) from
`.cloudflare/api-token` and hands it to curl on stdin, never on a command line. It will not
remove or shadow the apex, www, api or email records, or add a `_vercel` TXT that verifies one
of them for another Vercel account. Reads are fine; ask the maintainer before any DNS write.

## API surface
Routers are registered in `app/main.py` under these prefixes: `/api` (auth: `login-check`,
`create-user`, `check-email`, `check-user-exists`), `/api/classes`, `/api/institutions`, `/api/projects`, `/api/assignments`,
`/api/tsrs`, `/api/staffing`, `/api/messages`, `/api/profiles`, `/api/contact`,
`/api/issues` (public issue form → GitHub issue), `/api/notifications`, `/api/tas`, `/api/stats`, `/api/analytics` (scope, dashboard), `/api/email`
(outbox dispatch, Maileroo webhook, unsubscribe, email preferences), `/api/scrum` +
`/api/projects/{id}/scrum` (scrum board), `/api/projects/{project_id}/meetings` (a team's one-off
meetings), `/api/search` (`index`), plus attendance routes under `/api`.
The full agent-facing action catalog (method, params, role) lives at
`frontend/public/.well-known/grepthink-actions.json`.

## Gotchas (read before changing these areas)
- **`service_client` bypasses RLS.** Controllers query Postgres with the service
  role, so Row-Level Security does **not** protect you (RLS is on for every table, and most
  have no policies). A missing membership/ownership check in a controller is an
  IDOR — authorization correctness is 100% in Python. Verify access on every read/write.
- **Two distinct project-TA roles (by design):** `projects.assigned_ta_id` = the
  *meeting TA* (runs the weekly meeting + takes attendance; `app/attendance`).
  `project_review_tas` = the *review TA* (reviews TSRs; `app/tas`). Both draw
  from the one class-TA pool (`enrollment_role`). **Class-TA designation is unified** —
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
- **The browser gets no table access, by grant as well as by policy.** `anon` holds nothing in
  `public`; `authenticated` holds `SELECT` on the Realtime tables only, and new tables start with
  no client privileges (`2026-09-21_lock_down_direct_table_access.sql`). Never add a write policy
  or a `GRANT` for those roles to make something work: route it through the backend. A table the
  browser must read over Realtime needs a `SELECT` policy scoped by `auth.uid()` **and**
  `GRANT SELECT … TO authenticated`.
- **Identity columns are never taken from a request body.** `profiles.email`, `profiles.edu_email`
  and `profiles.role` decide whose roster row and whose privileges an account gets. The email
  comes from the verified token, `edu_email` is written only by `verify_edu_email` (or from the
  token's address when it is a school email — `.edu`, or an institution's `email_domains`;
  `app/institutions/controller.py` `is_school_email` — not just `.edu`), and the role is written
  once by `create_user`. A login email change goes through Supabase Auth (Settings → Change),
  and `GET /api/profiles/me` re-mirrors the token's email afterwards. See `AUTH.md`.
- **Match identifiers with `eq`, not `ilike`.** `%` and `_` are wildcards: an `ilike` on a join
  code once let `%` join any class. Validate the shape first, then match exactly.
- **Routes are defined by each feature's `url.py`** (and the OpenAPI pages it produces at `/docs`).
  The web client (`lib/api/<domain>.ts`) and the agent catalog follow it, and both are
  hand-maintained, so they can drift. Confirm a route exists before adding or calling a client
  method, and add the method to the matching domain file (`lib/api.ts` spreads them all into
  `api`; `apiFacade.test.ts` fails if two domains share a method name).
- **Never depend on unapplied SQL.** Migrations in `backend/database/migrations/` are
  applied by hand, dev first and then prod; merging does not apply them. Code must work on
  the schema that is live, and an upsert needs a unique constraint that already exists.
- **`projects.num_members` is derived.** After any `project_members` write call
  `projects.controller.recount_num_members(client, project_ids)`; never read-modify-write it.
- **Secrets stay server-side.** `.env` lives at the repo root (see `.env.example`), and Vite
  exposes only `VITE_*` (`envPrefix`). Never widen that prefix: the same file holds
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET`.
- **`backend/api/index.py` is the Vercel entrypoint.** It only re-exports `app`; keep the
  `__all__`, which stops ruff deleting the import as unused. Keep tool settings out of a
  `backend/pyproject.toml`: Vercel reads that file as a dependency source, and deployments
  install from `requirements.txt`.
- **Sentry scrubs by name and by shape.** With `SENTRY_DSN` set, `app/core/sentry.py` filters
  the values of env vars whose names look like credentials (`KEY`, `SECRET`, `TOKEN`,
  `PASSWORD`, ...) and anything shaped like an email, IP address, JWT or provider token. Name
  new credentials that way, and keep names, grades and review text out of exception and log
  messages: nothing can recognise those.
- **Rate limiting** (slowapi) is per route: `@limiter.limit(...)` (+ a `request: Request` param)
  sits on the auth routes, contact, the issue form, `GET /api/institutions`, message sending, the
  `/api/email` dispatch, webhook and unsubscribe routes, the scrum board's PR refresh and AI drafts,
  stats, analytics and the search index. The search index's limit is per signed-in user
  (`key_func=_search_rate_key` in `app/search/views.py`): on Vercel every request arrives from
  the proxy's address, so a limit keyed by address is one bucket for everybody. Add one to any
  new public or abuse-prone endpoint.
- **Email goes through the outbox.** Queue an email with `app.outbox.controller.enqueue`
  (one row per recipient, a `kind` registered in `app/outbox/kinds.py`, a `dedupe_key` when the
  producer may run twice) instead of sending from a request or a background task: Vercel pauses
  an instance between requests, so a send started inside one can be cut off and lost. Only interactive
  emails the user is waiting for (verification codes, the contact and issue forms) call
  `app.utils.email.send_email` directly. Reminder/digest kinds need a preference `category`.
- **Preview / "View class as student"** (offered only in a class you teach) is a frontend-only
  read-only simulation of that class as its students see it (`previewContext` + `previewGuard`) —
  no backend act-as, so it does not show a specific student's real data.
- **Deadlines are instants.** `assignments.due_at` (first moment after `close_date` in the school's
  zone, derived by the backend) is the deadline; `accept_until` is a late window. After a published
  assignment's `due_at` passes, moving `close_date` or unpublishing is refused (400): set
  `accept_until`. A draft can always be rescheduled. `create_tsr`, `update_tsr_entry` (students) and
  `submit_feedback` enforce the window (403 `"This assignment is not open yet"` / `"This assignment
  is closed"`). `app.assignments.deadlines` holds the arithmetic and the clock (`now_utc`, patched in
  tests).
- **Times: store instants, compute in the school's zone, show in the viewer's.**
  - The database holds `timestamptz` instants.
  - Calendar boundaries (a day, a term week, a deadline's `due_at`) are computed in the school's zone:
    `institutions.timezone`, read through `app.institutions.controller.institution_timezone()`.
  - The web client shows times in the viewer's zone, with the campus time beside them when the two
    differ (`features/schedule/scheduleModel.ts` `zoneDiffers` / `viewerZone`,
    `TeamMeetings/teamMeetingsModel.ts` `campusTimeOf`).
  - Known exceptions, still to fix: the scrum board's day boundary is hard-coded to Pacific
    (`app/scrum/controller.py`), the Final Reviews page shows the browser's zone with no campus time,
    and the web client's fallback `SCHOOL_ZONE` is a Pacific constant.
- **Product events** go through `app.core.events.record(kind, ...)` (one insert; a database failure
  is logged at WARNING and never raised, an unregistered kind raises `ValueError`; kinds live in
  `KINDS`; `meta` holds ids and short enums only — never names, emails, grades or text). Pass ids
  and timestamps as strings: a `UUID` or `datetime` raises `TypeError` before anything is written
  (tests catch it; the fake client does not serialize).
- **Analytics counts in Postgres, authorizes in Python.** `app/analytics` fans out `analytics_*` SQL
  functions over `.rpc()` and composes one payload; who may see an institution is decided by
  `scope_for_user` (maintainers from `ANALYTICS_ADMIN_EMAILS`, instructors through the classes they
  created). A missing or failing function is a card in `failures[]`, never a 500. The nightly
  `analytics_daily` rollup runs under pg_cron (`prod/2026-10/2026-10-07_analytics_cron.sql`); its
  `class_id` has no foreign key on purpose, so deleted classes keep their history.
- **Shared UI components.** Basic elements (buttons, fields, dialogs, alerts, badges, avatars, cards,
  tabs) come from `frontend/src/components/` as each one is ported from `design/components/`; today
  the kit holds Button, IconButton, Spinner, the fields (FieldShell, Input, Textarea, Select,
  SearchField, PasswordField, CodeInput, Checkbox, Toggle, RadioGroup, DatePickerField, Slider), Popover,
  Menu, Tooltip, Toast, Skeleton and Markdown. A field's `maxLength` is a soft limit: the text past it
  is kept and flagged, so the form's own validation must refuse it. A
  feature stylesheet never re-declares a shared component's classes, and feature markup never renders
  them by hand: `npm run lint:design` fails if either happens. Adjust a shared component from your
  feature's own class (`.my-feature__head .gt-button`). Until an element has its shared component,
  build it with your feature's own class names; never copy a design component's CSS block.

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
