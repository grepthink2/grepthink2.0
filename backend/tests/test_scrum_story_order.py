"""Stories' priority order: the board lists a sprint's stories, and the backlog, by rank and then
by key, and PUT /api/projects/{project_id}/scrum/stories/order sets one list's ranks."""

from datetime import date

from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import PID, UID, pin_today, scrum_db

TODAY = date(2026, 9, 10)
SPRINT = {
    "id": "sp1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-09-07",
    "ends_at": "2026-09-20",  # holds TODAY
    "status": "planned",
}
BOARD_URL = f"/api/projects/{PID}/scrum/board"


def _story(sid: str, key: str, sprint: str | None, created: str, **extra) -> dict:
    return {
        "id": sid,
        "project_id": PID,
        "key": key,
        "title": key,
        "sprint_id": sprint,
        "reporter_id": UID,
        "created_at": created,
        "archived_at": None,
        **extra,
    }


def test_the_board_lists_ranked_stories_first_then_the_rest_by_key(monkeypatch):
    """In the sprint and in the backlog alike. The stories were created in another order, which
    the board used to keep."""
    pin_today(monkeypatch, TODAY)
    scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            _story("a", "US-10", "sp1", "1"),
            _story("b", "US-2", "sp1", "2", rank=2),
            _story("c", "US-1", "sp1", "3"),
            _story("d", "US-9", "sp1", "4"),
            _story("e", "US-3", "sp1", "5", rank=1),
            _story("f", "US-12", None, "6"),
            _story("g", "US-11", None, "7", rank=1),
            _story("h", "US-5", "sp1", "8", archived_at="2026-09-01T00:00:00Z"),  # legacy: backlog
            _story("i", "US-4", None, "9"),
        ],
        tasks=[],
    )

    board = controller.get_board(project_id=PID, user_id=UID, sprint_id=None)

    assert [s["key"] for s in board["stories"]] == ["US-3", "US-2", "US-1", "US-9", "US-10"]
    assert [s["key"] for s in board["backlog"]] == ["US-11", "US-4", "US-5", "US-12"]


def test_board_stories_carry_their_rank_and_criteria(monkeypatch, client):
    """A row from a database without the two columns reads as unranked, with no criteria."""
    pin_today(monkeypatch, TODAY)
    scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            _story("a", "US-1", "sp1", "1", rank=1, acceptance_criteria=["Finds a trail by name"]),
            _story("b", "US-2", None, "2"),
        ],
        tasks=[],
    )

    body = client.get(BOARD_URL, headers=header_for("tony@ucsc.edu", sub=UID)).json()

    [story] = body["stories"]
    assert (story["rank"], story["acceptance_criteria"]) == (1, ["Finds a trail by name"])
    [backlog] = body["backlog"]
    assert (backlog["rank"], backlog["acceptance_criteria"]) == (None, [])
