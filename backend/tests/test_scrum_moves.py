"""Moves: one task_moves INSERT (the trigger applies it), the no-op fast path, the
dependency gate (a task in To do waits for what it depends on), and which story edits pay
for a burnup snapshot."""

import pytest
from fastapi import HTTPException

from app.core.errors import AppError
from app.scrum import controller
from tests.scrum_support import PID, STUDENT, TA, UID, scrum_db

STORY = {"id": "st1", "project_id": PID, "key": "US-1", "title": "Search", "sprint_id": "sp1"}
TASK = {"id": "t1", "story_id": "st1", "project_id": PID, "key": "GT-1", "status": "todo"}
#: What TASK depends on, in _blocked_board.
DEPENDENCY = {"id": "t2", "story_id": "st1", "project_id": PID, "key": "GT-2", "status": "todo"}
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


def _blocked_board(monkeypatch, *, status="todo", dependency_status="in_progress"):
    """t1 (``status``) depends on t2 (``dependency_status``)."""
    return scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[dict(STORY)],
        tasks=[dict(TASK, status=status), dict(DEPENDENCY, status=dependency_status)],
        task_dependencies=[{"task_id": "t1", "depends_on_task_id": "t2", "project_id": PID}],
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


def test_a_move_answers_the_movers_name_and_the_new_status(monkeypatch):
    """The board resolves moved_by_name from its bulk profile read; this single-row
    response resolves its own, or the client reconciles its optimistic audit line
    down to "Unknown". The name comes embedded in the move's insert; the status comes
    from the move, never from the task embedded there (see the next test)."""
    _board(monkeypatch)
    out = controller.move_task(task_id="t1", user_id=UID, to_status="done")
    assert (out["task"]["status"], out["task"]["moved_by_name"]) == ("done", "Tony Wu")
    assert out["task"]["moved_at"] == out["move"]["moved_at"]
    assert not {"mover", "task"} & set(out["move"])


def test_a_task_embedded_on_a_moves_insert_shows_its_status_before_the_move(monkeypatch):
    """PostgREST runs a write and its select as one statement on one snapshot, so the task
    embedded on a move's insert still has its old status although the trigger has moved
    it. The fake's trigger runs after its copy of the store, as Postgres's runs inside the
    statement."""
    db = _board(monkeypatch)
    res = (
        db.table("task_moves")
        .insert({"task_id": "t1", "to_status": "done", "moved_by": UID})
        .select("from_status, task:tasks!task_moves_task_id_fkey(status)")
        .execute()
    )
    assert res.data == [{"from_status": "todo", "task": {"status": "todo"}}]
    assert db.rows("tasks")[0]["status"] == "done"


def test_a_mover_without_a_profile_is_unknown(monkeypatch):
    db = _board(monkeypatch)
    db.store["profiles"] = [p for p in db.rows("profiles") if p["id"] != UID]
    out = controller.move_task(task_id="t1", user_id=UID, to_status="done")
    assert out["task"]["moved_by_name"] == "Unknown"


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


@pytest.mark.parametrize("to", ["in_progress", "done"])
def test_a_todo_task_with_an_unfinished_dependency_cannot_leave_todo(monkeypatch, to):
    db = _blocked_board(monkeypatch)
    with pytest.raises(AppError) as e:
        controller.move_task(task_id="t1", user_id=UID, to_status=to)
    assert (e.value.status_code, e.value.detail, e.value.code) == (
        409,
        controller.TASK_BLOCKED,
        "task_blocked",
    )
    assert db.rows("task_moves") == []
    assert db.rows("tasks")[0]["status"] == "todo"


def test_the_move_goes_through_once_the_dependency_is_done(monkeypatch):
    db = _blocked_board(monkeypatch, dependency_status="done")
    controller.move_task(task_id="t1", user_id=UID, to_status="in_progress")
    assert db.rows("tasks")[0]["status"] == "in_progress"
    # A move without dependencies plus one read: the dependencies' statuses.
    assert db.executes <= 7


def test_a_blocked_task_moved_to_todo_writes_nothing(monkeypatch):
    db = _blocked_board(monkeypatch)
    out = controller.move_task(task_id="t1", user_id=UID, to_status="todo")
    assert out["move"] is None
    assert db.rows("task_moves") == []


def test_a_started_task_finishes_even_if_its_dependency_reopened(monkeypatch):
    """Only leaving To do waits: a reopened dependency never pulls a started task back."""
    db = _blocked_board(monkeypatch, status="in_progress", dependency_status="todo")
    controller.move_task(task_id="t1", user_id=UID, to_status="done")
    assert db.rows("tasks")[0]["status"] == "done"


def test_a_move_without_dependencies_costs_one_more_read(monkeypatch):
    db = _board(monkeypatch)
    controller.move_task(task_id="t1", user_id=UID, to_status="done")
    assert db.rows("tasks")[0]["status"] == "done"
    # The task, the writer check, its dependency rows (none), the insert (the mover's name
    # and the story's sprint embedded), and the burnup snapshot (one read and the upsert).
    assert db.executes == 6


def test_a_move_snapshots_the_sprint_burnup(monkeypatch):
    """The totals are read after the move, from the sprint's live stories, in both units: their
    tasks count, never a story's points; an archived story's tasks count nowhere; and only done
    tasks are completed."""
    db = scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            dict(STORY, points=5),
            dict(STORY, id="st2", key="US-2", points=3, archived_at="2026-08-20T00:00:00Z"),
        ],
        tasks=[
            dict(TASK, points=2, estimate_hours=4),
            dict(TASK, id="t3", key="GT-3", status="in_progress", points=1, estimate_hours=6),
            dict(
                TASK, id="t4", story_id="st2", key="GT-4", status="done", points=4, estimate_hours=8
            ),
        ],
    )
    controller.move_task(task_id="t1", user_id=UID, to_status="done")
    [snap] = db.rows("sprint_burnup_days")
    assert snap["sprint_id"] == "sp1"
    assert [snap[k] for k in ("scope_points", "completed_points")] == [3, 2]
    assert [snap[k] for k in ("scope_hours", "completed_hours")] == [10, 4]


def test_moving_a_backlog_task_takes_no_burnup_snapshot(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY, sprint_id=None)], tasks=[dict(TASK)])
    controller.move_task(task_id="t1", user_id=UID, to_status="done")
    assert db.rows("tasks")[0]["status"] == "done"
    assert db.rows("sprint_burnup_days") == []
    assert not [q for q in db.queries if q["table"] == "user_stories"]
    # The task, the writer check, its dependency rows (none) and the insert.
    assert db.executes == 4


@pytest.mark.parametrize("fields", [{"title": "New title"}, {"points": 5}])
def test_a_story_title_or_points_edit_skips_the_burnup_snapshot(monkeypatch, fields):
    """A snapshot costs two extra sequential round trips, and only a sprint change can move
    the burnup line: it counts the sprint's tasks, never a story's points (spec D21)."""
    db = _board(monkeypatch)
    controller.update_story(story_id="st1", user_id=UID, fields=fields)
    assert db.rows("sprint_burnup_days") == []
    # The story, the writer check and the update.
    assert db.executes == 3


def test_a_story_sprint_change_snapshots_both_sprints(monkeypatch):
    """The story's tasks leave one sprint's scope and join the other's."""
    db = scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT), dict(SPRINT, id="sp2", name="Sprint 2")],
        user_stories=[dict(STORY)],
        tasks=[dict(TASK, points=3, estimate_hours=4)],
    )
    controller.update_story(story_id="st1", user_id=UID, fields={"sprint_id": "sp2"})
    scopes = {
        s["sprint_id"]: (s["scope_points"], s["scope_hours"]) for s in db.rows("sprint_burnup_days")
    }
    assert scopes == {"sp1": (0, 0), "sp2": (3, 4)}
