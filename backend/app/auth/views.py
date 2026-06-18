"""
Auth views — parameter handling and responses
"""
import logging

from fastapi import HTTPException, Request, Depends
from app.dependencies import require_user, require_user_payload
from app.auth.models import SignupRequest, CheckEmailRequest
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
        row = {"id": user_id, "email": email, "role": user_type}
        if email.lower().endswith('.edu'):
            row["edu_email"] = email
        if data.firstName:
            row["first_name"] = data.firstName.strip()
        if data.lastName:
            row["last_name"] = data.lastName.strip()
        if data.avatarUrl:
            row["image_url"] = data.avatarUrl
        return client.table('profiles').insert(row).execute()

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

            # A Supabase trigger may have auto-created the profile row without
            # edu_email. If the primary email is .edu and edu_email isn't set
            # yet, backfill it now so the column stays in sync.
            if email.lower().endswith('.edu'):
                existing_edu = (
                    client.table('profiles')
                    .select('edu_email')
                    .eq('id', user_id)
                    .single()
                    .execute()
                )
                if existing_edu.data and not existing_edu.data.get('edu_email'):
                    client.table('profiles').update(
                        {'edu_email': email}
                    ).eq('id', user_id).execute()
                    logger.info(
                        "create_user: backfilled edu_email | user_id=%s email=%s",
                        user_id, email,
                    )

            raise HTTPException(
                status_code=409,
                detail="Profile already exists for this user",
            )

        # If the signup email is .edu, block it if another account already owns
        # that address as its edu_email (defensive backstop for race conditions;
        # the /check-email endpoint handles the common case earlier in SignUp.tsx).
        if email.lower().endswith('.edu') and service_client:
            edu_conflict = (
                service_client.table('profiles')
                .select('id')
                .eq('edu_email', email)
                .execute()
            )
            if edu_conflict.data:
                try:
                    service_client.auth.admin.delete_user(user_id)
                except Exception:
                    logger.warning(
                        "create_user: failed to delete orphaned auth user | user_id=%s", user_id
                    )
                raise HTTPException(
                    status_code=409,
                    detail="This .edu email is already linked to another account.",
                )

        _insert_profile(client)
        # Drop any cached "no role" entry from a prior login-check that
        # raced this provisioning call.
        from app.auth.controller import invalidate_user_role
        invalidate_user_role(user_id)
        from app.notifications.controller import ensure_profile_completion_notification
        ensure_profile_completion_notification(user_id)
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


def check_email(data: CheckEmailRequest):
    """
    Unauthenticated endpoint. Returns whether a .edu email address is
    available to be claimed — i.e. not already stored as edu_email on any
    existing profile. Used by SignUp.tsx to give early feedback before
    calling supabase.auth.signUp.
    """
    client = service_client
    if client is None:
        raise HTTPException(status_code=503, detail="Service unavailable")

    try:
        result = (
            client.table('profiles')
            .select('id')
            .eq('edu_email', data.email.lower())
            .execute()
        )
        return {"available": len(result.data) == 0}
    except Exception:
        logger.exception("check_email: lookup failed | email=%s", data.email)
        raise HTTPException(status_code=500, detail="Failed to check email availability")
