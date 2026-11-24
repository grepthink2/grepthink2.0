"""
Profile views — parameter handling and responses
"""

import logging

from fastapi import Depends, HTTPException, Request
from slowapi.util import get_remote_address

from app.dependencies import require_user, require_user_payload
from app.limiter import limiter
from app.profiles import controller
from app.profiles.models import (
    ProfileUpdateRequest,
    SendEduVerificationRequest,
    VerifyEduEmailRequest,
)

logger = logging.getLogger(__name__)


def get_my_profile(
    user_id: str = Depends(require_user),
    payload: dict = Depends(require_user_payload),
):
    """
    Return the authenticated user's profile row.

    The token's ``email`` claim is the login address Supabase has confirmed. When it differs
    from ``profiles.email`` (the user changed it in Settings and opened the confirmation
    link) the row is brought up to date first, so the mirror heals on the first request
    after the change, on whichever device opened the link.
    """
    try:
        profile = controller.get_profile(user_id, token_email=payload.get("email"))
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    except HTTPException:
        raise
    except Exception:
        logger.exception("get_my_profile failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


def _caller(request: Request, user_id: str = Depends(require_user)) -> str:
    """The signed-in user, also kept on the request as its rate-limit key (``_profiles_rate_key``)."""
    request.state.profiles_rate_key = user_id
    return user_id


def _profiles_rate_key(request: Request) -> str:
    """The rate-limit bucket of a profile request: the signed-in user's own.

    On Vercel every request arrives from the proxy's address, so a limit keyed by address would be
    one bucket shared by everybody. The limit is checked after the route's dependencies have run,
    so ``_caller`` has set the key by then; the address is only a fallback.
    """
    return getattr(request.state, "profiles_rate_key", None) or get_remote_address(request)


@limiter.limit("120/minute", key_func=_profiles_rate_key)
def get_person_profile(
    request: Request,
    user_id: str,
    viewer_id: str = Depends(_caller),
) -> dict:
    """
    One person, as the caller may see them: someone they share a class with, or themself.

    ``user_id`` is read as text, so an id that is not a UUID gets the same 404 as one that names
    nobody the caller may see.
    """
    return controller.get_person_profile(viewer_id, user_id)


def update_my_profile(
    data: ProfileUpdateRequest,
    user_id: str = Depends(require_user),
):
    """
    Update the authenticated user's mutable profile fields.
    Only fields explicitly sent in the request body are written.
    """
    try:
        return controller.update_profile(user_id, data.model_dump(exclude_unset=True))
    except HTTPException:
        raise
    except Exception:
        logger.exception("update_my_profile failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to update profile")


def send_edu_verification(
    data: SendEduVerificationRequest,
    user_id: str = Depends(require_user),
):
    """
    Email a 6-digit verification code to the provided school email address.
    """
    try:
        sent = controller.send_edu_verification(user_id, data.edu_email)
        return {"message": "Verification code sent.", **sent}
    except HTTPException:
        raise
    except Exception:
        logger.exception("send_edu_verification failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to send verification code")


def verify_edu_email(
    data: VerifyEduEmailRequest,
    user_id: str = Depends(require_user),
):
    """
    Verify a school email code and save the email to the profile.
    """
    try:
        return controller.verify_edu_email(user_id, data.edu_email, data.code)
    except HTTPException:
        raise
    except Exception:
        logger.exception("verify_edu_email failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to verify email")
