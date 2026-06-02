"""
Authentication business logic
"""
import logging
import time
import threading

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


# ---------------------------------------------------------------------------
# Role lookup cache
#
# ``get_user_role`` was being called on almost every authenticated endpoint
# (every classes view, ``require_instructor``, etc.) and each call was a
# round-trip to Supabase. Roles change extremely rarely — and we already
# invalidate explicitly on the few code paths that mutate them — so a small
# in-process TTL cache is safe and trims one DB round-trip from the hot
# path of nearly every page load.
#
# Process-local (not shared across uvicorn workers); a stale read on one
# worker for at most ``_ROLE_CACHE_TTL_SECONDS`` is acceptable.
# ---------------------------------------------------------------------------
_ROLE_CACHE_TTL_SECONDS = 60.0
_role_cache: dict[str, tuple[str | None, float]] = {}
_role_cache_lock = threading.Lock()


def invalidate_user_role(user_id: str | None) -> None:
    """Drop a cached role for ``user_id`` (no-op if absent or ``None``)."""
    if not user_id:
        return
    with _role_cache_lock:
        _role_cache.pop(user_id, None)


def get_user_role(user_id: str) -> str | None:
    """
    Fetch the user's role, returning a cached value when fresh.

    The cache is populated with the value the database returned (including
    ``None`` for missing profile rows), so we never re-query the same id
    repeatedly inside the TTL window. Database errors are not cached: they
    log and return ``None`` for this call only.

    Args:
        user_id: User's unique identifier

    Returns:
        User's role string or None if not found
    """
    if not user_id:
        return None

    now = time.monotonic()
    with _role_cache_lock:
        cached = _role_cache.get(user_id)
        if cached is not None and cached[1] > now:
            return cached[0]

    try:
        client = service_client if service_client else supabase
        result = client.table('profiles').select('role').eq('id', user_id).execute()
        role = (
            result.data[0].get('role')
            if result.data and len(result.data) > 0
            else None
        )
        if role is None:
            logger.debug("get_user_role: no profile row | user_id=%s", user_id)
        with _role_cache_lock:
            _role_cache[user_id] = (role, now + _ROLE_CACHE_TTL_SECONDS)
        return role
    except Exception:
        # WARN: Silent failure path — callers just get None back and can't
        # distinguish "no role" from "DB error". Returning None here means
        # downstream role checks may silently deny access instead of failing
        # loud. See CODE_REVIEW.md #17.
        logger.exception("get_user_role: lookup failed | user_id=%s", user_id)
    return None
