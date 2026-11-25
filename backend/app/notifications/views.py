"""HTTP handlers for notifications."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Depends, Query, Response, status

from app.dependencies import require_user
from app.notifications import controller
from app.notifications.models import (
    MarkNotificationsReadRequest,
    NotificationItem,
    NotificationsListResponse,
)


def list_notifications(
    view: Literal["unread", "all"] = Query(
        "all", description="unread: every unread row; all: 30 days"
    ),
    cursor: str | None = Query(None, description="next_cursor of the page before"),
    limit: int = Query(controller.PAGE_SIZE, ge=1, le=controller.MAX_PAGE_SIZE),
    user_id: str = Depends(require_user),
) -> NotificationsListResponse:
    result = controller.list_notifications(user_id, view=view, cursor=cursor, limit=limit)
    return NotificationsListResponse(
        notifications=[NotificationItem(**row) for row in result["notifications"]],
        unread_count=result["unread_count"],
        next_cursor=result["next_cursor"],
    )


def mark_notification_read(
    notification_id: UUID,
    user_id: str = Depends(require_user),
) -> Response:
    controller.mark_notification_read(str(notification_id), user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def mark_all_read(user_id: str = Depends(require_user)) -> Response:
    controller.mark_all_read(user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def mark_notifications_read(
    payload: MarkNotificationsReadRequest,
    user_id: str = Depends(require_user),
) -> Response:
    controller.mark_notifications_read([str(i) for i in payload.ids], user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
