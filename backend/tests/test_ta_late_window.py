"""The TA late window: the per-TA permission, who may change an assignment's late window, the
route that does, the students it notifies, and the TA payloads that carry the permission.

A late window is an assignment's class-wide ``accept_until``. The class instructor sets it, and so
may a TA whose enrollment carries ``can_extend_deadlines``, on the class's TSR assignments only.
"""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi import HTTPException

from app.assignments import deadlines
from app.core import authz
from app.tas import controller as tas
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2"
TA_ON, TA_OFF = "00000000-0000-4000-8000-0000000000b1", "00000000-0000-4000-8000-0000000000b2"
S1, S2, S3, OUTSIDER = (
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000009",
)
CLASS, OTHER_CLASS = "00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000c2"
MISSING_CLASS = "00000000-0000-4000-8000-0000000000cf"
P1 = "00000000-0000-4000-8000-0000000000d1"
A_TSR, A_DRAFT, A_FB, A_OTHER = (
    "00000000-0000-4000-8000-0000000000e1",
    "00000000-0000-4000-8000-0000000000e2",
    "00000000-0000-4000-8000-0000000000e3",
    "00000000-0000-4000-8000-0000000000e4",
)
MISSING_ASSIGNMENT = "00000000-0000-4000-8000-0000000000ef"

NOW_AFTER = dt.datetime(2026, 1, 10, 12, 0, tzinfo=dt.UTC)  # after A_TSR's deadline
LATE = dt.datetime(2026, 1, 12, 8, 0, tzinfo=dt.UTC)  # a late window three days past it


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid: str, first: str, role: str = "student") -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "first_name": first,
        "last_name": "X",
        "role": role,
    }


def _enrollment(class_id: str, uid: str, role: str = "student", *, can_extend: bool = False):
    return {
        "id": f"e-{class_id[-2:]}-{uid[-2:]}",
        "class_id": class_id,
        "user_id": uid,
        "enrollment_role": role,
        "can_extend_deadlines": can_extend,
    }


def _assignment(aid: str, class_id: str, title: str, kind: str, status: str) -> dict:
    return {
        "id": aid,
        "class_id": class_id,
        "Title": title,
        "assignment_type": kind,
        "status": status,
        "open_date": "2026-01-01",
        "close_date": "2026-01-08",
        "due_at": "2026-01-09T08:00:00+00:00",
        "created_at": "2026-01-01T00:00:00+00:00",
    }


@pytest.fixture
def db(monkeypatch):
    """INSTR teaches CLASS (no school: Pacific time). TA_ON may open late windows there, TA_OFF may
    not; S1, S2 and S3 are its students, and S1 has submitted A_TSR. TA_ON is also a TA without the
    permission in OTHER_CLASS, which OTHER_INSTR teaches. OUTSIDER is enrolled nowhere."""
    fake = FakeSupabase(
        profiles=[
            _profile(INSTR, "Ina", "instructor"),
            _profile(OTHER_INSTR, "Ivo", "instructor"),
            _profile(TA_ON, "Tara"),
            _profile(TA_OFF, "Theo"),
            _profile(S1, "Sam"),
            _profile(S2, "Sara"),
            _profile(S3, "Sid"),
            _profile(OUTSIDER, "Oz"),
        ],
        classes=[
            {"id": CLASS, "created_by": INSTR},
            {"id": OTHER_CLASS, "created_by": OTHER_INSTR},
        ],
        class_enrollments=[
            _enrollment(CLASS, TA_ON, "ta", can_extend=True),
            _enrollment(CLASS, TA_OFF, "ta"),
            _enrollment(CLASS, S1),
            _enrollment(CLASS, S2),
            _enrollment(CLASS, S3),
            _enrollment(OTHER_CLASS, TA_ON, "ta"),
        ],
        projects=[{"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA_ON}],
        assignments=[
            _assignment(A_TSR, CLASS, "TSR 1", "tsr", "publish"),
            _assignment(A_DRAFT, CLASS, "TSR 2", "tsr", "draft"),
            _assignment(A_FB, CLASS, "Feedback", "feedback", "publish"),
            _assignment(A_OTHER, OTHER_CLASS, "TSR 1", "tsr", "publish"),
        ],
        TSRs=[
            {
                "id": "t-1",
                "assignment_id": A_TSR,
                "project_id": P1,
                "evaluator_id": S1,
                "evaluatee_id": S2,
                "percent_contribution": 50,
                "positive_feedback": "p",
                "constructive_feedback": None,
                "scrum_master_tickets": None,
                "scrum_master_assessment": None,
                "scrum_master_notes": None,
                "created_at": "2026-01-05T00:00:00+00:00",
                "updated_at": "2026-01-05T00:00:00+00:00",
            }
        ],
        project_review_tas=[],
        events=[],
        notifications=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.fixture
def clock(monkeypatch):
    def set_now(value):
        monkeypatch.setattr(deadlines, "now_utc", lambda: value)

    return set_now


# ------------------------------------------------------------- the permission


def test_demote_clears_the_late_window_permission(db):
    out = tas.demote_ta(INSTR, CLASS, TA_ON)
    row = next(
        e for e in db.rows("class_enrollments") if e["user_id"] == TA_ON and e["class_id"] == CLASS
    )
    assert row["enrollment_role"] == "student"
    assert row["can_extend_deadlines"] is False
    assert out == {"user_id": TA_ON, "enrollment_role": "student"}


# ---------------------------------------------------------- who may change it


def test_late_window_access_for_the_instructor_and_a_permitted_ta(db):
    assert authz.require_late_window_access(db, INSTR, CLASS)["id"] == CLASS
    assert authz.require_late_window_access(db, TA_ON, CLASS)["id"] == CLASS
    assert db.executes == 4, _trace(db)  # class + enrollment, twice


@pytest.mark.parametrize("user", [TA_OFF, S1, OUTSIDER, OTHER_INSTR])
def test_late_window_access_is_refused_without_the_flag(db, user):
    with pytest.raises(HTTPException) as exc:
        authz.require_late_window_access(db, user, CLASS)
    assert (exc.value.status_code, exc.value.detail) == (403, authz.NOT_LATE_WINDOW_EDITOR)


def test_late_window_access_on_a_missing_class_is_404(db):
    with pytest.raises(HTTPException) as exc:
        authz.require_late_window_access(db, INSTR, MISSING_CLASS)
    assert (exc.value.status_code, exc.value.detail) == (404, authz.CLASS_NOT_FOUND)
