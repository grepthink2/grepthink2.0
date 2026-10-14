"""HTTP handlers for global search."""

from __future__ import annotations

from fastapi import Depends, Request
from slowapi.util import get_remote_address

from app.dependencies import require_user
from app.limiter import limiter
from app.search import controller
from app.search.models import SearchIndexResponse, SearchItem


def _caller(request: Request, user_id: str = Depends(require_user)) -> str:
    """The signed-in user, also kept on the request as its rate-limit key (``_search_rate_key``)."""
    request.state.search_rate_key = user_id
    return user_id


def _search_rate_key(request: Request) -> str:
    """The rate-limit bucket of an index request: the signed-in user's own.

    On Vercel every request arrives from the proxy's address, so a limit keyed by address would
    be one bucket shared by everybody. The limit is checked after the route's dependencies have
    run, so ``_caller`` has set the key by then; the address is only a fallback.
    """
    return getattr(request.state, "search_rate_key", None) or get_remote_address(request)


@limiter.limit("60/minute", key_func=_search_rate_key)
def get_search_index(
    request: Request,
    user_id: str = Depends(_caller),
) -> SearchIndexResponse:
    result = controller.build_index(user_id)
    return SearchIndexResponse(
        items=[SearchItem(**row) for row in result["items"]],
        generated_at=result["generated_at"],
    )
