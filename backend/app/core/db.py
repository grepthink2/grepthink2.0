"""Database access shared by every controller.

Every ``.execute()`` on the Supabase client is one HTTP round trip to
PostgREST. Controllers therefore batch related reads (``.in_()``, embedded
selects over foreign keys, bulk ``insert``/``upsert``) and fan independent
reads out through ``query_pool``. This module is the single place that decides
which client a controller talks through, and the boundary where a failed
database request becomes a typed ``app.core.errors.DatabaseError``.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Mapping
from typing import Any, TypeVar

import httpx
from postgrest.exceptions import APIError

from app.core.errors import (
    DatabaseConflictError,
    DatabaseError,
    DatabaseUnavailableError,
    Operation,
)
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
    "FOREIGN_KEY_VIOLATION",
    "TRANSIENT_ERRORS",
    "UNIQUE_VIOLATION",
    "DatabaseClient",
    "fan_out",
    "get_client",
    "query_pool",
    "retry_on_disconnect",
    "to_database_error",
]

T = TypeVar("T")

#: ``query_pool`` worker threads are named ``supabase-query_<n>``.
_POOL_THREAD_PREFIX = "supabase-query"

#: Postgres SQLSTATEs the application reacts to.
UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"

#: Codes meaning "the database is unreachable or overloaded", not "this request was
#: wrong": statement timeout, shutdowns, too many connections, PostgREST's own
#: connection and schema-cache errors, and the gateway statuses postgrest-py reports
#: as the code of a non-JSON error body. SQLSTATE class ``08`` (connection
#: exceptions) is matched by prefix.
_UNAVAILABLE_CODES = frozenset(
    {
        "57014",
        "57P01",
        "57P02",
        "57P03",
        "53300",
        "PGRST000",
        "PGRST001",
        "PGRST002",
        "PGRST003",
        "502",
        "503",
        "504",
    }
)

#: The builder method that decides whether a failed request was a read or a write.
_OPERATION_OF_METHOD: dict[str, Operation] = {
    "select": "read",
    "insert": "write",
    "upsert": "write",
    "update": "write",
    "delete": "write",
}


def to_database_error(
    exc: BaseException, *, operation: Operation, target: str | None
) -> DatabaseError | None:
    """The ``DatabaseError`` for a failure raised by the Supabase client, else ``None``.

    * PostgREST rejected the request (``postgrest.exceptions.APIError``): a unique
      violation is a ``DatabaseConflictError``; a timeout or connection-level code
      is a ``DatabaseUnavailableError``; anything else is a ``DatabaseError``.
    * The HTTP request itself failed (``httpx.TransportError``): a
      ``DatabaseUnavailableError``, retryable when the connection dropped.
    * Anything else did not come from the database and is not translated.
    """
    if isinstance(exc, DatabaseError):
        return exc
    if isinstance(exc, APIError):
        pg_code = None if exc.code is None else str(exc.code)
        diagnosis = {
            "operation": operation,
            "target": target,
            "pg_code": pg_code,
            "pg_message": exc.message,
        }
        if pg_code == UNIQUE_VIOLATION:
            return DatabaseConflictError(**diagnosis)
        if pg_code is not None and (pg_code in _UNAVAILABLE_CODES or pg_code.startswith("08")):
            return DatabaseUnavailableError(**diagnosis)
        return DatabaseError(**diagnosis)
    if isinstance(exc, httpx.TransportError):
        return DatabaseUnavailableError(
            operation=operation,
            target=target,
            pg_message=f"{type(exc).__name__}: {exc}",
            retryable=isinstance(exc, TRANSIENT_ERRORS),
        )
    return None


def _translated(
    operation: Operation, target: str | None, fn: Callable[..., T], /, *args: Any, **kwargs: Any
) -> T:
    """Call ``fn``; a failure from the database is re-raised as its ``DatabaseError``."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        error = to_database_error(exc, operation=operation, target=target)
        if error is None or error is exc:
            raise
        raise error from exc


def _is_request_builder(value: object) -> bool:
    return callable(getattr(value, "execute", None)) or callable(getattr(value, "eq", None))


class _Request:
    """A PostgREST request builder whose failures raise ``DatabaseError``.

    Proxies every builder method and property. The first of ``select`` /
    ``insert`` / ``upsert`` / ``update`` / ``delete`` decides whether a failure is
    reported as a read or a write.
    """

    __slots__ = ("_builder", "_operation", "_target")

    def __init__(self, builder: Any, target: str | None, operation: Operation | None) -> None:
        self._builder = builder
        self._target = target
        self._operation = operation

    def execute(self) -> Any:
        return _translated(self._operation or "read", self._target, self._builder.execute)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        result = _translated(
            self._operation or "read", self._target, self._builder, *args, **kwargs
        )
        return self._wrap(result, self._operation)

    def __getattr__(self, name: str) -> Any:
        operation = self._operation or _OPERATION_OF_METHOD.get(name)
        attr = getattr(self._builder, name)
        if _is_request_builder(attr):
            return _Request(attr, self._target, operation)
        if not callable(attr):
            return attr

        def call(*args: Any, **kwargs: Any) -> Any:
            result = _translated(operation or "read", self._target, attr, *args, **kwargs)
            return self._wrap(result, operation)

        return call

    def _wrap(self, value: Any, operation: Operation | None) -> Any:
        if isinstance(value, _Request) or not _is_request_builder(value):
            return value
        return _Request(value, self._target, operation)


class DatabaseClient:
    """The Supabase client controllers talk through. Database failures raise ``DatabaseError``.

    ``table()``, ``from_()`` and ``rpc()`` return request builders whose failures
    are translated by ``to_database_error``. Every other attribute (``auth``,
    ``storage`` and so on) is the wrapped client's own.
    """

    __slots__ = ("_client",)

    def __init__(self, client: Any) -> None:
        self._client = client

    def table(self, name: str) -> Any:
        return _Request(_translated("read", name, self._client.table, name), name, None)

    def from_(self, name: str) -> Any:
        return _Request(_translated("read", name, self._client.from_, name), name, None)

    def rpc(
        self,
        fn: str,
        params: dict | None = None,
        *args: Any,
        operation: Operation = "read",
        **kwargs: Any,
    ) -> Any:
        """Call a Postgres function. Its failures count as reads unless ``operation="write"``."""
        builder = _translated(operation, fn, self._client.rpc, fn, params, *args, **kwargs)
        return _Request(builder, fn, operation)

    def schema(self, name: str) -> DatabaseClient:
        return DatabaseClient(self._client.schema(name))

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


def get_client() -> DatabaseClient:
    """Return the service-role client when configured, else the anon client.

    The client is wrapped in ``DatabaseClient``, so a failed database request raises
    a ``DatabaseError`` (see ``to_database_error``) instead of a raw PostgREST or
    httpx exception.

    The service-role client bypasses Row-Level Security, which is why every
    authorization decision lives in Python (see ``app.core.authz``). Without a
    service key the anon client is used and RLS applies to every query — the
    app then answers "not found" for rows the policies hide, so treat a
    missing ``SUPABASE_SERVICE_ROLE_KEY`` as a configuration error in any real
    deployment (``app.database.client`` logs a warning at startup).

    Tests replace the client by patching ``app.core.db.service_client``.
    """
    return DatabaseClient(service_client if service_client is not None else supabase)


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
      propagates unchanged, so a ``DatabaseError`` keeps its type and
      ``@retry_on_disconnect`` still sees a retryable outage.
    * Zero or one job runs inline. So does a call made from inside a pool worker
      (a job that fans out again): queueing behind itself on a saturated pool
      would deadlock.
    * Keep jobs to reads. Writes should stay sequential and explicit.
    """
    if len(jobs) <= 1 or threading.current_thread().name.startswith(_POOL_THREAD_PREFIX):
        return {key: job() for key, job in jobs.items()}
    futures = {key: query_pool.submit(job) for key, job in jobs.items()}
    return {key: future.result() for key, future in futures.items()}
