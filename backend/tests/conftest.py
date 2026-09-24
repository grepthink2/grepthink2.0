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
