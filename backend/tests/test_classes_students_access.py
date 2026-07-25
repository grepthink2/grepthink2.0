"""Access-control guards for ``GET /api/classes/{class_id}/students``.

The endpoint used to take only ``class_id``: the view injected ``user_id`` via
``require_user`` but never passed it on, so the controller checked existence and
nothing else. Any authenticated user could read any class's full roster (emails,
names, project affiliation) by guessing a class UUID.

Access now matches the sibling ``get_class_roster``: the class owner
(instructor) or any enrolled user (student or TA).

Runs the real controller logic against an in-memory FakeSupabase (the repo's
`mem` fixture references a missing module, so these are self-contained).
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.classes.controller as classes_controller
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase


INSTR = "11111111-1111-1111-1111-111111111111"
TA1 = "22222222-2222-2222-2222-222222222222"
S1 = "33333333-3333-3333-3333-333333333333"
OUTSIDER = "44444444-4444-4444-4444-444444444444"
OTHER_INSTR = "55555555-5555-5555-5555-555555555555"
CLASS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
EMPTY_CLASS = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
MISSING_CLASS = "cccccccc-cccc-cccc-cccc-cccccccccccc"
P1 = "dddddddd-dddd-dddd-dddd-dddddddddddd"


def _profile(uid, first):
    return {"id": uid, "email": f"{uid}@ucsc.edu", "role": "student",
            "first_name": first, "last_name": "X"}


@pytest.fixture
def db(monkeypatch):
    """CLASS is owned by INSTR with TA1 (ta) and S1 (student) enrolled.

    EMPTY_CLASS is owned by INSTR with nobody enrolled. OUTSIDER and
    OTHER_INSTR have no relationship to either class.
    """
    fake = FakeSupabase(
        profiles=[_profile(INSTR, "Ina"), _profile(TA1, "Tara"),
                  _profile(S1, "Sam"), _profile(OUTSIDER, "Otto"),
                  _profile(OTHER_INSTR, "Otis")],
        classes=[
            {"id": CLASS, "created_by": INSTR, "name": "CSE115C"},
            {"id": EMPTY_CLASS, "created_by": INSTR, "name": "CSE110"},
        ],
        class_enrollments=[
            {"id": "enr-ta", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "enr-s1", "class_id": CLASS, "user_id": S1, "enrollment_role": "student"},
        ],
        projects=[{"id": P1, "class_id": CLASS, "name": "Alpha"}],
        project_members=[{"project_id": P1, "user_id": S1, "role": "member"}],
    )
    monkeypatch.setattr(classes_controller, "service_client", fake, raising=False)
    monkeypatch.setattr(classes_controller, "supabase", fake, raising=False)
    return fake


# -- the hole this closes --

def test_unrelated_user_cannot_read_roster(db):
    with pytest.raises(HTTPException) as exc:
        classes_controller.get_class_students(CLASS, OUTSIDER, "student")
    assert exc.value.status_code == 403


def test_instructor_of_another_class_cannot_read_roster(db):
    # Being an instructor is not itself access — only owning *this* class is.
    with pytest.raises(HTTPException) as exc:
        classes_controller.get_class_students(CLASS, OTHER_INSTR, "instructor")
    assert exc.value.status_code == 403


def test_empty_class_still_denies_non_member(db):
    # A class with no enrollments must 403 rather than leak an empty 200:
    # the access check has to run before the empty-roster early return.
    with pytest.raises(HTTPException) as exc:
        classes_controller.get_class_students(EMPTY_CLASS, OUTSIDER, "student")
    assert exc.value.status_code == 403


# -- legitimate callers keep working --

def test_owning_instructor_can_read_roster(db):
    students = classes_controller.get_class_students(CLASS, INSTR, "instructor")
    assert {s["id"] for s in students} == {TA1, S1}


def test_enrolled_student_can_read_roster(db):
    students = classes_controller.get_class_students(CLASS, S1, "student")
    assert {s["id"] for s in students} == {TA1, S1}


def test_enrolled_ta_can_read_roster(db):
    # TAs are rows in class_enrollments (enrollment_role='ta'), so the
    # membership arm covers them; TAManagement must keep working.
    students = classes_controller.get_class_students(CLASS, TA1, "student")
    assert {s["id"] for s in students} == {TA1, S1}


def test_roster_payload_is_unchanged_for_members(db):
    # The enrichment contract the frontend maps over must survive the fix.
    students = classes_controller.get_class_students(CLASS, INSTR, "instructor")
    sam = next(s for s in students if s["id"] == S1)
    assert sam["project_id"] == P1
    assert sam["project_name"] == "Alpha"
    assert sam["enrollment_role"] == "student"
    tara = next(s for s in students if s["id"] == TA1)
    assert tara["enrollment_role"] == "ta"
    assert tara["project_id"] is None


def test_owning_instructor_gets_empty_list_for_empty_class(db):
    assert classes_controller.get_class_students(EMPTY_CLASS, INSTR, "instructor") == []


def test_missing_class_is_404(db):
    with pytest.raises(HTTPException) as exc:
        classes_controller.get_class_students(MISSING_CLASS, INSTR, "instructor")
    assert exc.value.status_code == 404


# -- the view must actually thread the caller through --

def test_endpoint_denies_non_member(client: TestClient, db, monkeypatch):
    # Guards the original bug directly: the view injected user_id but dropped
    # it. Exercised through the real route so re-breaking the wiring fails here.
    monkeypatch.setattr("app.classes.views.get_user_role", lambda _uid: "student")
    r = client.get(
        f"/api/classes/{CLASS}/students",
        headers={"Authorization": f"Bearer {make_token(sub=OUTSIDER)}"},
    )
    assert r.status_code == 403


def test_endpoint_allows_enrolled_student(client: TestClient, db, monkeypatch):
    monkeypatch.setattr("app.classes.views.get_user_role", lambda _uid: "student")
    r = client.get(
        f"/api/classes/{CLASS}/students",
        headers={"Authorization": f"Bearer {make_token(sub=S1)}"},
    )
    assert r.status_code == 200
    assert {s["id"] for s in r.json()["students"]} == {TA1, S1}
