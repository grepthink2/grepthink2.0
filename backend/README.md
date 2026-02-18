# Grepthink 2.0 Backend

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)

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

**Environment:** Create a `.env` file (e.g. at project root or in `backend/`) with your Supabase and app settings:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
PORT=5001
```

The API runs at `http://localhost:5001` by default. Use `GET /health` to confirm it’s up.

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
│   ├── utils/               # Helpers (e.g. code generators)
│   │   └── generators.py
│   │
│   ├── health/              # Health check
│   │   ├── url.py           # Path + method only (one line per route)
│   │   └── views.py         # Response logic
│   ├── auth/                # Auth feature
│   │   ├── url.py
│   │   ├── views.py         # Parameter handling, auth, calls controller
│   │   ├── controller.py   # Business logic
│   │   └── models.py        # Request/response models
│   ├── classes/             # Class management feature
│   │   ├── url.py
│   │   ├── views.py
│   │   ├── controller.py
│   │   └── models.py
│   └── projects/            # Project management feature
│       ├── url.py
│       ├── views.py
│       ├── controller.py
│       └── models.py
│
├── requirements.txt
└── run.py                   # Entry point (starts uvicorn)
```

**Conventions:**

- **`url.py`** — Path and HTTP method only; one line per route, e.g. `router.get('/path')(views.handler)`.
- **`views.py`** — Parameter handling (query, body, `Depends`), auth checks, and calls into the controller; returns response dicts.
- **`controller.py`** — Business logic and database access (no FastAPI dependencies).
- **`models.py`** — Pydantic models for request bodies (and any shared DTOs).

To add a new feature, create a folder under `app/` with `url.py`, `views.py`, `controller.py`, and `models.py`, then register its router in `app/main.py`.
