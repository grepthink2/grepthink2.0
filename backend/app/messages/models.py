"""Pydantic request/response models for the messages feature.

Char limit (1024 code points) is enforced authoritatively in the controller;
Pydantic validation here is a fast pre-flight so 400s short-circuit cheaply.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ----- Requests --------------------------------------------------------------


class SendMessageRequest(BaseModel):
    """Exactly one of to_user_id (new DM) or conversation_id (existing
    conversation / team channel) — enforced in the controller (400)."""

    to_user_id: str | None = Field(default=None, min_length=1)
    conversation_id: str | None = Field(default=None, min_length=1)
    # 1024 code-point limit; backend re-checks (defense in depth).
    body: str = Field(..., min_length=1, max_length=1024)


# ----- Subobjects ------------------------------------------------------------


class OtherUser(BaseModel):
    id: str
    email: str | None = None
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    image_url: str | None = None


class Participant(BaseModel):
    id: str
    role: Literal["member", "ta", "instructor"]
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    image_url: str | None = None
    last_read_at: str | None = None


class MessagePreview(BaseModel):
    id: str
    sender_id: str
    body: str
    created_at: str


class Message(BaseModel):
    id: str
    sender_id: str
    body: str
    created_at: str


# ----- Responses -------------------------------------------------------------


class ConversationSummary(BaseModel):
    id: str
    type: Literal["dm", "team_ta", "team_instructor", "team_members"] = "dm"
    project_id: str | None = None
    team_name: str | None = None
    participants: list[Participant] = []
    # Populated for type='dm' only (stale-client compat).
    other_user: OtherUser | None = None
    last_message: MessagePreview | None = None
    unread_count: int
    other_user_last_read_at: str | None = None
    can_send: bool
    last_message_at: str | None = None


class ConversationsListResponse(BaseModel):
    conversations: list[ConversationSummary]


class SendMessageResponse(BaseModel):
    conversation_id: str
    message: Message


class MessagesListResponse(BaseModel):
    messages: list[Message]
    # Opaque cursor for the next-older page; None when history is exhausted.
    next_cursor: str | None = None


class Contact(BaseModel):
    id: str
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    image_url: str | None = None
    role: str | None = None


class ContactsListResponse(BaseModel):
    contacts: list[Contact]
