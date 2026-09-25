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
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=dict(TASK)
    )
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "mv1",
                "from_status": "todo",
                "to_status": "done",
                "moved_at": "2026-08-12T01:00:00Z",
            }
        ]
    )
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
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=dict(TASK)
    )
    out = move_task(task_id="t1", user_id=UID, to_status="todo")
    client.table.return_value.insert.assert_not_called()
    assert out["move"] is None


@patch("app.scrum.controller._snapshot_burnup_safe")
@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_move_returns_mover_display_name(mock_client, _w, _snap):
    """The board list resolves moved_by_name from a bulk profile fetch; this
    single-row response must resolve its own, or the client reconciles its
    optimistic audit line down to "Unknown"."""
    from app.scrum.controller import move_task

    client = MagicMock()
    mock_client.return_value = client
    tables = {}

    def table(name):
        tables.setdefault(name, MagicMock())
        return tables[name]

    client.table.side_effect = table
    table(
        "tasks"
    ).select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        MagicMock(data=dict(TASK))
    )
    table("task_moves").insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "mv1",
                "from_status": "todo",
                "to_status": "done",
                "moved_at": "2026-08-12T01:00:00Z",
            }
        ]
    )
    table(
        "profiles"
    ).select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        MagicMock(
            data={
                "id": UID,
                "first_name": "QA",
                "last_name": "Student",
                "email": "qa.student@grepthink.dev",
            }
        )
    )

    out = move_task(task_id="t1", user_id=UID, to_status="done")
    assert out["task"]["moved_by_name"] == "QA Student"


@patch("app.scrum.controller._snapshot_burnup_safe")
@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_story_title_edit_skips_the_burnup_snapshot(mock_client, _w, snap):
    """A snapshot costs three extra sequential round-trips; only scope-bearing
    edits (points / sprint_id / archived) can move the burnup line."""
    from app.scrum.controller import update_story

    client = MagicMock()
    mock_client.return_value = client
    story = {"id": "st1", "project_id": PID, "sprint_id": "sp1"}
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=dict(story)
    )
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[dict(story)]
    )

    update_story(story_id="st1", user_id=UID, fields={"title": "New title"})
    snap.assert_not_called()


@patch("app.scrum.controller._snapshot_burnup_safe")
@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_story_points_edit_still_snapshots(mock_client, _w, snap):
    from app.scrum.controller import update_story

    client = MagicMock()
    mock_client.return_value = client
    story = {"id": "st1", "project_id": PID, "sprint_id": "sp1"}
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=dict(story)
    )
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[dict(story)]
    )

    update_story(story_id="st1", user_id=UID, fields={"points": 5})
    snap.assert_called_once_with("sp1")
