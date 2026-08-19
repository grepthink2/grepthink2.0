"""Move endpoint: single task_moves INSERT (trigger applies), no-op fast path."""
from unittest.mock import MagicMock, patch

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"
TASK = {"id": "t1", "project_id": PID, "status": "todo", "story_id": "st1"}


@patch("app.scrum.controller._snapshot_burnup_safe")
@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_move_inserts_single_move_row(mock_client, _w, _snap):
    from app.scrum.controller import move_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=dict(TASK))
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "mv1", "from_status": "todo", "to_status": "done", "moved_at": "2026-08-12T01:00:00Z"}])
    out = move_task(task_id="t1", user_id=UID, to_status="done")
    inserted = client.table.return_value.insert.call_args.args[0]
    assert inserted == {"task_id": "t1", "to_status": "done", "moved_by": UID}
    assert out["task"]["status"] == "done" and out["move"]["from_status"] == "todo"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_move_same_status_is_noop(mock_client, _w):
    from app.scrum.controller import move_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=dict(TASK))
    out = move_task(task_id="t1", user_id=UID, to_status="todo")
    client.table.return_value.insert.assert_not_called()
    assert out["move"] is None
