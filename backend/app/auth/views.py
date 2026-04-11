"""
Auth views — parameter handling and responses
"""
import logging

from fastapi import HTTPException, Request, Depends
from app.dependencies import require_user, require_user_payload
from app.auth.models import SignupRequest
from app.auth.controller import get_user_role
from app.database.client import service_client, get_authenticated_client

logger = logging.getLogger(__name__)


def test_auth(user_id: str = Depends(require_user)):
    """
    Diagnostic endpoint: confirms the backend is reachable and the caller's
    token was verified. Requires a valid bearer token — use ``GET /health``
    for a no-auth liveness probe.
    """
    return {
        "message": f"Backend connected & Authenticated. Hello {user_id}",
        "user_id": user_id,
    }


def login_check(user_id: str = Depends(require_user)):
    """
    Returns the caller's id and profile role. Used by the frontend
    ``/auth/callback`` route to decide whether to send a first-time user to
    the role-selection page. ``role`` is ``None`` when no profile row exists.
    """
    role = get_user_role(user_id)
    return {
        "message": f"Backend connected & Authenticated. Hello {user_id}",
        "user_id": user_id,
        "role": role,
    }


def create_user(
    request: Request,
    data: SignupRequest,
    payload: dict = Depends(require_user_payload),
):
    email = data.email
    user_id = data.userId
    user_type = data.userType

    if payload.get('sub') != user_id:
        logger.warning(
            "create_user: token/body user_id mismatch | token_sub=%s body_user_id=%s email=%s",
            payload.get('sub'), user_id, email,
        )
        raise HTTPException(status_code=403, detail="User ID mismatch between Token and Body")

    logger.info(
        "Creating profile record | user_id=%s email=%s role=%s", user_id, email, user_type
    )

    try:
        user_data = {"id": user_id, "email": email, "role": user_type}

        if service_client:
            try:
                logger.debug(
                    "create_user: upserting profile via service role client | email=%s", email
                )
                service_client.table('profiles').upsert(user_data, on_conflict="id").execute()
                logger.info(
                    "Profile upserted via service role | user_id=%s email=%s", user_id, email
                )
                return {"message": "User record created successfully.", "email": email, "role": user_type}
            except Exception:
                # WARN: Service-role upsert failed — falling back to RLS path.
                # If you see this frequently, your service key or network to Supabase is bad.
                logger.warning(
                    "create_user: service-role upsert failed, falling back to authenticated client | email=%s",
                    email, exc_info=True,
                )

        auth_header = request.headers.get("Authorization") or ""
        parts = auth_header.split(" ")
        if len(parts) != 2:
            logger.warning("create_user: missing/malformed auth header on fallback path | email=%s", email)
            raise HTTPException(status_code=401, detail="Missing authentication token")
        token = parts[1]
        auth_client = get_authenticated_client(token)

        try:
            logger.debug(
                "create_user: upserting profile via authenticated client | email=%s", email
            )
            auth_client.table('profiles').upsert(user_data, on_conflict="id").execute()
            logger.info(
                "Profile upserted via RLS client | user_id=%s email=%s", user_id, email
            )
        except Exception:
            # WARN: This is almost always an RLS policy problem — profiles table
            # likely doesn't allow INSERT for the authenticated role.
            logger.exception(
                "create_user: profile upsert via RLS client failed — check RLS policies on profiles | email=%s",
                email,
            )
            raise HTTPException(status_code=500, detail="Database insert failed")

        return {"message": "User record created successfully.", "email": email, "role": user_type}

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Unexpected error in create_user | user_id=%s email=%s", user_id, email
        )
        raise HTTPException(status_code=500, detail="Failed to create user record")
