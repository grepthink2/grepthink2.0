"""Tests for app.messages.controller.can_message."""

from __future__ import annotations

from unittest.mock import patch


@patch("app.messages.controller.has_shared_class", return_value=True)
def test_people_who_share_a_class_can_message(_has_shared):
    from app.messages.controller import can_message

    assert can_message("alice", "bob") is True


@patch("app.messages.controller.has_shared_class", return_value=False)
def test_can_message_requires_shared_class(_has_shared):
    from app.messages.controller import can_message

    assert can_message("alice", "bob") is False


def test_can_message_rejects_self():
    from app.messages.controller import can_message

    assert can_message("alice", "alice") is False
