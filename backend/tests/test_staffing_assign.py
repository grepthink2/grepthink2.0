"""Behaviour + round-trip budgets for the staffing write paths.

assign_user / unassign_user used to route every membership change through
projects.instructor_add_member / instructor_remove_member (8 and 6 round trips
each), and auto_assign called instructor_add_member once per placement — ~486
sequential calls for a 60-student class. These tests pin the batched shape:
membership rows are written directly, `num_members` is derived from rows, and
the response shapes are unchanged.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.staffing import controller as staffing
from tests.fake_supabase import FakeSupabase

INSTR = "instr"
TA1 = "ta-1"
S1, S2, S3, S4 = "s1", "s2", "s3", "s4"
CLASS = "class-1"
OTHER_CLASS = "class-2"
P1, P2, P_OTHER = "proj-1", "proj-2", "proj-other"


def _profile(uid: str) -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "first_name": uid.upper(),
        "last_name": "X",
        "role": "student",
    }


@pytest.fixture
def db(monkeypatch):
    """P1 (team_size 2) = {S1 member}; P2 (team_size 2) = {}; S2-S4 unassigned; TA1 is a TA."""
    fake = FakeSupabase(
        profiles=[_profile(u) for u in (INSTR, TA1, S1, S2, S3, S4)],
        classes=[
            {"id": CLASS, "created_by": INSTR},
            {"id": OTHER_CLASS, "created_by": "someone-else"},
        ],
        class_enrollments=[
            {
                "id": f"e-{u}",
                "class_id": CLASS,
                "user_id": u,
                "enrollment_role": "ta" if u == TA1 else "student",
            }
            for u in (TA1, S1, S2, S3, S4)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "team_size": 2, "num_members": 1},
            {"id": P2, "class_id": CLASS, "name": "Beta", "team_size": 2, "num_members": 0},
            {
                "id": P_OTHER,
                "class_id": OTHER_CLASS,
                "name": "Elsewhere",
                "team_size": 5,
                "num_members": 0,
            },
        ],
        project_members=[{"id": "m1", "project_id": P1, "user_id": S1, "role": "member"}],
        interest_form=[
            {"id": "i1", "user_id": S2, "class_id": CLASS, "project_id": P1, "interest_value": 5},
            {"id": "i2", "user_id": S2, "class_id": CLASS, "project_id": P2, "interest_value": 3},
            {"id": "i3", "user_id": S3, "class_id": CLASS, "project_id": P2, "interest_value": 5},
            {"id": "i4", "user_id": S4, "class_id": CLASS, "project_id": P1, "interest_value": 4},
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _members(db, pid):
    return {r["user_id"]: r["role"] for r in db.rows("project_members") if r["project_id"] == pid}


def _num_members(db, pid):
    return next(p for p in db.rows("projects") if p["id"] == pid)["num_members"]


# ------------------------------------------------------------------ assign_user


def test_assign_moves_student_between_teams_and_recounts(db):
    out = staffing.assign_user(INSTR, CLASS, S1, P2)
    assert out == {
        "message": "User assigned to project",
        "user_id": S1,
        "project_id": P2,
        "previous_project_ids": [P1],
        "added": {"message": "Added member successfully", "user_id": S1, "role": "member"},
    }
    assert _members(db, P1) == {}
    assert _members(db, P2) == {S1: "scrum master"}  # first member of a team without one
    assert _num_members(db, P1) == 0 and _num_members(db, P2) == 1
    assert db.executes <= 8, [q["table"] + ":" + q["op"] for q in db.queries]


def test_assign_unassigned_student_keeps_member_role_when_scrum_master_exists(db):
    db.rows("project_members")[0]["role"] = "scrum master"
    out = staffing.assign_user(INSTR, CLASS, S2, P1)
    assert out["previous_project_ids"] == []
    assert _members(db, P1) == {S1: "scrum master", S2: "member"}
    assert _num_members(db, P1) == 2
    assert db.executes <= 6


def test_assign_already_on_that_team_is_a_cheap_noop(db):
    out = staffing.assign_user(INSTR, CLASS, S1, P1)
    assert out == {
        "message": "User already assigned to this project",
        "user_id": S1,
        "project_id": P1,
    }
    assert _num_members(db, P1) == 1
    assert not any(q["op"] in {"insert", "update", "delete"} for q in db.queries)
    assert db.executes <= 3


def test_assign_rejects_wrong_class_missing_project_and_non_instructor(db):
    with pytest.raises(HTTPException) as wrong:
        staffing.assign_user(INSTR, CLASS, S2, P_OTHER)
    assert wrong.value.status_code == 400
    with pytest.raises(HTTPException) as missing:
        staffing.assign_user(INSTR, CLASS, S2, "nope")
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as denied:
        staffing.assign_user(TA1, CLASS, S2, P1)
    assert denied.value.status_code == 403


def test_assign_inserts_before_removing_so_a_failure_never_strands_the_student(db, monkeypatch):
    real_table = db.table

    def failing_table(name):
        q = real_table(name)
        if name == "project_members":

            def boom(*_a, **_k):
                raise RuntimeError("insert failed")

            q.insert = boom
        return q

    monkeypatch.setattr(db, "table", failing_table)
    with pytest.raises(HTTPException) as exc:
        staffing.assign_user(INSTR, CLASS, S1, P2)
    assert exc.value.status_code == 500
    assert _members(db, P1) == {S1: "member"}  # old membership untouched


# ---------------------------------------------------------------- unassign_user


def test_unassign_removes_from_class_projects_and_recounts(db):
    out = staffing.unassign_user(INSTR, CLASS, S1)
    assert out == {
        "message": "User unassigned from project",
        "user_id": S1,
        "removed_project_ids": [P1],
    }
    assert _members(db, P1) == {}
    assert _num_members(db, P1) == 0
    assert db.executes <= 5


def test_unassign_not_assigned_404(db):
    with pytest.raises(HTTPException) as exc:
        staffing.unassign_user(INSTR, CLASS, S2)
    assert exc.value.status_code == 404


# ------------------------------------------------------------------ auto_assign


def test_auto_assign_places_everyone_in_one_bulk_insert(db):
    out = staffing.auto_assign(INSTR, CLASS)
    # least-options-first: S3 (only P2), S4 (only P1), then S2 (P1 full -> P2)
    assert out == [
        {"user_id": S3, "project_id": P2, "project_name": "Beta", "interest_value": 5},
        {"user_id": S4, "project_id": P1, "project_name": "Alpha", "interest_value": 4},
        {"user_id": S2, "project_id": P2, "project_name": "Beta", "interest_value": 3},
    ]
    assert _members(db, P1) == {S1: "member", S4: "scrum master"}  # P1 had no scrum master
    assert _members(db, P2) == {S3: "scrum master", S2: "member"}
    assert _num_members(db, P1) == 2 and _num_members(db, P2) == 2
    ops = [q["op"] for q in db.queries]
    assert ops.count("insert") == 1
    assert db.executes <= 10, [q["table"] + ":" + q["op"] for q in db.queries]


def test_auto_assign_with_nobody_to_place_writes_nothing(db):
    for uid, pid in ((S2, P2), (S3, P2), (S4, P1)):
        db.rows("project_members").append(
            {"id": f"m-{uid}", "project_id": pid, "user_id": uid, "role": "member"}
        )
    assert staffing.auto_assign(INSTR, CLASS) == []
    assert not any(q["op"] in {"insert", "update", "delete"} for q in db.queries)


def test_auto_assign_skips_students_with_no_open_seat(db):
    db.rows("interest_form")[:] = [
        {"id": "i1", "user_id": S2, "class_id": CLASS, "project_id": P1, "interest_value": 5},
        {"id": "i4", "user_id": S4, "class_id": CLASS, "project_id": P1, "interest_value": 4},
    ]
    out = staffing.auto_assign(INSTR, CLASS)
    assert [p["user_id"] for p in out] == [S2]  # one seat left on P1; S4 has no other choice
    assert S4 not in _members(db, P1)
