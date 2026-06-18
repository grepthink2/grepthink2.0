"""HTTP handlers for notifications."""
from __future__ import annotations

from fastapi import Depends, Response, status

from app.dependencies import require_user
from app.notifications import controller
from app.notifications.models import NotificationItem, NotificationsListResponse


def list_notifications(user_id: str = Depends(require_user)) -> NotificationsListResponse:
    result = controller.list_notifications(user_id)
    return NotificationsListResponse(
        notifications=[NotificationItem(**row) for row in result["notifications"]],
        unread_count=result["unread_count"],
    )


def mark_notification_read(
    notification_id: str,
    user_id: str = Depends(require_user),
) -> Response:
    controller.mark_notification_read(notification_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def mark_all_read(user_id: str = Depends(require_user)) -> Response:
    controller.mark_all_read(user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
