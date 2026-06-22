"""
Profile business logic
"""
import logging
import secrets
import time
from fastapi import HTTPException

from app.database.client import service_client, supabase
from app.utils.email import send_email

logger = logging.getLogger(__name__)

PROFILE_FIELDS = "id, email, role, first_name, last_name, linkedin, github, image_url, edu_email"

_ALLOWED_UPDATE_FIELDS = {
    'first_name',
    'last_name',
    'linkedin',
    'github',
    'image_url',
    'edu_email',
}

# In-memory store for pending edu email verification codes.
# key: user_id → (edu_email, code, expires_at)
# TO BE REPLACED with a proper email/cache solution when email is implemented.
_pending_edu_codes: dict[str, tuple[str, str, float]] = {}
_CODE_EXPIRY_SECONDS = 600  # 10 minutes


def get_profile(user_id: str) -> dict:
    """
    Fetch a user's full profile row.
    """
    client = service_client or supabase
    result = (
        client.table('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else {}


def _user_has_class_access(client, user_id: str, class_id: str, created_by: str) -> bool:
    """True if the user is the class instructor or enrolled as a student."""
    if user_id == created_by:
        return True
    enrollment = (
        client.table('class_enrollments')
        .select('id')
        .eq('class_id', class_id)
        .eq('user_id', user_id)
        .execute()
    )
    return bool(enrollment.data)


def get_profile_for_class_member(viewer_id: str, target_user_id: str, class_id: str) -> dict:
    """
    Return a profile visible to another member of the same class.

    Both viewer and target must belong to the class (instructor via created_by,
    student via class_enrollments).
    """
    client = service_client or supabase
    class_result = (
        client.table('classes')
        .select('id, created_by')
        .eq('id', class_id)
        .execute()
    )
    if not class_result.data:
        raise HTTPException(status_code=404, detail='Class not found')

    created_by = class_result.data[0]['created_by']
    if not _user_has_class_access(client, viewer_id, class_id, created_by):
        raise HTTPException(
            status_code=403,
            detail='You do not have access to this class',
        )
    if not _user_has_class_access(client, target_user_id, class_id, created_by):
        raise HTTPException(status_code=404, detail='User is not in this class')

    profile = get_profile(target_user_id)
    if not profile:
        raise HTTPException(status_code=404, detail='Profile not found')
    return profile


def update_profile(user_id: str, data: dict) -> dict:
    """
    Update mutable profile fields for a user.
    Only keys present in _ALLOWED_UPDATE_FIELDS are written.
    """
    payload = {k: v for k, v in data.items() if k in _ALLOWED_UPDATE_FIELDS}
    if not payload:
        logger.debug("update_profile: no valid fields to update | user_id=%s", user_id)
        return get_profile(user_id)

    client = service_client or supabase
    result = (
        client.table('profiles')
        .update(payload)
        .eq('id', user_id)
        .execute()
    )
    updated = result.data[0] if result.data else {}
    full_profile = get_profile(user_id) if updated else {}

    from app.notifications.controller import (
        dismiss_profile_completion_notification,
        ensure_profile_completion_notification,
    )
    if full_profile and not _profile_incomplete(full_profile):
        dismiss_profile_completion_notification(user_id)
    else:
        ensure_profile_completion_notification(user_id)

    return full_profile or updated


def _profile_incomplete(profile: dict) -> bool:
    first = (profile.get('first_name') or '').strip()
    last = (profile.get('last_name') or '').strip()
    if not first or not last:
        return True
    role = profile.get('role')
    email = (profile.get('email') or '').strip().lower()
    edu_email = (profile.get('edu_email') or '').strip()
    if role == 'student' and not email.endswith('.edu') and not edu_email:
        return True
    return False


def send_edu_verification(user_id: str, edu_email: str) -> None:
    """
    Generate a 6-digit verification code and email it to the provided
    .edu address. The code is stored in memory and expires after 10 minutes.
    """
    if not edu_email.lower().endswith('.edu'):
        raise HTTPException(status_code=400, detail="Must be a valid .edu email address")

    # Check availability before issuing a code so the error surfaces at
    # Save Changes time (inline), not after the user enters the code in the modal.
    client = service_client or supabase
    conflict = (
        client.table('profiles')
        .select('id')
        .eq('edu_email', edu_email)
        .neq('id', user_id)
        .execute()
    )
    if conflict.data:
        raise HTTPException(
            status_code=409,
            detail="This .edu email is already linked to another account.",
        )

    code = str(secrets.randbelow(1_000_000)).zfill(6)
    expires_at = time.time() + _CODE_EXPIRY_SECONDS
    _pending_edu_codes[user_id] = (edu_email, code, expires_at)

    body_text = (
        f"Your GrepThink .edu verification code is: {code}\n\n"
        f"Enter this code on the settings page to confirm your university email address.\n"
        f"This code expires in 10 minutes.\n\n"
        f"If you did not request this, you can safely ignore this message."
    )
    body_html = f"""
<html>
  <body style="font-family:sans-serif;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin-bottom:8px">Verify your university email</h2>
    <p>Enter the code below in GrepThink to confirm <strong>{edu_email}</strong>.</p>
    <div style="font-size:2rem;font-weight:700;letter-spacing:0.25em;
                background:#f4f4f5;border-radius:8px;padding:16px 24px;
                display:inline-block;margin:16px 0">{code}</div>
    <p style="color:#666;font-size:0.875rem">This code expires in 10 minutes.<br>
    If you did not request this, you can safely ignore this email.</p>
  </body>
</html>
"""

    try:
        send_email(
            to=edu_email,
            subject="GrepThink — verify your .edu email",
            body_text=body_text,
            body_html=body_html,
        )
    except RuntimeError:
        # SMTP not configured (local dev without mail server).
        # Log the code so developers can still test the flow.
        logger.warning(
            "edu_verification: SMTP not configured — code for %s is %s (dev only)",
            edu_email, code,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "Email delivery is not configured on this server. "
                "Please contact your administrator."
            ),
        )

    logger.info(
        "edu_verification: code sent | user_id=%s email=%s",
        user_id, edu_email,
    )


def verify_edu_email(user_id: str, edu_email: str, code: str) -> dict:
    """
    Verify the code for a pending .edu email verification.
    On success, saves edu_email to the profiles table.
    """
    pending = _pending_edu_codes.get(user_id)
    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No verification pending. Please save your changes again to get a new code.",
        )

    stored_email, stored_code, expires_at = pending

    if time.time() > expires_at:
        del _pending_edu_codes[user_id]
        raise HTTPException(
            status_code=400,
            detail="Verification code expired. Please save your changes again.",
        )

    if stored_email.lower() != edu_email.lower():
        raise HTTPException(
            status_code=400,
            detail="Email mismatch. Please save your changes again to get a new code.",
        )

    if stored_code != code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    del _pending_edu_codes[user_id]

    client = service_client or supabase
    try:
        result = (
            client.table('profiles')
            .update({'edu_email': edu_email})
            .eq('id', user_id)
            .execute()
        )
    except Exception as e:
        # Postgres unique constraint violation — another account claimed this
        # edu_email between when the code was sent and when it was verified.
        if '23505' in str(e):
            raise HTTPException(
                status_code=409,
                detail="This .edu email is already linked to another account.",
            )
        raise HTTPException(status_code=500, detail="Database error during verification.")

    logger.info("edu_verification: verified and saved | user_id=%s email=%s", user_id, edu_email)
    return result.data[0] if result.data else {}
