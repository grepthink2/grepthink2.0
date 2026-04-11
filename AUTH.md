# Authentication & Authorization

This document describes the auth architecture shipped in the 7-phase
refactor on the `pranay-kt` branch. It is aimed at engineers who need to
understand *why* the code looks the way it does, not just what it does —
so it leans heavier on rationale than on boilerplate.

Everything here replaces the older cookie-storage + per-view guard
design. If you find a view that does not match this document (open-coded
`if not payload:` checks, cookie storage, etc.), that is a bug — see the
phase commits below for how it was meant to be wired.

---

## Table of contents

1. [Goals](#goals)
2. [Frontend: PKCE + localStorage](#frontend-pkce--localstorage)
3. [Google OAuth first-login routing (`/select`)](#google-oauth-first-login-routing-select)
4. [Backend: dependency layering](#backend-dependency-layering)
5. [Role source-of-truth: DB, not JWT](#role-source-of-truth-db-not-jwt)
6. [`/api/create-user` and privilege escalation](#apicreate-user-and-privilege-escalation)
7. [CORS allowlist](#cors-allowlist)
8. [Security headers middleware](#security-headers-middleware)
9. [Automated tests](#automated-tests)
10. [Environment variables](#environment-variables)
11. [Phase commit map](#phase-commit-map)
12. [Open items](#open-items)

---

## Goals

The old auth path had three properties we wanted to eliminate:

1. **Silent bypass risk.** `verify_supabase_token` returned `None` on a
   missing header, so every view had to remember to guard with
   `if not payload: raise HTTPException(401)`. A single missed guard
   silently let unauthenticated traffic reach business logic.
2. **Role-in-body trust.** The old `/api/create-user` accepted a
   `userType` field and upserted on the user id. An already-authenticated
   student could re-POST as `'instructor'` and escalate — the token/body
   id match still held because they were targeting themselves.
3. **Wide-open CORS.** `allow_origins=["*"]` combined with
   `allow_credentials=True` is silently rejected by browsers, so CORS
   "worked" in unauthenticated dev but broke in authenticated prod.

The refactor addresses all three, adds security headers and an automated
test suite, and standardises the frontend session lifecycle.

---

## Frontend: PKCE + localStorage

**File:** `frontend/src/lib/supabaseClient.ts`

```ts
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,  // we handle /auth/callback ourselves
    flowType: 'pkce',
    storage: window.localStorage,
  },
});
```

- **PKCE** (Proof Key for Code Exchange) is the OAuth flow for public
  clients. It adds a per-request `code_verifier` that only the browser
  tab that started the flow knows, which defeats auth-code interception.
- **localStorage** is the Supabase default. It's visible to any script
  that runs on our origin, which is acceptable because our CSP blocks
  third-party scripts. A previous iteration used a custom `cookieStorage`
  adapter stuffed into a single `__Host-session` cookie; it had two
  unfixable bugs (sessions >4KB silently dropped, and
  `__Host-`/`Secure` attributes behave inconsistently on `http://localhost`),
  so it was removed. See the history block at the top of
  `supabaseClient.ts`. If we ever adopt a real backend-for-frontend
  pattern we'll reintroduce cookie-based storage via HttpOnly
  server-set cookies.
- **`detectSessionInUrl: false`** disables the SDK's opportunistic URL
  scan for `?code=`. We handle the exchange in `/auth/callback`
  ourselves so we can show a loading state and route first-time
  OAuth users to the role-selection page.

### Session lifecycle

`frontend/src/lib/auth.tsx` owns the `AuthProvider`. The only source of
truth for session state is `supabase.auth.onAuthStateChange`:

```
INITIAL_SESSION  — first load, session restored from localStorage
SIGNED_IN        — successful sign-in
SIGNED_OUT       — explicit signOut() or token invalidated
TOKEN_REFRESHED  — silent refresh produced a new access token
USER_UPDATED     — email/password/metadata updated
```

Because localStorage is shared across tabs of the same origin, these
events propagate cross-tab for free: signing out in tab A triggers
`SIGNED_OUT` in tab B on the next render tick, which clears `session`
and bumps `ProtectedRoute` to `/login`. No `BroadcastChannel` needed.

`getToken()` on the context reaches for the cached session first, then
falls back to `supabase.auth.refreshSession()` once before returning
`null`. This closes the "user is truthy but access token is null" race
where the access token expired between renders but the SDK hadn't yet
issued a silent refresh.

---

## Google OAuth first-login routing (`/select`)

**Files:** `frontend/src/features/auth/pages/AuthCallback.tsx`,
`frontend/src/features/auth/pages/RoleSelection.tsx`,
`frontend/src/features/auth/components/SignUp.tsx`

Google sign-in has no `userType` input — we can't ask Google whether
this is a student or an instructor. The flow is:

1. `SignUp.tsx` kicks off OAuth with
   `redirectTo: ${origin}/auth/callback`.
2. Google redirects back with `?code=...`.
3. `AuthCallback.tsx` exchanges the code via
   `supabase.auth.exchangeCodeForSession(window.location.href)`.
4. It then calls `api.loginCheck()`. `loginCheck` returns `role: null`
   when no `profiles` row exists for the user.
5. If `role` is null → navigate to `/select`. If non-null → navigate to
   `/app/home`.
6. `RoleSelection.tsx` shows the student/instructor chooser, then POSTs
   to `/api/create-user` with the chosen `userType`. The endpoint
   creates the profile and the user is sent to `/app/home`.

`RoleSelection.tsx` also runs `loginCheck()` on mount and redirects
users who already have a role, which guards against:

- A user who manually navigates to `/select` after signup.
- The race where `AuthCallback` has exchanged the code but the user
  hand-refreshes onto `/select` before `/app/home`.

Email/password signup goes through `SignUpOrchestrator.tsx` and posts
to the same `/api/create-user` endpoint — the role is collected up-front
in the form, so the `/select` detour is OAuth-only.

---

## Backend: dependency layering

**File:** `backend/app/dependencies.py`

The backend uses three stacked FastAPI dependencies instead of one:

```
verify_supabase_token   → parses & cryptographically verifies the JWT;
                          raises 401 on missing/malformed/invalid.
                          Returns the decoded payload dict.

require_user_payload    → thin pass-through that yields the full payload.
                          Use when a view needs claims beyond `sub`.

require_user            → extracts the `sub` claim. Use when a view only
                          needs the user id. This is the common case.

require_instructor      → builds on require_user, then looks up the role
                          in the `profiles` table. Raises 403 if the
                          caller is not an instructor. Returns user_id.
```

### Why layered?

Before the refactor, `verify_supabase_token` returned `None` on a
missing header. This meant every view had to remember:

```python
# OLD — error-prone
def list_projects(payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = payload.get("sub")
    ...
```

~40 views had that guard, and a single missed one would silently let
unauthenticated traffic through. The new shape is:

```python
# NEW — authenticated by default
def list_projects(user_id: str = Depends(require_user)):
    ...
```

If you forget to add `Depends(require_user)` to a view, the view has no
`user_id` argument and won't compile — auth becomes a type-checker
error instead of a runtime silent pass.

### JWT verification internals

`verify_supabase_token` handles both HS256 (symmetric, shared secret)
and RS256/ES256 (asymmetric, fetched via JWKS). The JWKS client is
initialised lazily once per process and points at
`{SUPABASE_URL}/auth/v1/keys`. If the JWKS lookup fails *and*
`SUPABASE_JWK_JSON` is set (a static inline JWK for air-gapped envs),
it falls back to that. HS256 requires `SUPABASE_JWT_SECRET` to be set.

`options={"verify_aud": False}` is intentional: Supabase issues tokens
with `aud: "authenticated"` for every authenticated user, which is not
useful as a discriminator. We verify the signature and the `exp` claim
and derive authorisation from `sub` + the `profiles.role` lookup.

---

## Role source-of-truth: DB, not JWT

`require_instructor` looks up `profiles.role` in the database on every
request rather than trusting `user_metadata.role` on the JWT. This is
deliberate:

- **Role changes don't invalidate tokens.** If we ever demote an
  instructor, their existing access token would keep claiming
  `role: instructor` for up to an hour until the next refresh.
  Trusting the JWT would give them an hour of lingering elevated
  access.
- **JWT user_metadata is mutable by the user.** Depending on RLS
  policies on `auth.users`, the user_metadata field can be
  client-editable. The `profiles` table is server-managed.

The per-request DB lookup is cheap (indexed on the user id, single row)
and is a fair trade for the reduced blast radius. If we ever need to
cut the DB hop we should cache within a request via a Redis session
store, not by trusting the JWT.

`require_instructor` uses a lazy import of
`app.auth.controller.get_user_role` to avoid a circular import between
`app.dependencies` and the controller (which imports the database
client which imports config which ... etc.).

---

## `/api/create-user` and privilege escalation

**File:** `backend/app/auth/views.py`

### The bug (pre-refactor)

The old endpoint was a single `upsert` keyed on the user id:

```python
# OLD — vulnerable
supabase.table('profiles').upsert(
    {"id": user_id, "email": email, "role": user_type},
    on_conflict='id',
).execute()
```

An already-authenticated student could POST to `/api/create-user` with
`{ userId: their_own_sub, userType: 'instructor' }`. The token/body
user id match check passed (they were targeting themselves) and the
upsert overwrote their existing `role: student` profile row.

### The fix

1. **INSERT-only.** The endpoint now does a `select` first and returns
   `409 Conflict` if a profile already exists. Role is fixed at signup.
2. **`userType` whitelist.** Validated server-side against
   `{'student', 'instructor'}` — we don't just echo the body field.
3. **Token/body id match.** Preserved from the old code.
4. **Frontend re-entry guard.** `RoleSelection.tsx` calls `loginCheck()`
   on mount and redirects users who already have a role, so the
   endpoint is never called twice from the happy path.

Role changes are now a deliberate admin path (not yet implemented).
Anything that tries to promote a student via `/api/create-user` will
hit the 409 and fail.

---

## CORS allowlist

**File:** `backend/app/config.py` (`_parse_origins`, `CORS_ORIGINS`)

```python
def _parse_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if "*" in origins:
        raise ValueError(
            "CORS_ORIGINS cannot contain '*' when credentials are allowed."
        )
    return origins
```

- `CORS_ORIGINS` is a comma-separated env var. The parser rejects `*`
  at load time, so a misconfigured prod env fails loudly on startup
  instead of silently breaking in the browser.
- If `CORS_ORIGINS` is unset the backend falls back to a dev allowlist
  covering `http://localhost:5173`, `http://127.0.0.1:5173`, and the
  `:3000` variants. In prod you must set `CORS_ORIGINS` explicitly —
  `settings.validate()` raises if the list resolves to empty.
- `CORS_METHODS` is the explicit list
  `[GET, POST, PATCH, PUT, DELETE, OPTIONS]` and `CORS_HEADERS` is
  narrowed to `[Authorization, Content-Type, Accept]`.

### Why not wildcard?

Because `allow_credentials=True` and `allow_origins=["*"]` are mutually
exclusive in the Fetch spec: the browser refuses preflight with that
combination. So the "wildcard CORS" we shipped before was actually
silently broken for any authenticated request — tests passed because
they hit unauthenticated endpoints, and authenticated calls failed in
a way that was easy to misattribute to token handling.

---

## Security headers middleware

**File:** `backend/app/middleware/security.py`

`SecurityHeadersMiddleware` adds the following to every response:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` |

These don't do much for JSON payloads on their own, but they matter if
the API is ever served from the same origin as the SPA (e.g. behind
nginx) because they also apply to error pages the API itself renders
and to any HTML surface (docs, `/redoc`) the host exposes. The CSP here
is intentionally minimal — the frontend SPA ships its own CSP via
nginx. Do **not** relax this CSP to allow scripts; the FastAPI host
should never serve executable JS.

### Middleware order

Starlette runs middleware in **reverse registration order** — the last
`add_middleware` call is the outermost. In `backend/app/main.py`:

```python
app.add_middleware(SecurityHeadersMiddleware)  # inner (registered first)
app.add_middleware(CORSMiddleware, ...)        # outer (registered last)
```

CORS must be outermost so it can handle `OPTIONS` preflight before the
request touches any other layer. Security headers run inside CORS,
which is fine — they apply to the eventual response body, and CORS
doesn't strip them on the way out.

---

## Automated tests

**Files:** `backend/pytest.ini`, `backend/tests/conftest.py`,
`backend/tests/test_auth_dependencies.py`

Before the refactor the backend had zero tests. Phase 6 added 17 cases
covering the pieces most likely to regress silently:

- `TestRequireUser` — missing header, malformed header, bearer with no
  token, bad signature, expired `exp`, valid token. Uses the real
  `/api/test-auth` view as the probe so the dependency → view → response
  wiring is exercised end-to-end, not just the dependency in isolation.
- `TestRequireInstructor` — instructor → 200, student → 403,
  `None` role → 403. Mocks `app.auth.controller.get_user_role` so the
  test doesn't need a live `profiles` table.
- `TestCorsAllowlist` — preflight from `http://localhost:5173` is
  allowed; preflight from `http://evil.example.com` does not get an
  `Access-Control-Allow-Origin` header.
- `TestSecurityHeaders` — parametrised over all six headers, asserts
  each one on a `GET /health` response.

### Running

```bash
cd backend
source .venv/bin/activate
pytest
```

`conftest.py` sets `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`,
and `CORS_ORIGINS` *before* importing the app, so tests never hit a
real Supabase project. Valid tokens are minted with `make_token(sub)`
which hand-signs an HS256 JWT using the test secret. Invalid tokens
use `make_token(..., secret='wrong-secret')` or
`make_token(..., expired=True)`.

Test-only dependencies (`pytest`, `httpx`) are listed under a
`# Test-only` block in `backend/requirements.txt`.

---

## Environment variables

Required at runtime:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL. Used by the DB client and the JWKS endpoint. |
| `SUPABASE_KEY` | Anon key. Used by the authenticated per-request client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Used by `service_client` for admin paths (e.g. `/api/create-user` can detect existing profiles without relying on RLS). |
| `SUPABASE_JWT_SECRET` | HS256 shared secret. Required if Supabase is issuing HS256 tokens. |
| `SUPABASE_JWK_JSON` | (Optional) Static JWK for air-gapped envs where the JWKS endpoint isn't reachable. Used as a fallback only. |
| `CORS_ORIGINS` | Comma-separated allowlist. Required in prod — must not contain `*`. |
| `ENVIRONMENT` | `development` or `production`. Used for logging context. |

Frontend (`frontend/.env` or inherited from the monorepo root):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Project URL for `createClient`. |
| `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_KEY`) | Anon key for `createClient`. |

---

## Phase commit map

| Phase | Commit | What it did |
|---|---|---|
| 1 | `83361d5` | PKCE flow, localStorage storage, `/auth/callback` race fix |
| 2 | `4275c47` | `require_user` / `require_instructor` dependencies; removed ~40 `if not payload` guards |
| 3 | `42463c1` | Google first-login routes through `/select`; `/api/create-user` is INSERT-only; `userType` whitelist; `RoleSelection.tsx` re-entry guard |
| 4 | `f950ed4` | `CORS_ORIGINS` allowlist with `*` rejection; `SecurityHeadersMiddleware` |
| 5 | `bfaa6c5` | `onAuthStateChange` dev-only logging; removed cookieStorage-era `signOut` workaround on Login; documented cross-tab propagation |
| 6 | `ebc280c` | `pytest` + 17-case auth dependency / CORS / headers test suite |
| 7 | (this commit) | `AUTH.md` + `CODE_REVIEW.md` status updates |

---

## Open items

These are documented as known gaps so no one re-discovers them:

- **`/api/projects/test-create` still ships.** It requires a valid JWT
  (`require_user`) but skips the instructor role check. It exists to
  back the `TestProjects.tsx` demo pages (`/test-115a-projects`,
  `/test-115b-projects`) and should be deleted along with those pages.
  See CODE_REVIEW.md #7.
- **Service role key is still used for most reads.** The dependency
  refactor addressed how *authentication* is enforced, but authorisation
  is still hand-coded in Python controllers rather than delegated to
  Supabase RLS. The right next step is per-request JWT-authenticated
  clients so RLS enforces access at the DB layer. See CODE_REVIEW.md #4.
- **No admin path for role changes.** Since `/api/create-user` is
  INSERT-only, there is currently no supported way to change a user's
  role after signup. A dedicated admin endpoint (gated on
  `require_instructor` + an `is_superadmin` flag we don't have yet) is
  the planned fix.
- **No rate limiting.** `slowapi` or an equivalent should wrap at least
  `/api/create-user` and the auth endpoints. CODE_REVIEW.md #5.
