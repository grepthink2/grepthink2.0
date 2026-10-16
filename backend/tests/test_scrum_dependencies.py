"""Task dependencies ("GT-15 depends on GT-12"): adding and removing an edge, and what is refused.

The world: sprints S1 (completed) and S2 (active); stories A (in S1), B (in S2) and D (in the
backlog); tasks a1 on A, b1 and b2 on B, d1 on D. Story X and its task x1 belong to another
project. An edge row is ``{task_id, depends_on_task_id, project_id}``: task_id depends on
depends_on_task_id.
"""

import pytest
from fastapi import HTTPException

from app.core import authz
from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import (
    INSTR,
    MEETING_TA,
    OTHER_PID,
    OUTSIDER,
    PID,
    STUDENT,
    TA,
    UID,
    scrum_db,
)


def _sprint(sid, status):
    return {
        "id": sid,
        "project_id": PID,
        "name": sid,
        "starts_at": "2026-09-07",
        "ends_at": "2026-09-20",
        "status": status,
    }


def _story(sid, sprint, project=PID):
    return {
        "id": sid,
        "project_id": project,
        "key": f"US-{sid}",
        "title": sid,
        "sprint_id": sprint,
        "reporter_id": UID,
    }


def _task(tid, story, status="todo", project=PID):
    return {
        "id": tid,
        "story_id": story,
        "project_id": project,
        "key": f"GT-{tid}",
        "title": tid,
        "status": status,
        "reporter_id": UID,
        "tags": [],
    }


def _edge(task, depends_on):
    return {"task_id": task, "depends_on_task_id": depends_on, "project_id": PID}


def _ref(tid, story, sprint, status):
    """What the API names a task by: its own fields, its story's key and its story's sprint."""
    return {
        "id": tid,
        "key": f"GT-{tid}",
        "title": tid,
        "status": status,
        "story_id": story,
        "story_key": f"US-{story}",
        "sprint_id": sprint,
    }


def _seed(monkeypatch, *edges):
    return scrum_db(
        monkeypatch,
        sprints=[_sprint("S1", "completed"), _sprint("S2", "active")],
        user_stories=[
            _story("A", "S1"),
            _story("B", "S2"),
            _story("D", None),
            _story("X", None, project=OTHER_PID),
        ],
        tasks=[
            _task("a1", "A", "done"),
            _task("b1", "B", "in_progress"),
            _task("b2", "B"),
            _task("d1", "D"),
            _task("x1", "X", project=OTHER_PID),
        ],
        task_dependencies=list(edges),
    )


def _edges(db) -> list[tuple[str, str]]:
    return [(e["task_id"], e["depends_on_task_id"]) for e in db.rows("task_dependencies")]


def test_add_dependency_inserts_the_edge_and_returns_the_tasks_dependencies(monkeypatch):
    # b2 already depends on d1; a1's dependency on b1 is a1's, not b2's.
    db = _seed(monkeypatch, _edge("b2", "d1"), _edge("a1", "b1"))
    out = controller.add_dependency(task_id="b2", user_id=UID, depends_on_task_id="b1")

    assert out == [_ref("d1", "D", None, "todo"), _ref("b1", "B", "S2", "in_progress")]
    new = db.rows("task_dependencies")[-1]
    assert {k: new[k] for k in ("task_id", "depends_on_task_id", "project_id", "created_by")} == {
        "task_id": "b2",
        "depends_on_task_id": "b1",
        "project_id": PID,
        "created_by": UID,
    }
    # the task pair, the writer check, the edges, the insert, the targets with their stories
    assert db.executes <= 5


@pytest.mark.parametrize(
    ("target", "story", "sprint", "status"),
    [("a1", "A", "S1", "done"), ("d1", "D", None, "todo")],  # a completed sprint; the backlog
)
def test_a_dependency_may_cross_sprints_or_reach_the_backlog(
    monkeypatch, target, story, sprint, status
):
    db = _seed(monkeypatch)
    out = controller.add_dependency(task_id="b2", user_id=UID, depends_on_task_id=target)
    assert out == [_ref(target, story, sprint, status)]
    assert _edges(db) == [("b2", target)]


def test_a_task_cannot_depend_on_itself(monkeypatch):
    db = _seed(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.add_dependency(task_id="b2", user_id=UID, depends_on_task_id="b2")
    assert (e.value.status_code, e.value.detail) == (422, controller.SELF_DEPENDENCY)
    assert _edges(db) == []


@pytest.mark.parametrize(
    ("task", "target"),
    [("b2", "x1"), ("b2", "missing"), ("missing", "b1")],
)
def test_a_task_outside_the_project_is_not_found(monkeypatch, task, target):
    """Another project's task answers as a missing one does: nothing about it leaks."""
    db = _seed(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.add_dependency(task_id=task, user_id=UID, depends_on_task_id=target)
    assert (e.value.status_code, e.value.detail) == (404, controller.TASK_NOT_FOUND)
    assert _edges(db) == []


def test_a_duplicate_edge_is_refused(monkeypatch):
    db = _seed(monkeypatch, _edge("b2", "b1"))
    with pytest.raises(HTTPException) as e:
        controller.add_dependency(task_id="b2", user_id=UID, depends_on_task_id="b1")
    assert (e.value.status_code, e.value.detail) == (409, controller.ALREADY_DEPENDS)
    assert _edges(db) == [("b2", "b1")]


def test_a_direct_cycle_is_refused(monkeypatch):
    db = _seed(monkeypatch, _edge("b1", "b2"))
    with pytest.raises(HTTPException) as e:
        controller.add_dependency(task_id="b2", user_id=UID, depends_on_task_id="b1")
    assert (e.value.status_code, e.value.detail) == (409, controller.DEPENDENCY_CYCLE)
    assert _edges(db) == [("b1", "b2")]


def test_a_two_step_cycle_is_refused(monkeypatch):
    # d1 → b2 → b1, so b1 → d1 would close the loop.
    db = _seed(monkeypatch, _edge("d1", "b2"), _edge("b2", "b1"))
    with pytest.raises(HTTPException) as e:
        controller.add_dependency(task_id="b1", user_id=UID, depends_on_task_id="d1")
    assert (e.value.status_code, e.value.detail) == (409, controller.DEPENDENCY_CYCLE)
    assert _edges(db) == [("d1", "b2"), ("b2", "b1")]


def test_a_shared_dependency_is_not_a_cycle(monkeypatch):
    # b2 → b1 and b2 → d1; d1 → b1 makes a diamond, not a loop.
    db = _seed(monkeypatch, _edge("b2", "b1"), _edge("b2", "d1"))
    controller.add_dependency(task_id="d1", user_id=UID, depends_on_task_id="b1")
    assert ("d1", "b1") in _edges(db)


@pytest.mark.parametrize(
    ("caller", "detail"),
    [
        (INSTR, controller.MEMBERS_ONLY),
        (TA, controller.MEMBERS_ONLY),
        (MEETING_TA, controller.MEMBERS_ONLY),
        (STUDENT, authz.NOT_PROJECT_MEMBER),
        (OUTSIDER, authz.NOT_PROJECT_MEMBER),
    ],
)
def test_only_the_team_adds_or_removes(monkeypatch, caller, detail):
    """Staff read both lists on the board and change neither; anyone else is not let in."""
    db = _seed(monkeypatch, _edge("b2", "b1"))
    with pytest.raises(HTTPException) as e:
        controller.add_dependency(task_id="b2", user_id=caller, depends_on_task_id="d1")
    assert (e.value.status_code, e.value.detail) == (403, detail)
    with pytest.raises(HTTPException) as e:
        controller.remove_dependency(task_id="b2", user_id=caller, depends_on_task_id="b1")
    assert (e.value.status_code, e.value.detail) == (403, detail)
    assert _edges(db) == [("b2", "b1")]


def test_remove_dependency_deletes_only_that_edge(monkeypatch):
    db = _seed(monkeypatch, _edge("b2", "b1"), _edge("b2", "d1"), _edge("a1", "b1"))
    controller.remove_dependency(task_id="b2", user_id=UID, depends_on_task_id="b1")
    assert _edges(db) == [("b2", "d1"), ("a1", "b1")]
    # the task, the writer check, the delete
    assert db.executes <= 3


def test_removing_a_missing_edge_is_404(monkeypatch):
    db = _seed(monkeypatch, _edge("b1", "b2"))  # the other way round
    with pytest.raises(HTTPException) as e:
        controller.remove_dependency(task_id="b2", user_id=UID, depends_on_task_id="b1")
    assert (e.value.status_code, e.value.detail) == (404, controller.DEPENDENCY_NOT_FOUND)
    assert _edges(db) == [("b1", "b2")]


def test_the_routes_answer_201_and_204(monkeypatch, client):
    db = _seed(monkeypatch)
    headers = header_for("tony@ucsc.edu", sub=UID)

    res = client.post(
        "/api/scrum/tasks/b2/dependencies", headers=headers, json={"depends_on_task_id": "b1"}
    )
    assert res.status_code == 201
    assert res.json() == {
        "message": "Dependency added",
        "depends_on": [_ref("b1", "B", "S2", "in_progress")],
    }

    res = client.delete("/api/scrum/tasks/b2/dependencies/b1", headers=headers)
    assert (res.status_code, res.content) == (204, b"")
    assert _edges(db) == []
