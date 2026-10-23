"""Route registration + auth smoke tests for the scrum module."""

from datetime import date

import pytest

from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import PID, UID, scrum_db

BOARD_URL = "/api/projects/00000000-0000-0000-0000-000000000001/scrum/board"
#: A backlog story, with the columns a story response needs.
STORY = {
    "id": "st1",
    "project_id": PID,
    "key": "US-1",
    "title": "Search",
    "sprint_id": None,
    "reporter_id": UID,
}


def _seed_story(monkeypatch):
    """Backlog story ``st1``. The fake applies no column defaults, so task inserts get
    ``status`` here the way Postgres' DEFAULT 'todo' fills it (a task response needs it)."""
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    table = db.table

    def table_with_task_status_default(name):
        query = table(name)
        if name == "tasks":
            insert = query.insert
            query.insert = lambda payload: insert({"status": "todo", **payload})
        return query

    monkeypatch.setattr(db, "table", table_with_task_status_default)
    return db


def test_board_requires_auth(client):
    assert client.get(BOARD_URL).status_code == 401


def test_board_rejects_a_bad_token(client):
    res = client.get(BOARD_URL, headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


def test_move_route_runs_the_move(monkeypatch, client):
    db = scrum_db(
        monkeypatch,
        user_stories=[{"id": "st1", "project_id": PID, "key": "US-1", "sprint_id": None}],
        tasks=[
            {
                "id": "t1",
                "story_id": "st1",
                "project_id": PID,
                "key": "GT-1",
                "title": "t",
                "status": "todo",
                "reporter_id": UID,
                "tags": [],
            }
        ],
    )
    res = client.post(
        "/api/scrum/tasks/t1/move",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"to_status": "done"},
    )
    assert res.status_code == 200
    # The moved task itself, not wrapped in {message, task}.
    assert (res.json()["status"], res.json()["moved_by_name"]) == ("done", "Tony Wu")
    assert "message" not in res.json()
    assert db.rows("tasks")[0]["status"] == "done"


@pytest.mark.parametrize(("parent", "parent_id"), [("stories", "st1"), ("tasks", "t1")])
def test_posting_a_comment_answers_the_comment(monkeypatch, client, parent, parent_id):
    db = scrum_db(
        monkeypatch,
        user_stories=[dict(STORY)],
        tasks=[{"id": "t1", "story_id": "st1", "project_id": PID, "key": "GT-1"}],
    )
    # Postgres fills scrum_comments.created_at (DEFAULT now()); a comment response needs it.
    db.triggers[("scrum_comments", "insert")] = lambda _db, row: row.setdefault(
        "created_at", "2026-10-21T00:00:00+00:00"
    )
    res = client.post(
        f"/api/scrum/{parent}/{parent_id}/comments",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"body_md": "Looks good"},
    )
    assert res.status_code == 200
    body = res.json()
    assert (body["body_md"], body["author_name"]) == ("Looks good", "Tony Wu")
    assert not {"message", "comment"} & set(body)


def test_the_sprint_routes_answer_the_sprint_itself(monkeypatch, client):
    """Creating and updating a sprint answer the sprint, with the status of its dates, not
    wrapped in {message, sprint}."""
    monkeypatch.setattr(controller, "_today_la", lambda: date(2026, 10, 22))
    db = scrum_db(monkeypatch)
    headers = header_for("tony@ucsc.edu", sub=UID)
    dates = {"starts_at": "2026-10-19", "ends_at": "2026-11-01"}

    res = client.post(
        f"/api/projects/{PID}/scrum/sprints", headers=headers, json={"name": "Sprint 1", **dates}
    )
    assert res.status_code == 200
    [row] = db.rows("sprints")
    assert res.json() == {"id": row["id"], "name": "Sprint 1", **dates, "status": "active"}

    res = client.patch(f"/api/scrum/sprints/{row['id']}", headers=headers, json={"name": "Kickoff"})
    assert res.status_code == 200
    assert res.json() == {"id": row["id"], "name": "Kickoff", **dates, "status": "active"}


def test_the_story_and_task_edit_routes_answer_the_row_itself(monkeypatch, client):
    """Editing a story or a task answers the story or the task, not wrapped in {message, story}
    or {message, task} (STYLE_GUIDE.md, Response Format)."""
    db = scrum_db(
        monkeypatch,
        user_stories=[dict(STORY)],
        tasks=[
            {
                "id": "t1",
                "story_id": "st1",
                "project_id": PID,
                "key": "GT-1",
                "title": "Index",
                "status": "todo",
                "reporter_id": UID,
                "tags": [],
            }
        ],
    )
    headers = header_for("tony@ucsc.edu", sub=UID)

    res = client.patch("/api/scrum/stories/st1", headers=headers, json={"title": "Find a ride"})
    assert res.status_code == 200
    story = res.json()
    assert (story["id"], story["key"], story["title"]) == ("st1", "US-1", "Find a ride")
    assert not {"message", "story"} & set(story)
    assert db.rows("user_stories")[0]["title"] == "Find a ride"

    res = client.patch("/api/scrum/tasks/t1", headers=headers, json={"title": "Index rides"})
    assert res.status_code == 200
    task = res.json()
    assert (task["id"], task["key"], task["title"]) == ("t1", "GT-1", "Index rides")
    assert not {"message", "task"} & set(task)
    assert db.rows("tasks")[0]["title"] == "Index rides"


def test_a_blocked_move_answers_409_with_its_code(monkeypatch, client):
    """The web client keys its refresh on the code; an API consumer can too."""
    task = {"story_id": "st1", "project_id": PID, "title": "t", "reporter_id": UID, "tags": []}
    db = scrum_db(
        monkeypatch,
        user_stories=[{"id": "st1", "project_id": PID, "key": "US-1", "sprint_id": None}],
        tasks=[
            {**task, "id": "t1", "key": "GT-1", "status": "todo"},
            {**task, "id": "t2", "key": "GT-2", "status": "in_progress"},
        ],
        task_dependencies=[{"task_id": "t1", "depends_on_task_id": "t2", "project_id": PID}],
    )
    res = client.post(
        "/api/scrum/tasks/t1/move",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"to_status": "in_progress"},
    )
    assert res.status_code == 409
    assert res.json() == {"detail": controller.TASK_BLOCKED, "code": "task_blocked"}
    assert db.rows("task_moves") == []


def test_delete_story_route_answers_204(monkeypatch, client):
    db = scrum_db(
        monkeypatch,
        user_stories=[{"id": "st1", "project_id": PID, "key": "US-1", "sprint_id": None}],
    )
    res = client.delete("/api/scrum/stories/st1", headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 204
    assert res.content == b""
    assert db.rows("user_stories") == []


@pytest.mark.parametrize("hours", [0, 16, 2.5, "4h"])
def test_task_estimate_outside_whole_hours_1_to_15_is_422(monkeypatch, client, hours):
    db = _seed_story(monkeypatch)
    res = client.post(
        "/api/scrum/stories/st1/tasks",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"title": "t", "estimate_hours": hours},
    )
    assert res.status_code == 422
    assert db.rows("tasks") == []


def test_task_estimate_of_15_is_accepted(monkeypatch, client):
    db = _seed_story(monkeypatch)
    res = client.post(
        "/api/scrum/stories/st1/tasks",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"title": "t", "estimate_hours": 15},
    )
    assert res.status_code == 200
    assert res.json()["task"]["estimate_hours"] == 15
    assert db.rows("tasks")[0]["estimate_hours"] == 15


def test_story_update_still_accepts_a_legacy_time_estimate_key(monkeypatch, client):
    """An older client may still send the story estimate; it is not refused, and not stored."""
    db = _seed_story(monkeypatch)
    res = client.patch(
        "/api/scrum/stories/st1",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"time_estimate": "2d"},
    )
    assert res.status_code == 200
    assert "time_estimate" not in db.rows("user_stories")[0]
