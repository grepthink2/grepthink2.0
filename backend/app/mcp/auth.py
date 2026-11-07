"""The MCP connector's OAuth settings: this API is both the authorization server (the MCP SDK's
endpoints on :class:`app.mcp.oauth.OAuthProvider`) and the resource server for /mcp."""

from __future__ import annotations

from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions

from app.config import settings
from app.mcp.oauth import SCOPE

#: Only for building the app when the API has no public address: /mcp then answers 503
#: (app/mcp/server.py) and nothing reads this.
_UNCONFIGURED = "http://localhost:5001"


def auth_settings() -> AuthSettings:
    issuer = settings.MCP_ISSUER_URL or _UNCONFIGURED
    return AuthSettings(
        issuer_url=issuer,
        resource_server_url=settings.MCP_RESOURCE_URL or f"{_UNCONFIGURED}/mcp",
        client_registration_options=ClientRegistrationOptions(
            enabled=True, valid_scopes=[SCOPE], default_scopes=[SCOPE]
        ),
        revocation_options=RevocationOptions(enabled=True),
        required_scopes=[SCOPE],
        # Our tokens are opaque and only ever issued for /mcp: there is no other resource.
        validate_token_resource=False,
    )
