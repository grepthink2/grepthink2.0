"""Connected-app tokens (a ``client_id`` claim, issued by Supabase's OAuth server) are refused
by every API route: only ``/mcp`` takes them."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.dependencies import APP_TOKEN_REFUSED, is_app_token
from tests.conftest import make_token


def test_an_app_token_is_refused_on_an_api_route(client: TestClient):
    token = make_token(sub="user-xyz", client_id="0b5c7f9e-claude")

    r = client.get("/api/login-check", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 401
    assert r.json()["detail"] == APP_TOKEN_REFUSED


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"sub": "u", "client_id": "abc"}, True),
        ({"sub": "u"}, False),
        ({"sub": "u", "client_id": ""}, False),
        ({"sub": "u", "client_id": None}, False),
    ],
    ids=["client_id", "no claim", "empty", "null"],
)
def test_is_app_token(payload, expected):
    assert is_app_token(payload) is expected
