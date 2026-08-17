"""Authorization matrix for the scrum board: member / staff / stranger."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


def _client_with(member_rows, project_row):
    client = MagicMock()
    members_q = MagicMock()
    members_q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=member_rows)
    projects_q = MagicMock()
    maybe = MagicMock()
    maybe.data = project_row
    projects_q.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = maybe if project_row else None
    client.table.side_effect = lambda name: {"project_members": members_q, "projects": projects_q}[name]
    return client


@patch("app.scrum.controller._client")
def test_member_gets_member(mock_client):
    from app.scrum.controller import _board_access
    mock_client.return_value = _client_with([{"id": "m1"}], None)
    assert _board_access(project_id=PID, user_id=UID) == "member"


@patch("app.scrum.controller.get_enrollment_role", return_value=None)
@patch("app.scrum.controller._is_instructor", return_value=True)
@patch("app.scrum.controller._client")
def test_class_instructor_gets_staff(mock_client, _inst, _enr):
    from app.scrum.controller import _board_access
    mock_client.return_value = _client_with([], {"id": PID, "class_id": "c1", "assigned_ta_id": None})
    assert _board_access(project_id=PID, user_id=UID) == "staff"


@patch("app.scrum.controller.get_enrollment_role", return_value=None)
@patch("app.scrum.controller._is_instructor", return_value=False)
@patch("app.scrum.controller._client")
def test_stranger_gets_404(mock_client, _inst, _enr):
    from app.scrum.controller import _board_access
    mock_client.return_value = _client_with([], {"id": PID, "class_id": "c1", "assigned_ta_id": None})
    with pytest.raises(HTTPException) as e:
        _board_access(project_id=PID, user_id=UID)
    assert e.value.status_code == 404


@patch("app.scrum.controller._board_access", return_value="staff")
def test_writer_rejects_staff(_access):
    from app.scrum.controller import _require_writer
    with pytest.raises(HTTPException) as e:
        _require_writer(project_id=PID, user_id=UID)
    assert e.value.status_code == 403
