"""
Authentication business logic
"""
import logging

from app.database.client import service_client, supabase

logger = logging.getLogger(__name__)


def is_instructor_role(role: str | None) -> bool:
    """
    Check if the given role is an instructor

    Args:
        role: User role string

    Returns:
        True if role is instructor, False otherwise
    """
    return role == "instructor"


def get_user_role(user_id: str) -> str | None:
    """
    Fetch user role from the database

    Args:
        user_id: User's unique identifier

    Returns:
        User's role string or None if not found
    """
    try:
        client = service_client if service_client else supabase
        result = client.table('profiles').select('role').eq('id', user_id).execute()
        if result.data and len(result.data) > 0:
            return result.data[0].get('role')
        logger.debug("get_user_role: no profile row | user_id=%s", user_id)
    except Exception:
        # WARN: Silent failure path — callers just get None back and can't
        # distinguish "no role" from "DB error". Returning None here means
        # downstream role checks may silently deny access instead of failing
        # loud. See CODE_REVIEW.md #17.
        logger.exception("get_user_role: lookup failed | user_id=%s", user_id)
    return None
