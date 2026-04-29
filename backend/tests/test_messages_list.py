"""Smoke tests for list_inbox / list_messages / mark_read.

The deep semantic tests (unread counting, can_send, ordering, participant
checks) live in test_messages_endpoints.py — exercising the views through
the FastAPI TestClient validates the same behavior end-to-end without the
fragility of mocking the supabase fluent chain inside the controller.
"""
from __future__ import annotations
from unittest.mock import MagicMock, patch


@patch("app.messages.controller.service_client")
def test_list_inbox_returns_empty_when_no_conversations(client):
    from app.messages.controller import list_inbox

    # Walk to the leaf of the conversations query chain
    chain = client.table.return_value.select.return_value.or_.return_value.not_
    chain.is_.return_value.order.return_value.execute.return_value = MagicMock(data=[])

    assert list_inbox(caller_id="alice") == []


def test_list_messages_and_mark_read_are_exported():
    """Surface check: ensure the public functions exist before Task 8 wires
    them into views.py."""
    from app.messages import controller
    assert callable(controller.list_inbox)
    assert callable(controller.list_messages)
    assert callable(controller.mark_read)
