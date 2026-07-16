"""Participant-based authorization for conversations (groups + DMs)."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


def _mock_conv(client, conv):
    (client.table.return_value.select.return_value.eq.return_value
     .maybe_single.return_value.execute.return_value) = MagicMock(data=conv)


def _mock_participants(client, user_ids):
    """conversation_participants .select().eq().execute() → rows."""
    (client.table.return_value.select.return_value.eq.return_value
     .execute.return_value) = MagicMock(
        data=[{"user_id": u, "role": "member"} for u in user_ids])


@patch("app.messages.controller.service_client")
def test_participant_passes(client):
    from app.messages.controller import _require_participant
    _mock_conv(client, {"id": "c1", "type": "team_members",
                        "user_a": None, "user_b": None})
    _mock_participants(client, ["alice", "bob"])
    conv = _require_participant("c1", "alice")
    assert conv["type"] == "team_members"


@patch("app.messages.controller.service_client")
def test_outsider_403(client):
    from app.messages.controller import _require_participant
    _mock_conv(client, {"id": "c1", "type": "team_ta",
                        "user_a": None, "user_b": None})
    _mock_participants(client, ["alice", "bob"])
    with pytest.raises(HTTPException) as exc:
        _require_participant("c1", "mallory")
    assert exc.value.status_code == 403


@patch("app.messages.controller.service_client")
def test_missing_conversation_404(client):
    from app.messages.controller import _require_participant
    (client.table.return_value.select.return_value.eq.return_value
     .maybe_single.return_value.execute.return_value) = None
    with pytest.raises(HTTPException) as exc:
        _require_participant("nope", "alice")
    assert exc.value.status_code == 404
