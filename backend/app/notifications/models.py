"""Pydantic models for the notifications feature."""

from __future__ import annotations

from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    type: str
    title: str
    body: str
    entity_type: str | None = None
    entity_id: str | None = None
    read_at: str | None = None
    created_at: str


class NotificationsListResponse(BaseModel):
    notifications: list[NotificationItem]
    unread_count: int
