"""
Profile business logic
"""
import logging
import secrets
import time
from fastapi import HTTPException

from app.database.client import service_client, supabase

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
        .single()
        .execute()
    )
    return result.data or {}


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
    return result.data[0] if result.data else {}


def send_edu_verification(user_id: str, edu_email: str) -> None:
    """
    Generate a 6-digit verification code for an .edu email and store it
    in memory. Prints the code to the terminal until email sending is implemented.

    TO BE REMOVED when real email delivery is wired up.
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

    # ── TO BE REMOVED WHEN EMAIL IS IMPLEMENTED ──────────────────────────────
    print(f"\n{'='*60}")
    print(f"[EDU VERIFICATION] user_id={user_id}")
    print(f"                   email   ={edu_email}")
    print(f"                   code    ={code}")
    print(f"{'='*60}\n")
    # ─────────────────────────────────────────────────────────────────────────

    logger.info(
        "edu_verification: code generated | user_id=%s email=%s",
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
