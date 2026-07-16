"""send_message v2: target an existing conversation (DM or team channel)."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


def _wire_insert(client, conv="conv-t"):
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "msg-1", "conversation_id": conv,
               "sender_id": "alice", "body": "hi", "created_at": "now"}])


def test_requires_exactly_one_target():
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", body="hi")
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", body="hi",
                     to_user_id="bob", conversation_id="c1")
    assert exc.value.status_code == 400


@patch("app.messages.controller.notify_recipients")
@patch("app.messages.controller._participant_ids",
       return_value=["alice", "bob", "carol"])
@patch("app.messages.controller._require_participant",
       return_value={"id": "conv-t", "type": "team_members",
                     "user_a": None, "user_b": None})
@patch("app.messages.controller.service_client")
def test_team_channel_send_notifies_others(client, _conv, _ids, notify):
    from app.messages.controller import send_message
    _wire_insert(client)
    result = send_message(sender_id="alice", conversation_id="conv-t", body="hi")
    assert result["conversation_id"] == "conv-t"
    _, kwargs = notify.call_args
    assert sorted(kwargs["recipient_ids"]) == ["bob", "carol"]


@patch("app.messages.controller.can_message", return_value=False)
@patch("app.messages.controller._participant_ids", return_value=["alice", "bob"])
@patch("app.messages.controller._require_participant",
       return_value={"id": "conv-d", "type": "dm",
                     "user_a": "alice", "user_b": "bob"})
@patch("app.messages.controller.service_client")
def test_dm_via_conversation_id_rechecks_eligibility(client, _conv, _ids, _can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", conversation_id="conv-d", body="hi")
    assert exc.value.status_code == 403


@patch("app.messages.controller.notify_recipients")
@patch("app.messages.controller._get_or_create_conversation", return_value="conv-x")
@patch("app.messages.controller.can_message", return_value=True)
@patch("app.messages.controller.service_client")
def test_legacy_to_user_id_path_still_works(client, _can, _goc, notify):
    from app.messages.controller import send_message
    _wire_insert(client, conv="conv-x")
    result = send_message(sender_id="alice", to_user_id="bob", body="hi")
    assert result["conversation_id"] == "conv-x"
    _, kwargs = notify.call_args
    assert kwargs["recipient_ids"] == ["bob"]
