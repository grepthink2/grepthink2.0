"""
Authentication business logic
"""

import logging
import threading
import time

from app.core.db import get_client

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
# ``get_user_role`` now runs only for ``require_instructor`` (creating a
# class, the one thing ``profiles.role`` still decides), ``join_class``'s
# has-a-role check and ``/api/login-check``; class endpoints check the class
# itself. It used to run on almost every authenticated endpoint, each call a
# round-trip to Supabase. Roles change extremely rarely — and we already
# invalidate explicitly on the few code paths that mutate them — so a small
# in-process TTL cache is safe and trims that round-trip.
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

    Only a chosen role is cached: it changes only when a maintainer flips it
    (student → instructor); the TTL bounds how long a stale role is served.
    ``None`` (no profile row, or a row whose owner has not picked a role yet)
    is looked up every time, because that state ends the moment the user
    picks and other instances cannot be told.
    A failed lookup raises ``DatabaseError`` and is not cached either, so
    callers answer 503 or 500 instead of treating a database blip as "no role"
    (which used to surface as a 403).

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

    client = get_client()
    result = client.table("profiles").select("role").eq("id", user_id).execute()
    role = result.data[0].get("role") if result.data else None
    if role is None:
        # No row yet, or its owner has not picked a role. Both end the moment they do, and
        # that has to show on the very next request from any instance, so only a chosen
        # role (which changes only when a maintainer flips it) is worth caching.
        logger.debug("get_user_role: no role yet | user_id=%s", user_id)
        return None
    with _role_cache_lock:
        _role_cache[user_id] = (role, now + _ROLE_CACHE_TTL_SECONDS)
    return role
