"""Route registration + auth smoke tests for the scrum module."""

import pytest

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
    assert res.json()["task"]["status"] == "done"
    assert db.rows("tasks")[0]["status"] == "done"


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
