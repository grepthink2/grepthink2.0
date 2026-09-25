"""The board end to end: GET through the router, the real controller, and a FakeSupabase.

Pins the response shape, the burnup numbers, the statuses, and a round-trip budget that
does not grow with the number of sprints (their burnup totals come from rows the board
already read, not from a query per sprint).
"""

from datetime import date

from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import OUTSIDER, PID, UID, scrum_db

TODAY = date(2026, 9, 10)
URL = f"/api/projects/{PID}/scrum/board"


def _sprint(sid, name, starts, ends, status):
    return {
        "id": sid,
        "project_id": PID,
        "name": name,
        "starts_at": starts,
        "ends_at": ends,
        "status": status,
    }


def _story(sid, sprint, points, created, **extra):
    return {
        "id": sid,
        "project_id": PID,
        "key": f"US-{sid}",
        "title": sid,
        "sprint_id": sprint,
        "points": points,
        "reporter_id": UID,
        "created_at": created,
        "archived_at": None,
        **extra,
    }


def _task(tid, story, points, status, created, **extra):
    return {
        "id": tid,
        "story_id": story,
        "project_id": PID,
        "key": f"GT-{tid}",
        "title": tid,
        "points": points,
        "status": status,
        "reporter_id": UID,
        "tags": [],
        "created_at": created,
        **extra,
    }


def _seed(monkeypatch):
    """Three sprints and none of them has a burnup snapshot yet: the worst case for a
    board that used to query each sprint's totals separately."""
    monkeypatch.setattr(controller, "_today_la", lambda: TODAY)
    return scrum_db(
        monkeypatch,
        sprints=[
            _sprint("S1", "Sprint 1", "2026-08-10", "2026-08-23", "completed"),
            _sprint("S2", "Sprint 2", "2026-09-07", "2026-09-20", "active"),
            _sprint("S3", "Sprint 3", "2026-09-21", "2026-10-04", "planned"),
        ],
        user_stories=[
            _story("A", "S1", 5, "1"),
            _story("B", "S2", 8, "2"),
            _story("C", "S3", 3, "3"),
            _story("D", None, 2, "4"),  # backlog
            _story("E", "S2", 13, "5", archived_at="2026-09-09T00:00:00Z"),  # archived
        ],
        tasks=[
            _task("a1", "A", 3, "done", "1"),
            _task("a2", "A", 2, "todo", "2"),
            _task("b1", "B", 5, "done", "3", moved_by=UID, moved_at="2026-09-08T18:00:00Z"),
            _task("b2", "B", 3, "in_progress", "4"),
        ],
        task_moves=[
            {
                "id": "mv1",
                "task_id": "b1",
                "from_status": "todo",
                "to_status": "done",
                "moved_by": UID,
                "moved_at": "2026-09-08T18:00:00Z",
            },
        ],
        scrum_comments=[
            {"id": "c1", "story_id": "B", "task_id": None},
            {"id": "c2", "story_id": None, "task_id": "b1"},
        ],
    )


def test_board_shape_and_burnup(monkeypatch, client):
    db = _seed(monkeypatch)
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    body = res.json()

    assert body["access"] == "member" and body["ai_enabled"] is False
    assert body["sprint_id"] == "S2"  # the active sprint
    assert [s["id"] for s in body["stories"]] == ["B"]
    assert [s["id"] for s in body["backlog"]] == ["D", "E"]  # unscheduled + archived
    [story] = body["stories"]
    assert story["comment_count"] == 1
    b1 = next(t for t in story["tasks"] if t["id"] == "b1")
    assert (b1["comment_count"], b1["moved_by_name"]) == (1, "Tony Wu")
    assert body["members"] == [
        {"user_id": UID, "name": "Tony Wu", "image_url": None, "project_role": "owner"}
    ]

    # Per sprint (scope, completed): S1 (5, 3), S2 (8, 5; E is archived), S3 (3, 0).
    assert body["burnup"]["cumulative"]["scope"] == [5, 13, 16]
    assert body["burnup"]["cumulative"]["completed"] == [3, 8, 8]
    # Snapshots started late, so past days come from the task_moves audit.
    assert body["burnup"]["sprint"]["completed"][:4] == [0, 5, 5, 5]
    [snap] = db.rows("sprint_burnup_days")
    assert (snap["sprint_id"], snap["day"]) == ("S2", TODAY.isoformat())
    assert (snap["scope_points"], snap["completed_points"]) == (8, 5)


def test_board_round_trips_do_not_grow_with_sprints(monkeypatch, client):
    db = _seed(monkeypatch)
    db.reset_counter()
    client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    # access 1 + three concurrent rounds (4 + 2 + 2) + snapshot upsert 1 + audit read 1
    assert db.executes <= 11


def test_board_is_403_for_an_outsider_and_404_for_no_project(monkeypatch, client):
    _seed(monkeypatch)
    res = client.get(URL, headers=header_for("x@ucsc.edu", sub=OUTSIDER))
    assert res.status_code == 403
    res = client.get(
        "/api/projects/00000000-0000-0000-0000-00000000dead/scrum/board",
        headers=header_for("x@ucsc.edu", sub=OUTSIDER),
    )
    assert res.status_code == 404


def test_an_unknown_sprint_is_404(monkeypatch, client):
    _seed(monkeypatch)
    res = client.get(f"{URL}?sprint_id=nope", headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 404
