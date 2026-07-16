"""HTTP handlers for the messages feature. Thin layer over controller.py."""
from __future__ import annotations

from fastapi import Depends, Request, Response, status

from app.dependencies import require_user
from app.limiter import limiter
from app.messages import controller
from app.messages.models import (
    ContactsListResponse,
    ConversationsListResponse,
    MessagesListResponse,
    SendMessageRequest,
    SendMessageResponse,
)


def list_contacts(
    user_id: str = Depends(require_user),
    q: str | None = None,
) -> ContactsListResponse:
    return ContactsListResponse(contacts=controller.list_contacts(caller_id=user_id, query=q))


def list_conversations(
    user_id: str = Depends(require_user),
) -> ConversationsListResponse:
    rows = controller.list_inbox(caller_id=user_id)
    return ConversationsListResponse(conversations=rows)


@limiter.limit("30/minute")
def send_message(
    request: Request,
    body: SendMessageRequest,
    user_id: str = Depends(require_user),
) -> SendMessageResponse:
    result = controller.send_message(
        sender_id=user_id,
        to_user_id=body.to_user_id,
        conversation_id=body.conversation_id,
        body=body.body,
    )
    return SendMessageResponse(**result)


def list_messages(
    conversation_id: str,
    user_id: str = Depends(require_user),
    before: str | None = None,
    limit: int = 50,
) -> MessagesListResponse:
    page = controller.list_messages(
        conversation_id=conversation_id, caller_id=user_id,
        before=before, limit=limit,
    )
    return MessagesListResponse(**page)


def mark_conversation_read(
    conversation_id: str,
    user_id: str = Depends(require_user),
) -> Response:
    controller.mark_read(conversation_id=conversation_id, caller_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def delete_conversation(
    conversation_id: str,
    user_id: str = Depends(require_user),
) -> Response:
    controller.delete_conversation_for_user(
        conversation_id=conversation_id, caller_id=user_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
