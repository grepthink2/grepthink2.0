"""Pydantic models for the notifications feature."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    type: str
    title: str
    body: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    read_at: Optional[str] = None
    created_at: str


class NotificationsListResponse(BaseModel):
    notifications: list[NotificationItem]
    unread_count: int
