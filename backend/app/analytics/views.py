"""HTTP layer for analytics: validation, the 60 s private cache header, the viewed event."""

from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Request, Response

from app.analytics import controller, windows
from app.analytics.models import AnalyticsDashboardResponse, ScopeResponse, Window
from app.core import events
from app.dependencies import require_user_payload
from app.limiter import limiter

CACHE_CONTROL = "private, max-age=60"


@limiter.limit("30/minute")
def get_scope(
    request: Request, response: Response, payload: dict = Depends(require_user_payload)
) -> ScopeResponse:
    response.headers["Cache-Control"] = CACHE_CONTROL
    return ScopeResponse(**controller.get_scope(payload["sub"], payload.get("email")))


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
    payload: dict = Depends(require_user_payload),
) -> AnalyticsDashboardResponse:
    # from/to belong to a custom range; dropped otherwise, the cache key stays canonical
    custom = window == "custom"
    try:
        data = controller.get_dashboard(
            payload["sub"],
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
    response.headers["Cache-Control"] = CACHE_CONTROL
    events.record(
        "analytics_viewed",
        actor_id=payload["sub"],
        class_id=str(class_id) if class_id else None,
        meta={"institution_id": str(institution_id), "window": window},
    )
    return AnalyticsDashboardResponse(**data)
