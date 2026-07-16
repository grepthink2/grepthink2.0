"""Inbox: RPC-backed list_inbox mapping to API response shape."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


RPC_DM_ROW = {
    "id": "conv-dm", "type": "dm", "project_id": None, "team_name": None,
    "created_at": "2026-07-01T00:00:00+00:00",
    "last_message_at": "2026-07-10T00:00:00+00:00",
    "unread_count": 2, "my_last_read_at": None,
    "last_message": {"id": "m9", "sender_id": "bob", "body": "yo",
                     "created_at": "2026-07-10T00:00:00+00:00"},
    "participants": [
        {"id": "alice", "role": "member", "email": "a@ucsc.edu",
         "first_name": "Alice", "last_name": "A", "image_url": None,
         "last_read_at": "2026-07-09T00:00:00+00:00"},
        {"id": "bob", "role": "member", "email": "b@ucsc.edu",
         "first_name": "Bob", "last_name": "B", "image_url": None,
         "last_read_at": "2026-07-08T00:00:00+00:00"},
    ],
    "can_send": True,
}

RPC_TEAM_ROW = {
    "id": "conv-team", "type": "team_ta", "project_id": "proj-1",
    "team_name": "Team Rocket",
    "created_at": "2026-07-01T00:00:00+00:00", "last_message_at": None,
    "unread_count": 0, "my_last_read_at": None, "last_message": None,
    "participants": [
        {"id": "alice", "role": "member", "email": "a@ucsc.edu",
         "first_name": "Alice", "last_name": "A", "image_url": None,
         "last_read_at": None},
        {"id": "ta-1", "role": "ta", "email": "t@ucsc.edu",
         "first_name": "Tess", "last_name": "A", "image_url": None,
         "last_read_at": None},
    ],
    "can_send": True,
}


@patch("app.messages.controller.service_client")
def test_inbox_calls_rpc_with_caller(client):
    from app.messages.controller import list_inbox
    client.rpc.return_value.execute.return_value = MagicMock(data=[])
    assert list_inbox(caller_id="alice") == []
    client.rpc.assert_called_once_with("messages_inbox", {"p_user": "alice"})


@patch("app.messages.controller.service_client")
def test_inbox_dm_row_derives_other_user(client):
    from app.messages.controller import list_inbox
    client.rpc.return_value.execute.return_value = MagicMock(data=[RPC_DM_ROW])
    [row] = list_inbox(caller_id="alice")
    assert row["other_user"]["id"] == "bob"
    assert row["other_user"]["name"] == "Bob B"
    assert row["other_user_last_read_at"] == "2026-07-08T00:00:00+00:00"
    assert row["unread_count"] == 2
    assert row["type"] == "dm"


@patch("app.messages.controller.service_client")
def test_inbox_team_row_has_no_other_user(client):
    from app.messages.controller import list_inbox
    client.rpc.return_value.execute.return_value = MagicMock(data=[RPC_TEAM_ROW])
    [row] = list_inbox(caller_id="alice")
    assert row["other_user"] is None
    assert row["team_name"] == "Team Rocket"
    assert row["can_send"] is True
    assert {p["role"] for p in row["participants"]} == {"member", "ta"}
