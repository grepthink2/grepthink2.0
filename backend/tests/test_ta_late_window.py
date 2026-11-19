"""The TA late window: the per-TA permission, who may change an assignment's late window, the
route that does, the students it notifies, and the TA payloads that carry the permission.

A late window is an assignment's class-wide ``accept_until``. The class instructor sets it, and so
may a TA whose enrollment carries ``can_extend_deadlines``, on the class's TSR assignments only.
"""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.assignments import controller as assignments
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


# ---------------------------------------------------------- who is told


def test_reopening_notifies_students_who_have_not_submitted(db, clock):
    clock(NOW_AFTER)
    assignments.update_assignment(INSTR, A_TSR, None, None, None, None, accept_until=LATE)
    rows = db.rows("notifications")
    # S1 has submitted, and TAs are not students.
    assert sorted(r["user_id"] for r in rows) == sorted([S2, S3])
    assert rows[0]["type"] == "late_window_opened"
    assert rows[0]["title"] == "Late submissions open for TSR 1"
    assert rows[0]["body"] == "You can submit until Jan 12, 12:00 AM (PST)"
    assert (rows[0]["entity_type"], rows[0]["entity_id"]) == ("class", CLASS)


def test_moving_the_window_notifies_again_and_a_draft_notifies_nobody(db, clock):
    clock(NOW_AFTER)
    assignments.update_assignment(INSTR, A_TSR, None, None, None, None, accept_until=LATE)
    later = LATE + dt.timedelta(days=2)
    assignments.update_assignment(INSTR, A_TSR, None, None, None, None, accept_until=later)
    assert len(db.rows("notifications")) == 4
    on_the_draft = dt.datetime(2026, 2, 12, 8, tzinfo=dt.UTC)
    assignments.update_assignment(INSTR, A_DRAFT, None, None, None, None, accept_until=on_the_draft)
    assert len(db.rows("notifications")) == 4


def test_a_window_with_nobody_left_to_tell_inserts_nothing(db, clock):
    clock(NOW_AFTER)
    for student in (S2, S3):
        db.rows("TSRs").append(
            {"id": f"t-{student[-2:]}", "assignment_id": A_TSR, "evaluator_id": student}
        )
    assignments.set_late_window(TA_ON, A_TSR, LATE)
    assert db.rows("notifications") == []
    # assignment, class + enrollment, update, event, recipients (enrollments, TSR rows)
    assert db.executes == 7, _trace(db)


def test_a_failed_notice_never_fails_the_write(db, clock, monkeypatch):
    def unavailable(**_kwargs):
        raise RuntimeError("notifications are down")

    clock(NOW_AFTER)
    monkeypatch.setattr(assignments.notifications, "notify_late_window_opened", unavailable)
    row = assignments.set_late_window(TA_ON, A_TSR, LATE)
    assert row["accept_until"] == "2026-01-12T08:00:00+00:00"
    assert [e["kind"] for e in db.rows("events")] == ["assignment_reopened"]


# ------------------------------------------------- PUT /api/assignments/{id}/late-window


def test_a_permitted_ta_sets_the_window_and_students_are_told(db, clock):
    clock(NOW_AFTER)
    row = assignments.set_late_window(TA_ON, A_TSR, LATE)
    assert row["accept_until"] == "2026-01-12T08:00:00+00:00"
    assert "tsrs" not in row
    assert [e["kind"] for e in db.rows("events")] == ["assignment_reopened"]
    assert db.rows("events")[0]["meta"] == {
        "assignment_id": A_TSR,
        "accept_until": "2026-01-12T08:00:00+00:00",
        "after_deadline": True,
    }
    assert sorted(r["user_id"] for r in db.rows("notifications")) == sorted([S2, S3])
    # assignment, class + enrollment, update, event, recipients (enrollments, TSR rows), insert
    assert db.executes <= 8, _trace(db)


def test_the_instructor_uses_the_same_route(db, clock):
    clock(NOW_AFTER)
    row = assignments.set_late_window(INSTR, A_FB, LATE)
    assert row["accept_until"] == "2026-01-12T08:00:00+00:00"


@pytest.mark.parametrize("user", [TA_OFF, S1, OUTSIDER])
def test_set_late_window_is_refused_without_permission(db, clock, user):
    clock(NOW_AFTER)
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(user, A_TSR, LATE)
    assert (exc.value.status_code, exc.value.detail) == (403, authz.NOT_LATE_WINDOW_EDITOR)
    assert db.rows("assignments")[0].get("accept_until") is None and db.rows("events") == []


def test_permission_is_per_class(db, clock):
    # TA_ON may open late windows in CLASS, not in OTHER_CLASS, where they are a TA without it.
    clock(NOW_AFTER)
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(TA_ON, A_OTHER, LATE)
    assert exc.value.status_code == 403
    other = next(a for a in db.rows("assignments") if a["id"] == A_OTHER)
    assert other.get("accept_until") is None and db.rows("events") == []


def test_a_ta_may_not_touch_a_non_tsr_assignment(db, clock):
    clock(NOW_AFTER)
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(TA_ON, A_FB, LATE)
    assert (exc.value.status_code, exc.value.detail) == (403, assignments.TA_LATE_WINDOW_TSR_ONLY)


@pytest.mark.parametrize("user", [TA_ON, INSTR])
def test_a_draft_takes_no_late_window(db, clock, user):
    clock(NOW_AFTER)
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(user, A_DRAFT, LATE)
    assert (exc.value.status_code, exc.value.detail) == (
        400,
        assignments.LATE_WINDOW_NEEDS_PUBLISHED,
    )


def test_set_late_window_validates_against_the_deadline(db, clock):
    clock(NOW_AFTER)
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(TA_ON, A_TSR, dt.datetime(2026, 1, 9, 7, tzinfo=dt.UTC))
    assert exc.value.detail == assignments.ACCEPT_UNTIL_BEFORE_DEADLINE
    db.rows("assignments")[0]["due_at"] = None
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(TA_ON, A_TSR, LATE)
    assert exc.value.detail == assignments.NO_DEADLINE_TO_EXTEND


def test_naive_accept_until_is_utc(db, clock):
    clock(NOW_AFTER)
    row = assignments.set_late_window(TA_ON, A_TSR, LATE.replace(tzinfo=None))
    assert row["accept_until"] == "2026-01-12T08:00:00+00:00"


def test_resending_the_current_window_writes_nothing(db, clock):
    clock(NOW_AFTER)
    db.rows("assignments")[0]["accept_until"] = "2026-01-12T08:00:00+00:00"
    db.reset_counter()
    row = assignments.set_late_window(TA_ON, A_TSR, LATE)
    assert row["accept_until"] == "2026-01-12T08:00:00+00:00"
    assert db.rows("events") == [] and db.rows("notifications") == []
    assert db.executes == 3, _trace(db)  # assignment, class + enrollment


def test_removing_notifies_nobody(db, clock):
    clock(NOW_AFTER)
    db.rows("assignments")[0]["accept_until"] = "2026-01-12T08:00:00+00:00"
    row = assignments.set_late_window(TA_ON, A_TSR, None)
    assert row["accept_until"] is None
    assert [(e["kind"], e["meta"]) for e in db.rows("events")] == [
        ("late_window_removed", {"assignment_id": A_TSR})
    ]
    assert db.rows("notifications") == []
    assert db.executes <= 5, _trace(db)  # assignment, class + enrollment, update, event


def test_removing_an_absent_window_writes_nothing(db, clock):
    clock(NOW_AFTER)
    assignments.set_late_window(INSTR, A_TSR, None)
    assert db.rows("events") == [] and db.executes == 3, _trace(db)


def test_set_late_window_on_a_missing_assignment_is_404(db, clock):
    with pytest.raises(HTTPException) as exc:
        assignments.set_late_window(INSTR, MISSING_ASSIGNMENT, LATE)
    assert (exc.value.status_code, exc.value.detail) == (404, "Assignment not found")


def test_late_window_route(client, auth_header):
    with patch("app.assignments.views.controller.set_late_window") as fn:
        fn.return_value = {"id": A_TSR, "accept_until": None}
        r = client.put(
            f"/api/assignments/{A_TSR}/late-window",
            json={"accept_until": None},
            headers=auth_header,
        )
    assert r.status_code == 200 and r.json() == {"id": A_TSR, "accept_until": None}
    assert fn.call_args.kwargs == {
        "user_id": "user-abc",
        "assignment_id": UUID(A_TSR),
        "accept_until": None,
    }
    missing_key = client.put(f"/api/assignments/{A_TSR}/late-window", json={}, headers=auth_header)
    assert missing_key.status_code == 422


# ------------------------------------- PATCH /api/tas/classes/{id}/tas/{user}: the permission


def test_the_instructor_grants_and_withdraws_the_permission(db):
    out = tas.set_ta_late_window_permission(INSTR, CLASS, TA_OFF, True)
    assert out == {"user_id": TA_OFF, "can_extend_deadlines": True}
    row = next(
        e for e in db.rows("class_enrollments") if e["user_id"] == TA_OFF and e["class_id"] == CLASS
    )
    assert row["can_extend_deadlines"] is True
    assert db.executes == 3, _trace(db)  # class + enrollment, update
    tas.set_ta_late_window_permission(INSTR, CLASS, TA_OFF, False)
    assert row["can_extend_deadlines"] is False


@pytest.mark.parametrize("target", [S1, OUTSIDER])
def test_permission_needs_a_ta_target(db, target):
    with pytest.raises(HTTPException) as exc:
        tas.set_ta_late_window_permission(INSTR, CLASS, target, True)
    assert (exc.value.status_code, exc.value.detail) == (400, tas.NOT_A_CLASS_TA)
    assert not any(
        e.get("can_extend_deadlines")
        for e in db.rows("class_enrollments")
        if e["user_id"] == target
    )
    assert not [q for q in db.queries if q["op"] == "update"]


def test_only_the_instructor_grants_the_permission(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_ta_late_window_permission(TA_ON, CLASS, TA_OFF, True)
    assert (exc.value.status_code, exc.value.detail) == (403, authz.NOT_CLASS_INSTRUCTOR)


def test_permission_route(client, auth_header):
    with patch("app.tas.views.controller.set_ta_late_window_permission") as fn:
        fn.return_value = {"user_id": TA_OFF, "can_extend_deadlines": True}
        r = client.patch(
            f"/api/tas/classes/{CLASS}/tas/{TA_OFF}",
            json={"can_extend_deadlines": True},
            headers=auth_header,
        )
    assert r.status_code == 200 and r.json()["can_extend_deadlines"] is True
    assert fn.call_args.args == ("user-abc", UUID(CLASS), UUID(TA_OFF), True)


# -------------------------------------------------- what the TA pages are told


def _event(kind: str, actor_id: str, class_id: str) -> dict:
    return {"kind": kind, "actor_id": actor_id, "class_id": class_id, "meta": {}}


def test_late_windows_opened_counts_this_tas_windows_in_this_class(db):
    db.rows("events").extend(
        [
            _event("assignment_reopened", TA_ON, CLASS),
            _event("assignment_reopened", TA_ON, CLASS),
            _event("assignment_reopened", TA_ON, OTHER_CLASS),  # another class
            _event("assignment_reopened", INSTR, CLASS),  # the instructor's own
            _event("late_window_removed", TA_ON, CLASS),  # not an opening
        ]
    )
    tas_ = {t["id"]: t for t in tas.list_class_tas(INSTR, CLASS)}
    assert (tas_[TA_ON]["can_extend_deadlines"], tas_[TA_ON]["late_windows_opened"]) == (True, 2)
    assert (tas_[TA_OFF]["can_extend_deadlines"], tas_[TA_OFF]["late_windows_opened"]) == (False, 0)
    assert db.executes == 5, _trace(db)  # class + enrollments; profiles + projects + events


def test_review_targets_carry_the_flag_and_the_window(db):
    db.rows("assignments")[0]["accept_until"] = "2026-01-12T08:00:00+00:00"
    out = tas.get_ta_review_targets(TA_ON, CLASS)
    assert out["can_extend_deadlines"] is True
    assert set(out["assignments"][0]) == {
        "id",
        "Title",
        "open_date",
        "close_date",
        "due_at",
        "accept_until",
        "status",
        "assignment_type",
    }
    assert out["assignments"][0]["accept_until"] == "2026-01-12T08:00:00+00:00"
    assert tas.get_ta_review_targets(TA_OFF, CLASS)["can_extend_deadlines"] is False
