"""
Profile views — parameter handling and responses
"""
import logging
from uuid import UUID

from fastapi import Depends, HTTPException, Query

from app.dependencies import require_user
from app.profiles.models import ProfileUpdateRequest, SendEduVerificationRequest, VerifyEduEmailRequest
from app.profiles import controller

logger = logging.getLogger(__name__)


def get_my_profile(user_id: str = Depends(require_user)):
    """
    Return the authenticated user's profile row.
    """
    try:
        profile = controller.get_profile(user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    except HTTPException:
        raise
    except Exception:
        logger.exception("get_my_profile failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


def get_user_profile(
    user_id: str,
    class_id: UUID = Query(..., description="Class context — both users must belong to it"),
    viewer_id: str = Depends(require_user),
):
    """
    View another user's profile when you share a class roster.
    """
    try:
        profile = controller.get_profile_for_class_member(
            viewer_id, user_id, str(class_id)
        )
        return {"profile": profile}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "get_user_profile failed | viewer=%s target=%s class=%s",
            viewer_id, user_id, class_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


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
    except Exception:
        logger.exception("update_my_profile failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to update profile")


def send_edu_verification(
    data: SendEduVerificationRequest,
    user_id: str = Depends(require_user),
):
    """
    Email a 6-digit verification code to the provided .edu address.
    """
    try:
        controller.send_edu_verification(user_id, data.edu_email)
        return {"message": "Verification code sent."}
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
    Verify a .edu email code and save the email to the profile.
    """
    try:
        return controller.verify_edu_email(user_id, data.edu_email, data.code)
    except HTTPException:
        raise
    except Exception:
        logger.exception("verify_edu_email failed | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to verify email")
