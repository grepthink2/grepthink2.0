# GrepThink 2.0 Backend

## Documentation for contributors

- **[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** — Full onboarding: architecture, request flow, auth and Supabase clients, database tables used in code, **[all HTTP endpoints (§8)](docs/DEVELOPER_GUIDE.md#8-api-reference-all-endpoints)**, how to add a feature, testing, troubleshooting.
- **[STYLE_GUIDE.md](STYLE_GUIDE.md)** — Naming, layer responsibilities, errors, and small examples.

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

# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the development server
python run.py
```

**Environment:** Create a `.env` file at the **repository root** (parent of `backend/`). `app.config` and `app.database.client` load it from there. Typical variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
PORT=5001
```

The API runs at `http://localhost:5001` by default. Use `GET /health` to confirm it's up.

## Project Structure

The backend is organized by **feature**: each feature has its own folder with routes, views, logic, and request models.

```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, router registration
│   ├── config.py            # Settings and env vars
│   ├── dependencies.py      # Shared deps (e.g. JWT auth)
│   │
│   ├── database/            # DB client (Supabase)
│   │   └── client.py
│   ├── utils/                # Helpers (e.g. code generators)
│   │   └── generators.py
│   │
│   ├── health/               # Health check
│   ├── auth/                 # Authentication
│   ├── classes/              # Class management
│   ├── projects/             # Project management (members, roles, join requests)
│   ├── assignments/          # Assignments and TSR (Team Self-Review)
│   ├── tsr/                  # TSR submission flow
│   ├── staffing/             # Project staffing (interest forms, assignments, auto-assign)
│   └── messages/             # Direct messaging between users
│
├── database/
│   └── migrations/           # SQL DDL snippets for reference (not auto-applied)
├── docs/
│   └── DEVELOPER_GUIDE.md    # Full onboarding + §8 API reference
├── tests/                    # Pytest tests (unit + integration)
│   ├── conftest.py
│   ├── memory_supabase.py
│   ├── test_staffing.py
│   ├── test_staffing_output.py
│   ├── test_tsr_view_and_edit.py
│   └── ...
├── requirements.txt
└── run.py                    # Entry point (starts uvicorn)
```

Each feature module follows the same pattern:

- **`url.py`** — Path and HTTP method only; one line per route, e.g. `router.get('/path')(views.handler)`.
- **`views.py`** — Parameter handling (query, body, `Depends`), auth checks, and calls into the controller; returns response dicts.
- **`controller.py`** — Business logic and database access (no FastAPI dependencies).
- **`models.py`** — Pydantic models for request bodies (and any shared DTOs).

To add a new feature, create a folder under `app/` with `url.py`, `views.py`, `controller.py`, and `models.py`, then register its router in `app/main.py`.

## API overview

**Full reference:** Every defined route, HTTP method, path, and a short description of what it does is documented in **[docs/DEVELOPER_GUIDE.md — section 8, API reference](docs/DEVELOPER_GUIDE.md#8-api-reference-all-endpoints)**. Update that section (and `app/<feature>/url.py`) when you add or change endpoints.

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

Install dev dependencies (pytest, pytest-cov, httpx):

```bash
pip install -r requirements-dev.txt
```

**Default (fast, no live DB):** unit/API tests use an in-memory Supabase stand-in and pytest excludes `integration` tests.

```bash
cd backend
python -m pytest --cov=app --cov-report=term-missing
```

**Integration (real Supabase):** requires `.env` and seed data (instructors/students in `profiles`, etc.).

```bash
python -m pytest -m integration tests/test_staffing.py -v
python -m pytest tests/ -v   # everything including integration
```

Coverage target is configured in `pytest.ini` (`fail_under`). Raise it as you add tests; full line coverage including every error branch usually needs both unit tests and integration runs.

## Style Guide

See [STYLE_GUIDE.md](STYLE_GUIDE.md) for conventions on module structure, naming, auth, error handling, and adding new features.
