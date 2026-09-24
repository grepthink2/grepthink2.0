"""Application-wide error types and exception handling.

Failures reach the client in one of three ways:

* ``DatabaseError`` and its subclasses: a request to the database failed.
  PostgREST rejected it (a constraint, a missing column, a permission) or the
  database could not be reached. The client that ``app.core.db.get_client()``
  returns raises these; our own logic never does. The response carries a safe
  ``detail`` and a stable ``code`` (``database_unavailable``,
  ``database_conflict``, ``database_read_failed``, ``database_write_failed``).
  PostgREST's code and message go to the log only.
* ``HTTPException`` raised deliberately by a route: answered as raised.
* Anything else is a bug. It is reported to Sentry (when ``SENTRY_DSN`` is set),
  logged with the request method and path, and answered with
  ``{"detail": "Internal server error", "code": "internal_error"}``.
  Exception text never reaches the client.

``AppError`` derives from ``HTTPException`` on purpose. Controllers use
``except HTTPException: raise`` to let deliberate errors through a broad
``except Exception`` block, so a ``DatabaseError`` passes those blocks with its
status and code intact. To handle one (for example ``DatabaseConflictError``
after losing a race on a unique key), catch that subclass *before* any
``except HTTPException`` clause.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.sentry import report_unhandled_exception

logger = logging.getLogger(__name__)

INTERNAL_ERROR_DETAIL = "Internal server error"
INTERNAL_ERROR_CODE = "internal_error"

Operation = Literal["read", "write"]


class AppError(HTTPException):
    """An error the API answers deliberately, with a stable machine-readable ``code``."""

    def __init__(
        self,
        status_code: int,
        code: str,
        detail: str,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code


class DatabaseError(AppError):
    """A database request failed: PostgREST rejected it, or the database was unreachable.

    ``operation`` says whether the request read or wrote data and ``target`` names
    the table or function. ``pg_code`` and ``pg_message`` keep PostgREST's
    diagnosis for the logs: ``str(error)`` includes them, ``detail`` never does.
    """

    _DEFAULTS: dict[str, tuple[str, str]] = {
        "read": ("database_read_failed", "Could not load data. Please try again."),
        "write": ("database_write_failed", "Could not save your changes. Please try again."),
    }

    def __init__(
        self,
        *,
        operation: Operation,
        target: str | None = None,
        pg_code: str | None = None,
        pg_message: str | None = None,
        retryable: bool = False,
        status_code: int = 500,
        code: str | None = None,
        detail: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        default_code, default_detail = self._DEFAULTS[operation]
        super().__init__(
            status_code, code or default_code, detail or default_detail, headers=headers
        )
        self.operation = operation
        self.target = target
        self.pg_code = pg_code
        self.pg_message = pg_message
        self.retryable = retryable

    def __str__(self) -> str:
        return (
            f"{self.code}: {self.operation} on {self.target or 'unknown target'} failed "
            f"(pg_code={self.pg_code}, message={self.pg_message!r})"
        )


class DatabaseUnavailableError(DatabaseError):
    """The database could not be reached, or timed out. Answers 503 with ``Retry-After``.

    ``retryable`` is true for a dropped connection, which ``@retry_on_disconnect``
    retries once.
    """

    def __init__(
        self,
        *,
        operation: Operation,
        target: str | None = None,
        pg_code: str | None = None,
        pg_message: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(
            operation=operation,
            target=target,
            pg_code=pg_code,
            pg_message=pg_message,
            retryable=retryable,
            status_code=503,
            code="database_unavailable",
            detail="The service is temporarily unavailable. Please try again in a moment.",
            headers={"Retry-After": "5"},
        )


class DatabaseConflictError(DatabaseError):
    """A write collided with existing data on a unique key (Postgres ``23505``). Answers 409."""

    def __init__(
        self,
        *,
        operation: Operation,
        target: str | None = None,
        pg_code: str | None = None,
        pg_message: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(
            operation=operation,
            target=target,
            pg_code=pg_code,
            pg_message=pg_message,
            retryable=retryable,
            status_code=409,
            code="database_conflict",
            detail="This conflicts with a change that was just made. Refresh and try again.",
        )


async def _app_error(request: Request, exc: AppError) -> JSONResponse:
    if isinstance(exc, DatabaseError):
        log = logger.warning if isinstance(exc, DatabaseUnavailableError) else logger.error
        log(
            "Database %s failed | %s %s target=%s pg_code=%s message=%s",
            exc.operation,
            request.method,
            request.url.path,
            exc.target,
            exc.pg_code,
            exc.pg_message,
            exc_info=exc,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
        headers=exc.headers,
    )


async def _unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    # Report first (a no-op without SENTRY_DSN): Sentry then records the error as
    # unhandled, where the log call below would file it as handled. It also waits for
    # delivery, because Vercel may freeze the function once this 500 is sent.
    await report_unhandled_exception(exc)
    logger.error(
        "Unhandled exception | %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": INTERNAL_ERROR_DETAIL, "code": INTERNAL_ERROR_CODE},
    )


def install_exception_handlers(app: FastAPI) -> None:
    """Register the handlers on ``app``. Called once from ``app.main``."""
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(Exception, _unhandled_exception)
