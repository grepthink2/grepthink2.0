"""Tests for the send-message path: conversation create-or-fetch + insert."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


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
