"""
Profile views — parameter handling and responses
"""
import logging

from fastapi import Depends, HTTPException

from app.dependencies import require_user
from app.profiles.models import ProfileUpdateRequest
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
