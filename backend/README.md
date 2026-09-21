# GrepThink 2.0 Backend

## Documentation for contributors

- **[STYLE_GUIDE.md](STYLE_GUIDE.md)** — layers, auth, database access and batching rules, errors, small examples.
- **[../AGENTS.md](../AGENTS.md)** — architecture, roles, gotchas and the commit gates.
- **[docs/FRONTEND_API.md](docs/FRONTEND_API.md)** — API notes for the web client.

## Table of Contents

- [Documentation for contributors](#documentation-for-contributors)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
- [Testing](#testing)
- [Style Guide](#style-guide)

## Getting Started

```bash
# From the backend directory (or project root with backend as cwd for run.py)

# Create a virtual environment (Python 3.11)
python3.11 -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt   # runtime deps + pytest/ruff (requirements.txt = runtime only)

# Run the development server
python run.py
```

**Environment:** Copy `.env.example` to `.env` at the **repository root** (parent of `backend/`). `app.config` and `app.database.client` load it from there. Typical variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
PORT=5001
```

The API runs at `http://localhost:5001` by default. Use `GET /health` to confirm it's up.

## Project Structure

The backend is organized by **feature**: each feature has its own folder with routes, views, logic, and request models. Shared infrastructure lives in `app/core`.

```
backend/
├── app/
│   ├── main.py              # App wiring: CORS, security headers, rate limiter, routers
│   ├── config.py            # Settings from the repo-root .env
│   ├── dependencies.py      # require_user / require_instructor (JWT verification)
│   ├── core/
│   │   ├── db.py            # get_client() (failures raise DatabaseError), fan_out(), retries
│   │   ├── authz.py         # Class and project access checks
│   │   └── errors.py        # DatabaseError types; handlers answer {"detail", "code"}
│   ├── jobs/
│   │   └── pending_invites.py  # Poller that sends queued class-invite emails
│   ├── database/client.py   # Supabase clients (anon + service role)
│   ├── utils/               # Helpers (profiles, code generators)
│   │
│   ├── health/  auth/  profiles/  contact/  stats/
│   ├── classes/             # Classes, enrollments, rosters, invites
│   ├── projects/            # Projects, members, roles, join requests
│   ├── assignments/         # Assignments, TSR review, feedback
│   ├── tsr/                 # TSR submission
│   ├── staffing/            # Interest forms, assign / unassign / auto-assign
│   ├── tas/                 # TA roles and final reviews
│   ├── attendance/          # TA meetings and attendance
│   ├── messages/            # Direct and group messaging
│   └── notifications/       # In-app notifications
│
├── database/migrations/     # SQL applied by hand (dev, then prod); merging does not apply it
├── docs/FRONTEND_API.md
├── tests/
│   ├── conftest.py          # Env stubs, HS256 test tokens
│   ├── fake_supabase.py     # In-memory PostgREST double with a round-trip counter
│   └── test_*.py
├── requirements.txt         # Runtime dependencies (pinned)
├── requirements-dev.txt     # + pytest, ruff
└── run.py                   # Entry point (starts uvicorn)
```

Each feature module follows the same pattern:

- **`url.py`** — Path and HTTP method only; one line per route, e.g. `router.get('/path')(views.handler)`.
- **`views.py`** — Parameters (query, body, `Depends`) and the authenticated user; calls the controller and returns response dicts.
- **`controller.py`** — Business logic, authorization and database access (no FastAPI request objects).
- **`models.py`** — Pydantic models for request bodies (and any shared DTOs).

To add a new feature, create a folder under `app/` with `url.py`, `views.py`, `controller.py`, and `models.py`, then register its router in `app/main.py`.

## API overview

**Routes:** each module's `app/<feature>/url.py` is the source of truth. The agent-facing action catalog lives at `frontend/public/.well-known/grepthink-actions.json`; update it and the web client (`frontend/src/lib/api/<domain>.ts`) when you add or change endpoints.

**High-level map:**

| Prefix | Description |
|--------|-------------|
| `/health` | Health check |
| `/api` | Auth helpers and `profiles` upsert (`test-auth`, `login-check`, `create-user`) |
| `/api/classes` | Classes, enrollments, invites, class students and projects |
| `/api/projects` | Projects, members, roles, join requests, `test-create` |
| `/api/assignments` | Assignments; TSR listing/editing under assignment scope (`class_id` query on list) |
| `/api/tsrs` | Submit and list TSRs by project |
| `/api/staffing` | Interest forms, instructor preference views, assign / unassign / auto-assign |
| `/api/messages` | Direct messaging — inbox, send message, conversation messages, mark read |

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
ruff format . && ruff check .     # lint gate (CI runs `ruff format --check`)
python -m pytest                  # fast; no network, no real Supabase project
```

`tests/conftest.py` stubs the environment and mints HS256 JWTs for route tests.
`tests/fake_supabase.py` is an in-memory PostgREST double (filters, embeds declared with
`relations=`, bulk writes, RPCs) that counts round trips, so data-heavy functions pin a budget:

```python
fake = FakeSupabase(
    relations={("projects", "classes"): ("class_id", "id", False)},
    projects=[...],
    classes=[...],
)
monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
result = controller.some_read(...)
assert fake.executes <= 3
```

Where a test goes, so the suite stays one assertion per fact:

- **One test per call.** What a function returns and what it costs share an arrange and an act,
  so they are one test (`assert out == EXPECTED` and `assert fake.executes <= n`), not a
  `_shape` test and a `_budget` test. Inputs that differ only in data are `parametrize` cases.
- **Who is refused, and how,** lives in `tests/test_authz_status_policy.py` (every module) and
  `tests/test_classes_authz.py` (every class route): status, message, and that nothing was
  written. Do not re-assert a 403 or 404 next to the feature's other tests.
- **What every route guarantees** lives in `tests/test_api_surface.py`: it walks every
  registered route, so a new route is covered by "needs a signed-in user" without a new test.
  A route that is meant to be public has to be added to its `PUBLIC` list.
- **Do not test the framework or a mock:** a controller patched to raise a 403 "answers 403", a
  required query parameter "answers 422", a mocked delete "is idempotent".
- Files are named for the unit under test (`test_<module>_<topic>.py`), never for the ticket,
  review or version that produced the tests.

Before removing or merging tests, record coverage and check nothing was lost:

```bash
python -m pytest --cov=app --cov-branch --cov-report=term-missing   # 69.11% line+branch, 2026-09-21
```

## Style Guide

See [STYLE_GUIDE.md](STYLE_GUIDE.md) for conventions on module structure, naming, auth, error handling, and adding new features.
