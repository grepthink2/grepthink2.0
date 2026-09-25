"""
Pytest fixtures for backend tests.

The tests run fully in-process via FastAPI's TestClient. We do NOT hit a
real Supabase project — every test either uses a hand-signed HS256 token
(so we can verify the JWT codepath without network) or mocks the
``app.auth.controller.get_user_role`` lookup.
"""

from __future__ import annotations

import os
import time

# Set env vars BEFORE importing the app so app.config picks them up.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-please-do-not-use-in-prod")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
# Never report to a real Sentry project, even when the repo-root .env has a DSN
# (load_dotenv leaves variables that are already set alone).
os.environ["SENTRY_DSN"] = ""

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

TEST_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def make_token(
    sub: str = "user-abc",
    *,
    expired: bool = False,
    secret: str | None = None,
    email: str | None = None,
) -> str:
    """Mint an HS256 JWT that mimics Supabase's access token shape.

    ``email`` is the verified address Supabase puts in every email or OAuth user's token;
    pass it for the endpoints that read it (``/api/create-user``).
    """
    now = int(time.time())
    payload = {
        "sub": sub,
        "iat": now - 60,
        "exp": (now - 120) if expired else (now + 3600),
        "aud": "authenticated",
        "role": "authenticated",
    }
    if email is not None:
        payload["email"] = email
    return jwt.encode(payload, secret or TEST_SECRET, algorithm="HS256")


def header_for(email: str, sub: str = "user-abc") -> dict[str, str]:
    """An Authorization header for ``sub`` whose token carries ``email``."""
    return {"Authorization": f"Bearer {make_token(sub=sub, email=email)}"}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def valid_token() -> str:
    return make_token(sub="user-abc")


@pytest.fixture
def auth_header(valid_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {valid_token}"}


#: The institution list every test starts from (see ``_known_institutions``).
UCSC_INSTITUTION = {
    "id": "00000000-0000-4000-8000-0000000000c5",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "email_domains": ["ucsc.edu"],
}

# Contains a hex letter on purpose: some tests check that a differently-cased form of this id
# still matches, which an all-digit id ("1111...") could not exercise.
ISTINYE_INSTITUTION = {
    "id": "1a111111-1111-4111-8111-111111111111",
    "name": "İstinye University",
    "slug": "istinye",
    "email_domains": ["istinye.edu.tr"],
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


@pytest.fixture
def with_istinye(monkeypatch):
    """Add İstinye (a non-``.edu`` school domain) to the cached institution list.

    For a test that needs an address at an institution's domain to count as a school email
    (``is_school_email``) without a real institutions-table round trip.
    """
    from app.institutions import controller as institutions

    monkeypatch.setattr(
        institutions,
        "_cache",
        (float("inf"), [dict(UCSC_INSTITUTION), dict(ISTINYE_INSTITUTION)]),
    )
