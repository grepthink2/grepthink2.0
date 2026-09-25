"""Moves: one task_moves INSERT (the trigger applies it), the no-op fast path, and
which story edits pay for a burnup snapshot."""

import pytest
from fastapi import HTTPException

from app.scrum import controller
from tests.scrum_support import PID, STUDENT, TA, UID, scrum_db

STORY = {"id": "st1", "project_id": PID, "key": "US-1", "title": "Search", "sprint_id": "sp1"}
TASK = {"id": "t1", "story_id": "st1", "project_id": PID, "key": "GT-1", "status": "todo"}
SPRINT = {
    "id": "sp1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-08-17",
    "ends_at": "2026-08-30",
    "status": "active",
}


def _board(monkeypatch):
    return scrum_db(
        monkeypatch, sprints=[dict(SPRINT)], user_stories=[dict(STORY)], tasks=[dict(TASK)]
    )


def test_move_is_one_insert_that_the_trigger_applies(monkeypatch):
    db = _board(monkeypatch)
    out = controller.move_task(task_id="t1", user_id=UID, to_status="done")

    [move] = db.rows("task_moves")
    assert {k: move[k] for k in ("task_id", "to_status", "moved_by", "from_status")} == {
        "task_id": "t1",
        "to_status": "done",
        "moved_by": UID,
        "from_status": "todo",
    }
    assert db.rows("tasks")[0]["status"] == "done"
    assert out["task"]["status"] == "done" and out["move"]["from_status"] == "todo"


def test_move_answers_with_the_movers_name(monkeypatch):
    """The board resolves moved_by_name from its bulk profile read; this single-row
    response resolves its own, or the client reconciles its optimistic audit line
    down to "Unknown"."""
    _board(monkeypatch)
    out = controller.move_task(task_id="t1", user_id=UID, to_status="done")
    assert out["task"]["moved_by_name"] == "Tony Wu"


def test_moving_to_the_same_status_writes_nothing(monkeypatch):
    db = _board(monkeypatch)
    out = controller.move_task(task_id="t1", user_id=UID, to_status="todo")
    assert out["move"] is None
    assert db.rows("task_moves") == []


def test_unknown_status_is_422(monkeypatch):
    _board(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.move_task(task_id="t1", user_id=UID, to_status="blocked")
    assert e.value.status_code == 422


@pytest.mark.parametrize(("caller", "status"), [(TA, 403), (STUDENT, 403)])
def test_only_the_team_moves_tasks(monkeypatch, caller, status):
    db = _board(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.move_task(task_id="t1", user_id=caller, to_status="done")
    assert e.value.status_code == status
    assert db.rows("task_moves") == []


def test_a_move_snapshots_the_sprint_burnup(monkeypatch):
    db = _board(monkeypatch)
    controller.move_task(task_id="t1", user_id=UID, to_status="done")
    [snap] = db.rows("sprint_burnup_days")
    assert snap["sprint_id"] == "sp1"


def test_a_story_title_edit_skips_the_burnup_snapshot(monkeypatch):
    """A snapshot costs three extra sequential round trips; only scope-bearing edits
    (points / sprint_id / archived) can move the burnup line."""
    db = _board(monkeypatch)
    controller.update_story(story_id="st1", user_id=UID, fields={"title": "New title"})
    assert db.rows("sprint_burnup_days") == []


def test_a_story_points_edit_still_snapshots(monkeypatch):
    db = _board(monkeypatch)
    controller.update_story(story_id="st1", user_id=UID, fields={"points": 5})
    [snap] = db.rows("sprint_burnup_days")
    assert (snap["sprint_id"], snap["scope_points"]) == ("sp1", 5)
