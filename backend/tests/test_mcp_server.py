"""The MCP endpoint (/mcp): who it lets in, the metadata that sends apps to Supabase's OAuth server,
and the tools it serves. The tools' rules are in test_mcp_controller.py."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from tests.conftest import make_token
from tests.scrum_support import PID, UID
from tests.test_mcp_controller import _db

HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-11-25",
}


@pytest.fixture
def mcp_client():
    with TestClient(app) as c:  # runs the lifespan, which starts the MCP session manager
        yield c


def _rpc(client: TestClient, method: str, params: dict | None = None, *, token: str | None):
    headers = dict(HEADERS)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", headers=headers, content=json.dumps(body))


def _app_token(sub: str = UID) -> str:
    return make_token(sub=sub, client_id="client-claude")


def _call(client: TestClient, name: str, arguments: dict, *, token: str) -> dict:
    r = _rpc(client, "tools/call", {"name": name, "arguments": arguments}, token=token)
    assert r.status_code == 200, r.text
    return r.json()["result"]


def test_no_token_points_at_the_resource_metadata(mcp_client):
    r = _rpc(mcp_client, "tools/list", token=None)

    assert r.status_code == 401
    assert "resource_metadata=" in r.headers["www-authenticate"]


def test_a_site_session_token_is_refused(mcp_client):
    r = _rpc(mcp_client, "tools/list", token=make_token(sub=UID))

    assert r.status_code == 401


def test_resource_metadata_names_supabase_as_the_authorization_server(mcp_client):
    r = mcp_client.get("/.well-known/oauth-protected-resource/mcp")

    assert r.status_code == 200
    body = r.json()
    assert body["resource"] == settings.MCP_RESOURCE_URL
    assert body["authorization_servers"] == [f"{settings.SUPABASE_URL}/auth/v1"]


def test_app_token_lists_the_three_tools(mcp_client):
    r = _rpc(mcp_client, "tools/list", token=_app_token())

    assert r.status_code == 200, r.text
    tools = {t["name"]: t for t in r.json()["result"]["tools"]}
    assert set(tools) == {"list_my_projects", "get_board_context", "fill_board"}
    assert tools["list_my_projects"]["annotations"]["readOnlyHint"] is True
    assert tools["get_board_context"]["annotations"]["readOnlyHint"] is True
    assert "explicit" in tools["fill_board"]["description"]


def test_list_my_projects_tool(mcp_client, monkeypatch):
    _db(monkeypatch)

    result = _call(mcp_client, "list_my_projects", {}, token=_app_token())

    assert not result.get("isError")
    assert result["structuredContent"]["result"][0]["project_id"] == PID


def test_fill_board_unconfirmed_is_a_tool_error(mcp_client, monkeypatch):
    fake = _db(monkeypatch)

    result = _call(
        mcp_client,
        "fill_board",
        {"project_id": PID, "confirmed": False, "stories": [{"title": "x"}]},
        token=_app_token(),
    )

    assert result["isError"] is True
    assert "explicit yes" in result["content"][0]["text"]
    assert fake.fill_calls == []


def test_fill_board_by_staff_is_a_tool_error(mcp_client, monkeypatch):
    from tests.scrum_support import TA

    _db(monkeypatch)

    result = _call(
        mcp_client,
        "fill_board",
        {"project_id": PID, "confirmed": True, "stories": [{"title": "x"}]},
        token=_app_token(sub=TA),
    )

    assert result["isError"] is True
    assert "Only team members can modify the board" in result["content"][0]["text"]


def test_fill_board_writes_and_returns_keys(mcp_client, monkeypatch):
    fake = _db(monkeypatch)

    result = _call(
        mcp_client,
        "fill_board",
        {"project_id": PID, "confirmed": True, "stories": [{"title": "Sign in", "points": 5}]},
        token=_app_token(),
    )

    assert not result.get("isError"), result
    out = result["structuredContent"]
    assert out["stories"][0]["key"] == "US-2"
    assert out["warnings"] == ["stories[0] 'Sign in': no assignee, no description"]
    assert len(fake.fill_calls) == 1
    assert fake.rows("events")[0]["meta"]["client_id"] == "client-claude"


def test_outside_the_app_lifespan_mcp_answers_503(client):
    r = _rpc(client, "tools/list", token=_app_token())

    assert r.status_code == 503


def test_without_a_public_address_mcp_answers_503_and_the_api_stays_up(monkeypatch):
    # On Vercel with no PUBLIC_API_URL there is no address to tell apps: better closed than
    # pointing them at localhost.
    monkeypatch.setattr(settings, "MCP_RESOURCE_URL", None)
    with TestClient(app) as c:
        assert _rpc(c, "tools/list", token=_app_token()).status_code == 503
        assert c.get("/health").status_code == 200


def test_a_failing_mcp_start_leaves_the_api_up(monkeypatch):
    def broken():
        raise RuntimeError("boom")

    monkeypatch.setattr("app.mcp.server.build_mcp_app", broken)
    with TestClient(app) as c:
        assert _rpc(c, "tools/list", token=_app_token()).status_code == 503
        assert c.get("/health").status_code == 200


def test_a_project_name_instead_of_an_id_is_a_readable_tool_error(mcp_client, monkeypatch):
    _db(monkeypatch)

    result = _call(mcp_client, "get_board_context", {"project_id": "Trailhead"}, token=_app_token())

    assert result["isError"] is True
    assert "list_my_projects" in result["content"][0]["text"]
