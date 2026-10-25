"""Who may use /mcp: a connected app holding a token Supabase's OAuth server issued for a user.

The token is an ordinary Supabase access token plus the app's ``client_id``, verified exactly
like a site session (:func:`app.dependencies.decode_supabase_jwt`). It is the mirror of the
API's rule: /mcp takes only app tokens, and every API route refuses them.
"""

from __future__ import annotations

import logging

from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings

from app.config import settings
from app.dependencies import decode_supabase_jwt, is_app_token

logger = logging.getLogger(__name__)


class SupabaseAppTokenVerifier:
    """The MCP SDK's ``TokenVerifier``: an :class:`AccessToken` for a valid app token, else None
    (the SDK answers 401 with a pointer to the resource metadata)."""

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            claims = decode_supabase_jwt(token)
        except Exception:
            logger.info("mcp: token verification failed", exc_info=True)
            return None
        if not is_app_token(claims) or not claims.get("sub"):
            logger.info("mcp: refused a token that is not a connected app's")
            return None
        return AccessToken(
            token=token,
            client_id=str(claims["client_id"]),
            scopes=[],
            expires_at=claims.get("exp"),
            subject=str(claims["sub"]),
        )


def auth_settings() -> AuthSettings:
    """Supabase Auth is the authorization server; this API is the resource server."""
    return AuthSettings(
        issuer_url=f"{settings.SUPABASE_URL}/auth/v1",
        resource_server_url=settings.MCP_RESOURCE_URL,
        # Supabase does not bind its tokens to a resource (they carry aud "authenticated"),
        # so there is no resource claim to compare.
        validate_token_resource=False,
    )
