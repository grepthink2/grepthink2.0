"""Tests for app.messages.controller.can_message."""
from __future__ import annotations
from unittest.mock import patch
import pytest


@patch("app.messages.controller.has_shared_class", return_value=True)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_blocks_instructor_pair(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "instructor", "bob": "instructor"}
    assert can_message("alice", "bob") is False


@patch("app.messages.controller.has_shared_class", return_value=True)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_allows_instructor_student(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "instructor", "bob": "student"}
    assert can_message("alice", "bob") is True


@patch("app.messages.controller.has_shared_class", return_value=True)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_allows_student_student(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "student", "bob": "student"}
    assert can_message("alice", "bob") is True


@patch("app.messages.controller.has_shared_class", return_value=False)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_requires_shared_class(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "student", "bob": "student"}
    assert can_message("alice", "bob") is False


def test_can_message_rejects_self():
    from app.messages.controller import can_message
    assert can_message("alice", "alice") is False
