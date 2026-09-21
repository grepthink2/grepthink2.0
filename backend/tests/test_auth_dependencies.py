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

    @pytest.mark.parametrize(
        ("authorization", "detail"),
        [
            (None, "Authentication required"),
            ("Basic abc", None),
            ("Bearer ", None),
            (
                lambda: f"Bearer {make_token(sub='user-xyz', secret='wrong-secret')}",
                "Invalid authentication token",
            ),
            (lambda: f"Bearer {make_token(sub='user-xyz', expired=True)}", None),
        ],
        ids=["no header", "not a bearer scheme", "empty bearer", "wrong signature", "expired"],
    )
    def test_anything_but_a_valid_bearer_token_answers_401(
        self, client: TestClient, authorization, detail
    ):
        value = authorization() if callable(authorization) else authorization
        r = client.get(
            "/api/login-check", headers={"Authorization": value} if value is not None else {}
        )

        assert r.status_code == 401
        if detail:
            assert r.json()["detail"] == detail

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
            json={
                "name": "115C",
                "description": "Soft Eng",
                "term": "Spring",
                "start_date": "2026-04-01",
            },
        )
        assert r.status_code == 200
        assert r.json()["class"]["id"] == "cls-1"
        mock_create_class.assert_called_once()

    @pytest.mark.parametrize("role", ["student", None], ids=["student", "no role yet"])
    @patch("app.auth.controller.get_user_role")
    def test_anyone_else_is_refused(self, mock_get_role, client: TestClient, auth_header, role):
        mock_get_role.return_value = role
        r = client.post(
            "/api/classes",
            headers=auth_header,
            json={
                "name": "115C",
                "description": "Soft Eng",
                "term": "Spring",
                "start_date": "2026-04-01",
            },
        )
        assert r.status_code == 403
        assert r.json()["detail"] == "Instructor role required"
