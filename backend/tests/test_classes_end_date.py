"""A class's last day of classes: what the API accepts, and who may change it.

The last day of classes (before finals week) is where TA meetings stop: the attendance module
counts 7-day weeks from ``start_date`` through it, and a class with none keeps the fixed length
its term had before classes had end dates. The instructor sets it when creating the class and
changes it later from Class Settings (``PATCH /api/classes/{class_id}/end-date``). The
``classes_end_date_after_start`` CHECK refuses a day before ``start_date`` in the database; the API
refuses it first (422 when creating, 400 when changing), so a bad day never reaches the database
as a 500.

Who may call the PATCH is pinned with the other instructor-only routes in ``test_classes_authz.py``
and ``test_class_scoped_roles.py``. That a new class stores the day only when one is given, and
that students and TAs get it with their class list, is pinned in
``test_classes_create_and_list.py``.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.classes import controller as classes
from app.classes.models import END_BEFORE_START, CreateClassRequest
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

INSTR = "10000000-0000-0000-0000-000000000001"
CLASS = "c0000000-0000-0000-0000-000000000001"
START = date(2026, 9, 24)
NEW_CLASS = {"name": "CSE 115A", "term": "Fall", "start_date": START}


# ------------------------------------------------------------ the create request


def test_a_class_is_created_without_a_last_day_when_none_is_given():
    # An older client names none; the class keeps the term's fixed length until one is set.
    assert CreateClassRequest(**NEW_CLASS).end_date is None


@pytest.mark.parametrize("end", [date(2026, 12, 4), START], ids=["term-end", "first-day-itself"])
def test_create_keeps_a_last_day_on_or_after_the_start(end):
    assert CreateClassRequest(**NEW_CLASS, end_date=end).end_date == end


def test_create_refuses_an_end_before_the_start():
    with pytest.raises(ValidationError) as exc:
        CreateClassRequest(**NEW_CLASS, end_date=date(2026, 9, 1))
    assert [error["msg"] for error in exc.value.errors()] == [f"Value error, {END_BEFORE_START}"]


# ------------------------------------------------------------ the controller


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "name": "CSE 115A",
                "status": "active",
                "start_date": START.isoformat(),
                "end_date": None,
            }
        ]
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _stored(db) -> str | None:
    [row] = db.rows("classes")
    return row["end_date"]


@pytest.mark.parametrize("before", [None, "2026-12-11"], ids=["set", "changed"])
def test_the_instructor_sets_the_last_day_in_two_round_trips(db, before):
    db.rows("classes")[0]["end_date"] = before
    row = classes.update_class_end_date(CLASS, date(2026, 12, 4), INSTR)
    assert (row["id"], row["end_date"]) == (CLASS, "2026-12-04")
    assert _stored(db) == "2026-12-04"
    assert db.executes == 2  # the owner check (with start_date), the update


def test_the_last_day_may_be_the_first_day_itself(db):
    classes.update_class_end_date(CLASS, START, INSTR)
    assert _stored(db) == "2026-09-24"


def test_a_class_with_no_start_date_takes_any_last_day(db):
    # Nothing to fall before: the CHECK passes for a NULL start_date too.
    db.rows("classes")[0]["start_date"] = None
    classes.update_class_end_date(CLASS, date(2026, 9, 1), INSTR)
    assert _stored(db) == "2026-09-01"


def test_a_last_day_before_the_start_is_refused_without_writing(db):
    with pytest.raises(HTTPException) as err:
        classes.update_class_end_date(CLASS, date(2026, 9, 1), INSTR)
    assert (err.value.status_code, err.value.detail) == (400, END_BEFORE_START)
    assert _stored(db) is None
    assert [q["op"] for q in db.queries] == ["select"]  # the owner check alone


# ------------------------------------------------------------ the route

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
    assert res.json() == {
        "message": "Last day of classes updated",
        "class": {"id": CLASS, "end_date": "2026-12-04"},
    }
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
