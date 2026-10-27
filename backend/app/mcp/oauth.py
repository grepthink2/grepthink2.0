"""The MCP connector's own authorization server: apps get GrepThink tokens for /mcp, never a Supabase
token (a Supabase token would let an app act on the student's whole account, password included).

The MCP SDK serves the OAuth endpoints (/register, /authorize, /token, /revoke) and does the protocol
checks; :class:`OAuthProvider` keeps their state in Postgres, so any serverless instance can answer:

* /authorize stores the request and sends the browser to the site's consent page, where the student,
  signed in as usual, answers through :func:`answer_authorization` (``/api/mcp/authorizations``).
* An Allow creates a grant: one student, one app, at most :data:`GRANT_TTL` long. Its tokens are opaque
  random strings stored only as SHA-256 hashes: access tokens for :data:`ACCESS_TTL`, refresh tokens
  rotated on every use. Reusing a rotated refresh token (after a short grace) ends the grant.
* Students list and end their grants from Settings (:func:`list_connections`, :func:`disconnect`).

Times come from ``deadlines.now_utc`` (patched in tests) and are compared in Python.
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

import anyio
from fastapi import HTTPException
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from app.assignments import deadlines
from app.core.db import get_client
from app.utils.urls import frontend_url

logger = logging.getLogger(__name__)

SCOPE = "scrum"
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=30)
#: One Allow lasts this long however often the app refreshes; then the student connects again.
GRANT_TTL = timedelta(days=90)
#: From /authorize to the student's answer, and from the answer to the app redeeming its code.
REQUEST_TTL = timedelta(minutes=10)
#: Registration deletes apps never used this long after registering.
UNUSED_CLIENT_TTL = timedelta(hours=24)
#: An app that refreshes twice at once presents the same refresh token twice; within this window
#: the second is only refused, after it the grant is ended as a stolen token's.
REUSE_GRACE = timedelta(seconds=30)
#: A grant's last_used_at is written at most this often (it shows in Settings).
LAST_USED_EVERY = timedelta(hours=1)
#: Registration metadata larger than this (JSON bytes) is refused; the column holds 8 kB.
MAX_CLIENT_INFO = 4096

#: Redirect URI schemes that would run in, or read from, the page that follows them: the consent
#: page sends the browser there, so one of these would run the registrant's code on the site.
BLOCKED_SCHEMES = frozenset({"javascript", "data", "vbscript", "file", "blob", "about"})

AUTHORIZATION_NOT_FOUND = "This request has expired or was already answered"
UNSAFE_REDIRECT = "This app's return address is not allowed"
CONNECTION_NOT_FOUND = "Connected app not found"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _now() -> datetime:
    return deadlines.now_utc()


def _at(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _first(res) -> dict | None:
    return (res.data or [None])[0] if res is not None else None


# ----------------------------------------------------------------- the SDK's tokens ----


class GrantCode(AuthorizationCode):
    request_id: str


class GrantRefreshToken(RefreshToken):
    grant_id: str


class GrantAccessToken(AccessToken):
    grant_id: str


# ------------------------------------------------------------------------- clients ----


def _get_client_info(client_id: str) -> dict | None:
    row = _first(
        get_client()
        .table("mcp_clients")
        .select("info")
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    return row["info"] if row else None


def _safe_redirect(uri: str) -> bool:
    scheme = urlparse(str(uri)).scheme.lower()
    return bool(scheme) and scheme not in BLOCKED_SCHEMES


def _register(info: dict) -> None:
    """Store a registration, after deleting apps never used within a day and expired requests,
    so open registration cannot grow the tables for long.

    ⚠️ Safety issue to revisit: any redirect URI is accepted, so anyone can register an app named
    "Claude" with their own redirect URI and ask a student to allow it (the consent page shows the
    redirect host). An allowlist of known callbacks is the likely fix."""
    if not all(_safe_redirect(u) for u in info.get("redirect_uris") or []):
        raise RegistrationError(
            "invalid_redirect_uri", "redirect_uris must not use a script or file scheme"
        )
    if len(json.dumps(info)) > MAX_CLIENT_INFO:
        raise RegistrationError("invalid_client_metadata", "Client metadata is too large")
    client = get_client()
    now = _now()
    client.table("mcp_clients").delete().is_("last_used_at", "null").lt(
        "registered_at", (now - UNUSED_CLIENT_TTL).isoformat()
    ).execute()
    client.table("mcp_authorizations").delete().lt("expires_at", now.isoformat()).execute()
    client.table("mcp_clients").insert(
        {"client_id": info["client_id"], "info": info, "registered_at": now.isoformat()}
    ).execute()


# ------------------------------------------------------------------- authorization ----


def _create_request(client_id: str, params: AuthorizationParams) -> str:
    request_id = secrets.token_urlsafe(24)
    get_client().table("mcp_authorizations").insert(
        {
            "id": request_id,
            "client_id": client_id,
            "params": params.model_dump(mode="json"),
            "expires_at": (_now() + REQUEST_TTL).isoformat(),
            "created_at": _now().isoformat(),
        }
    ).execute()
    return request_id


def _open_request(request_id: str) -> dict:
    """A request still waiting for the student's answer, with its app; else 404."""
    row = _first(
        get_client()
        .table("mcp_authorizations")
        .select("id, client_id, params, user_id, used_at, expires_at, mcp_clients(info)")
        .eq("id", request_id)
        .limit(1)
        .execute()
    )
    if not row or row.get("user_id") or row.get("used_at") or _at(row["expires_at"]) <= _now():
        raise HTTPException(status_code=404, detail=AUTHORIZATION_NOT_FOUND)
    return row


def _app_name(info: dict | None) -> str:
    return ((info or {}).get("client_name") or "").strip() or "An app"


def authorization_details(*, request_id: str, user_id: str) -> dict:
    """What the consent page shows: the app's name as it registered, and where it sends the student
    back (the only hint of who registered it)."""
    row = _open_request(request_id)
    info = (row.get("mcp_clients") or {}).get("info")
    return {
        "app_name": _app_name(info),
        "redirect_host": urlparse(row["params"]["redirect_uri"]).hostname or "",
    }


def answer_authorization(*, request_id: str, user_id: str, approve: bool) -> dict:
    """Record the signed-in student's answer and return where the browser goes next: the app's
    redirect URI with a one-time code, or with ``error=access_denied``. Answered once; 404 after."""
    row = _open_request(request_id)
    params = row["params"]
    if not _safe_redirect(params["redirect_uri"]):  # a request stored before registration checked
        raise HTTPException(status_code=400, detail=UNSAFE_REDIRECT)
    table = get_client().table("mcp_authorizations")
    if approve:
        code = secrets.token_urlsafe(32)
        change = {"user_id": str(user_id), "code_hash": _hash(code)}
        redirect = construct_redirect_uri(
            params["redirect_uri"], code=code, state=params.get("state")
        )
    else:
        change = {"used_at": _now().isoformat()}
        redirect = construct_redirect_uri(
            params["redirect_uri"], error="access_denied", state=params.get("state")
        )
    # Conditional on still being open: of two answers racing, one wins.
    res = (
        table.update(change)
        .eq("id", request_id)
        .is_("user_id", "null")
        .is_("used_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=AUTHORIZATION_NOT_FOUND)
    return {"redirect_url": redirect}


def _load_code(client_id: str, code: str) -> GrantCode | None:
    row = _first(
        get_client()
        .table("mcp_authorizations")
        .select("id, client_id, params, user_id, used_at, expires_at, grant_id")
        .eq("code_hash", _hash(code))
        .limit(1)
        .execute()
    )
    if not row or row["client_id"] != client_id:
        return None
    if row.get("used_at"):
        # A code presented twice was intercepted, or the app is broken: end what it gave.
        if row.get("grant_id"):
            logger.warning("mcp: an authorization code was replayed; ending its grant")
            _revoke_grant(row["grant_id"])
        return None
    if not row.get("user_id"):
        return None
    params = row["params"]
    return GrantCode(
        code=code,
        scopes=[SCOPE],
        expires_at=_at(row["expires_at"]).timestamp(),
        client_id=client_id,
        code_challenge=params["code_challenge"],
        redirect_uri=params["redirect_uri"],
        redirect_uri_provided_explicitly=params["redirect_uri_provided_explicitly"],
        resource=params.get("resource"),
        subject=row["user_id"],
        request_id=row["id"],
    )


def _redeem_code(code: GrantCode) -> OAuthToken:
    client = get_client()
    # One conditional update marks the code used: the SDK loads and exchanges it in two calls, and
    # only one exchange may win.
    used = (
        client.table("mcp_authorizations")
        .update({"used_at": _now().isoformat()})
        .eq("id", code.request_id)
        .is_("used_at", "null")
        .execute()
    )
    if not used.data:
        raise TokenError("invalid_grant", "authorization code has already been used")
    now = _now()
    # Before the grant exists: registration's cleanup deletes apps never used, with their grants.
    client.table("mcp_clients").update({"last_used_at": now.isoformat()}).eq(
        "client_id", code.client_id
    ).execute()
    grant = _first(
        client.table("mcp_grants")
        .insert(
            {
                "user_id": code.subject,
                "client_id": code.client_id,
                "scopes": [SCOPE],
                "created_at": now.isoformat(),
                "expires_at": (now + GRANT_TTL).isoformat(),
                "last_used_at": now.isoformat(),
            }
        )
        .execute()
    )
    client.table("mcp_authorizations").update({"grant_id": grant["id"]}).eq(
        "id", code.request_id
    ).execute()
    return _issue(grant)


# -------------------------------------------------------------------------- tokens ----


def _issue(grant: dict) -> OAuthToken:
    """A new access and refresh token for ``grant``, in one insert."""
    now = _now()
    access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    refresh_until = min(now + REFRESH_TTL, _at(grant["expires_at"]))
    get_client().table("mcp_tokens").insert(
        [
            {
                "token_hash": _hash(access),
                "grant_id": grant["id"],
                "kind": "access",
                "expires_at": (now + ACCESS_TTL).isoformat(),
                "created_at": now.isoformat(),
            },
            {
                "token_hash": _hash(refresh),
                "grant_id": grant["id"],
                "kind": "refresh",
                "expires_at": refresh_until.isoformat(),
                "created_at": now.isoformat(),
            },
        ]
    ).execute()
    return OAuthToken(
        access_token=access,
        expires_in=int(ACCESS_TTL.total_seconds()),
        refresh_token=refresh,
        scope=SCOPE,
    )


def _load_token(token: str, kind: str) -> tuple[dict, dict] | None:
    """The token's row and its grant, whatever their state; None for an unknown token."""
    row = _first(
        get_client()
        .table("mcp_tokens")
        .select("token_hash, kind, expires_at, revoked_at, grant_id, mcp_grants(*)")
        .eq("token_hash", _hash(token))
        .limit(1)
        .execute()
    )
    if not row or row["kind"] != kind or not row.get("mcp_grants"):
        return None
    return row, row["mcp_grants"]


def _grant_live(grant: dict) -> bool:
    return not grant.get("revoked_at") and _at(grant["expires_at"]) > _now()


def _revoke_grant(grant_id: str) -> None:
    get_client().table("mcp_grants").update({"revoked_at": _now().isoformat()}).eq(
        "id", grant_id
    ).is_("revoked_at", "null").execute()


def _load_refresh(client_id: str, token: str) -> GrantRefreshToken | None:
    found = _load_token(token, "refresh")
    if not found:
        return None
    row, grant = found
    if grant["client_id"] != client_id:
        return None
    if row.get("revoked_at"):
        if _now() - _at(row["revoked_at"]) > REUSE_GRACE:
            logger.warning("mcp: a rotated refresh token was reused; ending its grant")
            _revoke_grant(grant["id"])
        return None
    if not _grant_live(grant) or _at(row["expires_at"]) <= _now():
        return None
    return GrantRefreshToken(
        token=token,
        client_id=client_id,
        scopes=[SCOPE],
        expires_at=int(_at(row["expires_at"]).timestamp()),
        subject=grant["user_id"],
        grant_id=grant["id"],
    )


def _rotate(token: GrantRefreshToken) -> OAuthToken:
    client = get_client()
    rotated = (
        client.table("mcp_tokens")
        .update({"revoked_at": _now().isoformat()})
        .eq("token_hash", _hash(token.token))
        .is_("revoked_at", "null")
        .execute()
    )
    if not rotated.data:
        raise TokenError("invalid_grant", "refresh token has already been used")
    grant = _first(
        client.table("mcp_grants").select("*").eq("id", token.grant_id).limit(1).execute()
    )
    if not grant or not _grant_live(grant):
        raise TokenError("invalid_grant", "the connection has ended")
    # The access tokens issued before this refresh end with it.
    client.table("mcp_tokens").update({"revoked_at": _now().isoformat()}).eq(
        "grant_id", grant["id"]
    ).eq("kind", "access").is_("revoked_at", "null").execute()
    return _issue(grant)


def _load_access(token: str) -> GrantAccessToken | None:
    found = _load_token(token, "access")
    if not found:
        return None
    row, grant = found
    if row.get("revoked_at") or _at(row["expires_at"]) <= _now() or not _grant_live(grant):
        return None
    last = _at(grant.get("last_used_at"))
    if last is None or _now() - last > LAST_USED_EVERY:
        get_client().table("mcp_grants").update({"last_used_at": _now().isoformat()}).eq(
            "id", grant["id"]
        ).execute()
    return GrantAccessToken(
        token=token,
        client_id=grant["client_id"],
        scopes=[SCOPE],
        expires_at=int(_at(row["expires_at"]).timestamp()),
        subject=grant["user_id"],
        grant_id=grant["id"],
    )


# ------------------------------------------------------------------- connected apps ----


def list_connections(*, user_id: str) -> list[dict]:
    """The apps the student has allowed and not disconnected, one row per app."""
    rows = (
        get_client()
        .table("mcp_grants")
        .select("client_id, created_at, expires_at, revoked_at, last_used_at, mcp_clients(info)")
        .eq("user_id", str(user_id))
        .is_("revoked_at", "null")
        .order("created_at")
        .execute()
    ).data or []
    by_app: dict[str, dict] = {}
    for g in rows:
        if _at(g["expires_at"]) <= _now():
            continue
        entry = by_app.setdefault(
            g["client_id"],
            {
                "client_id": g["client_id"],
                "app_name": _app_name((g.get("mcp_clients") or {}).get("info")),
                "connected_at": g["created_at"],
                "last_used_at": g.get("last_used_at"),
            },
        )
        entry["connected_at"] = max(entry["connected_at"], g["created_at"])
        if g.get("last_used_at") and (entry["last_used_at"] or "") < g["last_used_at"]:
            entry["last_used_at"] = g["last_used_at"]
    return list(by_app.values())


def disconnect(*, user_id: str, client_id: str) -> None:
    """End every grant the student gave ``client_id``; 404 when there is none to end."""
    res = (
        get_client()
        .table("mcp_grants")
        .update({"revoked_at": _now().isoformat()})
        .eq("user_id", str(user_id))
        .eq("client_id", client_id)
        .is_("revoked_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=CONNECTION_NOT_FOUND)


# ------------------------------------------------------------------------ provider ----


async def _run(fn, *args):
    return await anyio.to_thread.run_sync(lambda: fn(*args))


class OAuthProvider:
    """The MCP SDK's ``OAuthAuthorizationServerProvider``, on the tables above."""

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        info = await _run(_get_client_info, client_id)
        return OAuthClientInformationFull.model_validate(info) if info else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        await _run(_register, client_info.model_dump(mode="json", exclude_none=True))

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        request_id = await _run(_create_request, client.client_id, params)
        return f"{frontend_url()}/oauth/consent?request={request_id}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> GrantCode | None:
        return await _run(_load_code, client.client_id, authorization_code)

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: GrantCode
    ) -> OAuthToken:
        return await _run(_redeem_code, authorization_code)

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> GrantRefreshToken | None:
        return await _run(_load_refresh, client.client_id, refresh_token)

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: GrantRefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        return await _run(_rotate, refresh_token)

    async def load_access_token(self, token: str) -> GrantAccessToken | None:
        return await _run(_load_access, token)

    async def revoke_token(self, token: GrantAccessToken | GrantRefreshToken) -> None:
        await _run(_revoke_grant, token.grant_id)
