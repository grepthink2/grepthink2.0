# Multi-Institution Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One GrepThink account can be the instructor of one class and a TA or student in another, at different schools; classes belong to maintainer-seeded institutions whose email domains decide what counts as a school email.

**Architecture:** The class membership is the only source of a role (`classes.created_by` → instructor, `class_enrollments.enrollment_role` → ta/student). `profiles.role` narrows to "may create classes" (`POST /api/classes` only). A new `institutions` table is read through a cached loader that answers `None` until the migration is applied, so the backend works on the schema that is live. The web client reads `my_role` from `GET /api/classes` through `useClassRole` / `useSelectedClassRole`; a school switcher in the profile dropdown filters the class switcher when active classes span 2+ schools.

**Tech Stack:** FastAPI + supabase-py (PostgREST) + pytest/`FakeSupabase`; React 19 + TypeScript + React Router 7 + Vitest/Testing Library; Supabase Postgres (SQL applied by hand).

**Spec:** `docs/superpowers/specs/2026-09-24-multi-institution-roles-design.md`

**Three deviations from the spec** (Task 9 updates the spec):
1. "Code must work on the schema that is live": the backend must run before the migration is applied, so institutions come from a cached loader that returns `None` when the table is missing (instead of a PostgREST embed that would 500).
2. "Update `supabase/schema.sql` once it is applied": `schema.sql` is NOT touched in this branch.
3. The school-email rule lives in `app/institutions/controller.py` (`is_school_email`), not `app/core/school_email.py`, so `core` never imports a feature module.

**Gates** (AGENTS.md "Before you commit"):
- Backend: `cd backend && .venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/python -m pytest` — baseline 629 passed.
- Frontend: `cd frontend && npm run lint && npm run lint:design && npm run build && npx vitest run` — baseline all green.

**Parallelism:** Tasks 1–8 touch only `backend/`; Tasks 10–17 touch only `frontend/`. They can run in parallel (separate worktrees). Task 9 (docs) and Task 18 (verification) run after both.

---

## File map

**Backend (create)**
- `backend/database/migrations/2026-09-25_institutions.sql` — expand migration (DEV + PROD).
- `backend/database/migrations/2026-09-25_seed_istinye.sql` — İstinye row (DEV + PROD).
- `backend/database/migrations/prod/2026-09-25_scott_class_creation.sql` — PROD-only role flip, after the release.
- `backend/app/institutions/{__init__,controller,views,url}.py` — cached loader, `is_school_email`, `GET /api/institutions`.
- `backend/tests/test_institutions.py`, `backend/tests/test_class_scoped_roles.py`.

**Backend (modify)**
- `backend/app/main.py` (router), `backend/tests/conftest.py` (autouse institutions fixture)
- `backend/app/core/authz.py` (`ROLE_INSTRUCTOR`, docstring)
- `backend/app/classes/{controller,views,models}.py`
- `backend/app/tas/views.py`
- `backend/app/assignments/controller.py`
- `backend/app/projects/controller.py`
- `backend/app/messages/controller.py`
- `backend/app/auth/{views,controller}.py`, `backend/app/profiles/controller.py`, `backend/app/notifications/controller.py`
- Tests: `test_classes_create_and_list.py`, `test_authz_status_policy.py`, `test_final_reviews.py`, `test_classes_reads.py`, `test_classes_authz.py`, `test_classes_invites.py`, `test_messages_can_message.py`, `test_messages_contacts.py`, `test_assignments.py`, `test_auth_hardening.py` (+ any other test the gates show failing because of these changes).

**Frontend (create)**
- `frontend/src/lib/api/institutions.ts`, `frontend/src/lib/institutions.ts`, `frontend/src/lib/schoolEmail.ts`
- `frontend/src/features/app/components/Layout/ClassRouteGuard.tsx`, `frontend/src/features/app/components/Layout/SchoolSwitcher.tsx`
- Tests: `lib/__tests__/classRole.test.tsx`, `lib/__tests__/schoolEmail.test.ts`, `features/app/config/__tests__/routePermissions.test.ts`, `features/app/config/__tests__/sidebar.test.ts`, `features/app/components/Layout/__tests__/SchoolSwitcher.test.tsx`, `features/app/pages/__tests__/MyClasses.roles.test.tsx`

**Frontend (modify)**
- `lib/api/types.ts`, `lib/api/classes.ts`, `lib/api.ts`, `lib/classContext.tsx`, `lib/auth.tsx`
- `features/app/config/{sidebar,routePermissions}.ts`, `features/app/AppView.tsx`
- `features/app/components/Layout/{Sidebar,Header,PreviewBanner}.tsx` (+ `Sidebar.scss`, `Header.scss`)
- `features/app/pages/{Home,MyClasses,ProjectDetails,CreateProject,Roster,TAMeetings,FinalReviews,TAManagement,Settings}.tsx` (+ `MyClasses.scss`)
- `features/app/components/Classes/CreateClassModal.tsx`, `features/app/components/Project/{ProjectView,MemberManagerModal}.tsx`, `features/app/components/RequireReviewAccess.tsx`, `features/app/components/Settings/EduVerifyModal.tsx`
- `features/auth/pages/AccountDetails.tsx`, `features/auth/components/SignUp.tsx`, `App.tsx`
- Tests: `lib/__tests__/authRole.test.tsx`, `lib/__tests__/apiFacade.test.ts`, `features/app/pages/__tests__/FinalReviews.timeEdit.test.tsx`, `features/app/pages/__tests__/Settings.eduEmail.test.tsx`

**Frontend (delete)**
- `lib/enrollmentRole.ts`, `lib/__tests__/enrollmentRole.test.ts`, `features/classes/pages/ClassManagement.{tsx,scss}`

---

## Task 1: Migration scripts

**Files:**
- Create: `backend/database/migrations/2026-09-25_institutions.sql`
- Create: `backend/database/migrations/2026-09-25_seed_istinye.sql`
- Create: `backend/database/migrations/prod/2026-09-25_scott_class_creation.sql`

- [ ] **Step 1: Write the expand migration**

`backend/database/migrations/2026-09-25_institutions.sql`:

```sql
-- 2026-09-25 — institutions: the school each class belongs to
--
-- EXPAND, idempotent, one transaction. Safe on either side of the code deploy: the backend reads
-- institutions through a cached loader (app/institutions/controller.py) that keeps the behaviour
-- from before institutions (no schools; ".edu" is the only school email) while this table does
-- not exist. Update supabase/schema.sql once this is applied (AGENTS.md).
--
-- Applied: DEV ____-__-__   PROD ____-__-__
--
--   * institutions (name, slug, email_domains): one row per school, added by a maintainer
--     (supabase/README.md, "Institutions"). RLS on with no policies and no client privileges:
--     only the service role reads it; the backend serves the list at GET /api/institutions.
--   * classes.institution_id: nullable until a later contract step. Every existing class is
--     assigned to UC Santa Cruz, the only school GrepThink has served so far.
--   * An address counts as a school email when its domain ends in .edu, or is one of an
--     institution's email_domains, or a subdomain of one (stu.istinye.edu.tr ⊂ istinye.edu.tr).

BEGIN;

CREATE TABLE IF NOT EXISTS public.institutions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  slug          text        NOT NULL,
  email_domains text[]      NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_slug_key UNIQUE (slug),
  CONSTRAINT institutions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutions FROM anon, authenticated;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions (id);

CREATE INDEX IF NOT EXISTS idx_classes_institution_id ON public.classes (institution_id);

INSERT INTO public.institutions (name, slug, email_domains)
VALUES ('UC Santa Cruz', 'ucsc', '{ucsc.edu}')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.classes
   SET institution_id = (SELECT id FROM public.institutions WHERE slug = 'ucsc')
 WHERE institution_id IS NULL;

COMMIT;

-- Check. Expected: one row per institution and 0 unassigned classes.
SELECT i.slug,
       array_to_string(i.email_domains, ', ')                                AS email_domains,
       (SELECT count(*) FROM public.classes c WHERE c.institution_id = i.id)  AS classes,
       (SELECT count(*) FROM public.classes c WHERE c.institution_id IS NULL) AS unassigned
  FROM public.institutions i
 ORDER BY i.slug;
```

- [ ] **Step 2: Write the İstinye seed**

`backend/database/migrations/2026-09-25_seed_istinye.sql`:

```sql
-- 2026-09-25 — add İstinye University
--
-- DATA, idempotent. Requires 2026-09-25_institutions.sql. Run on DEV and PROD. The app picks the
-- new school up within five minutes (the backend caches the institution list).
--
-- Before running: confirm with Scott that istinye.edu.tr is the base domain of İstinye addresses.
-- Subdomains (for example stu.istinye.edu.tr) already match, so list base domains only.
--
-- Applied: DEV ____-__-__   PROD ____-__-__

INSERT INTO public.institutions (name, slug, email_domains)
VALUES ('İstinye University', 'istinye', '{istinye.edu.tr}')
ON CONFLICT (slug) DO NOTHING;

-- Check. Expected: istinye | İstinye University | istinye.edu.tr
SELECT slug, name, array_to_string(email_domains, ', ') AS email_domains
  FROM public.institutions
 WHERE slug = 'istinye';
```

- [ ] **Step 3: Write the PROD-only role flip**

`backend/database/migrations/prod/2026-09-25_scott_class_creation.sql`:

```sql
-- 2026-09-25 — let Scott create classes (PROD only)
--
-- STAGED, NOT APPLIED. Nothing runs the files in this directory. Target: PROD.
--
-- ⚠️  ORDER: run only AFTER the per-class-roles release is live on PROD (beta → main deployed).
--     On the code PROD runs before that release, an instructor account sees only the classes it
--     created, so Scott's UCSC TA classes would disappear from their class list.
--
-- profiles.role now means only "may create classes". The classes Scott TAs keep working through
-- their class_enrollments rows. The backend caches roles, so this takes effect within 60 seconds.
--
-- Replace <scott-login-email> (twice below, plus the check) with the email of Scott's GrepThink
-- account, then run the whole file. It changes at most one row and rolls back otherwise.
--
-- Applied: PROD ____-__-__

BEGIN;

UPDATE public.profiles
   SET role = 'instructor'
 WHERE lower(email) = lower('<scott-login-email>')
   AND role = 'student';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles
       WHERE lower(email) = lower('<scott-login-email>') AND role = 'instructor') <> 1 THEN
    RAISE EXCEPTION 'expected exactly one instructor profile for that email; nothing was changed';
  END IF;
END $$;

COMMIT;

-- Check: Scott is an instructor and still holds their UCSC enrollments (enrollment_role = 'ta').
SELECT p.email, p.role, c.name AS class, e.enrollment_role
  FROM public.profiles p
  LEFT JOIN public.class_enrollments e ON e.user_id = p.id
  LEFT JOIN public.classes c ON c.id = e.class_id
 WHERE lower(p.email) = lower('<scott-login-email>');
```

- [ ] **Step 4: Commit**

```bash
git add backend/database/migrations/2026-09-25_institutions.sql backend/database/migrations/2026-09-25_seed_istinye.sql backend/database/migrations/prod/2026-09-25_scott_class_creation.sql
git commit -m "feat(db): institutions migration, İstinye seed and staged PROD role flip"
```

---

## Task 2: Institutions loader, school-email rule, `GET /api/institutions`

**Files:**
- Create: `backend/app/institutions/__init__.py` (empty), `controller.py`, `views.py`, `url.py`
- Modify: `backend/app/main.py`, `backend/tests/conftest.py`
- Test: `backend/tests/test_institutions.py`

- [ ] **Step 1: Prime the institutions cache for every test**

Append to `backend/tests/conftest.py`:

```python
#: The institution list every test starts from (see ``_known_institutions``).
UCSC_INSTITUTION = {
    "id": "00000000-0000-4000-8000-0000000000c5",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
}


@pytest.fixture(autouse=True)
def _known_institutions(monkeypatch):
    """Serve a fixed institution list (UC Santa Cruz) from the in-process cache.

    ``load_institutions`` caches for minutes. Without this, whichever test ran first would
    decide what later tests see, and the first read in each test would cost a round trip that
    no budget expects. Tests of the loader itself call ``clear_institutions_cache()``.
    """
    from app.institutions import controller as institutions

    monkeypatch.setattr(institutions, "_cache", (float("inf"), [dict(UCSC_INSTITUTION)]))
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_institutions.py`:

```python
"""Institutions: the cached loader, the school-email rule and ``GET /api/institutions``."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.core.errors import DatabaseError
from app.institutions import controller as institutions
from app.limiter import limiter
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
}
IST = {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "İstinye University",
    "slug": "istinye",
    "email_domains": [" Istinye.edu.TR "],
}


class _Unreadable:
    """A client whose every table read fails the way a missing table does."""

    def table(self, _name):
        raise DatabaseError(
            operation="read",
            target="institutions",
            pg_code="PGRST205",
            pg_message="Could not find the table 'public.institutions' in the schema cache",
        )


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(institutions=[dict(UCSC), dict(IST)])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    institutions.clear_institutions_cache()
    return fake


@pytest.fixture
def unmigrated(monkeypatch):
    institutions.clear_institutions_cache()
    monkeypatch.setattr(institutions, "get_client", lambda: _Unreadable())


def test_the_list_is_read_once_then_served_from_memory(db):
    first = institutions.load_institutions()
    assert [i["slug"] for i in first] == ["ucsc", "istinye"]  # ordered by name
    assert institutions.load_institutions() == first
    assert db.executes == 1


def test_domains_are_trimmed_and_lower_cased(db):
    ist = next(i for i in institutions.load_institutions() if i["slug"] == "istinye")
    assert ist == {**IST, "email_domains": ["istinye.edu.tr"]}


def test_a_missing_table_means_no_institutions_for_a_minute(unmigrated):
    assert institutions.load_institutions() is None
    expires_at, value = institutions._cache
    assert value is None
    assert expires_at - time.monotonic() <= 60


def test_summaries_and_known_ids(db):
    assert institutions.institution_summaries()[IST["id"]] == {
        "id": IST["id"],
        "name": "İstinye University",
        "slug": "istinye",
    }
    assert institutions.is_known_institution(IST["id"]) is True
    assert institutions.is_known_institution("33333333-3333-4333-8333-333333333333") is False


@pytest.mark.parametrize(
    ("email", "expected"),
    [
        ("ann@ucsc.edu", True),
        ("Ann@UCSC.EDU", True),
        ("ann@gatech.edu", True),  # any .edu counts, added or not
        ("ann@istinye.edu.tr", True),
        ("ann@stu.istinye.edu.tr", True),  # a subdomain of an institution domain
        ("ann@evil-istinye.edu.tr", False),
        ("ann@istinye.edu.tr.example.com", False),
        ("ann@gmail.com", False),
        ("not-an-email", False),
        ("", False),
        (None, False),
    ],
)
def test_school_email(db, email, expected):
    assert institutions.is_school_email(email) is expected


def test_before_the_migration_only_edu_counts(unmigrated):
    assert institutions.is_school_email("ann@ucsc.edu") is True
    assert institutions.is_school_email("ann@istinye.edu.tr") is False


def test_the_list_is_public_and_cacheable(client: TestClient, db):
    res = client.get("/api/institutions")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=300"
    assert res.json() == {
        "institutions": [
            UCSC,
            {**IST, "email_domains": ["istinye.edu.tr"]},
        ]
    }


def test_the_list_is_empty_before_the_migration(client: TestClient, unmigrated):
    res = client.get("/api/institutions")
    assert res.status_code == 200
    assert res.json() == {"institutions": []}


def test_the_list_is_rate_limited():
    assert "app.institutions.views.list_institutions" in limiter._route_limits
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_institutions.py -q`
Expected: collection error (`ModuleNotFoundError: No module named 'app.institutions'`).

- [ ] **Step 4: Write the module**

`backend/app/institutions/__init__.py`: empty file.

`backend/app/institutions/controller.py`:

```python
"""Institutions: the schools classes belong to.

Maintainers add the rows by hand (``supabase/README.md``, "Institutions"); the app only reads
them. The table is a handful of rows read on hot paths (every class list, every school-email
check), so the list is cached in process for five minutes: a newly added school shows up within
that long.

Until ``2026-09-25_institutions.sql`` is applied the table does not exist. ``load_institutions``
then answers ``None`` and every caller keeps the behaviour from before institutions: no schools,
and ``.edu`` is the only school email. AGENTS.md: code must work on the schema that is live.
"""

from __future__ import annotations

import logging
import threading
import time

from app.core.db import get_client
from app.core.errors import DatabaseError

logger = logging.getLogger(__name__)

INSTITUTION_COLUMNS = "id, name, slug, email_domains"

#: How long the list is served from memory. A school a maintainer adds appears within this long.
_TTL_SECONDS = 300.0
#: How long "the table cannot be read" is remembered before the next attempt.
_UNAVAILABLE_TTL_SECONDS = 60.0

_lock = threading.Lock()
#: ``(expires_at, institutions or None)``; ``expires_at`` is on the ``time.monotonic()`` clock.
_cache: tuple[float, list[dict] | None] | None = None


def _normalized(row: dict) -> dict:
    domains = [str(d).strip().lower() for d in (row.get("email_domains") or []) if str(d).strip()]
    return {
        "id": str(row["id"]),
        "name": row.get("name") or "",
        "slug": row.get("slug") or "",
        "email_domains": domains,
    }


def load_institutions() -> list[dict] | None:
    """Every institution as ``{id, name, slug, email_domains}``, ordered by name.

    ``None`` when the table cannot be read (the migration is not applied yet, or the database
    failed). Callers treat that as "no institutions", and must not select
    ``classes.institution_id`` either: the column arrives with the table.
    """
    global _cache
    now = time.monotonic()
    with _lock:
        if _cache is not None and _cache[0] > now:
            return _cache[1]
    try:
        rows = (
            get_client().table("institutions").select(INSTITUTION_COLUMNS).order("name").execute()
        ).data or []
        value: list[dict] | None = [_normalized(row) for row in rows]
        ttl = _TTL_SECONDS
    except DatabaseError:
        logger.warning("institutions: table unreadable, treating it as empty", exc_info=True)
        value, ttl = None, _UNAVAILABLE_TTL_SECONDS
    with _lock:
        _cache = (now + ttl, value)
    return value


def clear_institutions_cache() -> None:
    """Forget the cached list, so the next read goes to the database."""
    global _cache
    with _lock:
        _cache = None


def institution_summaries() -> dict[str, dict]:
    """``{id: {id, name, slug}}`` for every institution: what a class row embeds."""
    return {
        i["id"]: {"id": i["id"], "name": i["name"], "slug": i["slug"]}
        for i in load_institutions() or []
    }


def is_known_institution(institution_id) -> bool:
    """True when ``institution_id`` names an existing institution."""
    return str(institution_id) in {i["id"] for i in load_institutions() or []}


def email_domain(email: str | None) -> str:
    """The lower-cased part after the last ``@``, or ``""`` when there is none."""
    address = (email or "").strip().lower()
    return address.rsplit("@", 1)[1] if "@" in address else ""


def is_school_email(email: str | None) -> bool:
    """True for an address at a school.

    Its domain ends in ``.edu`` (so US schools that have not been added still count), or is one
    of an institution's ``email_domains``, or a subdomain of one: ``stu.istinye.edu.tr`` matches
    ``istinye.edu.tr``; ``evil-istinye.edu.tr`` does not.
    """
    domain = email_domain(email)
    if not domain:
        return False
    if domain.endswith(".edu"):
        return True
    return any(
        domain == allowed or domain.endswith(f".{allowed}")
        for institution in load_institutions() or []
        for allowed in institution["email_domains"]
    )
```

`backend/app/institutions/views.py`:

```python
"""Institutions views."""

from fastapi import Request, Response

from app.institutions import controller
from app.limiter import limiter


@limiter.limit("60/minute")
def list_institutions(request: Request, response: Response):
    """Public: the schools GrepThink knows, for the Create Class picker and for the school-email
    check at signup, which runs before the user is signed in. Empty until the migration is applied.
    """
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"institutions": controller.load_institutions() or []}
```

`backend/app/institutions/url.py`:

```python
"""Institution routes."""

from fastapi import APIRouter

from app.institutions import views

router = APIRouter(prefix="/api/institutions", tags=["institutions"])

router.get("")(views.list_institutions)
```

In `backend/app/main.py` add `from app.institutions.url import router as institutions_router` next to the other router imports (alphabetical: after `from app.health.url import ...`), and add `institutions_router,` to the tuple of routers right after `classes_router,`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_institutions.py -q`
Expected: all pass. If `test_the_list_is_rate_limited` fails, print `list(limiter._route_limits)` and assert against the key slowapi actually uses for the view (it is `f"{func.__module__}.{func.__name__}"`).

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 629 + the new tests pass (the autouse fixture must not break anything).

- [ ] **Step 7: Commit**

```bash
git add backend/app/institutions backend/app/main.py backend/tests/conftest.py backend/tests/test_institutions.py
git commit -m "feat(backend): cached institutions loader, school-email rule and GET /api/institutions"
```

---

## Task 3: Use the school-email rule everywhere `.edu` was hard-coded

**Files:**
- Modify: `backend/app/auth/views.py` (lines ~68, 119, 144–146, 257–273, 338)
- Modify: `backend/app/profiles/controller.py` (lines ~33–43, 149, 152–156, 211, 237–259, 306, 366)
- Modify: `backend/app/notifications/controller.py` (lines ~207–242)
- Test: `backend/tests/test_auth_hardening.py` (+ fix string assertions anywhere the gate finds them)

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_auth_hardening.py` (it already has the `client`, `auth_header`, `db` and `mailer` fixtures; `db` holds USER with `email = "ann@gmail.com"`, `role = "student"`, no `edu_email`):

```python
# ── school email: .edu or an institution's domains ───────────────────────────────

IST = {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "İstinye University",
    "slug": "istinye",
    "email_domains": ["istinye.edu.tr"],
}


@pytest.fixture
def with_istinye(monkeypatch):
    from app.institutions import controller as institutions
    from tests.conftest import UCSC_INSTITUTION

    monkeypatch.setattr(
        institutions, "_cache", (float("inf"), [dict(UCSC_INSTITUTION), dict(IST)])
    )


def test_an_institution_domain_can_be_verified_as_a_school_email(
    client, auth_header, db, mailer, with_istinye
):
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@stu.istinye.edu.tr"},
    )
    assert res.status_code == 200, res.text
    assert _pending(db)[0]["edu_email"] == "ann@stu.istinye.edu.tr"


def test_an_address_at_no_school_is_refused(client, auth_header, db, mailer, with_istinye):
    res = client.post(
        "/api/profiles/send-edu-verification",
        headers=auth_header,
        json={"edu_email": "ann@example.com"},
    )
    assert (res.status_code, res.json()["detail"]) == (400, "Must be a valid school email address")
    assert _pending(db) == []
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_hardening.py -q -k "school_email or no_school"`
Expected: the first fails with 400 (`.edu.tr` rejected), the second fails on the detail text.

- [ ] **Step 3: Change `backend/app/profiles/controller.py`**

1. Add the import: `from app.institutions.controller import is_school_email`.
2. Replace the `_EDU_EMAIL` block (comment + regex) with:

```python
# One mailbox: no whitespace (so no header injection through the ``To:`` line), no angle
# brackets (the address is echoed into the email's HTML), a single ``@``. Whether the host is a
# school is is_school_email's call (.edu, or an institution's email_domains).
_MAILBOX = re.compile(r"[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+")
```

3. `_profile_incomplete` last line becomes:

```python
    return role == "student" and not is_school_email(email) and not edu_email
```

4. `_normalize_edu_email` becomes:

```python
def _normalize_edu_email(raw: str | None) -> str:
    email = (raw or "").strip().lower()
    if not _MAILBOX.fullmatch(email) or not is_school_email(email):
        raise HTTPException(status_code=400, detail="Must be a valid school email address")
    return email
```

5. Every `"This .edu email is already linked to another account."` → `"This school email is already linked to another account."`
6. In `send_edu_verification`: body text `"Your GrepThink .edu verification code is: {code}"` → `"Your GrepThink school email verification code is: {code}"`; subject `"GrepThink — verify your .edu email"` → `"GrepThink — verify your school email"`. Update docstrings/comments that say ".edu" to say "school email" (keep function names and the `edu_email` column name).

- [ ] **Step 4: Change `backend/app/auth/views.py`**

1. Add the import: `from app.institutions.controller import is_school_email`.
2. In `_insert_profile`: `if email.endswith(".edu"):` → `if is_school_email(email):`.
3. In `_backfill_edu_email`: `if not email.endswith(".edu"):` → `if not is_school_email(email):` and the comment's ".edu" → "school email".
4. The signup conflict block: `if email.endswith(".edu") and service_configured:` → `if is_school_email(email) and service_configured:`; its detail → `"This school email is already linked to another account."`; its comment's ".edu" → "school email".
5. Docstrings at `create_user` (~line 68) and `check_email` (~line 338): ".edu address"/".edu email address" → "school email address".

- [ ] **Step 5: Change `backend/app/notifications/controller.py`**

1. Add the import: `from app.institutions.controller import is_school_email`.
2. `_profile_needs_completion`: docstring "a student lacks a roster .edu email" → "a student lacks a roster school email"; last line → `return role == "student" and not is_school_email(email) and not edu_email`.
3. `ensure_profile_completion_notification`: `if role == "student" and not email.endswith(".edu") and not edu_email:` → `if role == "student" and not is_school_email(email) and not edu_email:` and `missing.append("roster .edu email")` → `missing.append("roster school email")`.

- [ ] **Step 6: Update string assertions**

Run: `cd backend && grep -rn "\.edu email\|\.edu address\|roster \.edu\|verify your \.edu\|\.edu verification" tests`
For every hit that asserts on a message this task changed, update the expected text to the new wording. Do not change test data addresses (`@ucsc.edu` stays).

- [ ] **Step 7: Run the suite**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/auth/views.py backend/app/profiles/controller.py backend/app/notifications/controller.py backend/tests
git commit -m "feat(backend): school email = .edu or an institution's domains"
```

---

## Task 4: The class list returns owned ∪ enrolled classes with `my_role` and `institution`

**Files:**
- Modify: `backend/app/core/authz.py` (constants)
- Modify: `backend/app/classes/controller.py` (`get_classes_for_user`, ~lines 464–531)
- Modify: `backend/app/classes/views.py` (`get_classes`)
- Test: `backend/tests/test_classes_create_and_list.py`

- [ ] **Step 1: Add the constant**

In `backend/app/core/authz.py`, next to `ROLE_STUDENT = "student"` / `ROLE_TA = "ta"`, add:

```python
#: ``my_role`` for a class the caller created (``classes.created_by``).
ROLE_INSTRUCTOR = "instructor"
```

- [ ] **Step 2: Rewrite the class-list tests (they fail until Step 4)**

In `backend/tests/test_classes_create_and_list.py`:

1. Add constants and seed data. Replace the `list_db` fixture and the listing tests with:

```python
UCSC_ID = "00000000-0000-4000-8000-0000000000c5"  # tests.conftest.UCSC_INSTITUTION
IST_ID = "11111111-1111-4111-8111-111111111111"
C_IST = "class-ist"


@pytest.fixture
def list_db(monkeypatch):
    """C1 (INSTR, UCSC) has S1, S2 and TA1; C2 (OTHER_INSTR) has S1; C3 (INSTR) is empty;
    C_IST (created by TA1, İstinye) has S2."""
    fake = FakeSupabase(
        profiles=[
            {"id": INSTR, "email": "instr@ucsc.edu"},
            {"id": OTHER_INSTR, "email": "other@ucsc.edu"},
            {"id": S1, "email": "s1@ucsc.edu"},
            {"id": S2, "email": "s2@ucsc.edu"},
            {"id": TA1, "email": "ta1@ucsc.edu"},
            {"id": LONER, "email": "loner@ucsc.edu"},
        ],
        classes=[
            _class(C1, INSTR, "CSE 115C", "AAAA1111", institution_id=UCSC_ID),
            _class(C2, OTHER_INSTR, "CSE 110", "BBBB2222"),
            _class(C3, INSTR, "CSE 130", "CCCC3333", status="complete"),
            _class(C_IST, TA1, "SE 301", "DDDD4444", institution_id=IST_ID),
        ],
        class_enrollments=[
            {"id": "e1", "class_id": C1, "user_id": S1, "enrollment_role": "student"},
            {"id": "e2", "class_id": C2, "user_id": S1, "enrollment_role": None},
            {"id": "e3", "class_id": C1, "user_id": S2, "enrollment_role": "student"},
            {"id": "e4", "class_id": C1, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e5", "class_id": C_IST, "user_id": S2, "enrollment_role": "student"},
        ],
        relations={
            ("class_enrollments", "classes"): ("class_id", "id", False),
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.fixture
def two_schools(monkeypatch):
    from app.institutions import controller as institutions
    from tests.conftest import UCSC_INSTITUTION

    ist = {"id": IST_ID, "name": "İstinye University", "slug": "istinye", "email_domains": ["istinye.edu.tr"]}
    monkeypatch.setattr(institutions, "_cache", (float("inf"), [dict(UCSC_INSTITUTION), ist]))


UCSC_SUMMARY = {"id": UCSC_ID, "name": "UC Santa Cruz", "slug": "ucsc"}
IST_SUMMARY = {"id": IST_ID, "name": "İstinye University", "slug": "istinye"}

STUDENT_KEYS = {
    "id",
    "name",
    "description",
    "created_by",
    "created_at",
    "course_code",
    "status",
    "term",
    "start_date",
    "year",
    "image_url",
    "institution_id",
    "teacher_email",
    "enrolled_count",
    "my_role",
    "institution",
}


def test_students_see_their_classes_with_the_teacher_email(list_db):
    out = classes.get_classes_for_user(S1)
    assert [c["id"] for c in out] == [C1, C2]
    assert all(set(c) == STUDENT_KEYS for c in out), [sorted(c) for c in out]
    assert [(c["teacher_email"], c["enrolled_count"], c["my_role"]) for c in out] == [
        ("instr@ucsc.edu", 2, "student"),  # TAs are not counted
        ("other@ucsc.edu", 1, "student"),  # a NULL enrollment_role is a student
    ]
    assert [c["institution"] for c in out] == [UCSC_SUMMARY, None]
    # created and enrolled classes in one wave, then the counts
    assert list_db.executes <= 3, _trace(list_db)


def test_an_account_with_no_classes_gets_an_empty_list(list_db):
    assert classes.get_classes_for_user(LONER) == []
    assert list_db.executes == 2  # the two reads of the first wave, no counts


def test_instructors_see_the_classes_they_created(list_db):
    out = classes.get_classes_for_user(INSTR)
    by_id = {c["id"]: c for c in out}
    assert set(by_id) == {C1, C3}
    assert by_id[C1] == {
        **_class(C1, INSTR, "CSE 115C", "AAAA1111", institution_id=UCSC_ID),
        "enrolled_count": 2,
        "my_role": "instructor",
        "institution": UCSC_SUMMARY,
    }
    assert by_id[C3]["enrolled_count"] == 0
    assert list_db.executes <= 3, _trace(list_db)


def test_one_account_teaches_one_class_and_assists_in_another(list_db, two_schools):
    out = classes.get_classes_for_user(TA1)
    assert [(c["id"], c["my_role"], c["institution"]) for c in out] == [
        (C_IST, "instructor", IST_SUMMARY),  # created classes come first
        (C1, "ta", UCSC_SUMMARY),
    ]
    assert out[1]["teacher_email"] == "instr@ucsc.edu"


def test_a_class_both_created_and_enrolled_in_is_listed_once_as_taught(list_db):
    list_db.rows("class_enrollments").append(
        {"id": "e6", "class_id": C3, "user_id": INSTR, "enrollment_role": "student"}
    )
    out = classes.get_classes_for_user(INSTR)
    assert sorted((c["id"], c["my_role"]) for c in out) == [(C1, "instructor"), (C3, "instructor")]


def test_before_the_migration_classes_have_no_school(list_db, monkeypatch):
    from app.institutions import controller as institutions

    monkeypatch.setattr(institutions, "_cache", (float("inf"), None))
    out = classes.get_classes_for_user(S1)
    assert [c["institution"] for c in out] == [None, None]
    assert all("institution_id" not in c for c in out)  # not selected: the column may not exist


def test_class_list_lets_http_errors_through(list_db, monkeypatch):
    def unavailable(client, class_ids):
        raise HTTPException(status_code=503, detail="Service unavailable")

    monkeypatch.setattr(classes, "_enrollment_counts_by_class", unavailable)
    with pytest.raises(HTTPException) as exc:
        classes.get_classes_for_user(S1)
    assert (exc.value.status_code, exc.value.detail) == (503, "Service unavailable")
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_classes_create_and_list.py -q`
Expected: FAIL — `get_classes_for_user()` takes 2 positional arguments.

- [ ] **Step 4: Rewrite `get_classes_for_user`**

In `backend/app/classes/controller.py`:

1. Add the import: `from app.institutions.controller import load_institutions`.
2. Above `get_classes_for_user`, add:

```python
#: The class columns an enrolled student or TA may see (no review Zoom room, no settings).
_ENROLLED_CLASS_COLUMNS = (
    "id, name, description, created_by, created_at, course_code, status, term, start_date, "
    "year, image_url"
)
```

3. Replace the whole `get_classes_for_user` function with:

```python
def get_classes_for_user(user_id: str) -> list:
    """Every class the user created or is enrolled in, each with ``my_role``.

    ``my_role`` is ``'instructor'`` for a class the user created, else the enrollment role
    (``'ta'``, or ``'student'`` for anything else). A class the user both created and is
    enrolled in is listed once, as taught. Created classes come first with the full row;
    enrolled ones carry the columns students may see plus ``teacher_email``. Every class carries
    ``enrolled_count`` (students, not TAs) and ``institution`` (``{id, name, slug}`` or ``None``).

    Round trips: the created and the enrolled classes in one concurrent wave, then the
    enrollment counts. Institutions come from their in-process cache; before the institutions
    migration is applied (``load_institutions() is None``) ``institution_id`` is not selected.
    """
    try:
        client = get_client()
        institutions = load_institutions()
        enrolled_columns = _ENROLLED_CLASS_COLUMNS
        if institutions is not None:
            enrolled_columns += ", institution_id"
        reads = fan_out(
            {
                "owned": lambda: (
                    client.table("classes").select("*").eq("created_by", user_id).execute()
                ).data
                or [],
                "enrolled": lambda: (
                    client.table("class_enrollments")
                    .select(
                        f"enrollment_role, classes({enrolled_columns}, "
                        "instructor:profiles!classes_created_by_fkey(email))"
                    )
                    .eq("user_id", user_id)
                    .execute()
                ).data
                or [],
            }
        )

        classes: list[dict] = []
        seen: set[str] = set()
        for cls in reads["owned"]:
            cls["my_role"] = authz.ROLE_INSTRUCTOR
            classes.append(cls)
            seen.add(str(cls["id"]))
        for row in reads["enrolled"]:
            cls = row.get("classes")
            if not cls or str(cls["id"]) in seen:
                continue
            instructor = cls.pop("instructor", None) or {}
            cls["teacher_email"] = instructor.get("email")
            cls["my_role"] = (
                authz.ROLE_TA if row.get("enrollment_role") == authz.ROLE_TA else authz.ROLE_STUDENT
            )
            classes.append(cls)
            seen.add(str(cls["id"]))
        if not classes:
            return []

        summaries = {
            i["id"]: {"id": i["id"], "name": i["name"], "slug": i["slug"]}
            for i in institutions or []
        }
        for cls in classes:
            institution_id = cls.get("institution_id")
            cls["institution"] = summaries.get(str(institution_id)) if institution_id else None

        _attach_enrolled_counts(
            classes, _enrollment_counts_by_class(client, [c["id"] for c in classes])
        )
        return classes
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching classes | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to fetch classes")
```

4. In `backend/app/classes/views.py`, replace `get_classes` with:

```python
def get_classes(user_id: str = Depends(require_user)):
    """Every class the caller created or is enrolled in, each with the caller's ``my_role``."""
    return {"classes": controller.get_classes_for_user(user_id)}
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_classes_create_and_list.py -q`
Expected: PASS. Then `grep -rn "get_classes_for_user" backend/tests backend/app` and fix any other caller still passing a role.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/authz.py backend/app/classes/controller.py backend/app/classes/views.py backend/tests/test_classes_create_and_list.py
git commit -m "feat(backend): class list = created ∪ enrolled classes with my_role and institution"
```

---

## Task 5: Creating a class records its institution

**Files:**
- Modify: `backend/app/classes/models.py` (`CreateClassRequest`), `backend/app/classes/views.py` (`create_class`), `backend/app/classes/controller.py` (`create_class`)
- Test: `backend/tests/test_classes_create_and_list.py`

- [ ] **Step 1: Write the failing tests** (append to `test_classes_create_and_list.py`, next to the other `create_class` tests, which use the `create_db` fixture and `_codes`)

```python
def test_create_class_records_a_known_institution(create_db, monkeypatch):
    _codes(monkeypatch, ["FREE0001"])
    created = classes.create_class(
        "SE 301", None, "Fall", datetime.date(2026, 9, 24), INSTR, institution_id=UCSC_ID
    )
    assert created["institution_id"] == UCSC_ID
    assert create_db.executes <= 4, _trace(create_db)


def test_create_class_refuses_an_unknown_institution_before_writing(create_db, monkeypatch):
    _codes(monkeypatch, ["FREE0001"])
    with pytest.raises(HTTPException) as exc:
        classes.create_class(
            "SE 301",
            None,
            "Fall",
            datetime.date(2026, 9, 24),
            INSTR,
            institution_id="99999999-9999-4999-8999-999999999999",
        )
    assert (exc.value.status_code, exc.value.detail) == (400, "Unknown institution")
    assert create_db.executes == 0


def test_create_class_without_an_institution_leaves_it_unset(create_db, monkeypatch):
    _codes(monkeypatch, ["FREE0001"])
    created = classes.create_class("SE 301", None, "Fall", datetime.date(2026, 9, 24), INSTR)
    assert "institution_id" not in created
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_classes_create_and_list.py -q -k institution`
Expected: FAIL — unexpected keyword argument `institution_id`.

- [ ] **Step 3: Implement**

`backend/app/classes/models.py`: add `from uuid import UUID` if missing, and add to `CreateClassRequest`:

```python
    #: The school the class belongs to (``GET /api/institutions``). Optional until the
    #: institutions contract step makes ``classes.institution_id`` required.
    institution_id: UUID | None = None
```

`backend/app/classes/views.py` `create_class`: pass `institution_id=data.institution_id` to `controller.create_class(...)`.

`backend/app/classes/controller.py`:
1. Extend the import: `from app.institutions.controller import is_known_institution, load_institutions`.
2. Change the signature to add `institution_id=None` as the last parameter, add to the docstring "``institution_id`` must name an existing institution (400 otherwise); omitted, the class has none.", and make the first statements inside `try:`:

```python
        if institution_id is not None and not is_known_institution(institution_id):
            raise HTTPException(status_code=400, detail="Unknown institution")
```

3. After `class_data` is built (next to `if description is not None:`), add:

```python
        if institution_id is not None:
            class_data["institution_id"] = str(institution_id)
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_classes_create_and_list.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/classes backend/tests/test_classes_create_and_list.py
git commit -m "feat(backend): POST /api/classes takes an optional institution_id"
```

---

## Task 6: Anyone with a chosen role can join a class; its instructor cannot

**Files:**
- Modify: `backend/app/classes/views.py` (`join_class`), `backend/app/classes/controller.py` (`join_class_by_code`)
- Test: `backend/tests/test_auth_hardening.py` (the join section)

- [ ] **Step 1: Write the failing tests** (append to the "joining a class" section of `test_auth_hardening.py`; its `db` fixture holds classes `class-1` / `class-2` created by `inst-1`, code of `class-1` is `QASBX26A`)

```python
def _header(sub: str) -> dict[str, str]:
    from tests.conftest import make_token

    return {"Authorization": f"Bearer {make_token(sub=sub)}"}


def test_an_instructor_account_can_join_another_instructors_class(client, db):
    db.rows("profiles").append({"id": "inst-join-2", "email": "i2@ucsc.edu", "role": "instructor"})
    res = client.post("/api/classes/join", headers=_header("inst-join-2"), json={"course_code": "QASBX26A"})
    assert res.status_code == 200, res.text
    assert [(e["class_id"], e["user_id"]) for e in db.rows("class_enrollments")] == [
        ("class-1", "inst-join-2")
    ]


def test_the_instructor_of_a_class_cannot_join_it(client, db):
    db.rows("profiles").append({"id": "inst-1", "email": "i1@ucsc.edu", "role": "instructor"})
    res = client.post("/api/classes/join", headers=_header("inst-1"), json={"course_code": "QASBX26A"})
    assert (res.status_code, res.json()["detail"]) == (409, "You are the instructor of this class")
    assert db.rows("class_enrollments") == []


def test_an_account_without_a_role_cannot_join(client, db):
    db.rows("profiles").append({"id": "no-role-join", "email": "n@gmail.com", "role": None})
    res = client.post("/api/classes/join", headers=_header("no-role-join"), json={"course_code": "QASBX26A"})
    assert (res.status_code, res.json()["detail"]) == (
        403,
        "Choose whether you are a student or an instructor first",
    )
    assert db.rows("class_enrollments") == []
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_hardening.py -q -k join`
Expected: the instructor-join test fails with 403 "Only students can join classes"; the owner test fails the same way.

- [ ] **Step 3: Implement**

`backend/app/classes/views.py`:

```python
def join_class(data: JoinClassRequest, user_id: str = Depends(require_user)):
    """Join a class with its course code. Any account that has picked a role may join (as a
    student; the instructor can then make them a TA). The class instructor cannot join their own
    class (409, checked in the controller)."""
    if get_user_role(user_id) is None:
        raise HTTPException(
            status_code=403, detail="Choose whether you are a student or an instructor first"
        )
    return controller.join_class_by_code(data.course_code, user_id)
```

`backend/app/classes/controller.py` `join_class_by_code`: right after `class_row = class_result.data[0]`, add:

```python
        if str(class_row.get("created_by")) == str(user_id):
            raise HTTPException(status_code=409, detail="You are the instructor of this class")
```

and change the docstring's first line to "Enroll the caller in a class using its course code (anyone but its instructor)".

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_hardening.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/classes backend/tests/test_auth_hardening.py
git commit -m "feat(backend): any account with a role can join a class, never its own"
```

---

## Task 7: Class endpoints stop checking the account role

**Files:**
- Modify: `backend/app/classes/views.py` (11 views), `backend/app/tas/views.py` (6 views)
- Modify: `backend/app/classes/controller.py` (`cancel_invite`)
- Modify: `backend/app/assignments/controller.py` (remove `_require_instructor`)
- Create: `backend/tests/test_class_scoped_roles.py`
- Modify: `backend/tests/test_authz_status_policy.py`, `backend/tests/test_final_reviews.py`

- [ ] **Step 1: Write the route-level test**

`backend/tests/test_class_scoped_roles.py`:

```python
"""Class endpoints are gated by the class, not by the account role.

Each endpoint below used to sit behind ``require_instructor``, which refused an account whose
``profiles.role`` is ``student`` even when it owned the class. Now the route only authenticates
and the controller's owner check decides (pinned per endpoint, with an enrolled student, in
``test_authz_status_policy.py``). Here the controller is replaced, so a 200 proves the route no
longer looks at the account role, and the recorded arguments prove the caller's id reaches the
owner check.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_token

OWNER = "0e3c2f9e-0000-4000-8000-000000000001"
MEMBER = "0e3c2f9e-0000-4000-8000-000000000002"
CLASS = "0e3c2f9e-0000-4000-8000-0000000000c1"
PROJECT = "0e3c2f9e-0000-4000-8000-0000000000b1"
CLASSES = "app.classes.views.controller"
TAS = "app.tas.views.controller"

ROUTES = [
    pytest.param("patch", f"/api/classes/{CLASS}/status", {"json": {"status": "complete"}}, f"{CLASSES}.update_class_status", {}, id="class-status"),
    pytest.param("post", f"/api/classes/{CLASS}/invite", {"json": {"student_email": "ann@ucsc.edu"}}, f"{CLASSES}.invite_student_to_class", {"message": "ok"}, id="invite"),
    pytest.param("get", f"/api/classes/{CLASS}/roster/timeline", {}, f"{CLASSES}.get_class_roster_timeline", {"students": []}, id="roster-timeline"),
    pytest.param("post", f"/api/classes/{CLASS}/roster", {"files": {"file": ("roster.csv", b"Name,Email\n", "text/csv")}}, f"{CLASSES}.upload_class_roster", {"ok": True}, id="roster-upload"),
    pytest.param("post", f"/api/classes/{CLASS}/roster/manual", {"json": {"first_name": "Ann", "last_name": "Lee", "email": "ann@ucsc.edu"}}, f"{CLASSES}.add_manual_roster_student", {"ok": True}, id="roster-manual-add"),
    pytest.param("delete", f"/api/classes/{CLASS}/roster/manual/entry-1", {}, f"{CLASSES}.delete_manual_roster_entry", {"ok": True}, id="roster-manual-delete"),
    pytest.param("get", f"/api/classes/{CLASS}/turn-in-stats", {}, f"{CLASSES}.get_class_turn_in_stats", None, id="turn-in-stats"),
    pytest.param("delete", f"/api/classes/{CLASS}/students/{MEMBER}", {}, f"{CLASSES}.remove_student_from_class", {"ok": True}, id="remove-student"),
    pytest.param("post", f"/api/classes/{CLASS}/students/bulk-invite", {"json": {"emails": ["ann@ucsc.edu"]}}, f"{CLASSES}.bulk_invite_students", {"results": []}, id="bulk-invite"),
    pytest.param("post", f"/api/classes/{CLASS}/invites/queue", {"json": {"emails": ["ann@ucsc.edu"]}}, f"{CLASSES}.queue_invite", {"job_id": "job-1", "send_at": "2026-09-25T00:00:00+00:00"}, id="queue-invite"),
    pytest.param("delete", f"/api/classes/{CLASS}/invites/job-1", {}, f"{CLASSES}.cancel_invite", {"cancelled": True}, id="cancel-invite"),
    pytest.param("get", f"/api/tas/classes/{CLASS}", {}, f"{TAS}.list_class_tas", [], id="list-tas"),
    pytest.param("post", f"/api/tas/classes/{CLASS}/promote", {"json": {"user_id": MEMBER}}, f"{TAS}.promote_to_ta", {"ok": True}, id="promote-ta"),
    pytest.param("post", f"/api/tas/classes/{CLASS}/demote", {"json": {"user_id": MEMBER}}, f"{TAS}.demote_ta", {"ok": True}, id="demote-ta"),
    pytest.param("post", f"/api/tas/classes/{CLASS}/review-window", {"json": {"open": True}}, f"{TAS}.set_review_window", {"ok": True}, id="review-window"),
    pytest.param("post", f"/api/tas/classes/{CLASS}/review-zoom", {"json": {"zoom_url": "https://zoom.us/j/1"}}, f"{TAS}.set_review_zoom", {"ok": True}, id="review-zoom"),
    pytest.param("post", f"/api/tas/projects/{PROJECT}/review-time", {"json": {"scheduled_at": "2026-12-01T20:00:00Z"}}, f"{TAS}.set_final_review_time", {"ok": True}, id="review-time"),
]


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


@pytest.mark.parametrize(("method", "path", "kwargs", "target", "returns"), ROUTES)
def test_a_class_owner_whose_account_is_a_student_reaches_the_owner_check(
    client: TestClient, monkeypatch, method, path, kwargs, target, returns
):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    calls: list[tuple[str, ...]] = []

    def controller(*args, **_kwargs):
        calls.append(tuple(str(a) for a in args))
        return returns

    monkeypatch.setattr(target, controller)
    res = getattr(client, method)(path, headers=_as(OWNER), **kwargs)

    assert res.status_code == 200, res.text
    assert len(calls) == 1 and OWNER in calls[0]


def test_creating_a_class_still_needs_the_instructor_role(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    res = client.post(
        "/api/classes",
        headers=_as(OWNER),
        json={"name": "CSE 115A", "term": "Fall", "start_date": "2026-09-24"},
    )
    assert (res.status_code, res.json()["detail"]) == (403, "Instructor role required")
```

If a stubbed return value fails response validation for a route with a response model, look at the view's return annotation (`QueueInviteResponse`, `CancelInviteResponse`) and match it; do not change the view.

- [ ] **Step 2: Add the enrolled-student rows to `test_authz_status_policy.py`**

In the `db` fixture add the relation `("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False)` (invites load the instructor's profile with the class), register any other relation `FakeSupabase` asks for with a `KeyError`, and delete the line `monkeypatch.setattr(projects, "get_user_role", ROLES.get)` (Task 8 removes that import). In `CASES`:
1. Rename `"assignments.create/student-profile"` to `"assignments.create/enrolled-student"` and expect `(403, NOT_CLASS_INSTRUCTOR)`.
2. Change `"assignments.list/other-instructor"` to expect `(403, NOT_ENROLLED)` (Task 8: someone who neither created nor joined the class gets the same answer whatever their account role).
3. Add these rows (every call is by `S1`, a student enrolled in `CLASS`, and must answer 403 `NOT_CLASS_INSTRUCTOR` without writing):

```python
    "classes.update_status/enrolled-student": (
        lambda db: classes.update_class_status(CLASS, "complete", S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.invite/enrolled-student": (
        lambda db: classes.invite_student_to_class(CLASS, "x@ucsc.edu", S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.roster_timeline/enrolled-student": (
        lambda db: classes.get_class_roster_timeline(CLASS, S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.roster_upload/enrolled-student": (
        lambda db: classes.upload_class_roster(CLASS, "Name,Email\n", S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.roster_manual_add/enrolled-student": (
        lambda db: classes.add_manual_roster_student(CLASS, "A", "B", "a@ucsc.edu", S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.roster_manual_delete/enrolled-student": (
        lambda db: classes.delete_manual_roster_entry(CLASS, "entry-1", S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.turn_in_stats/enrolled-student": (
        lambda db: classes.get_class_turn_in_stats(CLASS, S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.remove_student/enrolled-student": (
        lambda db: classes.remove_student_from_class(CLASS, TA1, S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.bulk_invite/enrolled-student": (
        lambda db: classes.bulk_invite_students(CLASS, ["x@ucsc.edu"], S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.queue_invite/enrolled-student": (
        lambda db: classes.queue_invite(CLASS, ["x@ucsc.edu"], S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "classes.cancel_invite/enrolled-student": (
        lambda db: classes.cancel_invite(CLASS, "job-1", S1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "tas.promote/enrolled-student": (
        lambda db: tas.promote_to_ta(S1, CLASS, TA1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "tas.demote/enrolled-student": (
        lambda db: tas.demote_ta(S1, CLASS, TA1), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "tas.list_class_tas/enrolled-student": (
        lambda db: tas.list_class_tas(S1, CLASS), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_review_window/enrolled-student": (
        lambda db: tas.set_review_window(S1, CLASS, True), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_review_zoom/enrolled-student": (
        lambda db: tas.set_review_zoom(S1, CLASS, "https://zoom.us/j/1"), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_final_review_time/enrolled-student": (
        lambda db: tas.set_final_review_time(
            S1, P1, datetime.datetime(2026, 12, 1, 20, tzinfo=datetime.UTC)
        ),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "assignments.update/enrolled-student": (
        lambda db: assignments.update_assignment(S1, A_FEEDBACK, "T", None, None, None), 403, NOT_CLASS_INSTRUCTOR,
    ),
    "assignments.delete/enrolled-student": (
        lambda db: assignments.delete_assignment(S1, A_FEEDBACK), 403, NOT_CLASS_INSTRUCTOR,
    ),
```

If one of these answers a different detail for the same condition, read the controller: every one of these must reach an owner check that answers `NOT_CLASS_INSTRUCTOR`; a row that cannot is a bug in the controller, not in the test.

- [ ] **Step 3: Delete the two endpoint tests the new file replaces**

In `backend/tests/test_final_reviews.py`, delete `test_review_zoom_endpoint_requires_instructor` and `test_review_time_endpoint_requires_instructor` (with their `@patch` decorators). The route layer is now covered by `test_class_scoped_roles.py`, and the owner check by `test_set_review_zoom_instructor_only` / `test_set_final_review_time_instructor_only`, which stay.

- [ ] **Step 4: Run the tests to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_scoped_roles.py tests/test_authz_status_policy.py -q`
Expected: every route in `test_class_scoped_roles.py` fails with 403 "Instructor role required"; the `assignments.create/enrolled-student` row fails with the old detail; `classes.cancel_invite/enrolled-student` fails with 404.

- [ ] **Step 5: Implement**

1. `backend/app/classes/views.py`: in `update_class_status`, `invite_student`, `get_class_roster_timeline`, `upload_class_roster`, `add_manual_roster_student`, `delete_manual_roster_entry`, `get_class_turn_in_stats`, `remove_student`, `bulk_invite`, `queue_invite`, `cancel_invite` change `user_id: str = Depends(require_instructor)` to `user_id: str = Depends(require_user)`, and in each docstring replace "(instructor only)" with "(the class instructor; checked in the controller)". `create_class` keeps `require_instructor`.
2. `backend/app/tas/views.py`: the same change in `promote_to_ta`, `demote_ta`, `list_class_tas`, `set_review_window`, `set_review_zoom`, `set_final_review_time`. Remove `require_instructor` from the import if nothing else uses it. Replace the comment `# Class-level TA management (instructor only).` in `backend/app/tas/url.py` with `# Class-level TA management (the class instructor; checked in the controller).`
3. `backend/app/classes/controller.py` `cancel_invite`: make the first statements inside `try:`

```python
        client = get_client()
        _require_owner(client, instructor_id, str(class_id))
```

(remove the now-duplicate `client = get_client()` below it) and add to the docstring: "404 when the class does not exist, 403 unless the caller created it."
4. `backend/app/assignments/controller.py`: delete the `_require_instructor` function and its three calls (in `create_assignment`, `update_assignment`, `delete_assignment`); each keeps its `_require_class_instructor` call. Update the docstrings that say "(instructor only)" to "(the class instructor only)".

- [ ] **Step 6: Run the suite**

Run: `cd backend && .venv/bin/ruff check . && .venv/bin/python -m pytest -q`
Expected: all pass. A test that fails because it expected `Instructor role required` from one of these endpoints should now expect the owner check's `Only the class instructor can do this`, or be removed if it only tested the old dependency.

- [ ] **Step 7: Commit**

```bash
git add backend/app backend/tests
git commit -m "feat(backend): class and TA endpoints rely on the class owner check, not the account role"
```

---

## Task 8: Remaining account-role branches become per-class

**Files:**
- Modify: `backend/app/classes/controller.py` (`get_class_projects`, `_project_cards`, `get_class_projects_overview`, `invite_student_to_class`, `bulk_invite_students`), `backend/app/classes/views.py`
- Modify: `backend/app/assignments/controller.py` (`get_assignments_for_class`)
- Modify: `backend/app/projects/controller.py` (`create_project`, `update_project`)
- Modify: `backend/app/messages/controller.py` (`can_message`, `get_profile_roles`, `list_contacts`)
- Tests: `test_classes_reads.py`, `test_classes_authz.py`, `test_assignments.py`, `test_classes_invites.py`, `test_messages_can_message.py`, `test_messages_contacts.py` (+ whatever the gate shows)

- [ ] **Step 1: Project cards show sentiment to the class instructor only**

`_project_cards(projects, role, lead_profile)` → `_project_cards(projects, show_sentiment: bool, lead_profile)`; its card line becomes `"sentiment": project.get("sentiment") if show_sentiment else None,` and its docstring says "``sentiment`` only when ``show_sentiment`` (the caller created the class)". `get_class_projects(class_id, user_id)` and `get_class_projects_overview(class_id, user_id)` lose the `role` parameter and pass `reads["access"]["is_instructor"]` (the `ClassAccess` that `_require_member` returns). In `backend/app/classes/views.py`, `get_class_projects` / `get_class_projects_overview` stop calling `get_user_role` and call the controller with `(class_id, user_id)`.

Update `test_classes_reads.py` and `test_classes_authz.py`: drop the third argument from every `get_class_projects(...)` / `get_class_projects_overview(...)` call (in `test_classes_reads.py` that is the `projects()` / `overview()` helpers; remove the `_role` helper once unused). Add to `test_classes_reads.py` (its `db` fixture, `INSTR`, `TA1`, `CLASS` and the `projects()` helper already exist):

```python
def test_only_the_class_instructor_sees_sentiment_whatever_the_account_role(db):
    # TA1's account can be an instructor elsewhere; here they assist, so no sentiment.
    next(p for p in db.rows("profiles") if p["id"] == TA1)["role"] = "instructor"
    assert {c["sentiment"] for c in projects(TA1)} == {None}
    assert any(c["sentiment"] is not None for c in projects(INSTR))
```

- [ ] **Step 2: The assignments list branches on ownership**

In `get_assignments_for_class`, delete the `"role"` read from the `fan_out` and the `role = ...` line, then replace the branch with:

```python
        if str(cls.get("created_by")) == str(user_id):
            return _with_instructor_stats(client, cid, assignments)

        if not reads["enrolled"]:
            raise HTTPException(status_code=403, detail=authz.NOT_ENROLLED)
        return [a for a in assignments if a.get("status") == "publish"]
```

Docstring: "- The class instructor (``classes.created_by``) sees every status, with stats. - Anyone enrolled (student or TA) sees published assignments. - Anyone else: 403 ``NOT_ENROLLED``, whatever their account role." Round-trip note: "the class, the caller's enrollment and the assignments are read concurrently".

Add to `test_assignments.py` (its `db` fixture enrolls `TA1` in `CLASS` as a TA; `A_TSR`/`A_FB` are published, `A_DRAFT` is a draft):

```python
def test_a_ta_whose_account_is_an_instructor_sees_published_assignments(db):
    # Make TA1's account an instructor: the list must still treat them as enrolled, not refuse.
    next(p for p in db.rows("profiles") if p["id"] == TA1)["role"] = "instructor"
    out = assignments.get_assignments_for_class(TA1, CLASS)
    assert out and all(a["status"] == "publish" for a in out)
```

- [ ] **Step 3: Projects: the class instructor is whoever created the class**

`create_project`: delete `user_role = get_user_role(user_id)` and its comment; `is_instructor = str(class_row.get("created_by")) == str(user_id)`; inside `if not is_instructor:` delete the `if user_role != "student": raise ...` block (keep the enrollment and one-project checks). Update the docstring: "The class instructor (its creator) may create projects with sponsor information; anyone enrolled (student or TA) may create one without it."

`update_project`: replace the block that reads `profiles.role` and then `classes` with:

```python
        is_class_instructor = bool(class_id) and _is_instructor(user_id, class_id)
```

Remove `from app.auth.controller import get_user_role` if nothing else in the module uses it. Run the project tests; a test that set an account role to make someone the class instructor must now make them the class's `created_by` instead.

- [ ] **Step 4: Invites enrol any account except the class instructor**

`invite_student_to_class`: replace

```python
        if student["role"] != "student":
            raise HTTPException(status_code=400, detail="User is not a student")
```

with

```python
        if str(student["id"]) == str(class_row.get("created_by")):
            raise HTTPException(status_code=400, detail="You are the instructor of this class")
```

`bulk_invite_students`: after `email_ctx = ...` add `owner_id = str(class_row.get("created_by"))`; the `student_ids` comprehension filters `if str(p["id"]) != owner_id` (instead of `p.get("role") == "student"`); in the loop replace `if profile.get("role") != "student":` with `if str(profile["id"]) == owner_id:` (status stays `"not_a_student"`). Docstring: "``not_a_student`` – the address belongs to the class instructor."

Update `test_classes_invites.py`: the case that expected "User is not a student" / `not_a_student` for an instructor-account profile now expects that account to be enrolled; add one case each for inviting the class owner (single: 400 "You are the instructor of this class"; bulk: `not_a_student`, nothing enrolled).

- [ ] **Step 5: Messaging needs a shared class, nothing else**

`can_message` becomes:

```python
def can_message(a_id: str, b_id: str) -> bool:
    """Two different people who share a class may message each other.

    There used to be no instructor↔instructor messaging, by account role. A class has one
    instructor, so two instructors only share a class when one of them is enrolled in it (as a
    TA, say), and then they must be able to talk.
    """
    if a_id == b_id:
        return False
    return has_shared_class(a_id, b_id)
```

Delete `get_profile_roles` (no other caller). In `list_contacts`, delete `caller_role = ...` and the `if caller_role == "instructor" and p.get("role") == "instructor": continue` lines, and update its docstring ("minus self"; drop the instructor↔instructor sentences).

`test_messages_can_message.py` becomes:

```python
"""Tests for app.messages.controller.can_message."""

from __future__ import annotations

from unittest.mock import patch


@patch("app.messages.controller.has_shared_class", return_value=True)
def test_people_who_share_a_class_can_message(_has_shared):
    from app.messages.controller import can_message

    assert can_message("alice", "bob") is True


@patch("app.messages.controller.has_shared_class", return_value=False)
def test_can_message_requires_shared_class(_has_shared):
    from app.messages.controller import can_message

    assert can_message("alice", "bob") is False


def test_can_message_rejects_self():
    from app.messages.controller import can_message

    assert can_message("alice", "alice") is False
```

In `test_messages_contacts.py`, rename `test_contacts_excludes_self_and_instructor_pairs` to `test_contacts_excludes_self_and_includes_instructors_who_share_a_class` and change its last assertion to `assert "prof2" in ids  # prof TAs in prof2's class`.

- [ ] **Step 6: Run the suite and the lint gate**

Run: `cd backend && .venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/python -m pytest -q`
Expected: all pass. Then confirm nothing class-scoped still reads the account role:

Run: `cd backend && grep -rn "get_user_role\|select(\"role\")\|== \"instructor\"\|!= \"student\"" app | grep -v "project_members\|enrollment_role"`
Expected: only `app/auth/controller.py`, `app/auth/views.py` (create-user onboarding and login-check), `app/dependencies.py` (`require_instructor`) and `app/classes/views.py` (`join_class`'s "has a role" check).

- [ ] **Step 7: Commit**

```bash
git add backend/app backend/tests
git commit -m "fix(backend): sentiment, assignments, projects, invites and messaging follow the class role"
```

---

## Task 9: Docs (after Tasks 1–17)

**Files:** `AGENTS.md`, `AUTH.md`, `backend/app/core/authz.py` (module docstring), `backend/app/auth/controller.py` (role-cache comment), `supabase/README.md`, `frontend/public/llms.txt`, `frontend/public/.well-known/grepthink-actions.json`, `docs/superpowers/specs/2026-09-24-multi-institution-roles-design.md`

- [ ] **Step 1: AGENTS.md**

Replace the `## Roles` section with:

```markdown
## Roles
- **Account** (`profiles.role`): `instructor` | `student`. It only decides who may create a class
  (`POST /api/classes`, `require_instructor`). Nothing else reads it: never branch on it for a
  class decision, in the backend or the UI.
- **Class-scoped** (every other decision): instructor = `classes.created_by`; **TA** =
  `class_enrollments.enrollment_role = 'ta'` (single source of truth — see TA gotcha); student =
  any other enrollment. One account can hold a different role in each class. `GET /api/classes`
  returns `my_role` for every class; the web client reads it with `useSelectedClassRole()` /
  `useClassRole(classId)` from `lib/classContext.tsx`.
- **Project-scoped** (`project_members.role`): `owner` | `product owner` | `scrum master` | `admin` | `member`.
- **Institutions**: every class belongs to a maintainer-seeded `institutions` row
  (`classes.institution_id`). Its `email_domains`, plus any `.edu`, decide what counts as a school
  email (`app/institutions/controller.py` `is_school_email`, mirrored by `lib/schoolEmail.ts`).
```

In the directory tree: add `institutions` to the backend feature list; replace the `lib/enrollmentRole.ts` line with `lib/institutions.ts   # useInstitutions(): the public schools list, fetched once` and add `lib/schoolEmail.ts   # isSchoolEmail(): .edu or an institution domain`. Add `institutions` routes (`/api/institutions`) to "API surface".

- [ ] **Step 2: AUTH.md**

In the dependency table, `require_instructor` → "… Used only by `POST /api/classes`: a class's own endpoints check that the caller created the class." In "Open items": replace "No admin path for role changes" with "**Role changes are a maintainer step.** `/api/create-user` writes the role once; a maintainer flips `student → instructor` with the SQL in `supabase/README.md` ("Letting an existing account create classes"). The account role only gates class creation, so the flip changes nothing else." Keep "The instructor role is self-service."

- [ ] **Step 3: Code comments**

`backend/app/core/authz.py` module docstring roles list: add "- account role (``profiles.role``) = may create classes; never used for a class decision". `backend/app/auth/controller.py`: the comments that say a chosen role "never changes afterwards" → "changes only when a maintainer flips it (student → instructor); the TTL bounds how long a stale role is served".

- [ ] **Step 4: supabase/README.md** — add a section:

```markdown
## Institutions and class creation (maintainer steps)

- **Add a school:** copy `backend/database/migrations/2026-09-25_seed_istinye.sql`, change the name,
  slug (lower-case, hyphens) and base email domains, run it on DEV then PROD. The app shows it within
  five minutes. Subdomains of a listed domain count automatically.
- **Letting an existing account create classes:** edit and run
  `backend/database/migrations/prod/2026-09-25_scott_class_creation.sql` (it flips `student → instructor`
  for one email and refuses to change anything else). It takes effect within a minute; the user sees
  "Create Class" after reloading. Their classes as a TA or student are unaffected.
```

- [ ] **Step 5: Public catalog**

`frontend/public/.well-known/grepthink-actions.json`: `join_class` → `"role": "any"`; add

```json
{"id": "list_institutions", "title": "List the schools GrepThink serves", "role": "public", "method": "GET", "endpoint": "/api/institutions", "rateLimit": "60/min", "params": {}}
```

and in `llms.txt`'s concepts, after the **Class** line: `- **Institution**: the school a class belongs to. One account can be an instructor at one school and a TA or student at another.`

- [ ] **Step 6: Spec** — in the spec: migration file name `2026-09-25_institutions.sql`; data-model bullet "mirrored in supabase/schema.sql" → "`supabase/schema.sql` is updated once it is applied (AGENTS.md)"; school email lives in `app/institutions/controller.py`; Rollout step 1 → "Apply the migration to DEV, then PROD. The backend runs on either schema (the institutions loader falls back while the table is missing), so this can happen before or after the release."

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md AUTH.md backend/app/core/authz.py backend/app/auth/controller.py supabase/README.md frontend/public docs/superpowers/specs
git commit -m "docs: per-class roles, institutions and the maintainer runbook"
```

---

## Task 10: API types and client (frontend)

**Files:**
- Modify: `frontend/src/lib/api/types.ts`, `frontend/src/lib/api/classes.ts`, `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/api/institutions.ts`
- Test: `frontend/src/lib/__tests__/apiFacade.test.ts`

- [ ] **Step 1: Types** — in `lib/api/types.ts`, above `ApiClass`:

```ts
/** The signed-in user's role in one class: its creator, a TA, or an enrolled student. */
export type ClassRole = 'instructor' | 'ta' | 'student';

/** A school, as a class row embeds it. */
export interface ApiInstitutionSummary {
  id: string;
  name: string;
  slug: string;
}

/** A school with the email domains that count as its school email (GET /api/institutions). */
export interface ApiInstitution extends ApiInstitutionSummary {
  email_domains: string[];
}
```

and add to `ApiClass`:

```ts
  /** The caller's role in this class (GET /api/classes). Missing from older backends. */
  my_role?: ClassRole;
  /** The school the class belongs to; null when unassigned or before the institutions migration. */
  institution?: ApiInstitutionSummary | null;
  institution_id?: string | null;
```

- [ ] **Step 2: Client** — `lib/api/institutions.ts`:

```ts
/** Schools: endpoint methods spread into the `api` object in lib/api.ts. */
import { API_BASE_URL } from './client';
import type { ApiInstitution } from './types';

export const institutionsApi = {
  /**
   * The schools GrepThink knows. Public (SignUp checks school emails before sign-in), so this is
   * a plain fetch without the auth header. Any failure answers an empty list, which every caller
   * treats as "no schools" (".edu" still counts as a school email).
   */
  getInstitutions: async (): Promise<ApiInstitution[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/institutions`);
      if (!response.ok) return [];
      const body = (await response.json()) as { institutions?: ApiInstitution[] };
      return body.institutions ?? [];
    } catch {
      return [];
    }
  },
};
```

In `lib/api.ts`: `import { institutionsApi } from './api/institutions';` and spread `...institutionsApi,` into `api` (after `...classesApi,`). In `lib/api/classes.ts` `createClass`'s `data` type add `institution_id?: string;`.

- [ ] **Step 3: Facade test** — add `'getInstitutions',` to `METHODS` in `lib/__tests__/apiFacade.test.ts` at its sorted position (after `'getIncomingJoinRequests'`).

- [ ] **Step 4: Run** `cd frontend && npx vitest run src/lib/__tests__/apiFacade.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(web): class role and institution types, getInstitutions client"
```

---

## Task 11: School email helpers (frontend)

**Files:**
- Create: `frontend/src/lib/schoolEmail.ts`, `frontend/src/lib/institutions.ts`
- Test: `frontend/src/lib/__tests__/schoolEmail.test.ts`

- [ ] **Step 1: Failing test** — `lib/__tests__/schoolEmail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emailDomain, isSchoolEmail } from '../schoolEmail';

const SCHOOLS = [{ email_domains: ['ucsc.edu'] }, { email_domains: ['istinye.edu.tr'] }];

describe('isSchoolEmail (mirrors backend is_school_email)', () => {
  it.each([
    ['ann@ucsc.edu', true],
    ['Ann@UCSC.EDU', true],
    ['ann@gatech.edu', true],
    ['ann@istinye.edu.tr', true],
    ['ann@stu.istinye.edu.tr', true],
    ['ann@evil-istinye.edu.tr', false],
    ['ann@istinye.edu.tr.example.com', false],
    ['ann@gmail.com', false],
    ['not-an-email', false],
    ['', false],
  ])('%s → %s', (email, expected) => {
    expect(isSchoolEmail(email, SCHOOLS)).toBe(expected);
  });

  it('counts only .edu when no schools are known', () => {
    expect(isSchoolEmail('ann@ucsc.edu', [])).toBe(true);
    expect(isSchoolEmail('ann@istinye.edu.tr', [])).toBe(false);
    expect(isSchoolEmail(null, [])).toBe(false);
  });

  it('takes the domain after the last @', () => {
    expect(emailDomain(' Ann@Stu.Istinye.edu.tr ')).toBe('stu.istinye.edu.tr');
    expect(emailDomain('nobody')).toBe('');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/schoolEmail.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `lib/schoolEmail.ts`:

```ts
/**
 * What counts as a school email. Mirrors `is_school_email` in
 * backend/app/institutions/controller.py — keep the two in sync.
 */
import type { ApiInstitution } from './api';

/** The lower-cased part after the last `@`, or '' when there is none. */
export function emailDomain(email: string | null | undefined): string {
  const address = (email ?? '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1) : '';
}

/**
 * True when the domain ends in `.edu`, or is one of a school's `email_domains`, or a subdomain of
 * one (`stu.istinye.edu.tr` matches `istinye.edu.tr`; `evil-istinye.edu.tr` does not).
 */
export function isSchoolEmail(
  email: string | null | undefined,
  institutions: readonly Pick<ApiInstitution, 'email_domains'>[],
): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (domain.endsWith('.edu')) return true;
  return institutions.some((institution) =>
    institution.email_domains.some((raw) => {
      const allowed = raw.trim().toLowerCase();
      return allowed !== '' && (domain === allowed || domain.endsWith(`.${allowed}`));
    }),
  );
}
```

`lib/institutions.ts`:

```ts
/** The public schools list, fetched once per page load and shared by every caller. */
import { useEffect, useState } from 'react';
import { api, type ApiInstitution } from './api';

let pending: Promise<ApiInstitution[]> | null = null;

/** The schools list. An empty answer is not kept (it may be an outage), so it is asked again. */
export function fetchInstitutions(): Promise<ApiInstitution[]> {
  if (!pending) {
    pending = api.getInstitutions().then((list) => {
      if (list.length === 0) pending = null;
      return list;
    });
  }
  return pending;
}

export function clearInstitutionsCache(): void {
  pending = null;
}

/** The schools list; empty until it arrives (and when there are none). */
export function useInstitutions(): ApiInstitution[] {
  const [institutions, setInstitutions] = useState<ApiInstitution[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchInstitutions().then((list) => {
      if (!cancelled) setInstitutions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return institutions;
}
```

- [ ] **Step 4: Run** the test — PASS.
- [ ] **Step 5: Commit** `git add frontend/src/lib && git commit -m "feat(web): isSchoolEmail and the shared institutions list"`

---

## Task 12: Class context carries roles and schools (frontend)

**Files:**
- Modify: `frontend/src/lib/classContext.tsx`
- Test: `frontend/src/lib/__tests__/classRole.test.tsx`

- [ ] **Step 1: Failing test** — `lib/__tests__/classRole.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClass } from '@/lib/api';

const api = vi.hoisted(() => ({ getClasses: vi.fn(), updateClassStatus: vi.fn() }));
const preview = vi.hoisted(() => ({ isPreviewing: false, exitPreview: vi.fn() }));

vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => preview }));

import { ClassProvider, useClass, useClassRole, useSelectedClassRole } from '../classContext';

const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

function cls(id: string, extra: Partial<ApiClass>): ApiClass {
  return { id, name: id, created_by: 'someone', created_at: '2026-01-01', status: 'active', ...extra };
}

function Probe() {
  const { selectedClass, setSelectedClass, classes, sidebarClasses, schools, showSchoolSwitcher, selectSchool } = useClass();
  const selectedRole = useSelectedClassRole();
  const taughtRole = useClassRole('taught');
  return (
    <>
      <output data-testid="selected">{selectedClass?.id ?? 'none'}</output>
      <output data-testid="selected-role">{String(selectedRole)}</output>
      <output data-testid="taught-role">{String(taughtRole)}</output>
      <output data-testid="sidebar">{sidebarClasses.map((c) => c.id).join(',')}</output>
      <output data-testid="schools">{schools.map((s) => s.id).join(',')}</output>
      <output data-testid="switcher">{String(showSchoolSwitcher)}</output>
      {classes.map((c) => (
        <button key={c.id} onClick={() => setSelectedClass(c)}>{`select ${c.id}`}</button>
      ))}
      <button onClick={() => selectSchool('ucsc')}>school ucsc</button>
    </>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  localStorage.clear();
  preview.isPreviewing = false;
});
afterEach(() => vi.clearAllMocks());

describe('class roles', () => {
  it('reads my_role per class and derives it when an older backend omits it', async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('taught', { my_role: 'instructor', institution: IST }),
        cls('assisted', { my_role: 'ta', institution: UCSC }),
        cls('legacy', { created_by: 'me' }),
      ],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    expect(text('selected-role')).toBe('undefined'); // loading
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('selected-role')).toBe('instructor');
    expect(text('taught-role')).toBe('instructor');
    act(() => screen.getByText('select assisted').click());
    expect(text('selected-role')).toBe('ta');
    act(() => screen.getByText('select legacy').click());
    expect(text('selected-role')).toBe('instructor'); // created_by === me
  });

  it('answers null for a class the user is not in', async () => {
    api.getClasses.mockResolvedValue({ classes: [cls('other', { my_role: 'student' })] });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('other'));
    expect(text('taught-role')).toBe('null');
  });

  it('reports student for the selected class you teach while previewing, and ends preview on a class switch', async () => {
    preview.isPreviewing = true;
    api.getClasses.mockResolvedValue({
      classes: [cls('taught', { my_role: 'instructor' }), cls('assisted', { my_role: 'ta' })],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('selected-role')).toBe('student');
    expect(preview.exitPreview).not.toHaveBeenCalled(); // classes arriving is not a switch
    act(() => screen.getByText('select assisted').click());
    expect(preview.exitPreview).toHaveBeenCalledTimes(1);
  });
});

describe('schools', () => {
  it('hides the switcher and keeps every active class with one school', async () => {
    api.getClasses.mockResolvedValue({
      classes: [cls('a', { my_role: 'student', institution: UCSC }), cls('b', { my_role: 'student', institution: UCSC })],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('a'));
    expect(text('switcher')).toBe('false');
    expect(text('sidebar')).toBe('a,b');
  });

  it('with two schools, lists only the current school in the class switcher and returns to the last class used there', async () => {
    api.getClasses.mockResolvedValue({
      classes: [
        cls('taught', { my_role: 'instructor', institution: IST }),
        cls('assisted', { my_role: 'ta', institution: UCSC }),
        cls('second', { my_role: 'student', institution: UCSC }),
      ],
    });
    render(<ClassProvider><Probe /></ClassProvider>);
    await waitFor(() => expect(text('selected')).toBe('taught'));
    expect(text('switcher')).toBe('true');
    expect(text('schools')).toBe('ist,ucsc'); // ordered by name
    expect(text('sidebar')).toBe('taught');
    act(() => screen.getByText('select second').click());
    expect(text('sidebar')).toBe('assisted,second');
    act(() => screen.getByText('select taught').click());
    act(() => screen.getByText('school ucsc').click());
    expect(text('selected')).toBe('second'); // remembered, not the first UCSC class
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/classRole.test.tsx` — FAIL (`useClassRole` not exported).

- [ ] **Step 3: Implement** — edit `lib/classContext.tsx`:

1. Imports: add `useRef`; `import { api, type ApiClass, type ApiInstitutionSummary, type ClassRole } from './api';`, `import { useAuth } from './auth';`, `import { usePreview } from './previewContext';`.
2. After `persistSelectedClassId`, add:

```tsx
const LAST_CLASS_BY_SCHOOL_KEY = 'grepthink-last-class-by-school';

function loadLastClassBySchool(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAST_CLASS_BY_SCHOOL_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberClassForSchool(schoolId: string, classId: string): void {
  try {
    localStorage.setItem(
      LAST_CLASS_BY_SCHOOL_KEY,
      JSON.stringify({ ...loadLastClassBySchool(), [schoolId]: classId }),
    );
  } catch {
    // Storage full or unavailable — the switcher falls back to the school's first class.
  }
}

/** Re-read the class list when the tab regains focus, at most this often. */
const REFRESH_ON_FOCUS_MS = 30_000;
```

3. Types: add `export type { ClassRole };` and `export type School = ApiInstitutionSummary;`; add to `interface Class`:

```tsx
  /** The signed-in user's role in this class. */
  my_role: ClassRole;
  /** The school the class belongs to, when known. */
  institution: School | null;
  institution_id?: string | null;
```

4. Helpers:

```tsx
/** API row → Class. An older backend omits `my_role`: a class you created is yours to teach. */
function toClass(raw: ApiClass, userId: string | undefined): Class {
  return {
    ...raw,
    my_role: raw.my_role ?? (userId !== undefined && raw.created_by === userId ? 'instructor' : 'student'),
    institution: raw.institution ?? null,
  };
}

function distinctSchools(classes: Class[]): School[] {
  const byId = new Map<string, School>();
  for (const c of classes) {
    if (c.institution && !byId.has(c.institution.id)) byId.set(c.institution.id, c.institution);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The role the UI shows: while previewing, the selected class you teach shows as a student's. */
function roleInView(cls: Class, selectedId: string | undefined, previewing: boolean): ClassRole {
  return previewing && cls.my_role === 'instructor' && cls.id === selectedId ? 'student' : cls.my_role;
}
```

5. `ClassContextValue`: document `sidebarClasses` as "Active, visible classes at the current school (every active class when they all share one)" and add:

```tsx
  /** Schools the switcher offers: those with active classes, plus the current one. */
  schools: School[];
  /** The selected class's school. */
  currentSchool: School | null;
  /** Active classes span two or more schools: show the school switcher and caption. */
  showSchoolSwitcher: boolean;
  /** Select the last class used at `schoolId` (else its first active class) and return it. */
  selectSchool: (schoolId: string) => Class | null;
```

6. In `ClassProvider`:
   - `const { user } = useAuth(); const userId = user?.id; const { isPreviewing, exitPreview } = usePreview();`
   - Rename the existing `sidebarClasses` memo to `activeClasses` (same computation) and use `activeClasses` in `reselectSidebarClass`, in the render-time fallback (`resolveSelectedClass(activeClasses, null)`) and in `loadClasses`.
   - `loadClasses`: map first — `const all = response.classes.map((c) => toClass(c, userId));` then use `all` everywhere `response.classes` was used, and set `lastLoadedAt.current = Date.now();` in the `.then`. Add `userId` to its dependency list. Declare `const lastLoadedAt = useRef(0);` above it.
   - Schools:

```tsx
  const activeSchools = useMemo(() => distinctSchools(activeClasses), [activeClasses]);
  const showSchoolSwitcher = activeSchools.length > 1;
  const currentSchool = selectedClass?.institution ?? null;
  const schools = useMemo(
    () =>
      currentSchool && !activeSchools.some((s) => s.id === currentSchool.id)
        ? [...activeSchools, currentSchool]
        : activeSchools,
    [activeSchools, currentSchool],
  );
  const sidebarClasses = useMemo(
    () =>
      showSchoolSwitcher && currentSchool
        ? activeClasses.filter((c) => c.institution?.id === currentSchool.id)
        : activeClasses,
    [showSchoolSwitcher, currentSchool, activeClasses],
  );

  const selectSchool = useCallback(
    (schoolId: string): Class | null => {
      const active = activeClasses.filter((c) => c.institution?.id === schoolId);
      const pool = active.length > 0 ? active : visibleClasses.filter((c) => c.institution?.id === schoolId);
      const remembered = loadLastClassBySchool()[schoolId];
      const target = pool.find((c) => c.id === remembered) ?? pool[0] ?? null;
      if (target) setSelectedClass(target);
      return target;
    },
    [activeClasses, visibleClasses, setSelectedClass],
  );
```

   - Effects (after the existing "keep storage on the selected class" effect):

```tsx
  // Remember the class last used at each school, for the school switcher.
  const selectedSchoolId = selectedClass?.institution?.id;
  useEffect(() => {
    if (selectedClassId && selectedSchoolId) rememberClassForSchool(selectedSchoolId, selectedClassId);
  }, [selectedClassId, selectedSchoolId]);

  // "View class as student" previews one class: picking another class ends it. The first
  // selection (classes arriving) is not a switch.
  const previewedClassId = useRef(selectedClassId);
  useEffect(() => {
    const previous = previewedClassId.current;
    if (previous === selectedClassId) return;
    previewedClassId.current = selectedClassId;
    if (previous !== undefined && isPreviewing) exitPreview();
  }, [selectedClassId, isPreviewing, exitPreview]);

  // A TA promoted or a class joined elsewhere shows up when the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadedAt.current < REFRESH_ON_FOCUS_MS) return;
      void loadClasses();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadClasses]);
```

   - Add `schools, currentSchool, showSchoolSwitcher, selectSchool` to the context value and its dependency list.

7. After `useClass`, add (each with `// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider`):

```tsx
/** Your role in the selected class: undefined while classes load, null with no class. */
export const useSelectedClassRole = (): ClassRole | null | undefined => {
  const { selectedClass, loading } = useClass();
  const { isPreviewing } = usePreview();
  if (!selectedClass) return loading ? undefined : null;
  return roleInView(selectedClass, selectedClass.id, isPreviewing);
};

/** Your role in `classId`: undefined while classes load, null when you are not in it (or no id). */
export const useClassRole = (classId: string | null | undefined): ClassRole | null | undefined => {
  const { classes, selectedClass, loading } = useClass();
  const { isPreviewing } = usePreview();
  if (!classId) return null;
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return loading ? undefined : null;
  return roleInView(cls, selectedClass?.id, isPreviewing);
};
```

- [ ] **Step 4: Run** the test — PASS. `npm run lint` — no findings in this file.
- [ ] **Step 5: Commit** `git add frontend/src/lib && git commit -m "feat(web): class context carries my_role, schools and the class-role hooks"`

---

## Task 13: Auth exposes `canCreateClasses`; route rules follow the class role (frontend)

**Files:**
- Modify: `frontend/src/lib/auth.tsx`, `frontend/src/features/app/config/routePermissions.ts`, `frontend/src/features/app/config/sidebar.ts`
- Tests: `frontend/src/lib/__tests__/authRole.test.tsx`, create `features/app/config/__tests__/routePermissions.test.ts`, `features/app/config/__tests__/sidebar.test.ts`

- [ ] **Step 1: Auth** — in `lib/auth.tsx`:
   - Remove the `usePreview` import.
   - In `AuthContextValue`, delete `role`, `realRole`, `isPreviewing` (and their comments) and add:

```ts
  /**
   * `profiles.role === 'instructor'`: the account may create classes. It is the only thing the
   * account role decides — everything else follows your role in the selected class
   * (useSelectedClassRole in lib/classContext.tsx).
   */
  canCreateClasses: boolean;
```

   - In the provider's `useMemo`: rename `role` to `accountRole` and return `canCreateClasses: accountRole === 'instructor'` instead of `role`/`realRole`/`isPreviewing`.
   - `useAuth` becomes a plain context read:

```tsx
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
```

   - `authRole.test.tsx`: the `Probe` shows `loading ? 'loading' : String(canCreateClasses)`; expected `'instructor:instructor'` → `'true'`, `'student:student'` → `'false'`. Rename the describe to `'AuthProvider class-creation right'`.

- [ ] **Step 2: Route rules** — replace `features/app/config/routePermissions.ts` with:

```ts
import type { ClassRole } from '@/lib/api';

/** Class pages only the class instructor may open. */
export const instructorOnlyPaths: string[] = [
  '/app/dashboard',
  '/app/projects',
  '/app/assign-projects',
  '/app/modules',
  '/app/ta-management',
  '/app/class-settings',
];

/** Class pages for students and TAs (TAs keep the student pages). */
export const learnerOnlyPaths: string[] = ['/app/browse-projects', '/app/my-project', '/app/assignments'];

export const CLASS_ROLE_LABELS: Record<ClassRole, string> = {
  instructor: 'Instructor',
  ta: 'TA',
  student: 'Student',
};

/** A page that only makes sense with a class selected and a matching role in it. */
export function isClassScopedPath(path: string): boolean {
  return instructorOnlyPaths.includes(path) || learnerOnlyPaths.includes(path);
}

/** True if your role in the selected class may open `path` (every other page is shared). */
export function isPathAllowedForClassRole(path: string, role: ClassRole | null | undefined): boolean {
  if (instructorOnlyPaths.includes(path)) return role === 'instructor';
  if (learnerOnlyPaths.includes(path)) return role === 'student' || role === 'ta';
  return true;
}

/** Where a class opens for your role in it. */
export function classLandingPath(role: ClassRole): string {
  if (role === 'instructor') return '/app/dashboard';
  if (role === 'ta') return '/app/ta-meetings';
  return '/app/my-project';
}

/** After switching to a class where you are `role`: stay (null) or go to its landing page. */
export function pathAfterClassSwitch(currentPath: string, role: ClassRole): string | null {
  return isPathAllowedForClassRole(currentPath, role) ? null : classLandingPath(role);
}
```

`features/app/config/__tests__/routePermissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classLandingPath, isPathAllowedForClassRole, pathAfterClassSwitch } from '../routePermissions';

describe('class route rules', () => {
  it('opens instructor pages to the class instructor only', () => {
    expect(isPathAllowedForClassRole('/app/dashboard', 'instructor')).toBe(true);
    expect(isPathAllowedForClassRole('/app/dashboard', 'ta')).toBe(false);
    expect(isPathAllowedForClassRole('/app/dashboard', null)).toBe(false);
  });

  it('opens student pages to students and TAs', () => {
    expect(isPathAllowedForClassRole('/app/my-project', 'student')).toBe(true);
    expect(isPathAllowedForClassRole('/app/my-project', 'ta')).toBe(true);
    expect(isPathAllowedForClassRole('/app/my-project', 'instructor')).toBe(false);
  });

  it('shares every other page', () => {
    expect(isPathAllowedForClassRole('/app/home', undefined)).toBe(true);
    expect(isPathAllowedForClassRole('/app/ta-meetings', 'student')).toBe(true);
  });

  it('lands each role on its page', () => {
    expect(classLandingPath('instructor')).toBe('/app/dashboard');
    expect(classLandingPath('ta')).toBe('/app/ta-meetings');
    expect(classLandingPath('student')).toBe('/app/my-project');
  });

  it('stays on a shared or allowed page after a class switch', () => {
    expect(pathAfterClassSwitch('/app/home', 'ta')).toBeNull();
    expect(pathAfterClassSwitch('/app/dashboard', 'instructor')).toBeNull();
    expect(pathAfterClassSwitch('/app/dashboard', 'ta')).toBe('/app/ta-meetings');
  });
});
```

- [ ] **Step 3: Sidebar config** — in `features/app/config/sidebar.ts`, keep the imports and `UserRole`/`SidebarItem`/`SidebarSection` exports, add `import ModulesIcon ...` (moved from Sidebar.tsx) and `import type { ClassRole } from '@/lib/api';`, and replace `instructorSidebarConfig` / `studentSidebarConfig` with:

```ts
const HOME: SidebarItem = { label: 'Home', path: '/app/home', icon: House };
const MESSAGES: SidebarItem = { label: 'Messages', path: '/app/messages', iconSvg: MessagesIcon };
const MY_CLASSES: SidebarItem = { label: 'My Classes', path: '/app/my-classes', iconSvg: MyClassesIcon };
const CREATE_CLASS: SidebarItem = { label: 'Create Class', path: '/app/create-class', icon: SquarePen };
const JOIN_CLASS: SidebarItem = { label: 'Join Class', path: '/app/join-class', icon: GraduationCap };

export const instructorClassItems: SidebarItem[] = [
  { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Projects', path: '/app/projects', icon: List },
  { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
  { label: 'Modules', path: '/app/modules', iconSvg: ModulesIcon },
  { label: 'TA Management', path: '/app/ta-management', iconSvg: TaManagementIcon },
  { label: 'TA Meetings', path: '/app/ta-meetings', icon: Users },
  { label: 'Final Reviews', path: '/app/ta-review/final-reviews', icon: ClipboardCheck },
];

export const studentClassItems: SidebarItem[] = [
  { label: 'Create Project', path: '/app/create-project', icon: SquarePen },
  { label: 'Browse Projects', path: '/app/browse-projects', icon: LayoutList },
  { label: 'My Project', path: '/app/my-project', icon: Folder },
  { label: 'Assignments', path: '/app/assignments', icon: ClipboardList },
  { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
  { label: 'TA Meetings', path: '/app/ta-meetings', icon: Users },
];

export const taReviewItem: SidebarItem = {
  label: 'TA Review',
  path: '/app/ta-review',
  iconSvg: ModulesIcon,
  children: [
    { label: 'TSRs', path: '/app/ta-review' },
    { label: 'Final Reviews', path: '/app/ta-review/final-reviews' },
  ],
};

const SETTINGS_SECTION: SidebarSection = {
  title: 'Settings',
  items: [
    { label: 'Settings', path: '/app/settings', icon: Settings },
    { label: 'Help Center', path: '/app/help-center', icon: CircleQuestionMark },
  ],
};

/**
 * The sidebar for an account and its role in the selected class. The main section keeps each
 * account's familiar order; the class section follows the class role and is hidden with no class.
 */
export function buildSidebarConfig({
  canCreateClasses,
  classRole,
}: {
  canCreateClasses: boolean;
  classRole: ClassRole | null | undefined;
}): SidebarSection[] {
  const main = canCreateClasses
    ? [HOME, MESSAGES, MY_CLASSES, CREATE_CLASS]
    : [HOME, MESSAGES, JOIN_CLASS, MY_CLASSES];
  const sections: SidebarSection[] = [{ title: 'Main', items: main }];
  if (classRole === 'instructor') sections.push({ title: 'Class', items: instructorClassItems });
  else if (classRole === 'ta') sections.push({ title: 'Class', items: [...studentClassItems, taReviewItem] });
  else if (classRole === 'student') sections.push({ title: 'Class', items: studentClassItems });
  sections.push(SETTINGS_SECTION);
  return sections;
}
```

`features/app/config/__tests__/sidebar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSidebarConfig } from '../sidebar';

const labels = (canCreateClasses: boolean, classRole: 'instructor' | 'ta' | 'student' | null) =>
  buildSidebarConfig({ canCreateClasses, classRole }).map((s) => [s.title, s.items.map((i) => i.label)]);

describe('buildSidebarConfig', () => {
  it('keeps the instructor sidebar for a class you teach', () => {
    expect(labels(true, 'instructor')).toEqual([
      ['Main', ['Home', 'Messages', 'My Classes', 'Create Class']],
      ['Class', ['Dashboard', 'Projects', 'Roster', 'Modules', 'TA Management', 'TA Meetings', 'Final Reviews']],
      ['Settings', ['Settings', 'Help Center']],
    ]);
  });

  it('shows the student items plus TA Review in a class you TA, even for an account that can create classes', () => {
    const [main, cls] = labels(true, 'ta');
    expect(main).toEqual(['Main', ['Home', 'Messages', 'My Classes', 'Create Class']]);
    expect(cls).toEqual(['Class', ['Create Project', 'Browse Projects', 'My Project', 'Assignments', 'Roster', 'TA Meetings', 'TA Review']]);
  });

  it('keeps the student sidebar for a student account', () => {
    expect(labels(false, 'student')[0]).toEqual(['Main', ['Home', 'Messages', 'Join Class', 'My Classes']]);
  });

  it('hides the class section with no class selected', () => {
    expect(labels(false, null).map(([title]) => title)).toEqual(['Main', 'Settings']);
  });
});
```

- [ ] **Step 4: Run** the three test files — PASS. (`npm run build` will now fail in every consumer of the removed exports; Tasks 14–16 fix them.)
- [ ] **Step 5: Commit** `git add frontend/src && git commit -m "feat(web): canCreateClasses, class-role route rules and sidebar builder"`

---

## Task 14: Layout follows the selected class (frontend)

**Files:**
- Create: `frontend/src/features/app/components/Layout/ClassRouteGuard.tsx`, `frontend/src/features/app/components/Layout/SchoolSwitcher.tsx`
- Modify: `features/app/AppView.tsx`, `features/app/components/Layout/{Sidebar,Header,PreviewBanner}.tsx`, `Sidebar.scss`, `Header.scss`, `features/app/pages/Home.tsx`
- Test: `features/app/components/Layout/__tests__/SchoolSwitcher.test.tsx`

- [ ] **Step 1: Route guard** — `ClassRouteGuard.tsx`:

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import {
  classLandingPath,
  isClassScopedPath,
  isPathAllowedForClassRole,
} from '@features/app/config/routePermissions';

/**
 * Keeps class pages to the roles they are for, using your role in the selected class. Lives
 * inside ClassProvider (it needs the class list) and waits for it before deciding.
 */
const ClassRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { selectedClass } = useClass();
  const role = useSelectedClassRole();

  if (!isClassScopedPath(pathname)) return <>{children}</>;
  if (role === undefined) return <div className="class-route-guard" aria-busy="true" />;
  if (!selectedClass || role === null) return <Navigate to="/app/my-classes" replace />;
  if (!isPathAllowedForClassRole(pathname, role)) return <Navigate to={classLandingPath(role)} replace />;
  return <>{children}</>;
};

export default ClassRouteGuard;
```

`AppView.tsx`: remove `instructorOnlyPaths`/`studentOnlyPaths` imports and the two `Navigate` guards; `const { loading: authLoading } = useAuth(); const { isPreviewing } = usePreview();` (import `usePreview` from `@/lib/previewContext`); wrap `<Outlet ... />` in `<ClassRouteGuard>…</ClassRouteGuard>`; drop `role={role}` from `<Sidebar>`.

- [ ] **Step 2: Sidebar** — in `Sidebar.tsx`:
   - Remove the `role` prop (interface + destructuring), the `useEnrollmentRole` import and the `ModulesIcon` import; import `buildSidebarConfig` instead of the two configs, `useAuth`, `useSelectedClassRole`, and `CLASS_ROLE_LABELS, pathAfterClassSwitch` from routePermissions.
   - `const { canCreateClasses } = useAuth(); const classRole = useSelectedClassRole(); const { sidebarClasses, selectedClass, setSelectedClass, showSchoolSwitcher } = useClass();`
   - `const sidebarConfig = React.useMemo(() => buildSidebarConfig({ canCreateClasses, classRole }), [canCreateClasses, classRole]);`
   - `const mixedRoles = new Set(sidebarClasses.map((c) => c.my_role)).size > 1;`
   - `handleClassSelect`: after `setSelectedClass(classItem); setShowClassDropdown(false);` add `const next = pathAfterClassSwitch(location.pathname, classItem.my_role); if (next) navigate(next);`
   - Root class: `${classRole === 'instructor' ? 'instructor' : 'student'}`; the Projects highlight: `if (classRole === 'instructor' && isProjectsItem)`.
   - Class selector header: wrap the name in a column and add the caption:

```tsx
            <span className="class-selector-title">
              <span className="class-name">{selectedClass ? selectedClass.name : 'No class selected'}</span>
              {showSchoolSwitcher && selectedClass?.institution && (
                <span className="class-school">{selectedClass.institution.name}</span>
              )}
            </span>
```

   - Dropdown item: after the course code add `{mixedRoles && <div className="class-item-role">{CLASS_ROLE_LABELS[classItem.my_role]}</div>}`.
   - `Sidebar.scss`: `.class-selector-title { display: flex; flex-direction: column; min-width: 0; }`, `.class-school` and `.class-item-role` as small muted text (reuse the size/colour tokens `.class-item-code` already uses; no hex literals).

- [ ] **Step 3: School switcher** — `SchoolSwitcher.tsx`:

```tsx
import React, { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, School } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { pathAfterClassSwitch } from '@features/app/config/routePermissions';

interface SchoolSwitcherProps {
  /** Close the profile menu after a school is picked. */
  onPicked: () => void;
}

/**
 * The profile-menu row for accounts whose active classes span two or more schools. Expands in
 * place (no flyout, so it works with touch and keyboard); picking a school selects the class last
 * used there and lands on the page your role in it calls for.
 */
const SchoolSwitcher: React.FC<SchoolSwitcherProps> = ({ onPicked }) => {
  const { showSchoolSwitcher, schools, currentSchool, selectSchool } = useClass();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!showSchoolSwitcher) return null;

  const pick = (schoolId: string) => {
    setOpen(false);
    const target = selectSchool(schoolId);
    onPicked();
    if (!target) return;
    const next = pathAfterClassSwitch(pathname, target.my_role);
    if (next) navigate(next);
  };

  return (
    <div className="app-header__school">
      <button
        type="button"
        className="app-header__dropdown-item app-header__school-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <School size={18} aria-hidden />
        <span className="app-header__school-label">School: {currentSchool?.name ?? 'None selected'}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`app-header__school-chevron${open ? ' app-header__school-chevron--open' : ''}`}
        />
      </button>
      {open && (
        <ul id={listId} className="app-header__school-list" aria-label="Schools">
          {schools.map((school) => {
            const current = school.id === currentSchool?.id;
            return (
              <li key={school.id}>
                <button
                  type="button"
                  className={`app-header__school-option${current ? ' app-header__school-option--current' : ''}`}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => pick(school.id)}
                >
                  <span className="app-header__school-check" aria-hidden>
                    {current && <Check size={14} />}
                  </span>
                  <span>{school.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SchoolSwitcher;
```

`features/app/components/Layout/__tests__/SchoolSwitcher.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({
  showSchoolSwitcher: true,
  schools: [
    { id: 'ist', name: 'İstinye University', slug: 'istinye' },
    { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' },
  ],
  currentSchool: { id: 'ist', name: 'İstinye University', slug: 'istinye' },
  selectSchool: vi.fn(),
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => ctx }));

import SchoolSwitcher from '../SchoolSwitcher';

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path: string, onPicked = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SchoolSwitcher onPicked={onPicked} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onPicked;
}

beforeEach(() => {
  ctx.showSchoolSwitcher = true;
  ctx.selectSchool.mockReset();
});

describe('SchoolSwitcher', () => {
  it('renders nothing for an account at one school', () => {
    ctx.showSchoolSwitcher = false;
    renderAt('/app/home');
    expect(screen.queryByRole('button', { name: /school:/i })).not.toBeInTheDocument();
  });

  it('shows the current school and expands in place', () => {
    renderAt('/app/home');
    const toggle = screen.getByRole('button', { name: 'School: İstinye University' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'İstinye University' })).toHaveAttribute('aria-current', 'true');
  });

  it('picks a school, closes the menu and lands on the page for the role there', () => {
    ctx.selectSchool.mockReturnValue({ id: 'c1', my_role: 'ta' });
    const onPicked = renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: /school:/i }));
    fireEvent.click(screen.getByRole('button', { name: 'UC Santa Cruz' }));
    expect(ctx.selectSchool).toHaveBeenCalledWith('ucsc');
    expect(onPicked).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/ta-meetings');
  });
});
```

- [ ] **Step 4: Header** — in `Header.tsx`:
   - `const { signOut, user } = useAuth(); const { isPreviewing, enterPreview, exitPreview } = usePreview(); const classRole = useSelectedClassRole();` (import from `@/lib/classContext`), import `SchoolSwitcher`.
   - `buildBreadcrumbs(path, classRole === 'instructor' ? 'instructor' : 'student', selectedClass?.name, location.state)` (and the memo deps); `showInstructorClassMeta = isClassRoute && classRole === 'instructor'`.
   - Profile dropdown: first child `<SchoolSwitcher onPicked={() => setShowProfileMenu(false)} />`; the preview item condition becomes `selectedClass?.my_role === 'instructor'` with label `{isPreviewing ? 'Instructor view' : 'View class as student'}`.
   - `Header.scss`: styles for `.app-header__school` (bottom border separating it from the other items, same border token the dropdown uses), `-toggle` (reuse `.app-header__dropdown-item`), `-label` (flex: 1, ellipsis), `-chevron` / `--open` (rotate 180°), `-list` (no bullets, padding left to align with labels), `-option` (like a dropdown item, smaller), `--current` (bold), `-check` (fixed 14px width). Use the variables/tokens already used in `Header.scss`; no hex literals (`npm run lint:design`).

- [ ] **Step 5: Preview banner and Home**
   - `PreviewBanner.tsx`: `const { isPreviewing, exitPreview } = usePreview();` (drop `useAuth`).
   - `Home.tsx`:

```tsx
const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { canCreateClasses } = useAuth();
  const { selectedClass, loading: classesLoading } = useClass();
  const classRole = useSelectedClassRole();
  const navigate = useNavigate();

  if (!isLoaded || classesLoading) { /* existing loading skeleton */ }
  if (!user) { /* existing guest block */ }

  // Home follows the selected class; with no class yet, what the account can do.
  const instructorHome = selectedClass ? classRole === 'instructor' : canCreateClasses;
  return instructorHome ? <InstructorHomeDashboard /> : <StudentHomeDashboard />;
};
```

- [ ] **Step 6: Run** `npx vitest run src/features/app/components/Layout` — PASS.
- [ ] **Step 7: Commit** `git add frontend/src && git commit -m "feat(web): layout, route guard, home and profile-menu school switcher follow the class role"`

---

## Task 15: Pages use the per-class role (frontend)

**Files:** `features/app/pages/{MyClasses,ProjectDetails,CreateProject,Roster,TAMeetings,FinalReviews,TAManagement}.tsx`, `MyClasses.scss`, `features/app/components/Classes/CreateClassModal.tsx`, `features/app/components/Project/{ProjectView,MemberManagerModal}.tsx`, `features/app/components/RequireReviewAccess.tsx`, `App.tsx`; delete `lib/enrollmentRole.ts`, `lib/__tests__/enrollmentRole.test.ts`, `features/classes/`
- Tests: `features/app/pages/__tests__/FinalReviews.timeEdit.test.tsx`, create `features/app/pages/__tests__/MyClasses.roles.test.tsx`

- [ ] **Step 1: Mechanical swaps** (each file: remove the `role` from `useAuth()` / the `useEnrollmentRole` import; keep `user` where used)

| File | Change |
|---|---|
| `components/Project/ProjectView.tsx` | `const classRole = useClassRole(classId); const isInstructor = classRole === 'instructor';` `canManageAdmins = Boolean(classId) && (classRole === 'instructor' \|\| classRole === 'ta')`; delete the separate `useEnrollmentRole` call. |
| `components/Project/MemberManagerModal.tsx` | `const isInstructor = useClassRole(classId) === 'instructor';` |
| `pages/ProjectDetails.tsx` | `const classRole = useClassRole(project?.class_id ?? selectedClass?.id);` (use the loaded project's `class_id`); `onDelete={() => navigate(classRole === 'instructor' ? '/app/projects' : '/app/browse-projects')}`. |
| `pages/CreateProject.tsx` | `const classRole = useSelectedClassRole();` `checksMembership = selectedClass !== null && classRole !== undefined && classRole !== 'instructor'`; replace `role` with `classRole` in the membership state (`forRole`) and effect guard (`if (!selectedClass \|\| classRole === undefined \|\| classRole === 'instructor') return;`). |
| `pages/Roster.tsx` | `const classRole = useSelectedClassRole();` read-only branch `if (classRole !== 'instructor')`. |
| `components/RequireReviewAccess.tsx` | `const { selectedClass, loading } = useClass(); const role = useSelectedClassRole();` → `checking` while `loading \|\| role === undefined`; `deny` with no class; `allow` when `role === 'instructor' \|\| role === 'ta'`. Update its doc comment (the class role, not the account role). |
| `pages/TAMeetings.tsx` | `const role = useSelectedClassRole();` (same branches). |
| `pages/FinalReviews.tsx` | Delete `fetchScheduleAndRole`, the `ViewerRole` state and `setRole`; `const viewerRole = useSelectedClassRole();` `isInstructor = viewerRole === 'instructor'; isTa = viewerRole === 'ta';` load with `api.getFinalReviewSchedule(classId)`; `applySchedule(scheduleRes)`. |
| `pages/TAManagement.tsx` | `eligibleStudents`: drop `s.role !== 'instructor' &&` — the account role must not hide someone who teaches elsewhere; the class instructor is never in the enrollment list. |

Update `FinalReviews.timeEdit.test.tsx`: the `@/lib/classContext` mock also returns `useSelectedClassRole: () => 'instructor'`; remove `getMyEnrollmentRole` from the `@/lib/api` mock and its `mockResolvedValue`.

- [ ] **Step 2: My Classes**
   - `const { canCreateClasses } = useAuth();` delete `isInstructor`.
   - Card choice per class: `cls.my_role === 'instructor' ? <owner card> : <learner card>` (the two existing JSX branches).
   - Card activation (both kinds): `setSelectedClass(cls); navigate(classLandingPath(cls.my_role));` — replace `handleStudentCardActivate` / `handleInstructorCardActivate` with one `handleCardActivate`.
   - Role chip when roles are mixed: `const mixedRoles = new Set(visibleClasses.map((c) => c.my_role)).size > 1;` render `{mixedRoles && <span className="my-classes-card-role-tag">{CLASS_ROLE_LABELS[cls.my_role]}</span>}` next to `<ClassStatusTag>` in both cards.
   - School sections when classes span 2+ schools: group `filteredClasses` by `institution?.id` (ordered by school name, classes with no school last under "Other classes") and render each group as `<section className="my-classes-school"><h2 className="my-classes-school__heading">{name}</h2><div className="my-classes-list">…cards…</div></section>`; with one school keep today's single `.my-classes-list`.
   - Toolbar: `canCreateClasses` → Create Class and a secondary Join Class (`my-classes-toolbar__join-btn`); otherwise Join Class only. Empty-state copy by `canCreateClasses`. Render `CreateClassModal` when `canCreateClasses`; render `ClassSettingsModal` and the leave `ConfirmModal` unconditionally (each opens only from its own card).
   - `MyClasses.scss`: styles for `.my-classes-school`, `__heading`, `.my-classes-card-role-tag` (mirror `.my-classes-card-status-tag`), `.my-classes-toolbar__join-btn` (outlined variant); tokens only.

`features/app/pages/__tests__/MyClasses.roles.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const classes = vi.hoisted(() => [
  { id: 'taught', name: 'SE 301', created_by: 'me', created_at: '', status: 'active', my_role: 'instructor', institution: { id: 'ist', name: 'İstinye University', slug: 'istinye' } },
  { id: 'assisted', name: 'CSE 115C', created_by: 'prof', created_at: '', status: 'active', my_role: 'ta', institution: { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' } },
]);

vi.mock('@/lib/classContext', () => ({
  useClass: () => ({
    visibleClasses: classes,
    loading: false,
    successMessage: null,
    setSuccessMessage: vi.fn(),
    setSelectedClass: vi.fn(),
    getClassStatus: () => 'active',
    refreshClasses: vi.fn(() => Promise.resolve()),
  }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canCreateClasses: true }) }));
vi.mock('@/lib/api', () => ({ api: { leaveClass: vi.fn() } }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useOutletContext: () => ({ openJoinClassModal: vi.fn() }),
}));

import MyClasses from '../MyClasses';

describe('My Classes with mixed roles', () => {
  it('draws each card from its own role, labels the roles, and groups by school', () => {
    render(<MemoryRouter><MyClasses /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Class settings' })).toBeInTheDocument(); // owner card
    expect(screen.getByRole('button', { name: 'Leave CSE 115C' })).toBeInTheDocument(); // TA card
    expect(screen.getByText('Instructor')).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'İstinye University' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'UC Santa Cruz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join class/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Create Class modal** — add a School field above "Course Name":

```tsx
  const institutions = useInstitutions();
  const { refreshClasses, currentSchool } = useClass();
  const [chosenInstitutionId, setChosenInstitutionId] = useState<string | null>(null);
  const defaultInstitutionId =
    institutions.find((i) => i.id === currentSchool?.id)?.id ??
    (institutions.length === 1 ? institutions[0].id : '');
  const institutionId = chosenInstitutionId ?? defaultInstitutionId;
  const needsInstitution = institutions.length > 0;
```

   Field (rendered only when `needsInstitution`), with `id="create-class-school"`, a `<label htmlFor="create-class-school" className="create-class-modal__label">School</label>`, and a `<select className="create-class-modal__input">` whose first option is `<option value="" disabled>Select a school</option>`. Validation: `if (needsInstitution && !institutionId) { setError('School is required'); return; }`. Send `institution_id: institutionId || undefined` in `api.createClass`. Reset with `setChosenInstitutionId(null)`. Disable submit also when `needsInstitution && !institutionId`.

- [ ] **Step 4: Remove the dead code**
   - Delete `lib/enrollmentRole.ts` and `lib/__tests__/enrollmentRole.test.ts` (keep `api.getMyEnrollmentRole`; the route stays until a follow-up).
   - Delete `features/classes/pages/ClassManagement.tsx` and `.scss` (and the empty `features/classes/`); in `App.tsx` remove its import and `<Route path="/classes" … />`.

- [ ] **Step 5: Build** `cd frontend && npm run build` — fix every remaining TypeScript error the same way (a class decision reads `useSelectedClassRole()` / `useClassRole(classId)`; only class creation reads `canCreateClasses`).
- [ ] **Step 6: Run** `npx vitest run` — PASS.
- [ ] **Step 7: Commit** `git add -A frontend/src && git commit -m "feat(web): pages use the per-class role; My Classes and Create Class know schools"`

---

## Task 16: School email in signup and settings (frontend)

**Files:** `features/app/pages/Settings.tsx`, `features/auth/pages/AccountDetails.tsx`, `features/auth/components/SignUp.tsx`, `features/app/components/Settings/EduVerifyModal.tsx`; test `features/app/pages/__tests__/Settings.eduEmail.test.tsx`

- [ ] **Step 1: Settings**
   - `const { user, canCreateClasses } = useAuth(); const { classes } = useClass(); const institutions = useInstitutions();`
   - `const enrolledSomewhere = classes.some((c) => c.my_role !== 'instructor'); const showStudentFields = !canCreateClasses || enrolledSomewhere;` — use it wherever `role === 'student'` was (edu field, portfolio fields, `isStudent` in save).
   - `primaryIsEdu` (both places) → `primaryIsSchool = isSchoolEmail(user?.email, institutions)`; the save-time check `!newEduEmail.toLowerCase().endsWith('.edu')` → `!isSchoolEmail(newEduEmail, institutions)` with error `'Enter your school email address'`; `'This .edu email is already linked to another account.'` → `'This school email is already linked to another account.'`.
   - Labels: `.edu Email` → `School email`; `.edu Email (Roster Email)` → `School email (roster email)`; comment "Roster .edu email — students only" → "Roster school email — students and TAs".
   - Test: add mocks `vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: [] }) }));` and `vi.mock('@/lib/institutions', () => ({ useInstitutions: () => [{ id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc', email_domains: ['ucsc.edu'] }] }));`; the session mock gets `canCreateClasses: false` instead of `role: 'student'`; label queries use `'School email (roster email)'`.

- [ ] **Step 2: AccountDetails** — `const institutions = useInstitutions();` `primaryIsEdu` → `primaryIsSchool = isSchoolEmail(email, institutions)` (and in `useState` initialiser use the same check); `'Please enter your roster .edu email.'` → `'Please enter your roster school email.'`; `'Roster email must be a valid .edu address.'` → `'Roster email must be a school email address.'`; update the header comment and labels that say ".edu".

- [ ] **Step 3: SignUp** — replace `if (formData.email.toLowerCase().endsWith('.edu')) {` with `if (isSchoolEmail(formData.email, await fetchInstitutions())) {` and the message with `'This school email is already linked to another account.'`.

- [ ] **Step 4: EduVerifyModal** — title `Verify .edu Email` → `Verify school email`; any other visible ".edu" text → "school email".

- [ ] **Step 5: Run** `npx vitest run && npm run build` — PASS.
- [ ] **Step 6: Commit** `git add frontend/src && git commit -m "feat(web): school email follows the institution domains in signup and settings"`

---

## Task 17: Frontend gates

- [ ] **Step 1:** `cd frontend && npm run lint && npm run lint:design && npm run build && npx vitest run` — all green, no lint findings.
- [ ] **Step 2:** `grep -rn "useEnrollmentRole\|fetchEnrollmentRole\|realRole\|\.endsWith('.edu')" frontend/src` — no hits.
- [ ] **Step 3:** Commit any fixes: `git commit -am "chore(web): lint"` (only if needed).

---

## Task 18: Integration and verification (after Tasks 1–17)

- [ ] **Step 1:** Merge the frontend branch into the backend branch if they were built in separate worktrees; run both gates.
- [ ] **Step 2:** Apply `2026-09-25_institutions.sql` to DEV only after the maintainer approves; seed a second test institution on DEV if needed to exercise the switcher (or rely on the unit tests).
- [ ] **Step 3:** Browser check against DEV with a QA account: class list, sidebar per class role, class switch landing, school switcher in the profile menu (when two schools), Create Class school field, Settings school email label.
- [ ] **Step 4:** Hand the maintainer the three SQL files with the order: institutions (DEV, PROD) → release → seed İstinye (DEV, PROD) → Scott flip (PROD).
