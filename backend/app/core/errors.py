"""Application-wide exception handling.

Any exception a route does not translate into an ``HTTPException`` is logged
with the request method and path and answered with a fixed
``{"detail": "Internal server error"}`` body. Exception text — which for
PostgREST failures includes table names, constraint names and sometimes row
values — never reaches the client.

Controllers still catch exceptions where they can add useful context to the
log (ids of the entities involved) or map a known failure to a better status
code; they no longer need a blanket ``except Exception`` purely to produce a 500.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

INTERNAL_ERROR_DETAIL = "Internal server error"


async def _unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled exception | %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": INTERNAL_ERROR_DETAIL})


def install_exception_handlers(app: FastAPI) -> None:
    """Register the handlers on ``app``. Called once from ``app.main``."""
    app.add_exception_handler(Exception, _unhandled_exception)
