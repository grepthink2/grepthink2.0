"""
FastAPI dependencies for authentication and authorization
"""
import json
from fastapi import Request, HTTPException
import jwt
from jwt import PyJWKClient, PyJWK
from app.config import settings

# Initialize JWK client for RS256/ES256 algorithms
_static_jwk: PyJWK | None = None
if settings.SUPABASE_JWK_JSON:
    try:
        _static_jwk = PyJWK.from_dict(json.loads(settings.SUPABASE_JWK_JSON))
    except Exception as e:
        print(f"WARNING: Invalid SUPABASE_JWK_JSON: {e}")

_jwks_client: PyJWKClient | None = None
if settings.SUPABASE_URL:
    _jwks_client = PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/keys")


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
        # For testing endpoints that don't strictly require it yet
        return None
    
    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
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
            return payload

        # Handle RS256/ES256 (asymmetric) algorithms
        if alg in {"RS256", "ES256"}:
            if not _jwks_client:
                raise Exception("Missing SUPABASE_URL for JWKS")
            try:
                signing_key = _jwks_client.get_signing_key_from_jwt(token).key
            except Exception as jwks_error:
                if _static_jwk:
                    signing_key = _static_jwk.key
                else:
                    raise jwks_error
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
            return payload

        raise Exception(f"Unsupported JWT alg: {alg}")
    except Exception as e:
        print(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")
