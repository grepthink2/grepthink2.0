# Code Review: GrepThink 2.0

Findings organized by severity. Each item includes file locations and a suggested fix.

---

## Critical

### 1. `print()` used for all error logging

Every backend controller uses `print(f"Error: {e}")` instead of Python's `logging` module. No log levels, no structured output, impossible to filter or aggregate in production.

**Files:** Every controller (`projects/controller.py`, `classes/controller.py`, `tsr/controller.py`, `auth/controller.py`, `dependencies.py`)

**Fix:** Replace with `import logging; logger = logging.getLogger(__name__)` and use `logger.error()`, `logger.warning()`, etc. Configure a logging format in `main.py`.

---

### 2. Wide-open CORS with credentials

```python
# backend/app/config.py:28-30
CORS_ORIGINS: list = ["*"]
CORS_CREDENTIALS: bool = True
```

`allow_origins=["*"]` combined with `allow_credentials=True` is rejected by browsers per the CORS spec. This means credentialed cross-origin requests silently fail. It's also a security misconfiguration.

**Fix:** Set `CORS_ORIGINS` to explicit allowed origins (e.g., `["http://localhost:5173"]` for dev, the production domain for prod). Use an env var.

---

### 3. Auth middleware returns `None` instead of raising 401

```python
# backend/app/dependencies.py:38-39
if not auth_header:
    return None
```

Every view function then repeats the same guard:
```python
if not payload:
    raise HTTPException(status_code=401, detail="Authentication required")
```

This boilerplate appears in every single view function (~15 times).

**Fix:** Make `verify_supabase_token` raise `HTTPException(401)` by default. For the rare endpoints that allow anonymous access, create a separate `optional_auth` dependency.

---

### 4. Service role key bypasses Row Level Security on every query

```python
# Repeated in every controller function
client = service_client if service_client else supabase
```

The service role key has unrestricted access to all data, bypassing Supabase RLS policies. All authorization is hand-coded in Python controllers. A single missed check exposes data.

**Fix:** Use authenticated per-request clients (pass the user's JWT to `create_client()`) so RLS policies enforce access control at the database level. Reserve the service role client for admin-only operations.

---

### 5. No input validation beyond Pydantic type checking

No string length limits, no content validation, no rate limiting on any endpoint. A user could submit a project name with 10MB of text.

**Fix:** Add `Field(max_length=...)` constraints to Pydantic models. Add rate limiting middleware (e.g., `slowapi`). Validate URL formats for sponsor fields.

---

## High

### 6. Massive code duplication in join request handling

`accept_join_request` and `reject_join_request` in `backend/app/projects/controller.py:438-573` are ~60 lines each and 95% identical. The only difference is the status string (`"approved"` vs `"rejected"`) and whether a member is inserted.

**Fix:** Extract a shared `_review_join_request(request_id, reviewer_id, approve: bool)` function.

---

### 7. Test endpoint shipped in production

```python
# backend/app/projects/url.py registers:
# POST /api/projects/test-create
```

`test_create_project` in `backend/app/projects/views.py:12-63` bypasses all role checks. Anyone with a valid JWT can create projects in any class.

**Fix:** Remove this endpoint entirely, or gate it behind a `DEBUG` / `TESTING` environment flag that is never set in production.

---

### 8. Bug: `instructor_add_member` updates the wrong user's role

```python
# backend/app/projects/controller.py:731-734
response = (client.table("project_members")
    .update({"role": role})
    .eq("user_id", requester_id)  # BUG: should be target_user_id
    .eq("project_id", str(project_id))
    .execute()
)
```

When updating an existing member's role, the code updates the **requester** (instructor) instead of the **target user**. The instructor's own role gets overwritten.

**Fix:** Change `requester_id` to `target_user_id` on the `.eq("user_id", ...)` line.

---

### 9. `_is_admin` checks ownership of ANY project, not the specific one

```python
# backend/app/projects/controller.py:39-44
enrollment_result = (
    client.table('project_members').select('user_id')
    .eq('user_id', str(user_id)).eq('role', "owner")
    .execute()
)
```

Missing `.eq('project_id', str(project_id))`. A user who owns Project A would be treated as admin of Project B.

**Fix:** Add `.eq('project_id', str(project_id))` to the query.

---

### 10. No atomic transactions

Operations like `accept_join_request` perform 3 separate DB calls: update request status, insert member, increment counter. If any call fails after the first succeeds, the database is left in an inconsistent state.

**Fix:** Use Supabase RPC functions or database triggers for multi-step operations. At minimum, wrap in try/except with compensating rollback logic.

---

## Medium

### 11. Commented-out code throughout frontend

Sponsor-related code is commented out across multiple files rather than removed:

- `frontend/src/features/app/pages/CreateProject.tsx:37-41` (state declarations)
- `frontend/src/features/app/pages/CreateProject.tsx:171-178` (API call)
- `frontend/src/features/app/pages/CreateProject.tsx:226-229` (component props)

**Fix:** Remove commented code. Use git history to recover it if needed later.

---

### 12. `num_members` counter can drift out of sync

`_increment_project_num_members` in `backend/app/projects/controller.py:10-19` manually reads and updates a counter. If any add/remove operation fails partway, the counter diverges from reality.

**Fix:** Replace with a computed field (database view or `COUNT(*)` query) or use a database trigger to maintain the count.

---

### 13. Hardcoded magic strings for roles

Role strings like `"owner"`, `"admin"`, `"scrum master"`, `"product owner"`, `"member"` are scattered across the backend with no central definition.

**Files:** `backend/app/projects/controller.py` (lines 42, 227, 478, 554, 730, 738, 805), `backend/app/tsr/controller.py:143`

**Fix:** Define a `ProjectRole` enum or constants module. Use it everywhere.

---

### 14. `handleSaveDraft` is a no-op

```typescript
// frontend/src/features/app/pages/CreateProject.tsx:188-190
const handleSaveDraft = () => {
    console.log('Saving draft');
};
```

The "Save Draft" button in the UI calls this but does nothing.

**Fix:** Either implement draft saving (e.g., localStorage or API) or remove the button from the UI.

---

### 15. Debug `console.log` in production auth code

```typescript
// frontend/src/lib/auth.tsx:67-68
console.log('[Auth] user_metadata.role ...:', userMetadata?.role, ...);
console.log('[Auth] full user_metadata:', session?.user?.user_metadata);
```

Logs auth metadata to the browser console on every auth state change.

**Fix:** Remove these debug logs or gate behind a `process.env.NODE_ENV === 'development'` check.

---

### 16. Inconsistent error return types in backend

Some helper functions return `False` on error while others raise `HTTPException`:

- `_is_admin` returns `None` implicitly on exception (`backend/app/projects/controller.py:61`)
- `instructor_remove_member` returns `False` when project not found (`controller.py:719`)

Callers never check for `False` and proceed as if the result is truthy.

**Fix:** All functions should raise `HTTPException` on error. Never return sentinel values.

---

### 17. Frontend sends `user_id` in request body redundantly

```typescript
// frontend/src/lib/api.ts:231-248
acceptProjectJoinRequest: async (requestId: string) => {
    const { data: { user } } = await supabase.auth.getUser();  // redundant
    // ...
    body: JSON.stringify({ request_id: requestId, user_id: user.id }),
};
```

The backend already extracts the user from the JWT. Sending `user_id` in the body means a malicious client could impersonate another user if the backend trusts the body field over the token.

**Fix:** Remove `user_id` from the request body. The backend already has it from `payload.get('sub')`.

---

### 18. `instructor_remove_member` requires BOTH instructor AND owner role

```python
# backend/app/projects/controller.py:798-806
if not _is_instructor(requester_id, class_id):
    raise HTTPException(...)
# AND THEN ALSO checks:
if not membership.data or membership.data[0].get('role') != 'owner':
    raise HTTPException(...)
```

An instructor who owns the class but isn't a project "owner" member cannot remove students. This seems unintentional.

**Fix:** If the user is the class instructor, they should be able to manage all projects in their class regardless of project membership.

---

## Low

### 19. Settings class reads env at class definition time

```python
# backend/app/config.py:17-21
class Settings:
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
```

Class-level attributes are evaluated at import time, not when `Settings()` is instantiated. This makes testing harder and doesn't follow the Pydantic `BaseSettings` pattern.

**Fix:** Use `pydantic_settings.BaseSettings` with `model_config` for proper env loading, validation, and testability.

---

### 20. Inconsistent table naming (`TSRs` vs lowercase)

```python
# backend/app/tsr/controller.py:122
result = client.table('TSRs').insert(tsr_data).execute()
```

All other tables use lowercase (`projects`, `classes`, `profiles`). `TSRs` is capitalized. PostgreSQL folds unquoted identifiers to lowercase, so this only works if the table was created with quoted `"TSRs"`.

**Fix:** Standardize to lowercase `tsrs` for consistency.

---

### 21. No React error boundary

No error boundary component exists. A rendering crash in any component takes down the entire app with a white screen.

**Fix:** Add an `ErrorBoundary` component wrapping the router in `App.tsx`.

---

### 22. No API response caching

Every page navigation re-fetches all data via `useEffect` + `fetch`. No SWR, React Query, or TanStack Query.

**Fix:** Adopt TanStack Query for data fetching with built-in caching, deduplication, and background refetching.

---

### 23. Fragile env file resolution in Vite config

```typescript
// frontend/vite.config.ts
envDir: path.resolve(__dirname, '..'),
```

Loads `.env` from the parent directory. This breaks if the monorepo structure changes or if the frontend is deployed independently.

**Fix:** Keep `.env` in the frontend directory or use a more robust path resolution.
