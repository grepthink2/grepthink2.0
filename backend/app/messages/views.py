"""HTTP handlers for the messages feature. Thin layer over controller.py."""
from __future__ import annotations

from fastapi import Depends, Response, status

from app.dependencies import require_user
from app.messages import controller
from app.messages.models import (
    ConversationsListResponse,
    MessagesListResponse,
    SendMessageRequest,
    SendMessageResponse,
)


def list_conversations(
    user_id: str = Depends(require_user),
) -> ConversationsListResponse:
    rows = controller.list_inbox(caller_id=user_id)
    return ConversationsListResponse(conversations=rows)


def send_message(
    body: SendMessageRequest,
    user_id: str = Depends(require_user),
) -> SendMessageResponse:
    result = controller.send_message(
        sender_id=user_id, to_user_id=body.to_user_id, body=body.body,
    )
    return SendMessageResponse(**result)


def list_messages(
    conversation_id: str,
    user_id: str = Depends(require_user),
) -> MessagesListResponse:
    msgs = controller.list_messages(conversation_id=conversation_id, caller_id=user_id)
    return MessagesListResponse(messages=msgs)


def mark_conversation_read(
    conversation_id: str,
    user_id: str = Depends(require_user),
) -> Response:
    controller.mark_read(conversation_id=conversation_id, caller_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
