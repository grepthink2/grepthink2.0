# GrepThink 2.0

GrepThink 2.0 is a team-based project management platform for university courses. Students sign up for team projects, manage assignments, and submit team self-reviews (TSRs). Instructors create courses, manage rosters, and oversee project teams. This is the v2 rebuild of [grepthink.com](https://www.grepthink.com).

## Tech Stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite (rolldown-vite)    |
| Styling      | SCSS modules, Lucide React icons              |
| Routing      | React Router DOM v7                           |
| State        | React Context (AuthContext, ClassContext)      |
| Backend      | Python FastAPI, Uvicorn                       |
| Database     | Supabase (managed PostgreSQL)                 |
| Auth         | Supabase Auth (JWT), PyJWT for verification   |
| Validation   | Pydantic (backend), TypeScript interfaces     |

## Directory Structure

```
/
├── frontend/                 # React + TypeScript SPA
│   ├── src/
│   │   ├── features/         # Feature-based modules
│   │   │   ├── auth/         # Login, signup, password reset, protected route
│   │   │   ├── app/          # Main app: pages, components, utils, config
│   │   │   └── classes/      # Class management pages
│   │   ├── lib/              # Shared libraries
│   │   │   ├── api.ts        # Centralized API client with typed methods
│   │   │   ├── auth.tsx      # AuthContext, useAuth, useUser hooks
│   │   │   ├── classContext.tsx  # ClassContext for selected class state
│   │   │   ├── supabaseClient.ts # Supabase client init
│   │   │   └── cookieStorage.ts  # Session persistence
│   │   ├── pages/            # Shared pages (LandingPage)
│   │   ├── assets/           # Images, SVGs
│   │   ├── styles/           # Global SCSS, design tokens
│   │   ├── App.tsx           # Router config
│   │   └── main.tsx          # Entry point (AuthProvider wrapper)
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                  # Python FastAPI REST API
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, router registration
│   │   ├── config.py         # Settings from .env
│   │   ├── dependencies.py   # JWT verification (verify_supabase_token)
│   │   ├── database/
│   │   │   └── client.py     # Supabase client (anon + service role)
│   │   ├── utils/
│   │   │   └── generators.py # Course code generator
│   │   ├── health/           # GET /health
│   │   ├── auth/             # Signup, login check, user creation
│   │   ├── classes/          # Class CRUD, enrollment, invitations
│   │   ├── projects/         # Project CRUD, join requests, members
│   │   ├── assignments/      # Assignment CRUD
│   │   └── tsr/              # Team Self-Review submission & viewing
│   ├── run.py                # Dev server entry (uvicorn)
│   └── requirements.txt
│
├── .env                      # Environment variables (not committed)
└── .gitignore
```

## Architecture Patterns

### Backend: Views / Controller / Models

Each feature module follows the same structure:
- **`url.py`** - Route definitions (FastAPI router with path + method)
- **`views.py`** - Request handling: extract auth payload, call controller, format response
- **`controller.py`** - Business logic: database queries, authorization checks, data transforms
- **`models.py`** - Pydantic request/response models

### Frontend: Feature-Based Components

Components are organized under `features/{feature}/components/` and pages under `features/{feature}/pages/`. Shared UI lives in `features/app/components/`.

### Auth Flow

1. Frontend: Supabase `signUp()` or `signInWithPassword()` / Google OAuth
2. On signup, frontend also calls `POST /api/create-user` to sync user profile to backend
3. JWT stored in cookies via custom `cookieStorage`
4. All API calls include `Authorization: Bearer {jwt}` via `apiRequest()` wrapper
5. Backend verifies JWT via `verify_supabase_token` dependency (supports HS256 + RS256)

### Roles

Two user roles: `instructor` and `student` (stored in Supabase `user_metadata.role` and `profiles.role`).

Project-level roles: `owner`, `product owner`, `scrum master`, `admin`, `member`.

## Database Tables

| Table                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `profiles`               | User profiles (id, email, role)                |
| `classes`                | Courses (name, course_code, term, created_by)  |
| `class_enrollments`      | Student-class enrollment (class_id, user_id)   |
| `projects`               | Team projects (name, description, team_size, skills, sponsor info) |
| `project_members`        | Project membership + role                      |
| `project_join_requests`  | Pending/approved/rejected join requests        |
| `assignments`            | Class assignments (TSR type auto-generated)    |
| `TSRs`                   | Team self-review submissions                   |

## API Endpoints

### Auth (`/api/auth/`)
- `GET /api/auth/test-auth` - Token verification test
- `GET /api/auth/login-check` - Check auth status + role
- `POST /api/auth/create-user` - Create profile record after Supabase signup

### Classes (`/api/classes/`)
- `POST /api/classes` - Create class (instructor only)
- `GET /api/classes` - Get user's classes (role-dependent)
- `GET /api/classes/{id}` - Get specific class
- `POST /api/classes/join` - Join by course code (student)
- `POST /api/classes/{id}/invite` - Invite student (instructor)
- `GET /api/classes/{id}/students` - List enrolled students
- `GET /api/classes/{id}/projects` - List class projects

### Projects (`/api/projects/`)
- `POST /api/projects` - Create project
- `GET /api/projects` - List projects (optional `?class_id=`)
- `GET /api/projects/{id}` - Get project details
- `PATCH /api/projects/{id}` - Update project
- `POST /api/projects/request-join` - Request to join
- `POST /api/projects/accept-request` - Accept join request
- `POST /api/projects/reject-request` - Reject join request
- `GET /api/projects/{id}/members` - List members
- `POST /api/projects/{id}/members` - Add member (instructor)
- `DELETE /api/projects/{id}/members/{user_id}` - Remove member

### Assignments (`/api/assignments/`)
- `POST /api/assignments` - Create assignment (instructor)
- `PATCH /api/assignments/{id}` - Update assignment
- `GET /api/assignments` - List assignments (optional `?class_id=`)

### TSRs (`/api/tsrs/`)
- `POST /api/tsrs` - Submit TSR
- `GET /api/tsrs/{project_id}` - View TSRs (role-scoped)
- `GET /api/tsrs/{project_id}/submitted` - TSRs you submitted
- `GET /api/tsrs/{project_id}/received` - TSRs about you

## Development Setup

### Prerequisites
- Node.js 18+, Python 3.11+
- A Supabase project with the required tables

### Environment Variables (`.env` at project root)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

### Running Locally
```bash
# Frontend (port 5173)
cd frontend && npm install && npm run dev

# Backend (port 5001)
cd backend && pip install -r requirements.txt && python run.py
```

The Vite dev server proxies `/api` requests to `http://localhost:5001`.

### Frontend Path Aliases
- `@/` -> `src/`
- `@features/` -> `src/features/`
- `@pages/` -> `src/pages/`
- `@components/` -> `src/components/`
- `@assets/` -> `src/assets/`
- `@styles/` -> `src/styles/`

## Testing

No test suite exists yet. No unit tests, integration tests, or E2E tests.

## Key Files to Know

| Purpose                  | File                                          |
| ------------------------ | --------------------------------------------- |
| Frontend API client      | `frontend/src/lib/api.ts`                     |
| Auth context             | `frontend/src/lib/auth.tsx`                   |
| Class context            | `frontend/src/lib/classContext.tsx`            |
| Router config            | `frontend/src/App.tsx`                        |
| Backend app init         | `backend/app/main.py`                         |
| Backend config           | `backend/app/config.py`                       |
| JWT verification         | `backend/app/dependencies.py`                 |
| DB client                | `backend/app/database/client.py`              |
| Projects business logic  | `backend/app/projects/controller.py`          |
| Classes business logic   | `backend/app/classes/controller.py`           |
| TSR business logic       | `backend/app/tsr/controller.py`               |
