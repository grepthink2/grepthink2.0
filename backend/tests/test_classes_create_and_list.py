"""Class creation (course-code probe) and the class list (``GET /api/classes``).

Before: ``create_class`` probed up to five generated course codes one query at a
time, and the student class list read the enrollments, then the instructors'
profiles, then the enrollment counts, and emitted ``instructor_email`` although
the frontend reads ``teacher_email`` (decision D9), so students never saw it.
"""

from __future__ import annotations

import datetime

import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
S1, S2, TA1, LONER = "s1", "s2", "ta-1", "loner"
C1, C2, C3 = "class-1", "class-2", "class-3"
BANNER = "https://cdn.example/class-banner.svg"


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


# -------------------------------------------------------------- create_class


def _codes(monkeypatch, codes: list[str]) -> None:
    pending = iter(codes)
    monkeypatch.setattr(classes, "generate_course_code", lambda: next(pending))


@pytest.fixture
def create_db(monkeypatch):
    fake = FakeSupabase(
        classes=[
            {"id": "old-1", "course_code": "TAKEN001", "created_by": OTHER_INSTR},
            {"id": "old-2", "course_code": "taken002", "created_by": OTHER_INSTR},
        ],
        assignments=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr(classes, "upload_class_banner", lambda client, class_id: BANNER)
    return fake


def test_create_class_takes_the_first_free_code_in_one_probe(create_db, monkeypatch):
    # The probe is case-insensitive: "taken002" on file blocks "TAKEN002".
    _codes(monkeypatch, ["TAKEN001", "TAKEN002", "FREE0003", "FREE0004", "FREE0005"])
    created = classes.create_class(
        "CSE 115C", "Software engineering", "Fall", datetime.date(2026, 9, 24), INSTR
    )
    assert {k: created[k] for k in created if k != "id"} == {
        "name": "CSE 115C",
        "description": "Software engineering",
        "created_by": INSTR,
        "course_code": "FREE0003",
        "year": 2026,
        "term": "Fall",
        "start_date": "2026-09-24",
        "status": "active",
        "image_url": BANNER,
    }
    tsrs = [a for a in create_db.rows("assignments") if a["class_id"] == created["id"]]
    assert [a["Title"] for a in tsrs] == [f"TSR {n}" for n in range(1, 6)]

    probes = [q for q in create_db.queries if q["table"] == "classes" and q["op"] == "select"]
    assert len(probes) == 1, _trace(create_db)
    # probe, class insert, banner url update, TSR insert
    assert create_db.executes <= 4, _trace(create_db)


def test_create_class_gives_up_when_every_candidate_is_taken(create_db, monkeypatch):
    for n in range(3, 6):
        create_db.rows("classes").append(
            {"id": f"old-{n}", "course_code": f"TAKEN00{n}", "created_by": OTHER_INSTR}
        )
    _codes(monkeypatch, [f"TAKEN00{n}" for n in range(1, 6)])
    with pytest.raises(HTTPException) as exc:
        classes.create_class("CSE 115C", None, "Fall", datetime.date(2026, 9, 24), INSTR)
    assert (exc.value.status_code, exc.value.detail) == (
        500,
        "Failed to generate unique course code",
    )
    assert not [q for q in create_db.queries if q["op"] != "select"], _trace(create_db)


# ----------------------------------------------------------- class listing


def _class(cid, owner, name, code, **extra):
    return {
        "id": cid,
        "name": name,
        "description": f"{name} description",
        "created_by": owner,
        "created_at": "2026-01-01T00:00:00+00:00",
        "course_code": code,
        "status": "active",
        "term": "Fall",
        "start_date": "2026-09-24",
        "year": 2026,
        "image_url": None,
        "review_period_open": False,
        "review_zoom_url": None,
        **extra,
    }


@pytest.fixture
def list_db(monkeypatch):
    """C1 (INSTR) has S1, S2 and TA1; C2 (OTHER_INSTR) has S1; C3 (INSTR) is empty."""
    fake = FakeSupabase(
        profiles=[
            {"id": INSTR, "email": "instr@ucsc.edu"},
            {"id": OTHER_INSTR, "email": "other@ucsc.edu"},
            {"id": S1, "email": "s1@ucsc.edu"},
            {"id": S2, "email": "s2@ucsc.edu"},
            {"id": TA1, "email": "ta1@ucsc.edu"},
            {"id": LONER, "email": "loner@ucsc.edu"},
        ],
        classes=[
            _class(C1, INSTR, "CSE 115C", "AAAA1111"),
            _class(C2, OTHER_INSTR, "CSE 110", "BBBB2222"),
            _class(C3, INSTR, "CSE 130", "CCCC3333", status="complete"),
        ],
        class_enrollments=[
            {"id": "e1", "class_id": C1, "user_id": S1, "enrollment_role": "student"},
            {"id": "e2", "class_id": C2, "user_id": S1, "enrollment_role": None},
            {"id": "e3", "class_id": C1, "user_id": S2, "enrollment_role": "student"},
            {"id": "e4", "class_id": C1, "user_id": TA1, "enrollment_role": "ta"},
        ],
        relations={
            ("class_enrollments", "classes"): ("class_id", "id", False),
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


STUDENT_KEYS = {
    "id",
    "name",
    "description",
    "created_by",
    "created_at",
    "course_code",
    "status",
    "term",
    "start_date",
    "year",
    "image_url",
    "teacher_email",
    "enrolled_count",
}


def test_students_see_their_classes_with_the_teacher_email(list_db):
    out = classes.get_classes_for_user(S1, "student")
    assert [c["id"] for c in out] == [C1, C2]
    assert all(set(c) == STUDENT_KEYS for c in out), [sorted(c) for c in out]
    assert [(c["teacher_email"], c["enrolled_count"]) for c in out] == [
        ("instr@ucsc.edu", 2),  # TAs are not counted
        ("other@ucsc.edu", 1),
    ]
    # enrollments with their class and its instructor's email, then the counts
    assert list_db.executes <= 2, _trace(list_db)


def test_a_student_with_no_classes_gets_an_empty_list(list_db):
    assert classes.get_classes_for_user(LONER, "student") == []
    assert list_db.executes == 1


def test_instructors_see_the_classes_they_created(list_db):
    out = classes.get_classes_for_user(INSTR, "instructor")
    by_id = {c["id"]: c for c in out}
    assert set(by_id) == {C1, C3}
    assert by_id[C1] == {**_class(C1, INSTR, "CSE 115C", "AAAA1111"), "enrolled_count": 2}
    assert by_id[C3]["enrolled_count"] == 0
    assert list_db.executes <= 2, _trace(list_db)


def test_class_list_lets_http_errors_through(list_db, monkeypatch):
    def unavailable(client, class_ids):
        raise HTTPException(status_code=503, detail="Service unavailable")

    monkeypatch.setattr(classes, "_enrollment_counts_by_class", unavailable)
    with pytest.raises(HTTPException) as exc:
        classes.get_classes_for_user(S1, "student")
    assert (exc.value.status_code, exc.value.detail) == (503, "Service unavailable")
