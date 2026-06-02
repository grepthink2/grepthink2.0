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

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


TEST_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def make_token(sub: str = "user-abc", *, expired: bool = False, secret: str | None = None) -> str:
    """Mint an HS256 JWT that mimics Supabase's access token shape."""
    now = int(time.time())
    payload = {
        "sub": sub,
        "iat": now - 60,
        "exp": (now - 120) if expired else (now + 3600),
        "aud": "authenticated",
        "role": "authenticated",
    }
    return jwt.encode(payload, secret or TEST_SECRET, algorithm="HS256")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def valid_token() -> str:
    return make_token(sub="user-abc")


@pytest.fixture
def auth_header(valid_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {valid_token}"}


# In-memory Supabase for controller-level tests (see tests/memory_supabase.py).
_PATCH_MODULES = (
    "app.database.client",
    "app.classes.controller",
    "app.projects.controller",
    "app.staffing.controller",
    "app.assignments.controller",
    "app.tsr.controller",
    "app.auth.controller",
)


@pytest.fixture
def mem(monkeypatch: pytest.MonkeyPatch):
    from tests.memory_supabase import MemorySupabase

    db = MemorySupabase()
    for mod in _PATCH_MODULES:
        monkeypatch.setattr(f"{mod}.service_client", db, raising=False)
        monkeypatch.setattr(f"{mod}.supabase", db, raising=False)
    return db
