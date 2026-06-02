import functools
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, TypeVar

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Shared executor for fanning independent Supabase queries out in parallel.
# supabase-py wraps httpx.Client, which is thread-safe, so issuing several
# ``.execute()`` calls from different threads pulls connections from the
# same HTTP/2 pool concurrently. The pool size is intentionally small
# (8 workers) — we just need enough to overlap a handful of independent
# reads on the request hot path; we are not trying to parallelize CPU
# work, only network latency.
query_pool: ThreadPoolExecutor = ThreadPoolExecutor(
    max_workers=8, thread_name_prefix="supabase-query"
)

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

url: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
# Try standard names and the one in the .env
key: str = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("Supabase URL and Key must be set in .env file")
else:
    logger.info("Supabase URL and Key loaded successfully | url=%s", url)

# Default client (usually anon key)
supabase: Client = create_client(url, key)

# Service Role Client (Optional - for admin tasks)
service_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
service_client: Client = None

if service_key:
    try:
        service_client = create_client(url, service_key)
        logger.info("Supabase Service Role Client loaded")
    except Exception:
        logger.exception("Failed to load Service Role Client")
else:
    # WARN: without the service client every controller falls back to the anon client,
    # which is subject to RLS policies. If you're seeing unexpected 401s from the DB,
    # this is probably why.
    logger.warning(
        "SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon client "
        "(RLS policies will be enforced on all queries)"
    )


# Transient errors that mean "the existing connection died, retry once".
# Supabase's edge proxy occasionally tears down idle HTTP/2 streams, after
# which the *next* postgrest call throws ``RemoteProtocolError: Server
# disconnected``. The bad connection gets evicted from the pool by httpcore,
# so retrying immediately almost always succeeds.
_TRANSIENT_HTTPX_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.ReadTimeout,
)


def retry_on_disconnect(retries: int = 1) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """
    Decorator: retry the wrapped function on transient Supabase disconnects.

    Usage::

        @retry_on_disconnect()
        def update_thing(...):
            client.table('thing').update(...).execute()

    The decorated function MUST allow the transient ``httpx`` exceptions to
    propagate; if it catches them and converts to ``HTTPException(500)``,
    the retry never runs. ``HTTPException`` and other exceptions are not
    retried.
    """
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs) -> T:
            last_exc: Exception | None = None
            for attempt in range(retries + 1):
                try:
                    return fn(*args, **kwargs)
                except _TRANSIENT_HTTPX_ERRORS as exc:
                    last_exc = exc
                    if attempt >= retries:
                        raise
                    logger.warning(
                        "Supabase disconnect (%s) in %s — retrying %s/%s",
                        type(exc).__name__, fn.__qualname__,
                        attempt + 1, retries,
                    )
            # Unreachable in practice — the loop either returns or re-raises.
            assert last_exc is not None
            raise last_exc
        return wrapper
    return decorator


def get_authenticated_client(access_token: str) -> Client:
    """
    Returns a Supabase client authenticated as the user via the provided Bearer token (from Supabase Auth).
    """
    try:
        # Create a new client instance sharing the same URL and Key
        # We don't want to use the shared 'supabase' instance as that would mess up headers for everyone
        new_client = create_client(url, key)

        # Manually inject the Authorization header into the Postgrest client
        new_client.postgrest.auth(access_token)

        logger.debug("Created authenticated Supabase client for request")
        return new_client
    except Exception:
        logger.exception("Error creating authenticated client — falling back to default")
        # Fallback to default client if something goes wrong
        return supabase
