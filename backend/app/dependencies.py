"""
FastAPI dependencies for authentication and authorization.

Dependency layering
-------------------
``verify_supabase_token``  - Parses and cryptographically verifies the JWT.
                             Raises 401 if missing/invalid. Returns the full
                             decoded payload dict.
``require_user``           - Thin wrapper that extracts the ``sub`` claim from
                             the verified payload. Use this when a view only
                             needs the user id (most common case).
``require_user_payload``   - Use when a view needs the full token payload
                             (e.g., for claims beyond ``sub``).
``require_instructor``     - Verifies the token AND that the caller has the
                             ``instructor`` role in the ``profiles`` table.
                             Raises 403 if not an instructor.

Rationale
---------
Previously ``verify_supabase_token`` returned ``None`` on a missing header and
every view had to remember ``if not payload: raise HTTPException(401)``. A
single forgotten guard would silently let unauthenticated traffic reach
business logic. Raising at the dependency layer makes "authenticated" the
default and surfaces auth bugs as test/runtime failures instead of silent
bypasses. See CODE_REVIEW.md findings #3, #9, #17.
"""
import json
import logging

from fastapi import Request, HTTPException, Depends
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


def verify_supabase_token(request: Request) -> dict:
    """
    Verify and decode the Supabase JWT from the Authorization header.

    Returns:
        Decoded JWT payload (dict).

    Raises:
        HTTPException 401: If the header is missing, malformed, or the token
        fails cryptographic verification.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        logger.debug(
            "verify_supabase_token: missing Authorization header on %s %s",
            request.method, request.url.path,
        )
        raise HTTPException(status_code=401, detail="Authentication required")

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
    except HTTPException:
        raise
    except Exception:
        logger.warning(
            "Token verification failed on %s %s",
            request.method, request.url.path,
            exc_info=True,
        )
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def require_user_payload(payload: dict = Depends(verify_supabase_token)) -> dict:
    """
    Return the full verified JWT payload. Use when a view needs claims
    beyond ``sub`` (email, role in user_metadata, etc.). Most views should
    prefer ``require_user``.
    """
    return payload


def require_user(payload: dict = Depends(verify_supabase_token)) -> str:
    """
    Return the authenticated user's id (``sub`` claim).

    This is the dependency most views should reach for: it hides the payload
    dict and gives the view a plain user-id string.
    """
    user_id = payload.get("sub")
    if not user_id:
        # A token with no sub claim is malformed — reject rather than let
        # downstream code attempt to query with a None id.
        logger.warning("require_user: verified token has no 'sub' claim")
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return user_id


def require_instructor(user_id: str = Depends(require_user)) -> str:
    """
    Require the caller to be an instructor. Returns the user id.

    Looks up the role in the ``profiles`` table rather than trusting JWT
    claims — role changes in Supabase's user metadata are not propagated to
    already-issued access tokens, so the DB is the source of truth.

    Raises:
        HTTPException 403: If the caller is not an instructor.
    """
    # Import lazily to avoid a circular import between dependencies and
    # app.auth.controller (which imports the database client).
    from app.auth.controller import get_user_role, is_instructor_role

    role = get_user_role(user_id)
    if not is_instructor_role(role):
        logger.info(
            "require_instructor: denied non-instructor | user_id=%s role=%s",
            user_id, role,
        )
        raise HTTPException(
            status_code=403, detail="Instructor role required"
        )
    return user_id
