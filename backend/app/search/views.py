"""HTTP handlers for global search."""

from __future__ import annotations

from fastapi import Depends, Request

from app.dependencies import require_user
from app.limiter import limiter
from app.search import controller
from app.search.models import SearchIndexResponse, SearchItem


@limiter.limit("60/minute")
def get_search_index(
    request: Request,
    user_id: str = Depends(require_user),
) -> SearchIndexResponse:
    result = controller.build_index(user_id)
    return SearchIndexResponse(
        items=[SearchItem(**row) for row in result["items"]],
        generated_at=result["generated_at"],
    )
