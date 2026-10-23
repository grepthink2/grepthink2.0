"""The burnup counts tasks, in hours or in points (spec D21).

Scope is the sum of the sprint's task estimates in the unit and completed the same sum over its
done tasks; story points count nowhere. Points are available only when the sprint has a task and
every one of its tasks has points; hours always are, a task without hours counting zero. The board
draws points when it can, else hours, and ``?unit=`` picks another unit the sprint can draw (422
otherwise). Each day's snapshot keeps both units; a snapshot written before the hours columns
existed reads 0 hours, and the series takes it as no snapshot in hours.

Through the router, the real controller and a FakeSupabase with today pinned (``_today_la``), and
the pure helpers directly.
"""

from datetime import date

import pytest

from app.scrum import burnup, controller
from tests.conftest import header_for
from tests.scrum_support import PID, UID, scrum_db

TODAY = date(2026, 10, 22)
BOARD = f"/api/projects/{PID}/scrum/board"
#: Holds TODAY, its fourth day.
SPRINT = {
    "id": "SP",
    "project_id": PID,
    "name": "Sprint 2",
    "starts_at": "2026-10-19",
    "ends_at": "2026-10-25",
    "status": "planned",
}
#: Finished before TODAY.
EARLIER = {
    **SPRINT,
    "id": "SP0",
    "name": "Sprint 1",
    "starts_at": "2026-10-12",
    "ends_at": "2026-10-18",
}
UNIT_UNAVAILABLE = "Burnup unit not available for this sprint"


def _story(sid: str, sprint: str | None, **extra) -> dict:
    return {
        "id": sid,
        "project_id": PID,
        "key": f"US-{sid}",
        "title": sid,
        "sprint_id": sprint,
        "points": 13,  # story points: they reach no burnup
        "reporter_id": UID,
        "created_at": sid,
        "archived_at": None,
        **extra,
    }


def _task(tid: str, *, hours: int | None, points: int | None, status: str, story="S1") -> dict:
    return {
        "id": tid,
        "story_id": story,
        "project_id": PID,
        "key": f"GT-{tid}",
        "title": tid,
        "estimate_hours": hours,
        "points": points,
        "status": status,
        "reporter_id": UID,
        "tags": [],
        "created_at": tid,
    }


def _seed(monkeypatch, *, t2_points: int | None = None, **tables):
    """Story S1 in SPRINT holds T1 (4 h, 3 points, done) and T2 (6 h, ``t2_points``, to do).

    Neither the backlog story nor the story archived out of the sprint counts: their tasks have
    hours and no points, are done, and would change every number below if they did."""
    monkeypatch.setattr(controller, "_today_la", lambda: TODAY)
    seed = {
        "sprints": [dict(SPRINT)],
        "user_stories": [
            _story("S1", "SP"),
            _story("BL", None),
            _story("AR", "SP", archived_at="2026-10-20T00:00:00Z"),
        ],
        "tasks": [
            _task("T1", hours=4, points=3, status="done"),
            _task("T2", hours=6, points=t2_points, status="todo"),
            _task("TB", hours=8, points=None, status="done", story="BL"),
            _task("TA", hours=5, points=None, status="done", story="AR"),
        ],
    }
    return scrum_db(monkeypatch, **(seed | tables))


def _board(client, query: str = ""):
    return client.get(BOARD + query, headers=header_for("tony@ucsc.edu", sub=UID))


def _last(series: dict) -> tuple[int, int]:
    """Today's scope and completed: the values arrays stop at today."""
    return series["scope"][-1], series["completed"][-1]


# ------------------------------------------------------------------ the board ----


def test_a_task_without_points_puts_the_burnup_in_hours(monkeypatch, client):
    _seed(monkeypatch)
    res = _board(client)
    assert res.status_code == 200
    body = res.json()
    chart = body["burnup"]
    assert chart["unit"] == "hours"
    assert chart["units_available"] == ["hours"]
    assert chart["tasks_without_points"] == 1
    assert _last(chart["sprint"]) == (10, 4)
    # The picker's progress carries both units; the client shows the board's.
    [sprint] = body["sprints"]
    assert (sprint["progress"]["hours_done"], sprint["progress"]["hours_total"]) == (4, 10)
    assert sprint["progress"] == {
        "tasks_done": 1,
        "tasks_total": 2,
        "points_done": 3,
        "points_total": 3,  # T1's; T2 has none and S1's 13 story points count nowhere
        "hours_done": 4,
        "hours_total": 10,
    }


def test_points_on_every_task_put_the_burnup_in_points_and_hours_stay_available(
    monkeypatch, client
):
    _seed(monkeypatch, t2_points=5)
    chart = _board(client).json()["burnup"]
    assert chart["unit"] == "points"
    assert chart["units_available"] == ["points", "hours"]
    assert chart["tasks_without_points"] == 0
    assert _last(chart["sprint"]) == (8, 3)

    hours = _board(client, "?unit=hours").json()["burnup"]
    assert (hours["unit"], hours["units_available"]) == ("hours", ["points", "hours"])
    assert _last(hours["sprint"]) == (10, 4)

    points = _board(client, "?unit=points").json()["burnup"]
    assert (points["unit"], _last(points["sprint"])) == ("points", (8, 3))


@pytest.mark.parametrize(
    ("t2_points", "unit"),
    [
        (5, "speed"),  # no such unit
        (None, "points"),  # T2 has no points
    ],
)
def test_a_unit_the_sprint_cannot_draw_is_422(monkeypatch, client, t2_points, unit):
    db = _seed(monkeypatch, t2_points=t2_points)
    res = _board(client, f"?unit={unit}")
    assert res.status_code == 422
    assert res.json()["detail"] == UNIT_UNAVAILABLE == controller.UNIT_UNAVAILABLE
    # A refused load is not a view: no snapshot and no board_viewed event.
    assert db.rows("sprint_burnup_days") == []
    assert db.store["events"] == []


def test_a_board_without_sprints_draws_hours_and_counts_no_task(monkeypatch, client):
    monkeypatch.setattr(controller, "_today_la", lambda: TODAY)
    scrum_db(monkeypatch)
    chart = _board(client).json()["burnup"]
    assert {k: chart[k] for k in ("unit", "units_available", "tasks_without_points")} == {
        "unit": "hours",
        "units_available": ["hours"],
        "tasks_without_points": 0,
    }
    assert chart["sprint"] is None
    assert _board(client, "?unit=points").status_code == 422


def test_each_snapshot_keeps_both_units(monkeypatch, client):
    """The board's snapshot comes from the rows it loaded; a write's from the database."""
    db = _seed(monkeypatch)
    _board(client)
    values = ("scope_points", "completed_points", "scope_hours", "completed_hours")
    [snap] = db.rows("sprint_burnup_days")
    assert (snap["sprint_id"], snap["day"]) == ("SP", TODAY.isoformat())
    assert [snap[k] for k in values] == [3, 3, 10, 4]

    controller.move_task(task_id="T2", user_id=UID, to_status="done")
    [snap] = db.rows("sprint_burnup_days")
    assert [snap[k] for k in values] == [3, 3, 10, 10]


def test_days_before_the_first_snapshot_come_from_the_audit_in_the_unit(monkeypatch, client):
    """T1 was done on 10-20 (11:00 in Pacific time): its 4 hours, or its 3 points."""
    move = {
        "id": "mv1",
        "task_id": "T1",
        "from_status": "todo",
        "to_status": "done",
        "moved_by": UID,
        "moved_at": "2026-10-20T18:00:00Z",
    }
    _seed(monkeypatch, task_moves=[move])
    assert _board(client).json()["burnup"]["sprint"]["completed"] == [0, 4, 4, 4]

    _seed(monkeypatch, t2_points=5, task_moves=[move])
    assert _board(client).json()["burnup"]["sprint"]["completed"] == [0, 3, 3, 3]


def test_the_cumulative_line_adds_each_sprints_last_values_in_the_unit(monkeypatch, client):
    """The sprint shown adds its live values. A sprint not shown adds its last snapshot, or its
    live rows when it has none, or when that snapshot holds nothing in the unit: SP0's was written
    before the hours columns existed (4 points, 0 hours), and its live rows say 2 h and 1 point."""
    tables = {
        "sprints": [dict(EARLIER), dict(SPRINT)],
        "user_stories": [_story("S0", "SP0"), _story("S1", "SP")],
        "sprint_burnup_days": [
            {
                "sprint_id": "SP0",
                "day": "2026-10-18",
                "scope_points": 4,
                "completed_points": 4,
                "scope_hours": 0,
                "completed_hours": 0,
            }
        ],
    }
    t0 = _task("T0", hours=2, points=1, status="done", story="S0")
    t1 = _task("T1", hours=4, points=3, status="done")

    _seed(monkeypatch, tasks=[t0, t1, _task("T2", hours=6, points=None, status="todo")], **tables)
    hours = _board(client).json()["burnup"]
    assert hours["cumulative"]["labels"] == ["S1", "S2"]
    assert (hours["cumulative"]["scope"], hours["cumulative"]["completed"]) == ([2, 12], [2, 6])

    _seed(monkeypatch, tasks=[t0, t1, _task("T2", hours=6, points=5, status="todo")], **tables)
    points = _board(client).json()["burnup"]
    assert (points["cumulative"]["scope"], points["cumulative"]["completed"]) == ([4, 12], [4, 7])


def test_choosing_a_unit_costs_no_round_trip(monkeypatch, client):
    db = _seed(monkeypatch, t2_points=5)
    db.reset_counter()
    _board(client)
    default = db.executes
    db.reset_counter()
    _board(client, "?unit=hours")
    assert db.executes == default
    # access 1 + three concurrent rounds (5 + 2 + 2) + snapshot upsert 1 + audit read 1
    # + the board_viewed event insert 1, as tests/test_scrum_board.py pins
    assert default <= 13


# -------------------------------------------------------------------- helpers ----


def test_totals_count_tasks_and_never_story_points():
    story = {
        "points": 13,
        "tasks": [
            {"points": None, "estimate_hours": 2, "status": "todo"},
            {"points": None, "estimate_hours": None, "status": "done"},
        ],
    }
    totals = controller._totals([story], [story["tasks"][1]])
    assert totals.scope_points == 0
    assert totals == burnup.Totals(
        scope_points=0,
        completed_points=0,
        scope_hours=2,
        completed_hours=0,
        tasks_total=2,
        tasks_with_points=0,
    )


def test_totals_sum_both_units_over_the_tasks_and_their_done_ones():
    a = {"points": 3, "estimate_hours": 4, "status": "done"}
    b = {"points": 5, "estimate_hours": None, "status": "todo"}  # no hours: counts zero
    c = {"points": 2, "estimate_hours": 6, "status": "done"}
    totals = controller._totals([{"tasks": [a, b]}, {"tasks": [c]}], [a, c])
    assert totals == burnup.Totals(
        scope_points=10,
        completed_points=5,
        scope_hours=10,
        completed_hours=10,
        tasks_total=3,
        tasks_with_points=3,
    )


@pytest.mark.parametrize(
    ("points", "available"),
    [
        ([], ["hours"]),  # no task: nothing to draw in points
        ([3, None], ["hours"]),
        ([3, 5], ["points", "hours"]),
    ],
)
def test_points_are_available_only_when_every_task_has_them(points, available):
    tasks = [{"points": p, "estimate_hours": 1, "status": "todo"} for p in points]
    totals = controller._totals([{"tasks": tasks}], [])
    assert burnup.units_available(totals) == available
    assert burnup.default_unit(totals) == available[0]  # points when available, else hours


def test_sprint_progress_reports_both_units():
    tasks = [
        {"points": 3, "estimate_hours": 4, "status": "done"},
        {"points": None, "estimate_hours": 6, "status": "in_progress"},
    ]
    assert controller._sprint_progress([{"points": 13, "tasks": tasks}]) == {
        "tasks_done": 1,
        "tasks_total": 2,
        "points_done": 3,
        "points_total": 3,
        "hours_done": 4,
        "hours_total": 10,
    }


#: Written before the hours columns existed: 0 hours whatever the day held.
PRE_MIGRATION = {
    "day": "2026-10-20",
    "scope_points": 8,
    "completed_points": 3,
    "scope_hours": 0,
    "completed_hours": 0,
}


def _series(snapshots: list[dict], unit: str, live: tuple[int, int], **kwargs) -> dict:
    return burnup.build_sprint_series(
        snapshots=snapshots,
        starts_at=date(2026, 10, 19),
        ends_at=date(2026, 10, 25),
        today=TODAY,
        live_scope=live[0],
        live_completed=live[1],
        unit=unit,
        **kwargs,
    )


def test_a_snapshot_from_before_the_hours_columns_is_no_snapshot_in_hours():
    out = _series([PRE_MIGRATION], "hours", (10, 4))
    assert out["scope"] == [0, 0, 0, 10]  # carried forward from nothing, then today's live
    assert out["completed"] == [0, 0, 0, 4]
    # In points the same row is a snapshot like any other.
    out = _series([PRE_MIGRATION], "points", (8, 3))
    assert (out["scope"], out["completed"]) == ([0, 8, 8, 8], [0, 3, 3, 3])


def test_the_day_before_carries_forward_through_a_snapshot_missing_the_unit():
    """Read as 0 hours, the row would drop both lines to zero for a day. Skipped, it lets the
    day before carry forward, or the task_moves audit fill the completed line."""
    before = {
        "day": "2026-10-19",
        "scope_points": 8,
        "completed_points": 0,
        "scope_hours": 10,
        "completed_hours": 0,
    }
    out = _series([before, PRE_MIGRATION], "hours", (10, 4))
    assert (out["scope"], out["completed"]) == ([10, 10, 10, 10], [0, 0, 0, 4])
    out = _series([before, PRE_MIGRATION], "hours", (10, 4), completed_by_day={"2026-10-20": 4})
    assert out["completed"] == [0, 4, 4, 4]

    # The same rule the other way round: no points that day, while hours were taken.
    hours_only = {**PRE_MIGRATION, "scope_points": 0, "completed_points": 0, "scope_hours": 10}
    out = _series([before, hours_only], "points", (8, 3))
    assert out["scope"] == [8, 8, 8, 8]

    # A day whose four values are all 0 is a real zero, not a missing snapshot.
    zero = {**PRE_MIGRATION, "scope_points": 0, "completed_points": 0}
    out = _series([before, zero], "hours", (10, 4))
    assert out["scope"] == [10, 0, 0, 10]


def test_the_cumulative_series_reads_the_unit():
    sprints = [
        {
            "final": {
                "scope_points": 10,
                "completed_points": 9,
                "scope_hours": 20,
                "completed_hours": 18,
            }
        },
        {
            "final": {
                "scope_points": 8,
                "completed_points": 3,
                "scope_hours": 12,
                "completed_hours": 4,
            }
        },
    ]
    hours = burnup.build_cumulative_series(sprints, unit="hours")
    assert (hours["labels"], hours["scope"], hours["completed"]) == (
        ["S1", "S2"],
        [20, 32],
        [18, 22],
    )
    points = burnup.build_cumulative_series(sprints, unit="points")
    assert (points["scope"], points["completed"]) == ([10, 18], [9, 12])
