"""A class's last day of classes: what the API accepts, and who may change it.

The last day of classes (before finals week) is where TA meetings stop: the attendance module
counts 7-day weeks from ``start_date`` through it, and a class with none keeps the fixed length
its term had before classes had end dates. The instructor sets it when creating the class and
changes it later from Class Settings (``PATCH /api/classes/{class_id}/end-date``). The
``classes_end_date_after_start`` CHECK refuses a day before ``start_date``, or more than 370 days
after it (53 weeks), in the database; the API refuses it first (422 when creating, 400 when
changing), so a bad day never reaches the database as a 500. A change that would drop a week that
already has attendance is refused too (409): TA Meetings could no longer open that week. So is a day
whose week (Monday to Sunday) ends before the class's last sprint does (409, spec D20), with or
without a first day: the instructor shortens the sprint schedule first. The route answers the class
row itself.

Who may call the PATCH is pinned with the other instructor-only routes in ``test_classes_authz.py``
and ``test_class_scoped_roles.py``. That a new class stores the day only when one is given, and
that students and TAs get it with their class list, is pinned in
``test_classes_create_and_list.py``.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.classes import controller as classes
from app.classes.models import END_BEFORE_START, CreateClassRequest
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

INSTR = "10000000-0000-0000-0000-000000000001"
STUDENT = "30000000-0000-0000-0000-000000000001"
CLASS = "c0000000-0000-0000-0000-000000000001"
OTHER_CLASS = "c0000000-0000-0000-0000-000000000002"
PROJECT = "d0000000-0000-0000-0000-000000000001"
OTHER_PROJECT = "d0000000-0000-0000-0000-000000000002"  # a team in OTHER_CLASS
START = date(2026, 9, 24)
LATEST = START + timedelta(days=370)  # the end of week 53
NEW_CLASS = {
    "name": "CSE 115A",
    "term": "Fall",
    "start_date": START,
    "sprint_count": 5,
    "sprint_frequency": "biweekly",
}
#: What a day more than a year after the first week of term is refused with (422 when creating,
#: 400 when changing), spelled out as the instructor reads it.
END_TOO_LATE = "The last day of classes must be within a year of the first week of term."


# ------------------------------------------------------------ the create request


def test_a_class_is_created_without_a_last_day_when_none_is_given():
    # An older client names none; the class keeps the term's fixed length until one is set.
    assert CreateClassRequest(**NEW_CLASS).end_date is None


@pytest.mark.parametrize(
    "end",
    [date(2026, 12, 4), START, LATEST],
    ids=["term-end", "first-day-itself", "latest-allowed-day"],
)
def test_create_keeps_a_last_day_from_the_start_to_the_end_of_week_53(end):
    assert CreateClassRequest(**NEW_CLASS, end_date=end).end_date == end


@pytest.mark.parametrize(
    ("end", "message"),
    [
        (date(2026, 9, 1), END_BEFORE_START),
        (LATEST + timedelta(days=1), END_TOO_LATE),
    ],
    ids=["before-the-start", "over-a-year-later"],
)
def test_create_refuses_an_end_outside_the_term(end, message):
    with pytest.raises(ValidationError) as exc:
        CreateClassRequest(**NEW_CLASS, end_date=end)
    assert [error["msg"] for error in exc.value.errors()] == [f"Value error, {message}"]


# ------------------------------------------------------------ the controller


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "name": "CSE 115A",
                "term": "Fall",
                "status": "active",
                "start_date": START.isoformat(),
                "end_date": None,
            }
        ],
        projects=[
            {"id": PROJECT, "class_id": CLASS},
            {"id": OTHER_PROJECT, "class_id": OTHER_CLASS},
        ],
        attendance=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _stored(db) -> str | None:
    [row] = db.rows("classes")
    return row["end_date"]


def _attended(db, week: int, project: str = PROJECT) -> None:
    """A member was marked present at the project's TA meeting in term ``week``."""
    db.rows("attendance").append(
        {"project_id": project, "user_id": STUDENT, "week_number": week, "status": "present"}
    )


def _tables(db) -> list[str]:
    return [q["table"] for q in db.queries]


@pytest.mark.parametrize("before", [None, "2026-12-11"], ids=["set", "changed"])
@pytest.mark.parametrize(
    "attended", [[], [1, 11]], ids=["no-attendance", "attendance-within-the-new-weeks"]
)
def test_the_instructor_sets_the_last_day_in_four_round_trips(db, before, attended):
    db.rows("classes")[0]["end_date"] = before
    for week in attended:
        _attended(db, week)  # week 11 is the last week of a term that ends on Dec 4
    row = classes.update_class_end_date(CLASS, date(2026, 12, 4), INSTR)
    assert (row["id"], row["end_date"]) == (CLASS, "2026-12-04")
    assert _stored(db) == "2026-12-04"
    # the owner check (with start_date) beside the class's teams, the attendance read, the update
    assert db.executes == 4


def test_a_class_with_no_teams_has_no_attendance_to_read(db):
    db.rows("projects").clear()
    classes.update_class_end_date(CLASS, date(2026, 12, 4), INSTR)
    assert _stored(db) == "2026-12-04"
    assert db.executes == 3  # the owner check, the (empty) teams, the update
    assert "attendance" not in _tables(db)


def test_the_last_day_may_be_the_first_day_itself(db):
    classes.update_class_end_date(CLASS, START, INSTR)
    assert _stored(db) == "2026-09-24"


@pytest.mark.parametrize(
    "day", [date(2026, 9, 1), date(2031, 1, 1)], ids=["before-any-start", "years-later"]
)
def test_a_class_with_no_start_date_takes_any_last_day(db, day):
    # Nothing to count weeks from or to fall before: the CHECK passes for a NULL start_date too,
    # and the class keeps its term's fixed length whatever the day, so no attendance can be hidden.
    db.rows("classes")[0]["start_date"] = None
    _attended(db, 10)
    classes.update_class_end_date(CLASS, day, INSTR)
    assert _stored(db) == day.isoformat()
    assert "attendance" not in _tables(db)


def test_a_last_day_before_the_start_is_refused_without_writing(db):
    with pytest.raises(HTTPException) as err:
        classes.update_class_end_date(CLASS, date(2026, 9, 1), INSTR)
    assert (err.value.status_code, err.value.detail) == (400, END_BEFORE_START)
    assert _stored(db) is None
    assert {q["op"] for q in db.queries} == {"select"}


def test_the_last_day_may_be_the_end_of_week_53(db):
    classes.update_class_end_date(CLASS, LATEST, INSTR)
    assert _stored(db) == "2027-09-29"


def test_a_last_day_over_a_year_after_the_start_is_refused_without_writing(db):
    with pytest.raises(HTTPException) as err:
        classes.update_class_end_date(CLASS, LATEST + timedelta(days=1), INSTR)
    assert (err.value.status_code, err.value.detail) == (400, END_TOO_LATE)
    assert _stored(db) is None
    assert {q["op"] for q in db.queries} == {"select"}
    assert "attendance" not in _tables(db)  # refused on the dates alone


# ------------------------------------------------------------ weeks that have attendance

SUMMER_START = date(2026, 6, 22)  # a Monday: week 6 begins Jul 27


@pytest.mark.parametrize(
    ("term", "start", "attended", "end", "detail"),
    [
        pytest.param(
            "Fall",
            START,
            [1, 2, 11],
            date(2026, 12, 2),  # week 10
            "Week 11 already has attendance. Pick Dec 3, 2026 or later.",
            id="fall-week-11",
        ),
        pytest.param(
            "Summer",
            SUMMER_START,
            [1, 6],
            date(2026, 7, 26),  # week 5: the 6-week summer class's last week would be hidden
            "Week 6 already has attendance. Pick Jul 27, 2026 or later.",
            id="summer-week-6",
        ),
        pytest.param(
            "Fall",
            START,
            [9, 11],
            date(2026, 11, 18),  # week 8: weeks 9 and 11 would both be hidden
            "Week 11 already has attendance. Pick Dec 3, 2026 or later.",
            id="the-latest-week-names-the-day",
        ),
    ],
)
def test_a_last_day_that_would_hide_a_week_with_attendance_is_refused_without_writing(
    db, term, start, attended, end, detail
):
    db.rows("classes")[0].update(term=term, start_date=start.isoformat())
    for week in attended:
        _attended(db, week)
    with pytest.raises(HTTPException) as err:
        classes.update_class_end_date(CLASS, end, INSTR)
    assert (err.value.status_code, err.value.detail) == (409, detail)
    assert _stored(db) is None
    assert {q["op"] for q in db.queries} == {"select"}
    assert db.executes == 3  # the owner check and the teams, then the attendance read


def test_the_earliest_last_day_that_keeps_an_attended_week_is_accepted(db):
    _attended(db, 11)
    classes.update_class_end_date(CLASS, date(2026, 12, 3), INSTR)  # the first day of week 11
    assert _stored(db) == "2026-12-03"


def test_attendance_in_another_class_holds_no_week_back(db):
    _attended(db, 11, OTHER_PROJECT)
    classes.update_class_end_date(CLASS, date(2026, 12, 2), INSTR)
    assert _stored(db) == "2026-12-02"


# ------------------------------------------------------------ the sprint schedule

#: Four weekly sprints from Mon Sep 28: Sprint 4 runs Oct 19-25, so the last day of classes may be
#: any day from Mon Oct 19, the first day of the week (Monday to Sunday) that Sprint 4 ends in.
FOUR_WEEKLY = {"sprint_count": 4, "sprint_frequency": "weekly", "sprints_start_on": "2026-09-28"}
BEFORE_SPRINTS = "Sprint 4 ends 2026-10-25; change the sprint schedule first"


@pytest.mark.parametrize("start", [START.isoformat(), None], ids=["first-day", "no-first-day"])
def test_a_last_day_whose_week_ends_before_the_last_sprint_is_refused_without_writing(db, start):
    db.rows("classes")[0].update(FOUR_WEEKLY, start_date=start)
    with pytest.raises(HTTPException) as err:
        # Sun Oct 18 ends the week before the one Sprint 4 ends in.
        classes.update_class_end_date(CLASS, date(2026, 10, 18), INSTR)
    assert (err.value.status_code, err.value.detail) == (409, BEFORE_SPRINTS)
    assert _stored(db) is None
    assert {q["op"] for q in db.queries} == {"select"}


@pytest.mark.parametrize(
    "day",
    [date(2026, 10, 19), date(2026, 10, 23), date(2026, 10, 25)],
    ids=["monday", "friday", "sunday-the-sprint-ends"],
)
def test_the_last_day_may_be_any_day_of_the_week_the_last_sprint_ends_in(db, day):
    db.rows("classes")[0].update(FOUR_WEEKLY)
    classes.update_class_end_date(CLASS, day, INSTR)
    assert _stored(db) == day.isoformat()
    # the owner check (with the schedule) beside the teams, the attendance read, the update: no
    # round trip more
    assert db.executes == 4


def test_a_week_with_attendance_is_named_before_the_sprints(db):
    db.rows("classes")[0].update(FOUR_WEEKLY)
    _attended(db, 5)
    # Oct 14 is in week 3, and before Sprint 4 ends: both refusals apply.
    with pytest.raises(HTTPException) as err:
        classes.update_class_end_date(CLASS, date(2026, 10, 14), INSTR)
    assert (err.value.status_code, err.value.detail) == (
        409,
        "Week 5 already has attendance. Pick Oct 22, 2026 or later.",
    )


# ------------------------------------------------------------ the routes

ROUTE = f"/api/classes/{CLASS}/end-date"


@pytest.fixture
def calls(monkeypatch) -> list[tuple]:
    recorded: list[tuple] = []

    def controller(class_id, end_date, instructor_id):
        recorded.append((str(class_id), end_date, instructor_id))
        return {"id": str(class_id), "end_date": end_date.isoformat()}

    monkeypatch.setattr("app.classes.views.controller.update_class_end_date", controller)
    return recorded


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


def test_the_route_hands_the_day_to_the_owner_check(client: TestClient, calls):
    res = client.patch(ROUTE, headers=_as(INSTR), json={"end_date": "2026-12-04"})
    assert res.status_code == 200, res.text
    # The class row itself, not {"message": ..., "class": ...} (STYLE_GUIDE.md, Response Format).
    assert res.json() == {"id": CLASS, "end_date": "2026-12-04"}
    assert calls == [(CLASS, date(2026, 12, 4), INSTR)]


@pytest.mark.parametrize(
    "kwargs",
    [{}, {"json": {}}, {"json": {"end_date": None}}, {"json": {"end_date": "soon"}}],
    ids=["no-body", "no-day-named", "null", "not-a-date"],
)
def test_the_route_refuses_a_bad_body_before_the_owner_check(client: TestClient, calls, kwargs):
    res = client.patch(ROUTE, headers=_as(INSTR), **kwargs)
    assert res.status_code == 422, res.text
    assert calls == []


@pytest.mark.parametrize(
    ("end", "message"),
    [("2026-09-01", END_BEFORE_START), ("2027-09-30", END_TOO_LATE)],
    ids=["before-the-start", "over-a-year-later"],
)
def test_the_create_route_refuses_an_end_outside_the_term_before_creating_anything(
    client: TestClient, monkeypatch, end, message
):
    created: list = []
    monkeypatch.setattr(classes, "create_class", lambda *args, **kwargs: created.append(kwargs))
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "instructor")
    res = client.post(
        "/api/classes",
        headers=_as(INSTR),
        json={**NEW_CLASS, "start_date": START.isoformat(), "end_date": end},
    )
    assert res.status_code == 422, res.text
    assert [error["msg"] for error in res.json()["detail"]] == [f"Value error, {message}"]
    assert created == []
