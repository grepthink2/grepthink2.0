"""Database access shared by every controller.

Every ``.execute()`` on the Supabase client is one HTTP round trip to
PostgREST. Controllers therefore batch related reads (``.in_()``, embedded
selects over foreign keys, bulk ``insert``/``upsert``) and fan independent
reads out through ``query_pool``. This module is the single place that decides
which client a controller talks through.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Mapping
from typing import TypeVar

from app.database.client import (
    _TRANSIENT_HTTPX_ERRORS as TRANSIENT_ERRORS,
)
from app.database.client import (
    query_pool,
    retry_on_disconnect,
    service_client,
    supabase,
)

__all__ = [
    "TRANSIENT_ERRORS",
    "fan_out",
    "get_client",
    "is_unique_violation",
    "query_pool",
    "retry_on_disconnect",
]

T = TypeVar("T")

#: ``query_pool`` worker threads are named ``supabase-query_<n>``.
_POOL_THREAD_PREFIX = "supabase-query"

#: Postgres SQLSTATE for a unique-constraint violation.
UNIQUE_VIOLATION = "23505"


def get_client():
    """Return the service-role client when configured, else the anon client.

    The service-role client bypasses Row-Level Security, which is why every
    authorization decision lives in Python (see ``app.core.authz``). Without a
    service key the anon client is used and RLS applies to every query — the
    app then answers "not found" for rows the policies hide, so treat a
    missing ``SUPABASE_SERVICE_ROLE_KEY`` as a configuration error in any real
    deployment (``app.database.client`` logs a warning at startup).

    Tests replace the client by patching ``app.core.db.service_client``.
    """
    return service_client if service_client is not None else supabase


def fan_out(jobs: Mapping[str, Callable[[], T]]) -> dict[str, T]:
    """Run independent reads concurrently on ``query_pool``; return results by key.

    Every PostgREST call is a network round trip, so N reads that do not depend
    on each other cost N round trips of latency when issued one after another
    and roughly one when fanned out::

        reads = fan_out({
            "class": lambda: authz.load_class(client, class_id),
            "members": lambda: client.table("project_members").select(...).execute().data,
        })

    * Results come back under the same keys. If a job raises, the exception
      propagates unchanged (so ``@retry_on_disconnect`` still sees transient
      httpx errors).
    * Zero or one job runs inline. So does a call made from inside a pool worker
      (a job that fans out again): queueing behind itself on a saturated pool
      would deadlock.
    * Keep jobs to reads. Writes should stay sequential and explicit.
    """
    if len(jobs) <= 1 or threading.current_thread().name.startswith(_POOL_THREAD_PREFIX):
        return {key: job() for key, job in jobs.items()}
    futures = {key: query_pool.submit(job) for key, job in jobs.items()}
    return {key: future.result() for key, future in futures.items()}


def is_unique_violation(exc: BaseException) -> bool:
    """True when ``exc`` is a Postgres unique-constraint violation from PostgREST.

    postgrest-py raises ``APIError`` carrying the SQLSTATE in ``.code``; use it to
    turn a lost insert race into a 409 (or a re-read) instead of a 500.
    """
    return getattr(exc, "code", None) == UNIQUE_VIOLATION
