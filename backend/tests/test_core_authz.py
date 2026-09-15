"""Tests for the shared authorization helpers in app.core.authz.

These helpers replace the per-module copies of "is this user the class
instructor?", "what is their enrollment role?", and "load this project", so
the behaviour pinned here is the behaviour every controller inherits.
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


class TestClassInstructor:
    def test_is_class_instructor_true_for_owner(self):
        assert authz.is_class_instructor(_db(), INSTRUCTOR, CLASS_ID) is True

    def test_is_class_instructor_false_for_student_and_missing_class(self):
        db = _db()
        assert authz.is_class_instructor(db, STUDENT, CLASS_ID) is False
        assert (
            authz.is_class_instructor(db, INSTRUCTOR, "00000000-0000-0000-0000-000000000000")
            is False
        )

    def test_require_class_instructor_returns_row(self):
        row = authz.require_class_instructor(_db(), INSTRUCTOR, CLASS_ID)
        assert row["id"] == CLASS_ID and row["created_by"] == INSTRUCTOR

    def test_require_class_instructor_denied_is_403(self):
        with pytest.raises(HTTPException) as exc:
            authz.require_class_instructor(_db(), STUDENT, CLASS_ID)
        assert exc.value.status_code == 403

    def test_require_class_instructor_missing_class(self):
        with pytest.raises(HTTPException) as exc:
            authz.require_class_instructor(
                _db(), INSTRUCTOR, "00000000-0000-0000-0000-000000000000"
            )
        assert exc.value.status_code == 404


class TestEnrollment:
    def test_get_enrollment_role(self):
        db = _db()
        assert authz.get_enrollment_role(db, CLASS_ID, STUDENT) == "student"
        assert authz.get_enrollment_role(db, CLASS_ID, TA) == "ta"
        assert authz.get_enrollment_role(db, CLASS_ID, STRANGER) is None
        # the instructor is not an enrollment row
        assert authz.get_enrollment_role(db, CLASS_ID, INSTRUCTOR) is None

    def test_get_class_access_shapes(self):
        db = _db()
        assert authz.get_class_access(db, INSTRUCTOR, CLASS_ID) == {
            "class": {"id": CLASS_ID, "created_by": INSTRUCTOR},
            "is_instructor": True,
            "enrollment_role": None,
        }
        ta = authz.get_class_access(db, TA, CLASS_ID)
        assert ta["is_instructor"] is False and ta["enrollment_role"] == "ta"
        assert authz.get_class_access(db, STRANGER, CLASS_ID)["enrollment_role"] is None
        assert authz.get_class_access(db, STUDENT, "00000000-0000-0000-0000-000000000000") is None

    def test_require_class_access(self):
        db = _db()
        assert authz.require_class_access(db, STUDENT, CLASS_ID)["enrollment_role"] == "student"
        assert authz.require_class_access(db, INSTRUCTOR, CLASS_ID)["is_instructor"] is True
        with pytest.raises(HTTPException) as denied:
            authz.require_class_access(db, STRANGER, CLASS_ID)
        assert denied.value.status_code == 403
        with pytest.raises(HTTPException) as missing:
            authz.require_class_access(db, STUDENT, "00000000-0000-0000-0000-000000000000")
        assert missing.value.status_code == 404

    def test_require_class_access_extra_columns(self):
        access = authz.require_class_access(
            _db(), STUDENT, CLASS_ID, columns="id, created_by, name, term"
        )
        assert access["class"]["name"] == "CSE 115A"
        assert access["class"]["term"] == "fall"


class TestProject:
    def test_load_project_default_columns(self):
        row = authz.load_project(_db(), PROJECT_ID)
        assert row["id"] == PROJECT_ID
        assert row["class_id"] == CLASS_ID
        assert row["assigned_ta_id"] == TA

    def test_load_project_with_class_embed(self):
        row = authz.load_project(_db(), PROJECT_ID, class_columns="id, created_by")
        assert row["classes"] == {"id": CLASS_ID, "created_by": INSTRUCTOR}

    def test_load_project_missing(self):
        with pytest.raises(HTTPException) as exc:
            authz.load_project(_db(), "00000000-0000-0000-0000-000000000000")
        assert exc.value.status_code == 404

    def test_project_role(self):
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


class TestRoundTrips:
    """The helpers must not regress into extra round trips."""

    def test_require_class_access_costs_at_most_two_queries(self):
        db = _db()
        authz.require_class_access(db, STUDENT, CLASS_ID)
        assert db.executes <= 2

    def test_load_project_with_class_is_one_query(self):
        db = _db()
        authz.load_project(db, PROJECT_ID, class_columns="created_by")
        assert db.executes == 1
