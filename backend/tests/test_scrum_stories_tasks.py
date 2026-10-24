"""Story/task creation (key RPC), updates, story and task delete, tag validation, PR links."""

import pytest
from fastapi import HTTPException

from app.core.db import get_client
from app.scrum import controller
from tests.scrum_support import OTHER_PID, PID, TA, UID, scrum_db

STORY = {"id": "st1", "project_id": PID, "key": "US-1", "title": "Search", "sprint_id": None}
SPRINT = {
    "id": "sp1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-08-17",
    "ends_at": "2026-08-30",
    "status": "active",
}
#: A legacy archived row: archived_at is set and it may still name the sprint it left.
ARCHIVED_AT = "2026-09-01T00:00:00Z"
TASK = {
    "id": "t1",
    "story_id": "st1",
    "project_id": PID,
    "key": "GT-1",
    "title": "Endpoint",
    "status": "todo",
    "pr_url": "https://github.com/o/r/pull/42",
}
FOREIGN_SPRINT = {
    "id": "s9",
    "project_id": OTHER_PID,
    "name": "Theirs",
    "starts_at": "2026-08-17",
    "ends_at": "2026-08-30",
    "status": "active",
}


def test_create_story_takes_its_key_from_the_rpc(monkeypatch):
    db = scrum_db(monkeypatch)
    first = controller.create_story(project_id=PID, user_id=UID, fields={"title": "Login flow"})
    second = controller.create_story(project_id=PID, user_id=UID, fields={"title": "Logout"})
    assert (first["key"], second["key"]) == ("US-1", "US-2")
    assert first["reporter_id"] == UID
    assert [q["table"] for q in db.queries].count("rpc:scrum_next_key") == 2


def test_create_story_rejects_a_sprint_from_another_project(monkeypatch):
    db = scrum_db(monkeypatch, sprints=[dict(FOREIGN_SPRINT)])
    with pytest.raises(HTTPException) as e:
        controller.create_story(
            project_id=PID, user_id=UID, fields={"title": "x", "sprint_id": "s9"}
        )
    assert (e.value.status_code, e.value.detail) == (404, controller.SPRINT_NOT_FOUND)
    assert db.rows("user_stories") == []


def test_staff_cannot_create_a_story(monkeypatch):
    db = scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.create_story(project_id=PID, user_id=TA, fields={"title": "x"})
    assert e.value.status_code == 403
    assert db.rows("user_stories") == []


def test_create_task_rejects_an_unknown_tag(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    with pytest.raises(HTTPException) as e:
        controller.create_task(story_id="st1", user_id=UID, fields={"title": "x", "tags": ["yolo"]})
    assert e.value.status_code == 422
    assert db.rows("tasks") == []


def test_create_task_inherits_the_story_project_and_gets_a_task_key(monkeypatch):
    scrum_db(monkeypatch, user_stories=[dict(STORY)])
    out = controller.create_task(
        story_id="st1", user_id=UID, fields={"title": "x", "tags": ["backend"]}
    )
    assert (out["key"], out["project_id"], out["tags"]) == ("GT-1", PID, ["backend"])


def test_creating_a_task_in_a_sprint_reads_the_burnup_totals_once(monkeypatch):
    db = scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[dict(STORY, sprint_id="sp1", points=13)],
        tasks=[dict(TASK, status="done", points=2)],
    )
    controller.create_task(story_id="st1", user_id=UID, fields={"title": "x", "points": 1})
    [snap] = db.rows("sprint_burnup_days")
    # The tasks' points, the new one's included; the story's 13 count nowhere (spec D21).
    assert (snap["scope_points"], snap["completed_points"]) == (3, 2)
    # The story, the writer check, the key, the insert, then the sprint's stories with their
    # tasks embedded (one read) and the snapshot's upsert.
    assert [q["table"] for q in db.queries if q["op"] == "select"] == [
        "user_stories",
        "project_members",
        "user_stories",
    ]
    assert db.executes == 6


def test_create_task_writes_estimate_hours_and_never_the_legacy_text(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    controller.create_task(
        story_id="st1",
        user_id=UID,
        fields={"title": "t", "estimate_hours": 4, "time_estimate": "4h"},
    )
    [row] = db.rows("tasks")
    assert row["estimate_hours"] == 4
    assert "time_estimate" not in row


def test_update_task_clears_estimate_hours_with_an_explicit_null(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)], tasks=[dict(TASK, estimate_hours=4)])
    controller.update_task(task_id="t1", user_id=UID, fields={"estimate_hours": None})
    assert db.rows("tasks")[0]["estimate_hours"] is None


def test_story_writes_ignore_a_legacy_time_estimate(monkeypatch):
    """A story's hours are its tasks' sum: an old client's story estimate is not written."""
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    controller.create_story(
        project_id=PID, user_id=UID, fields={"title": "s", "time_estimate": "2d"}
    )
    out = controller.update_story(story_id="st1", user_id=UID, fields={"time_estimate": "2d"})
    assert out == STORY
    assert [s for s in db.rows("user_stories") if "time_estimate" in s] == []
    assert [q for q in db.queries if q["op"] == "update"] == []


def test_update_story_rejects_a_sprint_from_another_project(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)], sprints=[dict(FOREIGN_SPRINT)])
    with pytest.raises(HTTPException) as e:
        controller.update_story(story_id="st1", user_id=UID, fields={"sprint_id": "s9"})
    assert e.value.status_code == 404
    assert db.rows("user_stories")[0]["sprint_id"] is None


@pytest.mark.parametrize("target", ["sp1", None])
def test_update_story_sprint_write_clears_the_legacy_archive_flag(monkeypatch, target):
    """Moving a legacy archived story, to a sprint (its old one included) or to the backlog,
    normalises it: afterwards only sprint_id says where it is."""
    db = scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[dict(STORY, sprint_id="sp1", archived_at=ARCHIVED_AT)],
    )
    controller.update_story(story_id="st1", user_id=UID, fields={"sprint_id": target})
    stored = db.rows("user_stories")[0]
    assert stored["archived_at"] is None
    assert stored["sprint_id"] == target


def test_update_story_ignores_an_archived_field(monkeypatch):
    """The archive is gone: an old client or the catalog sending `archived` changes nothing."""
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    out = controller.update_story(story_id="st1", user_id=UID, fields={"archived": True})
    assert out == STORY
    assert "archived_at" not in db.rows("user_stories")[0]
    assert [q for q in db.queries if q["op"] == "update"] == []


def test_update_story_rejects_a_null_title(monkeypatch):
    scrum_db(monkeypatch, user_stories=[dict(STORY)])
    with pytest.raises(HTTPException) as e:
        controller.update_story(story_id="st1", user_id=UID, fields={"title": None})
    assert (e.value.status_code, e.value.detail) == (422, controller.TITLE_REQUIRED)


def test_update_story_404_when_missing(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.update_story(story_id="nope", user_id=UID, fields={"title": "x"})
    assert (e.value.status_code, e.value.detail) == (404, controller.STORY_NOT_FOUND)


def test_delete_task_removes_it(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)], tasks=[dict(TASK)])
    controller.delete_task(task_id="t1", user_id=UID)
    assert db.rows("tasks") == []


#: A burnup snapshot's four values, in this order.
SNAPSHOT = ("scope_points", "completed_points", "scope_hours", "completed_hours")


def _full_edit(**changes) -> dict:
    """What the web client's task editor sends on every save: each field, with TASK's values
    (t1 in _task_in_sprint) unless changed."""
    return {
        "title": "Endpoint",
        "description_md": None,
        "tags": [],
        "points": 3,
        "estimate_hours": 4,
        "assignee_id": None,
        "pr_url": TASK["pr_url"],
        **changes,
    }


def _task_in_sprint(monkeypatch, **story):
    """st1 in sp1 (``story`` changes it) holds t1 (3 points, 4 h, done) and t2 (2 points,
    6 h, to do)."""
    return scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[{**STORY, "sprint_id": "sp1", **story}],
        tasks=[
            dict(TASK, points=3, estimate_hours=4, status="done"),
            dict(TASK, id="t2", key="GT-2", points=2, estimate_hours=6),
        ],
    )


@pytest.mark.parametrize(
    ("fields", "values"),
    [
        ({"points": 5}, [7, 5, 10, 4]),
        ({"estimate_hours": None}, [5, 3, 6, 0]),
        (_full_edit(estimate_hours=8), [5, 3, 14, 8]),
    ],
)
def test_a_task_estimate_edit_snapshots_its_sprints_burnup(monkeypatch, fields, values):
    """A task's points and hours are its sprint's scope (spec D21), and the web client applies
    an edit to the board it holds without reloading it: the edit snapshots the sprint itself."""
    db = _task_in_sprint(monkeypatch)
    controller.update_task(task_id="t1", user_id=UID, fields=fields)
    [snap] = db.rows("sprint_burnup_days")
    assert [snap[k] for k in SNAPSHOT] == values
    # The task with its story's sprint embedded, the writer check and the update, then the
    # snapshot: the sprint's totals and the upsert. One snapshot, never two.
    assert db.executes == 5


@pytest.mark.parametrize(
    ("story", "fields"),
    [
        ({}, _full_edit(title="Renamed")),  # every field sent, no estimate changed
        ({"sprint_id": None}, {"points": 5}),  # a backlog task
        ({"archived_at": ARCHIVED_AT}, {"points": 5}),  # a legacy archived story counts nowhere
    ],
)
def test_a_task_edit_that_moves_no_burnup_line_takes_no_snapshot(monkeypatch, story, fields):
    db = _task_in_sprint(monkeypatch, **story)
    controller.update_task(task_id="t1", user_id=UID, fields=fields)
    assert db.rows("sprint_burnup_days") == []
    assert db.executes == 3  # the task with its story, the writer check, the update


def test_deleting_a_task_snapshots_its_sprints_burnup(monkeypatch):
    db = _task_in_sprint(monkeypatch)
    controller.delete_task(task_id="t1", user_id=UID)
    [snap] = db.rows("sprint_burnup_days")
    assert [snap[k] for k in SNAPSHOT] == [2, 0, 6, 0]  # t2 is all that is left
    # The task with its story's sprint embedded, the writer check and the delete, then the
    # snapshot: the sprint's totals and the upsert.
    assert db.executes == 5


@pytest.mark.parametrize(
    ("story", "task"),
    [
        ({"sprint_id": None}, {}),  # a backlog task
        ({"archived_at": ARCHIVED_AT}, {}),  # a legacy archived story counts nowhere
        ({}, {"points": None, "estimate_hours": None}),  # no estimate: no line moves
    ],
)
def test_deleting_a_task_that_moves_no_burnup_line_takes_no_snapshot(monkeypatch, story, task):
    db = _task_in_sprint(monkeypatch, **story)
    db.rows("tasks")[0].update(task)
    controller.delete_task(task_id="t1", user_id=UID)
    assert [t["id"] for t in db.rows("tasks")] == ["t2"]
    assert db.rows("sprint_burnup_days") == []
    assert db.executes == 3  # the task with its story, the writer check, the delete


def test_delete_story_removes_a_backlog_story(monkeypatch):
    # Postgres cascades the story's tasks, comments and moves (ON DELETE CASCADE); the fake
    # does not, so only the story row is asserted.
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    controller.delete_story(story_id="st1", user_id=UID)
    assert db.rows("user_stories") == []
    assert db.executes <= 3


def test_delete_story_removes_a_legacy_archived_story_whatever_its_sprint(monkeypatch):
    """The board lists an archived row in the backlog even while it names a sprint."""
    db = scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[dict(STORY, sprint_id="sp1", archived_at=ARCHIVED_AT)],
    )
    controller.delete_story(story_id="st1", user_id=UID)
    assert db.rows("user_stories") == []


def test_delete_story_refuses_a_story_in_a_sprint(monkeypatch):
    db = scrum_db(monkeypatch, sprints=[dict(SPRINT)], user_stories=[dict(STORY, sprint_id="sp1")])
    with pytest.raises(HTTPException) as e:
        controller.delete_story(story_id="st1", user_id=UID)
    assert (e.value.status_code, e.value.detail) == (409, controller.STORY_IN_SPRINT)
    assert [s["id"] for s in db.rows("user_stories")] == ["st1"]


def test_delete_story_404_when_missing(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.delete_story(story_id="nope", user_id=UID)
    assert (e.value.status_code, e.value.detail) == (404, controller.STORY_NOT_FOUND)


def test_pr_fields_fetch_failure_stores_a_null_state(monkeypatch):
    scrum_db(monkeypatch)
    monkeypatch.setattr(controller, "fetch_pr_state", lambda parsed, token: None)
    out = controller._pr_fields(get_client(), "https://github.com/o/r/pull/42", project_id=PID)
    assert out["pr_provider"] == "github"
    assert out["pr_state"] is None and out["pr_checked_at"] is None


def test_pr_fields_fetch_success_stamps_the_state(monkeypatch):
    scrum_db(monkeypatch)
    monkeypatch.setattr(controller, "fetch_pr_state", lambda parsed, token: "merged")
    out = controller._pr_fields(get_client(), "https://github.com/o/r/pull/42", project_id=PID)
    assert out["pr_state"] == "merged" and out["pr_checked_at"] is not None


def test_pr_fields_rejects_an_unknown_host(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller._pr_fields(
            get_client(), "https://gitlab.com/o/r/-/merge_requests/1", project_id=PID
        )
    assert e.value.status_code == 422


def test_update_task_skips_the_pr_fetch_when_the_url_is_unchanged(monkeypatch):
    scrum_db(monkeypatch, user_stories=[dict(STORY)], tasks=[dict(TASK)])
    calls = []
    monkeypatch.setattr(controller, "_pr_fields", lambda *a, **k: calls.append(1) or {})
    out = controller.update_task(task_id="t1", user_id=UID, fields={"pr_url": TASK["pr_url"]})
    assert calls == [] and out["id"] == "t1"
