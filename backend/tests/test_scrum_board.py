"""The board end to end: GET through the router, the real controller, and a FakeSupabase.

Pins the response shape, the burnup numbers, the statuses, and a round-trip budget that
does not grow with the number of sprints (their burnup totals come from rows the board
already read, not from a query per sprint).
"""

from datetime import date

from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import CLASS, OUTSIDER, PID, UID, scrum_db

TODAY = date(2026, 9, 10)
URL = f"/api/projects/{PID}/scrum/board"


def _sprint(sid, name, starts, ends):
    """Stored ``planned``, the column's default: the status comes from the dates."""
    return {
        "id": sid,
        "project_id": PID,
        "name": name,
        "starts_at": starts,
        "ends_at": ends,
        "status": "planned",
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
            _sprint("S1", "Sprint 1", "2026-08-10", "2026-08-23"),
            _sprint("S2", "Sprint 2", "2026-09-07", "2026-09-20"),  # holds TODAY
            _sprint("S3", "Sprint 3", "2026-09-21", "2026-10-04"),
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
            _task(
                "b1",
                "B",
                5,
                "done",
                "3",
                moved_by=UID,
                moved_at="2026-09-08T18:00:00Z",
                estimate_hours=3,
            ),
            _task("b2", "B", 3, "in_progress", "4", estimate_hours=2),
            _task("d1", "D", 2, "done", "6"),  # on the backlog story: counted nowhere
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
        # b2 depends on b1 (same sprint) and on d1 (a backlog task).
        task_dependencies=[
            {"task_id": "b2", "depends_on_task_id": "b1", "project_id": PID},
            {"task_id": "b2", "depends_on_task_id": "d1", "project_id": PID},
        ],
    )


def _ref(tid, story, sprint, status):
    return {
        "id": tid,
        "key": f"GT-{tid}",
        "title": tid,
        "status": status,
        "story_id": story,
        "story_key": f"US-{story}",
        "sprint_id": sprint,
    }


def test_board_shape_and_burnup(monkeypatch, client):
    db = _seed(monkeypatch)
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    body = res.json()

    assert body["access"] == "member" and body["ai_enabled"] is False
    assert body["sprint_id"] == "S2"  # the sprint holding TODAY
    assert [s["id"] for s in body["stories"]] == ["B"]
    assert [s["id"] for s in body["backlog"]] == ["D", "E"]  # unscheduled + archived
    [story] = body["stories"]
    assert story["comment_count"] == 1
    b1 = next(t for t in story["tasks"] if t["id"] == "b1")
    assert (b1["comment_count"], b1["moved_by_name"]) == (1, "Tony Wu")
    assert body["members"] == [
        {"user_id": UID, "name": "Tony Wu", "image_url": None, "project_role": "owner"}
    ]

    # A story's hours are the sum of its tasks' (B: 3 + 2); none of D's tasks has any.
    by_key = {s["key"]: s for s in body["stories"]}
    assert by_key["US-B"]["estimate_hours"] == 5
    assert {s["key"]: s["estimate_hours"] for s in body["backlog"]}["US-D"] is None

    # Live stories only: E is archived, D is backlog (its done task counts nowhere).
    assert {s["id"]: s["progress"] for s in body["sprints"]} == {
        "S1": {"tasks_done": 1, "tasks_total": 2, "points_done": 3, "points_total": 5},
        "S2": {"tasks_done": 1, "tasks_total": 2, "points_done": 5, "points_total": 8},
        "S3": {"tasks_done": 0, "tasks_total": 0, "points_done": 0, "points_total": 3},
    }

    # Per sprint (scope, completed): S1 (5, 3), S2 (8, 5; E is archived), S3 (3, 0).
    assert body["burnup"]["cumulative"]["scope"] == [5, 13, 16]
    assert body["burnup"]["cumulative"]["completed"] == [3, 8, 8]
    # Snapshots started late, so past days come from the task_moves audit.
    assert body["burnup"]["sprint"]["completed"][:4] == [0, 5, 5, 5]
    [snap] = db.rows("sprint_burnup_days")
    assert (snap["sprint_id"], snap["day"]) == ("S2", TODAY.isoformat())
    assert (snap["scope_points"], snap["completed_points"]) == (8, 5)


def test_board_names_each_tasks_dependencies_both_ways(monkeypatch, client):
    _seed(monkeypatch)
    body = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID)).json()
    tasks = {t["id"]: t for s in body["stories"] + body["backlog"] for t in s["tasks"]}

    # In the edges' order; a backlog dependency has no sprint.
    assert tasks["b2"]["depends_on"] == [
        _ref("b1", "B", "S2", "done"),
        _ref("d1", "D", None, "done"),
    ]
    assert tasks["b1"]["blocks"] == tasks["d1"]["blocks"] == [_ref("b2", "B", "S2", "in_progress")]
    assert (tasks["b1"]["depends_on"], tasks["b2"]["blocks"]) == ([], [])

    # Every task of the project for the picker, a2 (in completed S1, not on this board)
    # included. Keys whose tail is not a number sort as text.
    assert [t["id"] for t in body["task_index"]] == ["a1", "a2", "b1", "b2", "d1"]
    assert body["task_index"][0] == _ref("a1", "A", "S1", "done")


def test_the_task_index_puts_keys_in_number_order():
    keys = ["GT-10", "GT-a1", "GT-2", "T-1", "GT-1"]
    assert sorted(keys, key=controller._key_order) == ["GT-1", "T-1", "GT-2", "GT-10", "GT-a1"]


def test_board_round_trips_do_not_grow_with_sprints(monkeypatch, client):
    db = _seed(monkeypatch)
    db.reset_counter()
    client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    # access 1 + three concurrent rounds (5 + 2 + 2) + snapshot upsert 1 + audit read 1
    # + the board_viewed event insert 1; round 1 reads the project's dependency edges
    assert db.executes <= 13


def test_board_is_403_for_an_outsider_and_404_for_no_project(monkeypatch, client):
    db = _seed(monkeypatch)
    res = client.get(URL, headers=header_for("x@ucsc.edu", sub=OUTSIDER))
    assert res.status_code == 403
    res = client.get(
        "/api/projects/00000000-0000-0000-0000-00000000dead/scrum/board",
        headers=header_for("x@ucsc.edu", sub=OUTSIDER),
    )
    assert res.status_code == 404
    assert db.store["events"] == []  # a refused load records no view


def test_an_unknown_sprint_is_404(monkeypatch, client):
    db = _seed(monkeypatch)
    res = client.get(f"{URL}?sprint_id=nope", headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 404
    assert db.store["events"] == []  # a refused load records no view


def test_loading_the_board_records_a_board_viewed_event(monkeypatch, client):
    db = _seed(monkeypatch)
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    assert "class_id" not in res.json()["project"]  # loaded for the event, never sent
    rows = [e for e in db.store["events"] if e["kind"] == "board_viewed"]
    assert len(rows) == 1
    assert {k: v for k, v in rows[0].items() if k != "id"} == {
        "kind": "board_viewed",
        "actor_id": UID,
        "class_id": CLASS,
        "project_id": PID,
        "meta": {},
    }
