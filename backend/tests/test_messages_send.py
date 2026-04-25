"""Tests for the send-message path: conversation create-or-fetch + insert."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


# ---------- send_message ---------------------------------------------------

@patch("app.messages.controller.can_message", return_value=True)
@patch("app.messages.controller._get_or_create_conversation", return_value="conv-x")
@patch("app.messages.controller.service_client")
def test_send_message_inserts_and_marks_sender_read(client, _get_or_create, _can):
    from app.messages.controller import send_message

    inserted = {"id": "msg-1", "conversation_id": "conv-x",
                "sender_id": "alice", "body": "hi", "created_at": "now"}
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[inserted]
    )

    result = send_message(sender_id="alice", to_user_id="bob", body="hi")

    assert result["conversation_id"] == "conv-x"
    assert result["message"] == inserted
    # Verify both inserts happened: messages + conversation_reads upsert
    table_calls = [c.args[0] for c in client.table.call_args_list]
    assert "messages" in table_calls
    assert "conversation_reads" in table_calls


@patch("app.messages.controller.can_message", return_value=True)
def test_send_message_rejects_too_long(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", to_user_id="bob", body="x" * 1025)
    assert exc.value.status_code == 400


@patch("app.messages.controller.can_message", return_value=True)
def test_send_message_rejects_whitespace_only(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", to_user_id="bob", body="   \n\t  ")
    assert exc.value.status_code == 400


@patch("app.messages.controller.can_message", return_value=True)
def test_send_message_rejects_self_target(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", to_user_id="alice", body="hi")
    assert exc.value.status_code == 400


@patch("app.messages.controller.can_message", return_value=False)
def test_send_message_rejects_ineligible(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", to_user_id="bob", body="hi")
    assert exc.value.status_code == 403


@patch("app.messages.controller.can_message", return_value=True)
def test_send_message_accepts_1024_codepoints_with_emoji(_can):
    """Q10=B: limit is 1024 code points. Build a body with multi-byte
    characters that exceeds 1024 bytes but is ≤ 1024 code points."""
    from app.messages.controller import send_message
    body = "🦊" * 1024  # each emoji is 1 code point but 4 UTF-8 bytes
    # Mock through the insert path
    with patch("app.messages.controller._get_or_create_conversation", return_value="c"), \
         patch("app.messages.controller.service_client") as client:
        client.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "m", "conversation_id": "c", "sender_id": "a",
                   "body": body, "created_at": "t"}]
        )
        send_message(sender_id="alice", to_user_id="bob", body=body)
    # No exception = pass


@patch("app.messages.controller.service_client")
def test_get_or_create_canonicalizes_pair(client):
    """Given two ids, the smaller goes in user_a regardless of call order."""
    from app.messages.controller import _get_or_create_conversation

    # Simulate "row exists"
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "conv-1"}
    )

    _get_or_create_conversation(
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000001",
    )
    _get_or_create_conversation(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    )

    # Both calls should have queried with user_a=...001 and user_b=...002
    eq_calls = client.table.return_value.select.return_value.eq.call_args_list
    for call in eq_calls:
        if call.args[0] == "user_a":
            assert call.args[1] == "00000000-0000-0000-0000-000000000001"
        elif call.args[0] == "user_b":
            assert call.args[1] == "00000000-0000-0000-0000-000000000002"


@patch("app.messages.controller.service_client")
def test_get_or_create_inserts_when_absent(client):
    from app.messages.controller import _get_or_create_conversation

    select_chain = client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single
    select_chain.return_value.execute.return_value = MagicMock(data=None)
    insert_chain = client.table.return_value.insert
    insert_chain.return_value.execute.return_value = MagicMock(data=[{"id": "new-conv"}])

    result = _get_or_create_conversation(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    )
    assert result == "new-conv"
