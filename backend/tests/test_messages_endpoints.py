"""End-to-end endpoint tests for /api/messages/*.

We exercise the FastAPI routes through TestClient with a hand-signed JWT
and mock the controller layer at function boundaries — that's the
right altitude: it validates routing, auth dep injection, request/response
shapes, and error mapping, without re-testing controller internals.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

# ----- list_conversations ---------------------------------------------------


@patch("app.messages.views.controller.list_inbox")
def test_get_conversations_serializes_team_channels_and_dms(_list, client, auth_header):
    """v2 shape through the real HTTP/Pydantic round trip: a team channel
    (other_user null, type/team_name/participants populated) and a DM
    (other_user populated) both serialize intact."""
    _list.return_value = [
        {
            "id": "conv-team",
            "type": "team_ta",
            "project_id": "proj-1",
            "team_name": "Team Rocket",
            "participants": [
                {
                    "id": "alice",
                    "role": "member",
                    "email": "a@ucsc.edu",
                    "first_name": "Alice",
                    "last_name": "A",
                    "image_url": None,
                    "last_read_at": None,
                },
                {
                    "id": "ta-1",
                    "role": "ta",
                    "email": "t@ucsc.edu",
                    "first_name": "Tess",
                    "last_name": "A",
                    "image_url": None,
                    "last_read_at": None,
                },
            ],
            "other_user": None,
            "last_message": None,
            "unread_count": 0,
            "other_user_last_read_at": None,
            "can_send": True,
            "last_message_at": None,
        },
        {
            "id": "conv-dm",
            "type": "dm",
            "project_id": None,
            "team_name": None,
            "participants": [
                {
                    "id": "alice",
                    "role": "member",
                    "email": "a@ucsc.edu",
                    "first_name": "Alice",
                    "last_name": "A",
                    "image_url": None,
                    "last_read_at": "2026-07-09T00:00:00+00:00",
                },
                {
                    "id": "bob",
                    "role": "member",
                    "email": "b@ucsc.edu",
                    "first_name": "Bob",
                    "last_name": "B",
                    "image_url": None,
                    "last_read_at": "2026-07-08T00:00:00+00:00",
                },
            ],
            "other_user": {
                "id": "bob",
                "email": "b@ucsc.edu",
                "name": "Bob B",
                "first_name": "Bob",
                "last_name": "B",
                "image_url": None,
            },
            "last_message": {
                "id": "m9",
                "sender_id": "bob",
                "body": "yo",
                "created_at": "2026-07-10T00:00:00+00:00",
            },
            "unread_count": 2,
            "other_user_last_read_at": "2026-07-08T00:00:00+00:00",
            "can_send": True,
            "last_message_at": "2026-07-10T00:00:00+00:00",
        },
    ]
    res = client.get("/api/messages/conversations", headers=auth_header)
    assert res.status_code == 200
    convs = res.json()["conversations"]
    assert len(convs) == 2
    team = next(c for c in convs if c["id"] == "conv-team")
    dm = next(c for c in convs if c["id"] == "conv-dm")
    assert team["other_user"] is None
    assert team["type"] == "team_ta"
    assert team["team_name"] == "Team Rocket"
    assert {p["role"] for p in team["participants"]} == {"member", "ta"}
    assert dm["type"] == "dm"
    assert dm["other_user"]["id"] == "bob"
    assert dm["other_user"]["name"] == "Bob B"
    assert [p["id"] for p in dm["participants"]] == ["alice", "bob"]


# ----- list_contacts --------------------------------------------------------


@patch("app.messages.views.controller.list_contacts")
def test_get_contacts_returns_contacts(lst, client, auth_header):
    lst.return_value = [
        {
            "id": "stu1",
            "name": "Samantha Stone",
            "first_name": "Samantha",
            "last_name": "Stone",
            "email": "s@u.e",
            "image_url": None,
            "role": "student",
        }
    ]
    res = client.get("/api/messages/contacts?q=sam", headers=auth_header)
    assert res.status_code == 200
    contacts = res.json()["contacts"]
    assert len(contacts) == 1
    assert contacts[0]["id"] == "stu1"
    assert contacts[0]["name"] == "Samantha Stone"
    assert contacts[0]["email"] == "s@u.e"
    assert contacts[0]["role"] == "student"
    lst.assert_called_once_with(caller_id="user-abc", query="sam")


# ----- send_message ---------------------------------------------------------


@patch("app.messages.views.controller.send_message")
def test_post_message_success(send, client, auth_header):
    send.return_value = {
        "conversation_id": "c1",
        "message": {
            "id": "m1",
            "sender_id": "user-abc",
            "body": "hi",
            "created_at": "2026-04-23T12:00:00Z",
        },
    }
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": "hi"},
    )
    assert res.status_code == 200
    assert res.json()["conversation_id"] == "c1"


@pytest.mark.parametrize("body", ["", "x" * 1025], ids=["empty", "over 1024 characters"])
def test_post_message_rejects_a_body_outside_the_length_limits(client, auth_header, body):
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": body},
    )
    assert res.status_code == 422  # SendMessageRequest's own constraints


# ----- list_messages -------------------------------------------------------


@patch("app.messages.views.controller.list_messages")
def test_get_messages_returns_list(lst, client, auth_header):
    lst.return_value = {
        "messages": [{"id": "m1", "sender_id": "bob", "body": "hi", "created_at": "t1"}],
        "next_cursor": None,
    }
    res = client.get("/api/messages/conversations/c1/messages", headers=auth_header)
    assert res.status_code == 200
    assert res.json()["messages"][0]["body"] == "hi"
    assert res.json()["next_cursor"] is None


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
