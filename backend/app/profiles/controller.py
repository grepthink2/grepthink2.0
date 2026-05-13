"""
Profile business logic
"""
import logging

from app.database.client import service_client, supabase

logger = logging.getLogger(__name__)

PROFILE_FIELDS = "id, email, role, first_name, last_name, linkedin, github, image_url"

_ALLOWED_UPDATE_FIELDS = {
    'first_name',
    'last_name',
    'linkedin',
    'github',
    'image_url',
}


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
