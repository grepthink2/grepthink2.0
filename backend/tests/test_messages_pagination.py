"""Keyset pagination for thread history."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


def _msgs(n, start=0):
    return [{"id": f"m{i}", "sender_id": "alice", "body": f"b{i}",
             "created_at": f"2026-07-10T00:00:{59 - i:02d}+00:00"}
            for i in range(start, start + n)]


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_full_page_returns_cursor(client, _auth):
    from app.messages.controller import list_messages
    rows = _msgs(50)
    q = client.table.return_value.select.return_value.eq.return_value
    q.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=rows)
    result = list_messages(conversation_id="c1", caller_id="alice")
    assert len(result["messages"]) == 50
    last = rows[-1]
    assert result["next_cursor"] == f"{last['created_at']}|{last['id']}"


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_short_page_has_no_cursor(client, _auth):
    from app.messages.controller import list_messages
    q = client.table.return_value.select.return_value.eq.return_value
    q.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=_msgs(3))
    result = list_messages(conversation_id="c1", caller_id="alice")
    assert result["next_cursor"] is None


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_before_cursor_applies_keyset_filter(client, _auth):
    from app.messages.controller import list_messages
    q = client.table.return_value.select.return_value.eq.return_value
    chain = q.or_.return_value
    chain.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    list_messages(conversation_id="c1", caller_id="alice",
                  before="2026-07-10T00:00:30+00:00|m29")
    args, _ = q.or_.call_args
    assert "created_at.lt.2026-07-10T00:00:30+00:00" in args[0]
    assert "id.lt.m29" in args[0]


def test_malformed_cursor_400():
    from app.messages.controller import list_messages
    with patch("app.messages.controller._require_participant"):
        with pytest.raises(HTTPException) as exc:
            list_messages(conversation_id="c1", caller_id="alice",
                          before="not-a-cursor")
        assert exc.value.status_code == 400


def test_cursor_filter_smuggling_400():
    """Cursor halves that parse but carry PostgREST filter syntax (parens,
    commas, dots in the id) must be rejected, not interpolated."""
    from app.messages.controller import list_messages
    with patch("app.messages.controller._require_participant"):
        with pytest.raises(HTTPException) as exc:
            list_messages(conversation_id="c1", caller_id="alice",
                          before="2026-07-10T00:00:30+00:00|m29),or(1.eq.1")
        assert exc.value.status_code == 400


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_limit_clamped_high(client, _auth):
    from app.messages.controller import list_messages
    q = client.table.return_value.select.return_value.eq.return_value
    q.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    list_messages(conversation_id="c1", caller_id="alice", limit=500)
    q.order.return_value.order.return_value.limit.assert_called_once_with(100)


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_limit_clamped_low(client, _auth):
    from app.messages.controller import list_messages
    q = client.table.return_value.select.return_value.eq.return_value
    q.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    list_messages(conversation_id="c1", caller_id="alice", limit=0)
    q.order.return_value.order.return_value.limit.assert_called_once_with(1)


@patch("app.messages.controller.service_client")
def test_list_messages_403_for_non_participant_wired(client):
    """Defense-in-depth: exercises the real _require_participant wiring."""
    from app.messages.controller import list_messages
    (client.table.return_value.select.return_value.eq.return_value
     .maybe_single.return_value.execute.return_value) = MagicMock(
        data={"id": "c1", "type": "dm", "user_a": "alice", "user_b": "bob",
              "project_id": None})
    (client.table.return_value.select.return_value.eq.return_value
     .execute.return_value) = MagicMock(
        data=[{"user_id": "alice", "role": "member"},
              {"user_id": "bob", "role": "member"}])
    with pytest.raises(HTTPException) as exc:
        list_messages(conversation_id="c1", caller_id="mallory")
    assert exc.value.status_code == 403
