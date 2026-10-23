"""A class's sprint schedule (spec D20): a class is created with it.

A class carries ``sprint_count`` (1-20), ``sprint_frequency`` (weekly, biweekly or monthly) and
``sprints_start_on``, the first sprint's first day. ``POST /api/classes`` requires the count and the
frequency; the first day defaults to the class's first week of term (``start_date``). The schedule
must fit the class's dates: a first sprint that starts before ``start_date``, or a last one that ends
after the last day of classes (``end_date``), is refused with a 422 whose detail is the sentence the
web client shows, before anything is read or written. A class with no last day takes a schedule of
any length. The route answers the class row itself, which carries the schedule.

Through the route and the real controller on a FakeSupabase. The windows are worked out by hand:
five biweekly sprints from Mon Sep 21, 2026 run Sep 21-Oct 4, Oct 5-18, Oct 19-Nov 1, Nov 2-15 and
Nov 16-29.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.classes import controller as classes
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

INSTR = "10000000-0000-0000-0000-000000000001"
BANNER = "https://cdn.example/class-banner.svg"
#: First week of term Mon Sep 21, last day of classes Fri Dec 4, and five biweekly sprints, the
#: last of which ends Sun Nov 29.
BODY = {
    "name": "CSE 115A",
    "term": "Fall",
    "start_date": "2026-09-21",
    "end_date": "2026-12-04",
    "sprint_count": 5,
    "sprint_frequency": "biweekly",
}


@pytest.fixture
def db(monkeypatch):
    """No class yet; INSTR's account is an instructor's."""
    fake = FakeSupabase(classes=[], assignments=[])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "instructor")
    monkeypatch.setattr(classes, "generate_course_code", lambda: "FREE0001")
    monkeypatch.setattr(classes, "upload_class_banner", lambda client, class_id: BANNER)
    return fake


def _create(client: TestClient, body: dict):
    return client.post(
        "/api/classes", headers={"Authorization": f"Bearer {make_token(sub=INSTR)}"}, json=body
    )


def _without(*keys: str) -> dict:
    return {key: value for key, value in BODY.items() if key not in keys}


def _schedule(row: dict) -> tuple:
    return (row["sprint_count"], row["sprint_frequency"], row["sprints_start_on"])


# ------------------------------------------------------------ creating a class


@pytest.mark.parametrize(
    ("changes", "schedule"),
    [
        pytest.param({}, (5, "biweekly", "2026-09-21"), id="first-sprint-in-the-first-week"),
        pytest.param(
            {"sprints_start_on": None}, (5, "biweekly", "2026-09-21"), id="null-first-day"
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-21"},
            (5, "biweekly", "2026-09-21"),
            id="first-day-named-on-the-start",
        ),
        pytest.param(
            {"end_date": "2026-11-29"},
            (5, "biweekly", "2026-09-21"),
            id="last-sprint-ends-on-the-last-day",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-26"},  # Sprint 5 ends Fri Dec 4
            (5, "biweekly", "2026-09-26"),
            id="later-first-day-ending-on-the-last-day",
        ),
        pytest.param(
            {"sprint_count": 1, "sprint_frequency": "weekly"},
            (1, "weekly", "2026-09-21"),
            id="one-weekly-sprint",
        ),
    ],
)
def test_a_class_is_created_with_its_sprint_schedule(client, db, changes, schedule):
    res = _create(client, {**BODY, **changes})
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    assert _schedule(row) == schedule


def test_a_class_with_no_last_day_takes_a_schedule_of_any_length(client, db):
    # Twenty monthly sprints run to May 2028: nothing to end by.
    res = _create(
        client, {**_without("end_date"), "sprint_count": 20, "sprint_frequency": "monthly"}
    )
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    assert "end_date" not in row
    assert _schedule(row) == (20, "monthly", "2026-09-21")


def test_the_route_answers_the_class_row_itself(client, db):
    res = _create(client, BODY)
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    # The row, not {"message": ..., "class": ...} (STYLE_GUIDE.md, Response Format).
    assert res.json() == row
    assert _schedule(res.json()) == (5, "biweekly", "2026-09-21")
    # the course-code probe, the class insert, the banner update, the TSR insert
    assert db.executes <= 4


@pytest.mark.parametrize(
    "body",
    [
        pytest.param(_without("sprint_count"), id="no-count"),
        pytest.param(_without("sprint_frequency"), id="no-frequency"),
        pytest.param({**BODY, "sprint_count": 0}, id="no-sprints"),
        pytest.param({**BODY, "sprint_count": 21}, id="over-twenty"),
        pytest.param({**BODY, "sprint_frequency": "daily"}, id="unknown-frequency"),
    ],
)
def test_a_class_needs_a_sprint_count_and_frequency(client, db, body):
    res = _create(client, body)
    assert res.status_code == 422, res.text
    assert db.executes == 0


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        pytest.param(
            {"end_date": "2026-11-01"},
            "The sprints run past the last day of classes (2026-11-01)",
            id="last-day-in-sprint-3",
        ),
        pytest.param(
            {"end_date": "2026-11-28"},
            "The sprints run past the last day of classes (2026-11-28)",
            id="last-day-before-sprint-5-ends",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-27"},  # Sprint 5 would end Sat Dec 5
            "The sprints run past the last day of classes (2026-12-04)",
            id="later-first-day-ending-past-the-last-day",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-14"},
            "The first sprint starts before the class does",
            id="first-sprint-a-week-early",
        ),
    ],
)
def test_a_schedule_that_does_not_fit_the_class_is_refused_before_anything_is_written(
    client, db, changes, detail
):
    res = _create(client, {**BODY, **changes})
    assert (res.status_code, res.json()["detail"]) == (422, detail)
    assert db.executes == 0
