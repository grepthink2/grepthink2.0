"""
Auth views — parameter handling and responses
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request

from app.auth.controller import get_user_role
from app.auth.models import CheckEmailRequest, SignupRequest
from app.core import db as core_db
from app.core.db import get_client
from app.core.errors import DatabaseConflictError, DatabaseError
from app.database.client import get_authenticated_client
from app.dependencies import require_user, require_user_payload
from app.limiter import limiter

logger = logging.getLogger(__name__)


def _has_service_client() -> bool:
    """True when the service-role client is configured (``SUPABASE_SERVICE_ROLE_KEY``).

    ``get_client()`` quietly falls back to the anon client without one; these
    views must not. ``check_email`` / ``check_user_exists`` would answer from
    RLS-filtered rows (every address would look free / unknown), so they answer
    503 instead, and ``create_user`` provisions through the caller's JWT-scoped
    client. Read through ``app.core.db`` at call time — the one point tests patch.
    """
    return core_db.service_client is not None


@limiter.limit("120/minute")
def login_check(request: Request, user_id: str = Depends(require_user)):
    """
    Returns the caller's id and profile role. Used by the frontend
    ``/auth/callback`` route to decide whether to send a first-time user to
    the role-selection page. ``role`` is ``None`` when no profile row exists or its
    owner has not picked a role yet.
    """
    role = get_user_role(user_id)
    return {
        "message": f"Backend connected & Authenticated. Hello {user_id}",
        "user_id": user_id,
        "role": role,
    }


@limiter.limit("20/minute")
def create_user(  # noqa: C901
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
    - The email is the verified token's, never the body's. It is written to
      ``profiles.email`` and, for a .edu address, to ``edu_email`` — the two
      columns a roster row is matched by — so a caller who could choose it could
      take over any classmate's roster row. The body's copy only has to agree.
    - The role is written once. It used to ``upsert`` on conflict with the user
      id, which meant an authenticated student could re-POST with
      ``userType: 'instructor'`` and escalate. A profile whose role is still
      empty (its owner signed up with Google and has not chosen yet) gets the
      requested role; any other existing profile answers 409 Conflict. Role
      changes must go through an explicit admin path (not yet built).
    """
    user_id = data.userId
    user_type = data.userType
    email = (payload.get("email") or "").strip().lower()

    if payload.get("sub") != user_id:
        logger.warning(
            "create_user: token/body user_id mismatch | token_sub=%s body_user_id=%s email=%s",
            payload.get("sub"),
            user_id,
            email,
        )
        raise HTTPException(status_code=403, detail="User ID mismatch between Token and Body")

    if not email or (data.email or "").strip().lower() != email:
        logger.warning(
            "create_user: token/body email mismatch | user_id=%s token_email=%s body_email=%s",
            user_id,
            email or None,
            data.email,
        )
        raise HTTPException(status_code=403, detail="Email mismatch between Token and Body")

    if user_type not in {"student", "instructor"}:
        logger.warning(
            "create_user: invalid user_type | user_id=%s email=%s user_type=%r",
            user_id,
            email,
            user_type,
        )
        raise HTTPException(status_code=400, detail="userType must be 'student' or 'instructor'")

    logger.info("Creating profile record | user_id=%s email=%s role=%s", user_id, email, user_type)

    # Prefer the service-role client (bypasses RLS) so we can deterministically
    # detect an existing row without depending on policy. Falls back to the
    # caller's JWT-authenticated client if no service key is configured.
    def _select_profile(client):
        return client.table("profiles").select("id, role, created_at").eq("id", user_id).execute()

    def _insert_profile(client):
        row = {"id": user_id, "email": email, "role": user_type}
        if email.endswith(".edu"):
            row["edu_email"] = email
        if data.firstName:
            row["first_name"] = data.firstName.strip()
        if data.lastName:
            row["last_name"] = data.lastName.strip()
        if data.avatarUrl:
            row["image_url"] = data.avatarUrl
        return client.table("profiles").insert(row).execute()

    service_configured = _has_service_client()
    if service_configured:
        client = get_client()
    else:
        auth_header = request.headers.get("Authorization") or ""
        parts = auth_header.split(" ")
        if len(parts) != 2:
            # This should never happen — require_user_payload already verified
            # the header. Defensive check.
            logger.warning("create_user: malformed auth header on RLS fallback | email=%s", email)
            raise HTTPException(status_code=401, detail="Missing authentication token")
        client = core_db.DatabaseClient(get_authenticated_client(parts[1]))

    def _backfill_edu_email(client):
        # A Supabase trigger may have auto-created the profile row without
        # edu_email. If the primary email is .edu and edu_email isn't set
        # yet, backfill it now so the column stays in sync.
        if not email.endswith(".edu"):
            return
        existing_edu = (
            client.table("profiles").select("edu_email").eq("id", user_id).single().execute()
        )
        if existing_edu.data and not existing_edu.data.get("edu_email"):
            client.table("profiles").update({"edu_email": email}).eq("id", user_id).execute()
            logger.info("create_user: backfilled edu_email | user_id=%s email=%s", user_id, email)

    try:
        existing = _select_profile(client)
        if existing.data:
            current_role = existing.data[0].get("role")
            created_at_str = existing.data[0].get("created_at")

            if current_role is None:
                # The signup trigger made the row and left the role for its owner to
                # choose (a Google signup carries none). Conditional on the role still
                # being empty, so of two racing requests exactly one picks.
                picked = (
                    client.table("profiles")
                    .update({"role": user_type})
                    .eq("id", user_id)
                    .is_("role", "null")
                    .execute()
                )
                if not picked.data:
                    raise HTTPException(
                        status_code=409, detail="Profile already exists for this user"
                    )
                try:
                    _backfill_edu_email(client)
                except DatabaseConflictError:
                    # Someone else holds this address as their roster email. The role is
                    # chosen; the address can be sorted out from Settings.
                    logger.warning(
                        "create_user: edu_email already claimed | user_id=%s email=%s",
                        user_id,
                        email,
                    )
                from app.auth.controller import invalidate_user_role
                from app.notifications.controller import ensure_profile_completion_notification

                invalidate_user_role(user_id)
                ensure_profile_completion_notification(user_id)
                logger.info(
                    "create_user: role chosen | user_id=%s email=%s role=%s",
                    user_id,
                    email,
                    user_type,
                )
                return {
                    "message": "User record created successfully.",
                    "email": email,
                    "role": user_type,
                }
            logger.info(
                "create_user: profile already exists | user_id=%s email=%s current_role=%s requested_role=%s",
                user_id,
                email,
                current_role,
                user_type,
            )

            # A Supabase DB trigger may have auto-created the profile row at
            # auth.users INSERT time with a hardcoded default role of 'student',
            # before this endpoint was called. Detect that case by checking:
            #   1. The roles differ (trigger used wrong default).
            #   2. The profile was created very recently (≤ 60 s ago) — meaning
            #      it was created by the trigger during this signup, not by a
            #      previous create-user call.
            #   3. The JWT user_metadata agrees with the requested role — rules
            #      out an attacker who updated their metadata after signup.
            # Only allow upgrading student→instructor here, not the reverse.
            if (
                current_role != user_type
                and current_role == "student"
                and user_type == "instructor"
                and created_at_str
            ):
                jwt_role = (payload.get("user_metadata") or {}).get("role", "")
                try:
                    created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                    age = datetime.now(UTC) - created_at
                    if age < timedelta(seconds=60) and jwt_role == "instructor":
                        client.table("profiles").update({"role": "instructor"}).eq(
                            "id", user_id
                        ).execute()
                        from app.auth.controller import invalidate_user_role

                        invalidate_user_role(user_id)
                        logger.info(
                            "create_user: corrected trigger-defaulted role | user_id=%s email=%s",
                            user_id,
                            email,
                        )
                        return {
                            "message": "User record created successfully.",
                            "email": email,
                            "role": user_type,
                        }
                except (ValueError, TypeError):
                    pass

            _backfill_edu_email(client)

            raise HTTPException(
                status_code=409,
                detail="Profile already exists for this user",
            )

        # If the signup email is .edu, block it if another account already owns
        # that address as its edu_email (defensive backstop for race conditions;
        # the /check-email endpoint handles the common case earlier in SignUp.tsx).
        # Only with the service-role client: `client` is that client here, and it
        # can see (and delete the auth user behind) other accounts' rows.
        if email.endswith(".edu") and service_configured:
            edu_conflict = client.table("profiles").select("id").eq("edu_email", email).execute()
            if edu_conflict.data:
                try:
                    client.auth.admin.delete_user(user_id)
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
    except DatabaseError as exc:
        # A foreign-key violation on profiles_id_fkey means the auth user id is not
        # in auth.users: a stale JWT for a deleted account. Answer 401 so the
        # frontend prompts a re-login. Any other database failure propagates with
        # its own status and code.
        if exc.pg_code == core_db.FOREIGN_KEY_VIOLATION and "profiles_id_fkey" in (
            exc.pg_message or ""
        ):
            logger.warning(
                "create_user: auth user missing from users table (stale JWT?) | user_id=%s email=%s",
                user_id,
                email,
            )
            raise HTTPException(
                status_code=401,
                detail="Auth account not found. Please sign out and sign back in.",
            ) from exc
        raise
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "create_user: profile provisioning failed | user_id=%s email=%s",
            user_id,
            email,
        )
        raise HTTPException(status_code=500, detail="Failed to create profile")


@limiter.limit("60/minute")
def check_user_exists(request: Request, data: CheckEmailRequest):
    """
    Unauthenticated endpoint. Returns whether an email belongs to an existing
    account. Used by ForgotPassword.tsx to surface an error before calling
    Supabase resetPasswordForEmail (which silently succeeds for unknown emails).
    """
    if not _has_service_client():
        raise HTTPException(status_code=503, detail="Service unavailable")
    client = get_client()

    result = client.table("profiles").select("id").eq("email", data.email.lower()).execute()
    return {"exists": len(result.data) > 0}


@limiter.limit("60/minute")
def check_email(request: Request, data: CheckEmailRequest):
    """
    Unauthenticated endpoint. Returns whether a .edu email address is
    available to be claimed — i.e. not already stored as edu_email on any
    existing profile. Used by SignUp.tsx to give early feedback before
    calling supabase.auth.signUp.
    """
    if not _has_service_client():
        raise HTTPException(status_code=503, detail="Service unavailable")
    client = get_client()

    result = client.table("profiles").select("id").eq("edu_email", data.email.lower()).execute()
    return {"available": len(result.data) == 0}
