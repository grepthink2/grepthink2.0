"""Pydantic models for the notifications feature."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationRef(BaseModel):
    """A class or a team a notification is about, by its current name."""

    id: str
    name: str


class NotificationActor(BaseModel):
    """Who caused a notification. ``name`` is ``""`` when they have none: never their email."""

    id: str
    name: str
    image_url: str | None = None


class NotificationConversation(BaseModel):
    """The conversation a message notification is about: ``direct`` (unnamed; the actor is the
    sender) or ``team`` (its team's name, with "TAs" or "Instructor" for those channels)."""

    id: str
    kind: Literal["direct", "team"]
    name: str


class NotificationItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: str
    title: str
    body: str
    entity_type: str | None = None
    entity_id: str | None = None
    read_at: str | None = None
    created_at: str
    class_: NotificationRef | None = Field(default=None, alias="class")
    team: NotificationRef | None = None
    actor: NotificationActor | None = None
    conversation: NotificationConversation | None = None
    message_count: int = 1


class NotificationsListResponse(BaseModel):
    notifications: list[NotificationItem]
    unread_count: int
    next_cursor: str | None = None


class MarkNotificationsReadRequest(BaseModel):
    """``POST /api/notifications/read``: the notifications to mark read, 1 to 100 of them."""

    ids: list[UUID] = Field(min_length=1, max_length=100)
