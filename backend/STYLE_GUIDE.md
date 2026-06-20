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
router.post('')(views.create_project)
router.get('/{project_id}')(views.get_project)
router.patch('/{project_id}')(views.update_project)
```

**`views.py`** — Extract params, check auth, delegate to controller, return response.

```python
def create_project(data: CreateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    project = controller.create_project(user_id=payload.get('sub'), ...)
    return {"message": "Project created", "project": project}
```

**`controller.py`** — Pure business logic. Receives typed args, returns dicts or raises `HTTPException`.

**`models.py`** — Pydantic `BaseModel` classes for request bodies.

---

## Naming Conventions

- **Modules**: `snake_case` (e.g. `project_members`, `interest_form`)
- **Functions**: `snake_case` (e.g. `create_project`, `get_my_interests`)
- **Private helpers**: prefix with `_` (e.g. `_client()`, `_require_class_instructor()`)
- **Route paths**: `kebab-case` for multi-word segments (e.g. `/assign-product-owner`, `/pref-by-student`)
- **Pydantic models**: `PascalCase` with `Request` or `Response` suffix (e.g. `CreateProjectRequest`, `AssignUserRequest`)

---

## Authentication

Use `Depends(verify_supabase_token)` for protected endpoints. The dependency returns the decoded JWT payload or `None` if no token is sent.

```python
def my_view(payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    # ...
```

For instructor-only endpoints, enforce in the controller (e.g. `_require_class_instructor(user_id, class_id)`).

---

## Database Access

- Use `service_client` when available, otherwise `supabase` from `app.database.client`
- Prefer a shared helper in the controller:

```python
def _client():
    return service_client if service_client else supabase
```

- Convert UUIDs to strings for queries: `str(project_id)`, `str(class_id)`
- Chain Supabase filters: `.eq()`, `.in_()`, `.order()`, etc.
- Handle empty results: `result.data or []`, `if not result.data: raise HTTPException(...)`

---

## Error Handling

- Use `HTTPException` for HTTP errors (400, 401, 403, 404, 500)
- Re-raise `HTTPException` in `except` blocks; handle other exceptions and wrap in 500
- Prefer specific status codes:
  - `400` — Bad request (validation, wrong class, etc.)
  - `401` — Unauthenticated
  - `403` — Forbidden (wrong role)
  - `404` — Not found
  - `500` — Server error (with `detail` including error message for debugging)

```python
except HTTPException:
    raise
except Exception as e:
    print(f"Error in create_project: {e}")
    raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")
```

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
- Use `from app.database.client import service_client, supabase`
- Use `from app.dependencies import verify_supabase_token` for auth

---

## Adding a New Feature

1. Create `app/<feature>/` with `__init__.py`, `url.py`, `views.py`, `controller.py`, `models.py`
2. Define routes in `url.py`, handlers in `views.py`, logic in `controller.py`
3. Add Pydantic models in `models.py`
4. Register the router in `app/main.py`
5. Add integration tests in `tests/` if the feature has non-trivial logic
