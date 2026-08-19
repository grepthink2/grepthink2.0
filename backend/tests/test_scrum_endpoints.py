"""Route registration + auth smoke tests for the scrum module."""


def test_board_requires_auth(client):
    res = client.get("/api/projects/00000000-0000-0000-0000-000000000001/scrum/board")
    assert res.status_code == 401


def test_board_rejects_bad_token(client):
    res = client.get(
        "/api/projects/00000000-0000-0000-0000-000000000001/scrum/board",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert res.status_code == 401


def test_move_route_wired(client, auth_header):
    from unittest.mock import patch
    task = {"id": "00000000-0000-0000-0000-000000000002", "story_id": "s", "key": "GT-1",
            "title": "t", "status": "done", "reporter_id": "r", "tags": []}
    with patch("app.scrum.views.controller.move_task", return_value={"task": task, "move": None}):
        res = client.post(
            "/api/scrum/tasks/00000000-0000-0000-0000-000000000002/move",
            headers=auth_header, json={"to_status": "done"},
        )
    assert res.status_code == 200
    assert res.json()["task"]["status"] == "done"
