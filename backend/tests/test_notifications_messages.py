"""Message notifications reach TAs and instructors too (group channels)."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


@patch("app.notifications.controller._upsert_unread_notification")
@patch("app.notifications.controller.profile_display_name", return_value="Alice A")
@patch("app.notifications.controller._get_profile", return_value={"id": "alice"})
def test_notifies_non_students(_prof, _name, upsert):
    from app.notifications.controller import notify_new_message
    notify_new_message(
        recipient_id="ta-1", sender_id="alice",
        conversation_id="conv-t", body="hello team",
    )
    upsert.assert_called_once()
    _, kwargs = upsert.call_args
    assert kwargs["user_id"] == "ta-1"
    assert kwargs["type"] == "message"
