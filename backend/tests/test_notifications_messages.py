"""Message notifications reach TAs and instructors too (group channels)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from tests.fake_supabase import FakeSupabase


@patch("app.notifications.controller._upsert_unread_notification")
@patch("app.notifications.controller.profile_display_name", return_value="Alice A")
@patch("app.notifications.controller._get_profile", return_value={"id": "alice"})
def test_notifies_non_students(_prof, _name, upsert):
    from app.notifications.controller import notify_new_message

    notify_new_message(
        recipient_id="ta-1",
        sender_id="alice",
        conversation_id="conv-t",
        body="hello team",
    )
    upsert.assert_called_once()
    _, kwargs = upsert.call_args
    assert kwargs["user_id"] == "ta-1"
    assert kwargs["type"] == "message"


def test_message_notification_goes_through_the_core_db_client(monkeypatch):
    """notifications._client() reads the service client through app.core.db — the
    one point tests patch — so a client injected there receives the reads and writes."""
    fake = FakeSupabase(
        profiles=[
            {
                "id": "alice",
                "email": "a@ucsc.edu",
                "role": "student",
                "first_name": "Alice",
                "last_name": "A",
                "edu_email": None,
            }
        ],
        notifications=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    from app.notifications.controller import notify_new_message

    notify_new_message(
        recipient_id="ta-1",
        sender_id="alice",
        conversation_id="conv-t",
        body="hello team",
    )
    [row] = fake.rows("notifications")
    assert {key: row.get(key) for key in ("user_id", "type", "title", "body", "entity_id")} == {
        "user_id": "ta-1",
        "type": "message",
        "title": "New message from Alice A",
        "body": "hello team",
        "entity_id": "conv-t",
    }


def test_notifications_answer_503_without_a_service_client(monkeypatch):
    """Unlike get_client(), notifications never fall back to the anon client."""
    monkeypatch.setattr("app.core.db.service_client", None, raising=False)
    from app.notifications.controller import mark_all_read

    with pytest.raises(HTTPException) as exc:
        mark_all_read("alice")
    assert (exc.value.status_code, exc.value.detail) == (503, "Service unavailable")
