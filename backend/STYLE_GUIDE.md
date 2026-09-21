# Backend Style Guide

A concise guide to how the GrepThink 2.0 backend is structured and styled.

## Module Structure

Each feature lives in its own folder under `app/` with four core files:

| File | Purpose |
|------|---------|
| `url.py` | Route definitions only — path, HTTP method, and view handler |
| `views.py` | HTTP layer — params, auth, validation, calls controller |
| `controller.py` | Business logic — database access, no FastAPI dependencies |
| `models.py` | Pydantic request/response models |

**`url.py`** — One line per route. No logic.

```python
router.post("")(views.create_project)
router.get("/{project_id}")(views.get_project)
router.patch("/{project_id}")(views.update_project)
```

**`views.py`** — Extract params, check auth, delegate to controller, return response.

```python
def create_project(data: CreateProjectRequest, user_id: str = Depends(require_user)):
    project = controller.create_project(user_id=user_id, ...)
    return {"message": "Project created", "project": project}
```

**`controller.py`** — Pure business logic. Receives typed args, returns dicts or raises `HTTPException`.

**`models.py`** — Pydantic `BaseModel` classes for request bodies.

---

## Naming Conventions

- **Modules**: `snake_case` (e.g. `project_members`, `interest_form`)
- **Functions**: `snake_case` (e.g. `create_project`, `get_my_interests`)
- **Private helpers**: prefix with `_` (e.g. `_load_project()`, `_require_meeting_editor()`)
- **Route paths**: `kebab-case` for multi-word segments (e.g. `/assign-product-owner`, `/pref-by-student`)
- **Pydantic models**: `PascalCase` with `Request` or `Response` suffix (e.g. `CreateProjectRequest`, `AssignUserRequest`)

---

## Authentication

Views take the caller from a dependency, so the JWT is verified before the view runs:

```python
from app.dependencies import require_user


def get_assignments(class_id: UUID = Query(...), user_id: str = Depends(require_user)):
    return {"assignments": controller.get_assignments_for_class(user_id, class_id)}
```

- `require_user` answers 401 without a valid token and returns the user id.
- `require_instructor` also requires `profiles.role == 'instructor'` (403 otherwise).
- Class and project rules (class owner, enrolled student or TA, project role) live in the
  controller, through `app.core.authz`:

```python
from app.core import authz

cls = authz.require_class_instructor(client, user_id, class_id)  # 404 no class, 403 not owner
access = authz.require_class_access(client, user_id, class_id)  # instructor or enrolled
project = authz.load_project(client, project_id, class_columns="created_by")  # 404 no project
```

The helpers choose the status code and the `detail`; they take no status arguments. See
[Not found versus not allowed](#not-found-versus-not-allowed).

---

## Database Access

The service-role client bypasses Row-Level Security, so every authorization decision is made
in Python. Get the client per call; feature modules never import `service_client`:

```python
from app.core.db import fan_out, get_client

client = get_client()  # a failed request raises app.core.errors.DatabaseError
```

Every `.execute()` is one HTTP round trip to PostgREST. Keep the count flat as data grows:

- **Embed related rows** over foreign keys instead of reading them one by one:
  `select("id, name, project_members(user_id, role)")`. When a table has several FKs to the
  same target, name the constraint: `profiles!project_join_requests_user_id_fkey(email)`.
- **Batch with `.in_()`** instead of one query per id, and read profiles once for all ids.
- **Fan out independent reads** so they cost one round trip of latency, not one each:

```python
reads = fan_out(
    {
        "class": lambda: authz.load_class(client, class_id),
        "projects": lambda: (
            client.table("projects").select("id, name").eq("class_id", cid).execute().data or []
        ),
    }
)
```

- **Validate, then write once.** Check every item in memory, then issue one bulk `insert`,
  `upsert(on_conflict=...)` or `delete`, so nothing is written when any item is invalid.
- **Lost races on unique keys:** catch `DatabaseConflictError` around the write to answer a
  specific 409 or re-read the winning row; uncaught, it answers a generic 409. Rely only on
  constraints in `supabase/schema.sql` that are applied; never on a staged migration.
- Convert UUIDs to strings for filters (`str(project_id)`) and treat empty results as
  `result.data or []`.

---

## Error Handling

- Raise `HTTPException` with a fixed, user-safe `detail` (400, 401, 403, 404, 409).
- Never put exception text in `detail`: PostgREST errors include table and constraint names.
- **Database failures are typed.** The client from `get_client()` raises
  `app.core.errors.DatabaseError` when PostgREST rejects a request or the database cannot be
  reached; a bug in our own code never becomes one. Every error body has a `detail` and a `code`:

| Raised | Status | `code` |
|---|---|---|
| `DatabaseUnavailableError`: timeout, dropped connection, overload | 503 with `Retry-After` | `database_unavailable` |
| `DatabaseConflictError`: a unique key (`23505`) | 409 | `database_conflict` |
| `DatabaseError`: any other rejected request | 500 | `database_read_failed` or `database_write_failed` |
| Any other uncaught exception (a bug) | 500 | `internal_error` |

- PostgREST's code and message stay on the exception (`pg_code`, `pg_message`) and in the log,
  which `app/core/errors.py` writes once per failure.
- `DatabaseError` is an `HTTPException`, so `except HTTPException: raise` passes it through a
  broad handler with its status and code, and `@retry_on_disconnect()` retries a dropped
  connection. Catch exceptions only to add context to the log or to map a known failure to a
  better status. To handle a database failure, catch its subclass **before**
  `except HTTPException`:

```python
from app.core.errors import DatabaseConflictError

try:
    client.table("meetings").insert(row).execute()
except DatabaseConflictError:
    meeting = existing_meeting()  # another request created the slot first
except HTTPException:
    raise
except Exception:
    logger.exception("Error creating meeting | project_id=%s", project_id)
    raise HTTPException(status_code=500, detail="Failed to create meeting")
```

### Not found versus not allowed

Every endpoint answers these two conditions the same way:

- **404**: the resource the request addresses does not exist: the class, project, assignment,
  TSR, join request, invite, roster entry, and so on.
- **403**: the resource exists and the caller is signed in, but lacks the relationship or role the
  action needs: not the class instructor, not enrolled, not a project member, not the assigned
  TA, the wrong project role, the wrong profile role.
- Existence is not hidden from non-members, so check that the resource exists before checking
  access. Ids are UUIDs, and the web client never branches on 403 versus 404 (it only
  special-cases 401).
- A membership that does not exist is itself the missing resource and answers 404: leaving a class
  you are not in, removing a member who is not on the team, viewing the profile of a user who is
  not in the class, unassigning a user with no team. Resources private to one user and looked up
  through that user, such as notifications, answer 404 too.
- One condition, one status and one `detail`, from the constants in `app/core/authz.py`:
  `CLASS_NOT_FOUND`, `NOT_CLASS_INSTRUCTOR`, `NOT_CLASS_MEMBER`, `NOT_ENROLLED`,
  `INSTRUCTOR_ROLE_REQUIRED`, `PROJECT_NOT_FOUND`, `NOT_PROJECT_MEMBER`. Write a different message
  only when it adds real information, such as "Only the instructor can appoint another TA".
- `authz.require_class_instructor` and `authz.require_class_access` enforce this. A controller that
  reads the rows itself (to fan them out with its own data) raises the same statuses with the same
  constants.

---

## Type Hints

- Use type hints for function parameters and return values
- Use `Optional[T]` for optional parameters; `list`, `dict` for collections
- Use `UUID` from `uuid` for ID parameters
- Use `Literal["draft", "publish"]` for fixed string enums in Pydantic

---

## Docstrings

- Module: one-line description at top of file
- Public functions: short summary; for controllers, include "Who can call", "Returns", "Raises"
- Private helpers: brief one-line description

```python
def assign_user(user_id: str, class_id: UUID, target_user_id: UUID, project_id: UUID) -> dict:
    """
    Assign a student to a project. If already assigned to another project
    in this class, move them (remove old, add new).
    """
```

---

## Response Format

- Success: `{"message": "...", "<resource>": <data>}` (e.g. `{"message": "Project created", "project": {...}}`)
- List endpoints: `{"<plural>": [...]}` (e.g. `{"assignments": [...]}`)
- Keep response shapes consistent within a feature

---

## Router Registration

- Each module defines `router = APIRouter(prefix="/api/<feature>", tags=["<feature>"])
- Register in `app/main.py`: `app.include_router(<feature>_router)`
- Health has no prefix: `router.get('/health')(views.health_check)`

---

## Imports

- Standard library first, then third-party, then `app.*`
- Prefer explicit imports; avoid `from module import *`
- Use `from app.core.db import get_client` (plus `fan_out` where reads are independent)
- Use `from app.dependencies import require_user` (or `require_instructor`) for auth

---

## Adding a New Feature

1. Create `app/<feature>/` with `__init__.py`, `url.py`, `views.py`, `controller.py`, `models.py`
2. Define routes in `url.py`, handlers in `views.py`, logic in `controller.py`
3. Add Pydantic models in `models.py`
4. Register the router in `app/main.py`
5. Add tests in `tests/` with `FakeSupabase` (`tests/fake_supabase.py`; see `tests/test_assignments.py`):
   pin the response shape, the status codes and a round-trip budget (`assert fake.executes <= N`)
