"""Smoke tests for list_inbox / list_messages / mark_read.

list_inbox's RPC contract (call shape, empty-data handling, row mapping)
is covered in test_messages_inbox.py. The deep semantic tests (unread
counting, can_send, ordering, participant checks) live in
test_messages_endpoints.py — exercising the views through the FastAPI
TestClient validates the same behavior end-to-end without the fragility
of mocking the supabase fluent chain inside the controller.
"""
from __future__ import annotations


def test_list_messages_and_mark_read_are_exported():
    """Surface check: ensure the public functions exist before Task 8 wires
    them into views.py."""
    from app.messages import controller
    assert callable(controller.list_inbox)
    assert callable(controller.list_messages)
    assert callable(controller.mark_read)
