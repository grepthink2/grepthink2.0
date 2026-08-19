"""Story/task creation (key RPC), updates, task delete, tag validation."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_create_story_uses_key_rpc(mock_client, _writer):
    from app.scrum.controller import create_story
    client = MagicMock()
    mock_client.return_value = client
    client.rpc.return_value.execute.return_value = MagicMock(data=7)
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "st1", "key": "US-7"}])
    out = create_story(project_id=PID, user_id=UID, fields={"title": "Login flow"})
    client.rpc.assert_called_with("scrum_next_key", {"p_project_id": PID, "p_kind": "story"})
    assert out["key"] == "US-7"
    inserted = client.table.return_value.insert.call_args.args[0]
    assert inserted["reporter_id"] == UID and inserted["key"] == "US-7"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_create_task_rejects_bad_tag(mock_client, _writer):
    from app.scrum.controller import create_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "st1", "project_id": PID})
    with pytest.raises(HTTPException) as e:
        create_task(story_id="st1", user_id=UID, fields={"title": "x", "tags": ["yolo"]})
    assert e.value.status_code == 422


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_story_archive_sets_timestamp(mock_client, _writer):
    from app.scrum.controller import update_story
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "st1", "project_id": PID, "sprint_id": "s1"})
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "st1", "archived_at": "2026-08-12T00:00:00Z"}])
    update_story(story_id="st1", user_id=UID, fields={"archived": True})
    payload = client.table.return_value.update.call_args.args[0]
    assert payload["archived_at"] is not None and "archived" not in payload
