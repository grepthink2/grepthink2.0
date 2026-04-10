"""
FastAPI dependencies for authentication and authorization
"""
import json
import logging

from fastapi import Request, HTTPException
import jwt
from jwt import PyJWKClient, PyJWK
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize JWK client for RS256/ES256 algorithms
_static_jwk: PyJWK | None = None
if settings.SUPABASE_JWK_JSON:
    try:
        _static_jwk = PyJWK.from_dict(json.loads(settings.SUPABASE_JWK_JSON))
        logger.info("Loaded static SUPABASE_JWK_JSON for token verification")
    except Exception:
        logger.warning("Invalid SUPABASE_JWK_JSON — ignoring", exc_info=True)

_jwks_client: PyJWKClient | None = None
if settings.SUPABASE_URL:
    _jwks_client = PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/keys")
    logger.debug("Initialized PyJWKClient for %s", settings.SUPABASE_URL)


def verify_supabase_token(request: Request):
    """
    Verify and decode Supabase JWT token from Authorization header

    Args:
        request: FastAPI request object

    Returns:
        Decoded JWT payload or None if no token provided

    Raises:
        HTTPException: If token is invalid or verification fails
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        # WARN: This returns None instead of raising 401, which forces every view
        # to re-check `if not payload: raise HTTPException(401)`. If you're seeing
        # unauthenticated requests reaching business logic, it's likely because a
        # view forgot that guard. See CODE_REVIEW.md finding #3.
        logger.debug(
            "verify_supabase_token: no Authorization header on %s %s — returning None",
            request.method, request.url.path,
        )
        return None

    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.warning(
            "Malformed Authorization header on %s %s",
            request.method, request.url.path,
        )
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = parts[1]

    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        # Handle HS256 (symmetric) algorithm
        if alg == "HS256":
            if not settings.SUPABASE_JWT_SECRET:
                raise Exception("Missing SUPABASE_JWT_SECRET")
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            logger.debug("Verified HS256 token for sub=%s", payload.get("sub"))
            return payload

        # Handle RS256/ES256 (asymmetric) algorithms
        if alg in {"RS256", "ES256"}:
            if not _jwks_client:
                raise Exception("Missing SUPABASE_URL for JWKS")
            try:
                signing_key = _jwks_client.get_signing_key_from_jwt(token).key
            except Exception as jwks_error:
                if _static_jwk:
                    logger.debug(
                        "JWKS lookup failed, falling back to static JWK: %s", jwks_error
                    )
                    signing_key = _static_jwk.key
                else:
                    raise jwks_error
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
            logger.debug("Verified %s token for sub=%s", alg, payload.get("sub"))
            return payload

        raise Exception(f"Unsupported JWT alg: {alg}")
    except Exception:
        logger.warning(
            "Token verification failed on %s %s",
            request.method, request.url.path,
            exc_info=True,
        )
        raise HTTPException(status_code=401, detail="Invalid authentication token")
