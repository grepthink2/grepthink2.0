"""Pydantic request/response models for the messages feature.

Char limit (1024 code points) is enforced authoritatively in the controller;
Pydantic validation here is a fast pre-flight so 400s short-circuit cheaply.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ----- Requests --------------------------------------------------------------

class SendMessageRequest(BaseModel):
    to_user_id: str = Field(..., min_length=1)
    # 1024 code-point limit; backend re-checks (defense in depth).
    body: str = Field(..., min_length=1, max_length=1024)


# ----- Subobjects ------------------------------------------------------------

class OtherUser(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    image_url: Optional[str] = None


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
    other_user: OtherUser
    last_message: Optional[MessagePreview] = None
    unread_count: int
    other_user_last_read_at: Optional[str] = None
    can_send: bool
    last_message_at: Optional[str] = None


class ConversationsListResponse(BaseModel):
    conversations: list[ConversationSummary]


class SendMessageResponse(BaseModel):
    conversation_id: str
    message: Message


class MessagesListResponse(BaseModel):
    messages: list[Message]
