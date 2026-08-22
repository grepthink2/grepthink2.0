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
def test_create_story_rejects_cross_project_sprint(mock_client, _writer):
    from app.scrum.controller import create_story
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "s9", "project_id": "OTHER"})
    with pytest.raises(HTTPException) as e:
        create_story(project_id=PID, user_id=UID, fields={"title": "x", "sprint_id": "s9"})
    assert e.value.status_code == 404
    client.table.return_value.insert.assert_not_called()


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_story_rejects_cross_project_sprint(mock_client, _writer):
    from app.scrum.controller import update_story
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.side_effect = [
        MagicMock(data={"id": "st1", "project_id": PID, "sprint_id": None}),   # story lookup
        MagicMock(data={"id": "s9", "project_id": "OTHER"}),                   # sprint lookup
    ]
    with pytest.raises(HTTPException) as e:
        update_story(story_id="st1", user_id=UID, fields={"sprint_id": "s9"})
    assert e.value.status_code == 404
    client.table.return_value.update.assert_not_called()


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


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_story_rejects_null_title(mock_client, _writer):
    from app.scrum.controller import update_story
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "st1", "project_id": PID, "sprint_id": None})
    with pytest.raises(HTTPException) as e:
        update_story(story_id="st1", user_id=UID, fields={"title": None})
    assert e.value.status_code == 422


@patch("app.scrum.controller._project_repo_rows", return_value=[])
@patch("app.scrum.controller._client")
@patch("app.scrum.controller.fetch_pr_state", return_value=None)
def test_pr_fields_fetch_failure_stores_null_state(_fetch, _client, _repos):
    from app.scrum.controller import _pr_fields
    out = _pr_fields("https://github.com/o/r/pull/42", project_id=PID)
    assert out["pr_provider"] == "github"
    assert out["pr_state"] is None and out["pr_checked_at"] is None


@patch("app.scrum.controller._project_repo_rows", return_value=[])
@patch("app.scrum.controller._client")
@patch("app.scrum.controller.fetch_pr_state", return_value="merged")
def test_pr_fields_fetch_success_stamps_state(_fetch, _client, _repos):
    from app.scrum.controller import _pr_fields
    out = _pr_fields("https://github.com/o/r/pull/42", project_id=PID)
    assert out["pr_state"] == "merged" and out["pr_checked_at"] is not None


@patch("app.scrum.controller._pr_fields")
@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_task_skips_pr_fetch_when_url_unchanged(mock_client, _writer, pr_fields):
    from app.scrum.controller import update_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "t1", "project_id": PID, "pr_url": "https://github.com/o/r/pull/42"})
    out = update_task(task_id="t1", user_id=UID,
                      fields={"pr_url": "https://github.com/o/r/pull/42"})
    pr_fields.assert_not_called()
    assert out["id"] == "t1"
