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

## Tech stack

| Layer     | Technology                                  |
| --------- | ------------------------------------------- |
| Frontend  | React 19, TypeScript 5.9, Vite 8 (rolldown) |
| Styling   | SCSS + design tokens (`src/styles/`), lucide-react icons |
| Routing   | React Router DOM v7                         |
| State     | React Context (auth, class, preview, conversations, notifications) |
| Backend   | Python 3.11 FastAPI + Uvicorn, slowapi (rate limiting) |
| Database  | Supabase (managed PostgreSQL) through supabase-py / PostgREST |
| Auth      | Supabase Auth (JWT); PyJWT verification (HS256 + ES256) |
| Tests     | pytest + `tests/fake_supabase.py` (backend), Vitest 5 + Testing Library (frontend) |
| Lint      | ruff check + format (backend), ESLint 10 + `lint:design` (frontend) |
| Tooling   | Node 24 in CI (`engines` >= 22.12), `backend/requirements-dev.txt` |

## Directory structure

```
backend/app/<feature>/{url,views,controller,models}.py   # one module per feature
  health auth classes institutions projects assignments tsr staffing
  messages profiles contact notifications tas attendance stats
  core/db.py         # get_client() (database failures raise DatabaseError), fan_out()
  core/authz.py      # class and project access checks shared by controllers
  core/errors.py     # DatabaseError types and handlers; error bodies carry "detail" and "code"
  core/sentry.py     # optional Sentry reporting (SENTRY_DSN): event scrubbing, delivery before the response
  jobs/pending_invites.py  # poller that sends queued class-invite emails
  main.py            # app wiring: CORS, security headers, rate limiter, routers
  config.py          # settings from the repo-root .env
  dependencies.py    # require_user / require_instructor (JWT verify)
  database/client.py # supabase (anon) + service_client (service role, bypasses RLS)
backend/database/migrations/*.sql   # per-change SQL, applied by hand (merging never applies it)
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
  components/         # shared UI (Skeleton, ErrorBoundary)
  styles/             # design tokens (@use '@styles/index.scss' as *)
  App.tsx             # router config: lazy routes, ErrorBoundary
frontend/public/      # served at site root (llms.txt, .well-known/grepthink-actions.json)

supabase/             # schema.sql + auth_glue.sql + storage.sql (DDL-as-code)
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
  returns it, the roster-email reminder (`needs_roster_email`) asks student accounts only, and the
  web client falls back on it when no class is selected (Home's dashboard, the sidebar while the
  classes load).
- **Class-scoped** (every other decision): instructor = `classes.created_by`; **TA** =
  `class_enrollments.enrollment_role = 'ta'` (single source of truth — see TA gotcha); student =
  any other enrollment. One account can hold a different role in each class. `GET /api/classes`
  returns `my_role` for every class; the web client reads it with `useSelectedClassRole()` /
  `useClassRole(classId)` from `lib/classContext.tsx`.
- **Project-scoped** (`project_members.role`): `owner` | `product owner` | `scrum master` | `admin` | `member`.
- **Institutions**: every class belongs to a maintainer-seeded `institutions` row
  (`classes.institution_id`). Its `email_domains`, plus any `.edu`, decide what counts as a school
  email (`app/institutions/controller.py` `is_school_email`, mirrored by `lib/schoolEmail.ts`).

## Run / test
```bash
# Backend (Python 3.11 venv at backend/.venv)
cd backend && .venv/bin/pip install -r requirements-dev.txt   # runtime + test/lint tools
.venv/bin/ruff format . && .venv/bin/ruff check .             # lint gate
.venv/bin/python -m pytest                  # no network: conftest stubs SUPABASE_* env
.venv/bin/python run.py                     # serve on :5001 (needs the real repo-root .env)

# Frontend (Node 24)
cd frontend && npm ci
npm run dev                                 # Vite dev server on :5173 (proxies /api)
npm run lint                                # ESLint: any finding fails (react-hooks rules are errors)
npm run build                               # tsc -b && vite build  (the typecheck gate)
npx vitest run                              # unit + component tests
```

## API surface
Routers are registered in `app/main.py` under these prefixes: `/api` (auth: `login-check`,
`create-user`, `check-email`), `/api/classes`, `/api/institutions`, `/api/projects`, `/api/assignments`,
`/api/tsrs`, `/api/staffing`, `/api/messages`, `/api/profiles`, `/api/contact`,
`/api/notifications`, `/api/tas`, `/api/stats`, plus attendance routes under `/api`.
The full agent-facing action catalog (method, params, role) lives at
`frontend/public/.well-known/grepthink-actions.json`.

## Gotchas (read before changing these areas)
- **`service_client` bypasses RLS.** Controllers query Postgres with the service
  role, so Row-Level Security does **not** protect you (14 of 22 RLS-enabled tables
  have no policies). A missing membership/ownership check in a controller is an
  IDOR — authorization correctness is 100% in Python. Verify access on every read/write.
- **Two distinct project-TA roles (by design):** `projects.assigned_ta_id` = the
  *meeting TA* (runs the weekly meeting + takes attendance; `app/attendance`).
  `project_ta_assignments` = the *review TA* (reviews TSRs; `app/tas`). Both draw
  from the one class-TA pool (`enrollment_role`). **Class-TA designation is unified** —
  designating via TA Management or TA Meetings writes the same `enrollment_role`
  (the legacy `class_tas` table was removed).
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
  once by `create_user`. See `AUTH.md`.
- **Match identifiers with `eq`, not `ilike`.** `%` and `_` are wildcards: an `ilike` on a join
  code once let `%` join any class. Validate the shape first, then match exactly.
- **`lib/api/*.ts` can drift from routes** — the client is hand-maintained, no codegen.
  Confirm a route exists before adding or calling a client method, and add the method to
  the matching domain file (`lib/api.ts` spreads them all into `api`).
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
- **Rate limiting** (slowapi) covers `create_user`, `check_email`, `login_check`,
  `contact`, `stats`, `list_institutions` (`GET /api/institutions`, 60/min). Add
  `@limiter.limit(...)` (+ a `request: Request` param) for new abuse-prone endpoints.
- **Preview / "View class as student"** (offered only in a class you teach) is a frontend-only
  read-only simulation of that class as its students see it (`previewContext` + `previewGuard`) —
  no backend act-as, so it does not show a specific student's real data.

## Path aliases (frontend)
`@/`→`src/`, `@features/`→`src/features/`, `@pages/`→`src/pages/`,
`@components/`→`src/components/`, `@assets/`→`src/assets/`, `@styles/`→`src/styles/`.

## Before you commit
- Backend: `.venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/python -m pytest` (all green).
- Frontend: `npm run lint && npm run lint:design && npm run build && npx vitest run` (no lint findings, all green).
- New backend route → add the matching method to `frontend/src/lib/api/<domain>.ts`.
- New `backend/database/migrations/*.sql` → update `supabase/schema.sql` once it is applied.
