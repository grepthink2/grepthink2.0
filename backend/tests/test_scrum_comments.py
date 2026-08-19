"""Comments: staff may post, parent routing, and the mention seam is invoked."""
from unittest.mock import MagicMock, patch

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


def _wire(mock_client, parent):
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=parent)
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "c1", "author_id": UID, "body_md": "x", "created_at": "2026-08-12T00:00:00Z"}])
    return client


@patch("app.scrum.controller._fanout_mentions")
@patch("app.scrum.controller._board_access", return_value="staff")
@patch("app.scrum.controller._client")
def test_staff_can_comment(mock_client, _access, _fan):
    from app.scrum.controller import create_comment
    _wire(mock_client, {"id": "st1", "project_id": PID, "key": "US-3"})
    out = create_comment(parent_kind="story", parent_id="st1", user_id=UID, body_md="hello")
    assert out["id"] == "c1"


@patch("app.scrum.controller._fanout_mentions")
@patch("app.scrum.controller._board_access", return_value="member")
@patch("app.scrum.controller._client")
def test_create_comment_routes_task_parent_and_invokes_seam(mock_client, _access, fan):
    from app.scrum.controller import create_comment
    client = _wire(mock_client, {"id": "t1", "project_id": PID, "key": "GT-12"})
    create_comment(parent_kind="task", parent_id="t1", user_id=UID, body_md="hello")
    inserted = client.table.return_value.insert.call_args.args[0]
    assert inserted["task_id"] == "t1" and "story_id" not in inserted
    assert fan.call_count == 1
    assert fan.call_args.kwargs["parent_key"] == "GT-12"
    assert fan.call_args.kwargs["parent_kind"] == "task"
