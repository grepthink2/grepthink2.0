"""Tests for the shared authorization helpers in app.core.authz.

These helpers replace the per-module copies of "is this user the class
instructor?", "what is their enrollment role?", and "load this project", so
the behaviour pinned here is the behaviour every controller inherits.

What each helper returns, and what it costs. Who is refused, with which status and message,
is pinned for these helpers and for every controller in ``test_authz_status_policy.py``.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core import authz
from tests.fake_supabase import FakeSupabase

CLASS_ID = "11111111-1111-1111-1111-111111111111"
PROJECT_ID = "22222222-2222-2222-2222-222222222222"
INSTRUCTOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
STUDENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
TA = "cccccccc-cccc-cccc-cccc-cccccccccccc"
STRANGER = "dddddddd-dddd-dddd-dddd-dddddddddddd"


def _db() -> FakeSupabase:
    return FakeSupabase(
        classes=[{"id": CLASS_ID, "created_by": INSTRUCTOR, "name": "CSE 115A", "term": "fall"}],
        class_enrollments=[
            {"id": "e1", "class_id": CLASS_ID, "user_id": STUDENT, "enrollment_role": "student"},
            {"id": "e2", "class_id": CLASS_ID, "user_id": TA, "enrollment_role": "ta"},
        ],
        projects=[
            {"id": PROJECT_ID, "class_id": CLASS_ID, "name": "Team A", "assigned_ta_id": TA},
        ],
        project_members=[
            {"id": "m1", "project_id": PROJECT_ID, "user_id": STUDENT, "role": "product owner"},
        ],
        relations={
            ("projects", "classes"): ("class_id", "id", False),
        },
    )


MISSING = "00000000-0000-0000-0000-000000000000"


def test_is_class_instructor_is_true_for_the_owner_only():
    db = _db()
    assert authz.is_class_instructor(db, INSTRUCTOR, CLASS_ID) is True
    assert authz.is_class_instructor(db, STUDENT, CLASS_ID) is False
    assert authz.is_class_instructor(db, INSTRUCTOR, MISSING) is False


def test_require_class_instructor_returns_the_class_row():
    row = authz.require_class_instructor(_db(), INSTRUCTOR, CLASS_ID)
    assert row["id"] == CLASS_ID and row["created_by"] == INSTRUCTOR


def test_get_enrollment_role():
    db = _db()
    assert authz.get_enrollment_role(db, CLASS_ID, STUDENT) == "student"
    assert authz.get_enrollment_role(db, CLASS_ID, TA) == "ta"
    assert authz.get_enrollment_role(db, CLASS_ID, STRANGER) is None
    # the instructor is not an enrollment row
    assert authz.get_enrollment_role(db, CLASS_ID, INSTRUCTOR) is None


def test_get_class_access_shapes():
    db = _db()
    assert authz.get_class_access(db, INSTRUCTOR, CLASS_ID) == {
        "class": {"id": CLASS_ID, "created_by": INSTRUCTOR},
        "is_instructor": True,
        "enrollment_role": None,
    }
    ta = authz.get_class_access(db, TA, CLASS_ID)
    assert ta["is_instructor"] is False and ta["enrollment_role"] == "ta"
    assert authz.get_class_access(db, STRANGER, CLASS_ID)["enrollment_role"] is None
    assert authz.get_class_access(db, STUDENT, MISSING) is None


def test_require_class_access_admits_members_with_the_columns_asked_for_in_two_reads():
    db = _db()
    access = authz.require_class_access(db, STUDENT, CLASS_ID, columns="id, created_by, name, term")

    assert access["enrollment_role"] == "student"
    assert (access["class"]["name"], access["class"]["term"]) == ("CSE 115A", "fall")
    assert db.executes <= 2  # the class, then the enrollment
    assert authz.require_class_access(_db(), INSTRUCTOR, CLASS_ID)["is_instructor"] is True


def test_load_project_returns_the_row_and_embeds_its_class_in_the_same_read():
    row = authz.load_project(_db(), PROJECT_ID)
    assert (row["id"], row["class_id"], row["assigned_ta_id"]) == (PROJECT_ID, CLASS_ID, TA)

    db = _db()
    with_class = authz.load_project(db, PROJECT_ID, class_columns="id, created_by")
    assert with_class["classes"] == {"id": CLASS_ID, "created_by": INSTRUCTOR}
    assert db.executes == 1


def test_load_project_answers_404_for_a_missing_project():
    with pytest.raises(HTTPException) as exc:
        authz.load_project(_db(), MISSING)
    assert exc.value.status_code == 404


def test_project_role():
    db = _db()
    assert authz.get_project_role(db, PROJECT_ID, STUDENT) == "product owner"
    assert authz.get_project_role(db, PROJECT_ID, STRANGER) is None
    assert (
        authz.require_project_role(db, PROJECT_ID, STUDENT, authz.ELEVATED_PROJECT_ROLES)
        == "product owner"
    )
    with pytest.raises(HTTPException) as not_member:
        authz.require_project_role(db, PROJECT_ID, STRANGER, authz.ELEVATED_PROJECT_ROLES)
    assert not_member.value.status_code == 403
    with pytest.raises(HTTPException) as wrong_role:
        authz.require_project_role(db, PROJECT_ID, STUDENT, ("admin",))
    assert wrong_role.value.status_code == 403
