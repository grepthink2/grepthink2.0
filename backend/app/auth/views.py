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
    """
    Provision the profiles row for a newly-authenticated user.

    Two callers today:
      - SignUp.tsx after an email/password signup.
      - RoleSelection.tsx after a Google OAuth first-login chooses a role.

    Security notes
    --------------
    - The JWT's ``sub`` must match ``userId`` in the body; otherwise a
      caller could provision a profile for another user.
    - This endpoint is INSERT-only. It used to ``upsert`` on conflict with
      the user id, which meant an authenticated student could re-POST with
      ``userType: 'instructor'`` and escalate. We now return 409 Conflict
      when a profile already exists, so role is fixed at signup. Role
      changes must go through an explicit admin path (not yet built).
    """
    email = data.email
    user_id = data.userId
    user_type = data.userType

    if payload.get('sub') != user_id:
        logger.warning(
            "create_user: token/body user_id mismatch | token_sub=%s body_user_id=%s email=%s",
            payload.get('sub'), user_id, email,
        )
        raise HTTPException(status_code=403, detail="User ID mismatch between Token and Body")

    if user_type not in {"student", "instructor"}:
        logger.warning(
            "create_user: invalid user_type | user_id=%s email=%s user_type=%r",
            user_id, email, user_type,
        )
        raise HTTPException(status_code=400, detail="userType must be 'student' or 'instructor'")

    logger.info(
        "Creating profile record | user_id=%s email=%s role=%s", user_id, email, user_type
    )

    # Prefer the service-role client (bypasses RLS) so we can deterministically
    # detect an existing row without depending on policy. Falls back to the
    # caller's JWT-authenticated client if no service key is configured.
    def _select_profile(client):
        return client.table('profiles').select('id, role').eq('id', user_id).execute()

    def _insert_profile(client):
        return client.table('profiles').insert(
            {"id": user_id, "email": email, "role": user_type}
        ).execute()

    client = service_client
    if client is None:
        auth_header = request.headers.get("Authorization") or ""
        parts = auth_header.split(" ")
        if len(parts) != 2:
            # This should never happen — require_user_payload already verified
            # the header. Defensive check.
            logger.warning("create_user: malformed auth header on RLS fallback | email=%s", email)
            raise HTTPException(status_code=401, detail="Missing authentication token")
        client = get_authenticated_client(parts[1])

    try:
        existing = _select_profile(client)
        if existing.data:
            current_role = existing.data[0].get('role')
            logger.info(
                "create_user: profile already exists | user_id=%s email=%s current_role=%s requested_role=%s",
                user_id, email, current_role, user_type,
            )
            raise HTTPException(
                status_code=409,
                detail="Profile already exists for this user",
            )

        _insert_profile(client)
        logger.info("Profile created | user_id=%s email=%s role=%s", user_id, email, user_type)
        return {
            "message": "User record created successfully.",
            "email": email,
            "role": user_type,
        }
    except HTTPException:
        raise
    except Exception:
        # WARN: This is almost always an RLS policy problem if running on the
        # authenticated client — profiles table likely doesn't allow INSERT
        # for the authenticated role. On the service-role client it indicates
        # a schema mismatch or network issue.
        logger.exception(
            "create_user: profile insert failed | user_id=%s email=%s", user_id, email,
        )
        raise HTTPException(status_code=500, detail="Database insert failed")
