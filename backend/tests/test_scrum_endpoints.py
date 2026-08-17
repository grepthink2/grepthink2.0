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


def test_move_route_exists(client, auth_header):
    res = client.post(
        "/api/scrum/tasks/00000000-0000-0000-0000-000000000002/move",
        headers=auth_header, json={"to_status": "done"},
    )
    assert res.status_code == 501  # stub until Task B6
