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
| Frontend  | React 19, TypeScript, Vite (rolldown-vite)  |
| Styling   | SCSS + design tokens (`src/styles/`), Lucide / react-icons |
| Routing   | React Router DOM v7                         |
| State     | React Context (AuthContext, ClassContext)   |
| Backend   | Python 3.11 FastAPI + Uvicorn, slowapi (rate limiting) |
| Database  | Supabase (managed PostgreSQL)               |
| Auth      | Supabase Auth (JWT); PyJWT verification (HS256 + ES256) |
| Tests     | pytest (backend), Vitest (frontend)         |

## Directory structure

```
backend/app/<feature>/{url,views,controller,models}.py   # one module per feature
  health auth classes projects assignments tsr staffing
  messages profiles contact notifications tas attendance stats scrum
  main.py            # FastAPI app: CORS, security headers, rate limiter, routers
  config.py          # settings from .env
  dependencies.py    # require_user / require_instructor (JWT verify)
  database/client.py # supabase (anon) + service_client (service role, bypasses RLS)
backend/database/migrations/*.sql   # per-change SQL
backend/tests/                      # pytest (conftest stubs env + mints HS256 JWTs)

frontend/src/
  features/<area>/{pages,components,hooks,config}/   # auth, app, classes, messages...
  lib/api.ts          # hand-maintained typed API client (keep in sync w/ routes!)
  lib/auth.tsx        # AuthContext / useAuth
  lib/classContext.tsx# selected-class state
  styles/             # design tokens (@use '@styles')
  App.tsx             # router config
frontend/public/      # served at site root (llms.txt, .well-known/grepthink-actions.json)

supabase/             # schema.sql + auth_glue.sql + storage.sql (DDL-as-code)
deploy/               # VM systemd unit + shared nginx; deploy.sh redeploys
```

## Architecture

- **Backend module = url + views + controller + models.** `url.py` registers routes
  (functional `router.post('/x')(views.fn)`); `views.py` handles request/response;
  `controller.py` holds business logic + **authorization checks**; `models.py` is Pydantic.
- **Auth flow:** Supabase `signUp`/`signInWithPassword`/Google OAuth on the frontend
  → frontend calls `POST /api/create-user` to provision the `profiles` row → JWT in
  cookies → every API call sends `Authorization: Bearer <jwt>` → backend verifies via
  `require_user` / `require_instructor`.
- **Frontend** dev server proxies `/api` to the backend (`uvicorn app.main:app`).

## Roles
- **Global** (`profiles.role`): `instructor` | `student`.
- **Class-scoped**: instructor = `classes.created_by`; **TA** = `class_enrollments.enrollment_role = 'ta'`
  (single source of truth — see TA gotcha).
- **Project-scoped** (`project_members.role`): `owner` | `product owner` | `scrum master` | `admin` | `member`.

## Run / test
```bash
# Backend (Python 3.11 venv at backend/.venv)
cd backend && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest                 # conftest stubs SUPABASE_* env
uvicorn app.main:app                        # serve (needs real SUPABASE_* env)

# Frontend
cd frontend && npm install
npm run dev                                 # Vite dev server (proxies /api)
npm run build                               # tsc -b && vite build  (the typecheck gate)
npx vitest run                              # unit tests
```

## API surface
Routers are registered in `app/main.py` under these prefixes: `/api` (auth: `login-check`,
`create-user`, `check-email`), `/api/classes`, `/api/projects`, `/api/assignments`,
`/api/tsrs`, `/api/staffing`, `/api/messages`, `/api/profiles`, `/api/contact`,
`/api/notifications`, `/api/tas`, `/api/stats`, `/api/scrum` + `/api/projects/{id}/scrum`
(scrum board), plus attendance routes under `/api`.
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
- **`api.ts` can drift from routes** — it's hand-maintained, no codegen. Confirm a
  route exists before adding/calling a client method.
- **Rate limiting** (slowapi) covers `create_user`, `check_email`, `login_check`,
  `contact`, `stats`. Add `@limiter.limit(...)` (+ a `request: Request` param) for
  new abuse-prone endpoints.
- **Preview / "View as student"** is a frontend-only read-only simulation
  (`previewContext` + `previewGuard`) — no backend act-as, so it does not show a
  specific student's real data.

## Path aliases (frontend)
`@/`→`src/`, `@features/`→`src/features/`, `@pages/`→`src/pages/`,
`@components/`→`src/components/`, `@assets/`→`src/assets/`, `@styles/`→`src/styles/`.

## Before you commit
- Backend: `.venv/bin/python -m pytest` (all green).
- Frontend: `npm run build` + `npx vitest run` (all green).
- New backend route → add the matching `api.ts` method.
- New `backend/database/migrations/*.sql` → also update `supabase/schema.sql`.
