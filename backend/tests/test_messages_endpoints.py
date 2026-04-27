"""End-to-end endpoint tests for /api/messages/*.

We exercise the FastAPI routes through TestClient with a hand-signed JWT
and mock the controller layer at function boundaries — that's the
right altitude: it validates routing, auth dep injection, request/response
shapes, and error mapping, without re-testing controller internals.
"""
from __future__ import annotations
from unittest.mock import patch

import pytest
from fastapi import HTTPException


# ----- list_conversations ---------------------------------------------------

@patch("app.messages.views.controller.list_inbox", return_value=[])
def test_get_conversations_empty(_list, client, auth_header):
    res = client.get("/api/messages/conversations", headers=auth_header)
    assert res.status_code == 200
    assert res.json() == {"conversations": []}


@patch("app.messages.views.controller.list_inbox")
def test_get_conversations_returns_summary(_list, client, auth_header):
    _list.return_value = [{
        "id": "c1",
        "other_user": {"id": "bob", "email": "bob@x", "name": "Bob"},
        "last_message": {"id": "m", "sender_id": "bob", "body": "hi",
                         "created_at": "2026-04-23T12:00:00Z"},
        "unread_count": 2,
        "other_user_last_read_at": None,
        "can_send": True,
        "last_message_at": "2026-04-23T12:00:00Z",
    }]
    res = client.get("/api/messages/conversations", headers=auth_header)
    assert res.status_code == 200
    body = res.json()
    assert len(body["conversations"]) == 1
    row = body["conversations"][0]
    assert row["id"] == "c1"
    assert row["unread_count"] == 2
    assert row["can_send"] is True


def test_get_conversations_requires_auth(client):
    res = client.get("/api/messages/conversations")
    assert res.status_code == 401


# ----- send_message ---------------------------------------------------------

@patch("app.messages.views.controller.send_message")
def test_post_message_success(send, client, auth_header):
    send.return_value = {
        "conversation_id": "c1",
        "message": {"id": "m1", "sender_id": "user-abc",
                    "body": "hi", "created_at": "2026-04-23T12:00:00Z"},
    }
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": "hi"},
    )
    assert res.status_code == 200
    assert res.json()["conversation_id"] == "c1"


def test_post_message_rejects_empty_body(client, auth_header):
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": ""},
    )
    assert res.status_code == 422  # Pydantic validation


def test_post_message_rejects_too_long(client, auth_header):
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": "x" * 1025},
    )
    assert res.status_code == 422


@patch("app.messages.views.controller.send_message")
def test_post_message_propagates_403(send, client, auth_header):
    send.side_effect = HTTPException(status_code=403, detail="Cannot message this user")
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": "hi"},
    )
    assert res.status_code == 403


# ----- list_messages -------------------------------------------------------

@patch("app.messages.views.controller.list_messages")
def test_get_messages_returns_list(lst, client, auth_header):
    lst.return_value = [
        {"id": "m1", "sender_id": "bob", "body": "hi", "created_at": "t1"}
    ]
    res = client.get("/api/messages/conversations/c1/messages", headers=auth_header)
    assert res.status_code == 200
    assert res.json()["messages"][0]["body"] == "hi"


@patch("app.messages.views.controller.list_messages",
       side_effect=HTTPException(status_code=403, detail="Not a participant"))
def test_get_messages_403_for_non_participant(_lst, client, auth_header):
    res = client.get("/api/messages/conversations/c1/messages", headers=auth_header)
    assert res.status_code == 403


# ----- mark_read ----------------------------------------------------------

@patch("app.messages.views.controller.mark_read", return_value=None)
def test_mark_read_returns_204(_mark, client, auth_header):
    res = client.post("/api/messages/conversations/c1/read", headers=auth_header)
    assert res.status_code == 204


# ----- delete_conversation -------------------------------------------------

@patch("app.messages.views.controller.delete_conversation_for_user", return_value=None)
def test_delete_conversation_returns_204(_del, client, auth_header):
    res = client.delete("/api/messages/conversations/c1", headers=auth_header)
    assert res.status_code == 204
    _del.assert_called_once()


@patch("app.messages.views.controller.delete_conversation_for_user", return_value=None)
def test_delete_conversation_is_idempotent(_del, client, auth_header):
    """Repeated deletes should still return 204 (controller handles upsert)."""
    for _ in range(3):
        res = client.delete("/api/messages/conversations/c1", headers=auth_header)
        assert res.status_code == 204
    assert _del.call_count == 3


@patch(
    "app.messages.views.controller.delete_conversation_for_user",
    side_effect=HTTPException(status_code=403, detail="Not a participant"),
)
def test_delete_conversation_403_for_non_participant(_del, client, auth_header):
    res = client.delete("/api/messages/conversations/c1", headers=auth_header)
    assert res.status_code == 403


def test_delete_conversation_requires_auth(client):
    res = client.delete("/api/messages/conversations/c1")
    assert res.status_code == 401
