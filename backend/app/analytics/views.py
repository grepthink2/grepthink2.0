"""HTTP layer for analytics: validation, the 60 s private cache header, the viewed event."""

from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Request, Response

from app.analytics import controller, windows
from app.analytics.models import AnalyticsDashboardResponse, ScopeResponse
from app.analytics.windows import Window
from app.core import events
from app.dependencies import require_user, require_user_payload
from app.limiter import limiter

CACHE_CONTROL = "private, max-age=60"
NO_STORE = "no-store"  # what the server would not cache, the browser must not either: fresh or degraded answers
VARY = "Authorization"  # a private answer is one account's: the next sign-in on the same browser gets its own


def _cache_headers(response: Response, *, no_store: bool = False) -> None:
    response.headers["Cache-Control"] = NO_STORE if no_store else CACHE_CONTROL
    response.headers["Vary"] = VARY


@limiter.limit("30/minute")
def get_scope(
    request: Request,
    response: Response,
    user_id: str = Depends(require_user),
    payload: dict = Depends(require_user_payload),
) -> ScopeResponse:
    body = ScopeResponse(**controller.get_scope(user_id, payload.get("email")))
    _cache_headers(response)
    return body


@limiter.limit("30/minute")
def get_dashboard(
    request: Request,
    response: Response,
    institution_id: UUID,
    class_id: UUID | None = None,
    window: Window = "30d",
    from_: dt.date | None = Query(default=None, alias="from"),
    to: dt.date | None = None,
    fresh: bool = False,
    user_id: str = Depends(require_user),
    payload: dict = Depends(require_user_payload),
) -> AnalyticsDashboardResponse:
    # from/to belong to a custom range; dropped otherwise, the cache key stays canonical
    custom = window == "custom"
    try:
        data = controller.get_dashboard(
            user_id,
            payload.get("email"),
            institution_id=str(institution_id),
            class_id=str(class_id) if class_id else None,
            window=window,
            custom_from=from_ if custom else None,
            custom_to=to if custom else None,
            fresh=fresh,
        )
    except windows.WindowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    body = AnalyticsDashboardResponse(**data)  # validated before the view is recorded
    _cache_headers(response, no_store=fresh or bool(data["failures"]))
    events.record(
        "analytics_viewed",
        actor_id=user_id,
        class_id=str(class_id) if class_id else None,
        meta={"institution_id": str(institution_id), "window": window},
    )
    return body
