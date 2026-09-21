"""send_message: to a user (create-or-fetch the DM) or to an existing conversation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

# ---------- send_message ---------------------------------------------------


@patch("app.messages.controller.notify_recipients")
@patch("app.messages.controller.can_message", return_value=True)
@patch("app.messages.controller._get_or_create_conversation", return_value="conv-x")
@patch("app.core.db.service_client")
def test_send_to_a_user_inserts_marks_the_sender_read_and_notifies_the_recipient(
    client, _get_or_create, _can, notify
):
    from app.messages.controller import send_message

    inserted = {
        "id": "msg-1",
        "conversation_id": "conv-x",
        "sender_id": "alice",
        "body": "hi",
        "created_at": "now",
    }
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[inserted])

    result = send_message(sender_id="alice", to_user_id="bob", body="hi")

    assert result["conversation_id"] == "conv-x"
    assert result["message"] == inserted
    # Verify both inserts happened: messages + conversation_reads upsert
    table_calls = [c.args[0] for c in client.table.call_args_list]
    assert "messages" in table_calls
    assert "conversation_reads" in table_calls
    assert notify.call_args.kwargs["recipient_ids"] == ["bob"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"to_user_id": "bob", "body": "x" * 1025},
        {"to_user_id": "bob", "body": "   \n\t  "},
        {"to_user_id": "alice", "body": "hi"},
        {"body": "hi"},
        {"to_user_id": "bob", "conversation_id": "c1", "body": "hi"},
    ],
    ids=["too long", "whitespace only", "to yourself", "no target", "two targets"],
)
@patch("app.messages.controller.can_message", return_value=True)
def test_send_message_answers_400(_can, kwargs):
    from app.messages.controller import send_message

    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", **kwargs)
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
    with (
        patch("app.messages.controller._get_or_create_conversation", return_value="c"),
        patch("app.core.db.service_client") as client,
    ):
        client.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "m",
                    "conversation_id": "c",
                    "sender_id": "a",
                    "body": body,
                    "created_at": "t",
                }
            ]
        )
        send_message(sender_id="alice", to_user_id="bob", body=body)
    # No exception = pass


@patch("app.core.db.service_client")
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


@pytest.mark.parametrize(
    "no_row",
    [MagicMock(data=None), None],
    ids=["a response with data=None", "None, as supabase-py 2.x answers"],
)
@patch("app.core.db.service_client")
def test_get_or_create_inserts_when_absent(client, no_row):
    """supabase-py 2.x returns None (not a response object) from
    `.maybe_single().execute()` when no row matches; earlier versions returned a response
    with `data=None`. The controller must handle both."""
    from app.messages.controller import _get_or_create_conversation

    select_chain = (
        client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single
    )
    select_chain.return_value.execute.return_value = no_row
    insert_chain = client.table.return_value.insert
    insert_chain.return_value.execute.return_value = MagicMock(data=[{"id": "new-conv"}])

    result = _get_or_create_conversation(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    )
    assert result == "new-conv"


# ---------- send_message to an existing conversation (a DM or a team channel) ----


def _wire_insert(client, conv="conv-t"):
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "msg-1",
                "conversation_id": conv,
                "sender_id": "alice",
                "body": "hi",
                "created_at": "now",
            }
        ]
    )


@patch("app.messages.controller.notify_recipients")
@patch("app.messages.controller._participant_ids", return_value=["alice", "bob", "carol"])
@patch(
    "app.messages.controller._require_participant",
    return_value={"id": "conv-t", "type": "team_members", "user_a": None, "user_b": None},
)
@patch("app.core.db.service_client")
def test_team_channel_send_notifies_others(client, _conv, _ids, notify):
    from app.messages.controller import send_message

    _wire_insert(client)
    result = send_message(sender_id="alice", conversation_id="conv-t", body="hi")
    assert result["conversation_id"] == "conv-t"
    _, kwargs = notify.call_args
    assert sorted(kwargs["recipient_ids"]) == ["bob", "carol"]


@patch("app.messages.controller.can_message", return_value=False)
@patch("app.messages.controller._participant_ids", return_value=["alice", "bob"])
@patch(
    "app.messages.controller._require_participant",
    return_value={"id": "conv-d", "type": "dm", "user_a": "alice", "user_b": "bob"},
)
@patch("app.core.db.service_client")
def test_dm_via_conversation_id_rechecks_eligibility(client, _conv, _ids, _can):
    from app.messages.controller import send_message

    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", conversation_id="conv-d", body="hi")
    assert exc.value.status_code == 403


@patch("app.core.db.service_client")
def test_send_403_for_non_participant_wired(client):
    """Core security property: non-participant cannot send via conversation_id."""
    from app.messages.controller import send_message

    (
        client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data={
            "id": "conv-t",
            "type": "team_members",
            "user_a": None,
            "user_b": None,
            "project_id": "p1",
        }
    )
    (
        client.table.return_value.select.return_value.eq.return_value.execute.return_value
    ) = MagicMock(
        data=[{"user_id": "alice", "role": "member"}, {"user_id": "bob", "role": "member"}]
    )
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="mallory", conversation_id="conv-t", body="hi")
    assert exc.value.status_code == 403


@patch("app.messages.controller._participant_ids", return_value=["alice", "bob", "carol"])
@patch(
    "app.messages.controller._require_participant",
    return_value={"id": "conv-t", "type": "team_members", "user_a": None, "user_b": None},
)
@patch("app.core.db.service_client")
def test_notify_failure_does_not_fail_send(client, _conv, _ids):
    """One recipient's notify blowing up must not 500 the send or starve the rest."""
    from app.messages import controller

    _wire_insert(client)
    calls = []

    def flaky(*, recipient_id, **kw):
        calls.append(recipient_id)
        if recipient_id == "bob":
            raise RuntimeError("boom")

    with patch("app.notifications.controller.notify_new_message", side_effect=flaky):
        result = controller.send_message(sender_id="alice", conversation_id="conv-t", body="hi")
    assert result["conversation_id"] == "conv-t"
    assert calls == ["bob", "carol"]
