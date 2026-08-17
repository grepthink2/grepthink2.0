"""Settings + sprint CRUD."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_settings_writes_scale(mock_client, _writer):
    from app.scrum.controller import update_settings
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": PID}])
    update_settings(project_id=PID, user_id=UID, estimate_scale="linear")
    client.table.assert_called_with("projects")
    client.table.return_value.update.assert_called_with({"estimate_scale": "linear"})


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_create_sprint_returns_row(mock_client, _writer):
    from app.scrum.controller import create_sprint
    client = MagicMock()
    mock_client.return_value = client
    row = {"id": "s1", "name": "Sprint 1", "starts_at": "2026-08-17",
           "ends_at": "2026-08-30", "status": "planned"}
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[row])
    out = create_sprint(project_id=PID, user_id=UID,
                        name="Sprint 1", starts_at="2026-08-17", ends_at="2026-08-30")
    assert out["id"] == "s1"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_sprint_404_when_missing(mock_client, _writer):
    from app.scrum.controller import update_sprint
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
    with pytest.raises(HTTPException) as e:
        update_sprint(sprint_id="s-missing", user_id=UID, fields={"status": "active"})
    assert e.value.status_code == 404
