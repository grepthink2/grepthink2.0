"""Route registration + auth smoke tests for the scrum module."""

from tests.conftest import header_for
from tests.scrum_support import PID, UID, scrum_db

BOARD_URL = "/api/projects/00000000-0000-0000-0000-000000000001/scrum/board"


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
