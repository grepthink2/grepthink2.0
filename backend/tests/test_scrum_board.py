"""Board GET shape via TestClient with the controller mocked."""
from unittest.mock import patch

BOARD = {
    "project": {"id": "p1", "name": "GrepThink 2.0", "estimate_scale": "fibonacci"},
    "ai_enabled": False,
    "sprints": [{"id": "s1", "name": "Sprint 1", "starts_at": "2026-08-10",
                 "ends_at": "2026-08-23", "status": "active"}],
    "sprint_id": "s1",
    "stories": [], "backlog": [],
    "burnup": {"sprint": {"labels": [], "scope": [], "completed": [], "subtitle": None},
               "cumulative": {"labels": ["S1"], "scope": [0], "completed": [0], "subtitle": None}},
    "members": [], "access": "member",
}


@patch("app.scrum.views.controller.get_board", return_value=BOARD)
def test_get_board_shape(_get, client, auth_header):
    res = client.get("/api/projects/p1/scrum/board", headers=auth_header)
    assert res.status_code == 200
    body = res.json()
    assert body["project"]["estimate_scale"] == "fibonacci"
    assert body["access"] == "member" and body["ai_enabled"] is False
