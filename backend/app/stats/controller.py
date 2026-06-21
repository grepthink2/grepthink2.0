import logging
import threading
import time

from app.database.client import service_client, supabase

logger = logging.getLogger(__name__)

_COUNT_CACHE_TTL_SECONDS = 60.0
# [cached_value, expiry_monotonic] — mutable so we can update in-place without global
_cache: list = [None, 0.0]
_count_cache_lock = threading.Lock()


def get_user_count() -> int:
    now = time.monotonic()
    with _count_cache_lock:
        if _cache[0] is not None and now < _cache[1]:
            return _cache[0]

    client = service_client if service_client else supabase
    try:
        result = client.table('profiles').select('id', count='exact').execute()
        count = result.count or 0
        with _count_cache_lock:
            _cache[0] = count
            _cache[1] = now + _COUNT_CACHE_TTL_SECONDS
        return count
    except Exception:
        logger.exception("get_user_count: query failed")
        return _cache[0] or 0
