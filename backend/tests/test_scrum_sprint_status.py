"""Sprint status follows the calendar (spec D22): through the router, the real controller and a
FakeSupabase, with today pinned (``_today_la``, the Pacific calendar day).

A sprint is ``planned`` before ``starts_at``, ``active`` from ``starts_at`` through ``ends_at`` and
``completed`` after it, whatever the stored ``sprints.status`` says. Every sprint here is stored
``planned``, the column's default, which nothing flips for the sprints a class schedule creates.
Without a ``sprint_id`` the board opens on today's sprint, else the latest one that has started,
else the first, and the project page's summary shows the same one. The update route takes no
status: one sent by an old client is ignored.
"""

from datetime import UTC, date, datetime

import pytest
from fastapi import HTTPException

from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import PID, UID, scrum_db

BOARD = f"/api/projects/{PID}/scrum/board"
SUMMARY = f"/api/projects/{PID}/scrum/summary"


def _sprint(sid: str, starts: str, ends: str) -> dict:
    return {
        "id": sid,
        "project_id": PID,
        "name": f"Sprint {sid}",
        "starts_at": starts,
        "ends_at": ends,
        "status": "planned",
    }


A = _sprint("A", "2026-10-01", "2026-10-14")
B = _sprint("B", "2026-10-15", "2026-10-28")
C = _sprint("C", "2026-10-29", "2026-11-11")

#: (today, the statuses of A, B and C, the sprint the board opens on)
CALENDAR = [
    (date(2026, 10, 22), ["completed", "active", "planned"], "B"),
    (date(2026, 11, 20), ["completed", "completed", "completed"], "C"),  # after them all: the last
    (date(2026, 9, 1), ["planned", "planned", "planned"], "A"),  # before them all: the first
    # A sprint is active through its last day and completed the day after.
    (date(2026, 10, 14), ["active", "planned", "planned"], "A"),
    (date(2026, 10, 15), ["completed", "active", "planned"], "B"),
    (date(2026, 10, 28), ["completed", "active", "planned"], "B"),
    (date(2026, 10, 29), ["completed", "completed", "active"], "C"),
]


def _seed(monkeypatch, today: date):
    monkeypatch.setattr("app.scrum.controller._today_la", lambda: today)
    return scrum_db(monkeypatch, sprints=[dict(A), dict(B), dict(C)])


def _headers() -> dict[str, str]:
    return header_for("tony@ucsc.edu", sub=UID)


def _get(client, url: str) -> dict:
    res = client.get(url, headers=_headers())
    assert res.status_code == 200
    return res.json()


@pytest.mark.parametrize(("today", "statuses", "opens_on"), CALENDAR)
def test_the_board_takes_each_status_from_the_dates_and_opens_on_todays_sprint(
    monkeypatch, client, today, statuses, opens_on
):
    _seed(monkeypatch, today)
    body = _get(client, BOARD)
    assert [(s["id"], s["status"]) for s in body["sprints"]] == list(
        zip("ABC", statuses, strict=True)
    )
    assert body["sprint_id"] == opens_on


@pytest.mark.parametrize(("today", "statuses", "opens_on"), CALENDAR)
def test_the_summary_shows_the_boards_sprint_with_the_same_status(
    monkeypatch, client, today, statuses, opens_on
):
    _seed(monkeypatch, today)
    board = _get(client, BOARD)
    shown = next(s for s in board["sprints"] if s["id"] == board["sprint_id"])
    sprint = _get(client, SUMMARY)["sprint"]
    assert (sprint["id"], sprint["status"]) == (shown["id"], shown["status"])
    assert (sprint["id"], sprint["status"]) == (opens_on, statuses["ABC".index(opens_on)])


@pytest.mark.parametrize(
    ("instant", "statuses"),
    [
        # Already 10-29 in UTC, still the evening of 10-28 in Pacific time: B's last day.
        (datetime(2026, 10, 29, 3, tzinfo=UTC), ["completed", "active", "planned"]),
        # Past midnight in Pacific time as well.
        (datetime(2026, 10, 29, 9, tzinfo=UTC), ["completed", "completed", "active"]),
    ],
)
def test_a_sprint_ends_at_midnight_pacific_time(monkeypatch, client, instant, statuses):
    """Today is the Pacific calendar day (``_today_la``), not the UTC one. Each instant falls on
    the same Pacific day at UTC-7 or UTC-8, so no daylight-time rule decides the outcome."""

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return instant.astimezone(tz)

    monkeypatch.setattr(controller, "datetime", Clock)
    scrum_db(monkeypatch, sprints=[dict(A), dict(B), dict(C)])
    assert [s["status"] for s in _get(client, BOARD)["sprints"]] == statuses


def test_a_status_sent_to_the_update_route_is_ignored(monkeypatch, client):
    db = _seed(monkeypatch, date(2026, 10, 22))
    res = client.patch("/api/scrum/sprints/A", json={"status": "active"}, headers=_headers())
    assert res.status_code == 200
    assert res.json()["status"] == "completed"  # A ended on 10-14
    assert [q for q in db.queries if q["op"] != "select"] == []  # nothing written
    assert db.rows("sprints")[0]["status"] == "planned"

    board = _get(client, BOARD)
    assert board["sprints"][0]["status"] == "completed"
    assert board["sprint_id"] == "B"


def test_an_update_answers_the_status_of_the_new_dates(monkeypatch, client):
    """B ends early, on 10-21: on 10-22 it is completed, though the request said active, and with
    no sprint holding today (C starts 10-29) the board opens on the latest one that has started."""
    db = _seed(monkeypatch, date(2026, 10, 22))
    res = client.patch(
        "/api/scrum/sprints/B",
        json={"ends_at": "2026-10-21", "status": "active"},
        headers=_headers(),
    )
    assert res.status_code == 200
    assert {k: res.json()[k] for k in ("ends_at", "status")} == {
        "ends_at": "2026-10-21",
        "status": "completed",
    }
    stored = next(s for s in db.rows("sprints") if s["id"] == "B")
    assert (stored["ends_at"], stored["status"]) == ("2026-10-21", "planned")

    board = _get(client, BOARD)
    assert [s["status"] for s in board["sprints"]] == ["completed", "completed", "planned"]
    assert board["sprint_id"] == "B"


def test_a_created_sprint_answers_the_status_of_its_dates(monkeypatch, client):
    db = _seed(monkeypatch, date(2026, 10, 22))
    # Postgres fills sprints.status with its default; the fake applies no defaults.
    table = db.table

    def table_with_status_default(name):
        query = table(name)
        if name == "sprints":
            insert = query.insert
            query.insert = lambda payload: insert({"status": "planned", **payload})
        return query

    monkeypatch.setattr(db, "table", table_with_status_default)
    res = client.post(
        f"/api/projects/{PID}/scrum/sprints",
        json={"name": "Hack week", "starts_at": "2026-10-20", "ends_at": "2026-10-24"},
        headers=_headers(),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "active"
    assert db.rows("sprints")[-1]["status"] == "planned"  # the column keeps its default


def test_with_status_answers_a_copy_with_the_status_of_its_dates():
    row = dict(B)
    assert controller._with_status(row, date(2026, 10, 29)) == {**B, "status": "completed"}
    assert row == B  # the row itself is untouched


def test_select_sprint_names_one_else_todays_else_the_latest_started_else_the_first():
    today = date(2026, 10, 22)
    assert controller._select_sprint([A, B, C], "A", today) is A  # named, even a finished one
    assert controller._select_sprint([A, B, C], None, today) is B  # the one holding today
    # Sprints made through the API may overlap: of two holding today, the later-starting one.
    overlapping = _sprint("O", "2026-10-20", "2026-10-30")
    assert controller._select_sprint([A, B, overlapping, C], None, today) is overlapping
    # A gap in the calendar: the latest sprint that has started, not the next one.
    assert controller._select_sprint([A, C], None, today) is A
    assert controller._select_sprint([A, B, C], None, date(2026, 9, 1)) is A  # none started
    assert controller._select_sprint([], None, today) is None
    with pytest.raises(HTTPException) as refused:
        controller._select_sprint([A, B, C], "nope", today)
    assert (refused.value.status_code, refused.value.detail) == (404, controller.SPRINT_NOT_FOUND)
