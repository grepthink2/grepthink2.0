"""
Tests for the auth dependency layer in ``app.dependencies``.

These tests exercise the dependency contract end-to-end through the real
FastAPI app so we catch regressions in the "dependency -> view -> response"
wiring, not just the dependency in isolation.

``/api/login-check`` is the simplest view that uses ``require_user``, so we
use it as a probe for every positive/negative case around missing headers,
malformed headers, bad signatures, and expired tokens.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_token


class TestRequireUser:
    """Covers require_user → verify_supabase_token via /api/login-check."""

    def test_missing_authorization_header_returns_401(self, client: TestClient):
        r = client.get("/api/login-check")
        assert r.status_code == 401
        assert r.json()["detail"] == "Authentication required"

    def test_malformed_authorization_header_returns_401(self, client: TestClient):
        r = client.get("/api/login-check", headers={"Authorization": "Basic abc"})
        assert r.status_code == 401

    def test_bearer_without_token_returns_401(self, client: TestClient):
        r = client.get("/api/login-check", headers={"Authorization": "Bearer "})
        assert r.status_code == 401

    def test_invalid_signature_returns_401(self, client: TestClient):
        bad = make_token(sub="user-xyz", secret="wrong-secret")
        r = client.get("/api/login-check", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid authentication token"

    def test_expired_token_returns_401(self, client: TestClient):
        bad = make_token(sub="user-xyz", expired=True)
        r = client.get("/api/login-check", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401

    @patch("app.auth.views.get_user_role")
    def test_valid_token_returns_user_id(self, mock_get_role, client: TestClient, auth_header):
        # login_check reads the caller's role; stub it so the probe needs no DB.
        mock_get_role.return_value = "student"
        r = client.get("/api/login-check", headers=auth_header)
        assert r.status_code == 200
        body = r.json()
        assert body["user_id"] == "user-abc"
        assert "Hello user-abc" in body["message"]


class TestRequireInstructor:
    """Covers require_instructor via /api/classes (POST) which requires it."""

    @patch("app.classes.controller.create_class")
    @patch("app.auth.controller.get_user_role")
    def test_instructor_can_create_class(
        self,
        mock_get_role,
        mock_create_class,
        client: TestClient,
        auth_header,
    ):
        mock_get_role.return_value = "instructor"
        mock_create_class.return_value = {"id": "cls-1", "name": "115C"}
        r = client.post(
            "/api/classes",
            headers=auth_header,
            json={"name": "115C", "description": "Soft Eng", "term": "Spring", "start_date": "2026-04-01"},
        )
        assert r.status_code == 200
        assert r.json()["class"]["id"] == "cls-1"
        mock_create_class.assert_called_once()

    @patch("app.auth.controller.get_user_role")
    def test_student_cannot_create_class(
        self,
        mock_get_role,
        client: TestClient,
        auth_header,
    ):
        mock_get_role.return_value = "student"
        r = client.post(
            "/api/classes",
            headers=auth_header,
            json={"name": "115C", "description": "Soft Eng", "term": "Spring", "start_date": "2026-04-01"},
        )
        assert r.status_code == 403
        assert r.json()["detail"] == "Instructor role required"

    @patch("app.auth.controller.get_user_role")
    def test_null_role_cannot_create_class(
        self,
        mock_get_role,
        client: TestClient,
        auth_header,
    ):
        """A user with no profiles row should not pass require_instructor."""
        mock_get_role.return_value = None
        r = client.post(
            "/api/classes",
            headers=auth_header,
            json={"name": "115C", "description": "Soft Eng", "term": "Spring", "start_date": "2026-04-01"},
        )
        assert r.status_code == 403


class TestCorsAllowlist:
    """CORS allowlist (Phase 4): wildcard removed, explicit origins only."""

    def test_preflight_from_allowed_origin(self, client: TestClient):
        r = client.options(
            "/api/classes",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        assert r.status_code == 200
        assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
        assert r.headers.get("Access-Control-Allow-Credentials") == "true"

    def test_preflight_from_disallowed_origin(self, client: TestClient):
        r = client.options(
            "/api/classes",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        # Starlette's CORSMiddleware rejects disallowed preflight with 400
        # and omits the Allow-Origin header entirely.
        assert r.headers.get("Access-Control-Allow-Origin") is None


class TestSecurityHeaders:
    """Phase 4 SecurityHeadersMiddleware contract."""

    @pytest.mark.parametrize(
        "header,expected_substr",
        [
            ("X-Content-Type-Options", "nosniff"),
            ("X-Frame-Options", "DENY"),
            ("Referrer-Policy", "no-referrer"),
            ("Strict-Transport-Security", "max-age=31536000"),
            ("Content-Security-Policy", "default-src 'none'"),
            ("Permissions-Policy", "camera=()"),
        ],
    )
    def test_health_has_header(self, client: TestClient, header: str, expected_substr: str):
        r = client.get("/health")
        assert r.status_code == 200
        assert expected_substr in r.headers.get(header, "")
