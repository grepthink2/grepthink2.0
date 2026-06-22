"""
Tests for the TA Management controllers (class-TA designation, project-TA
assignment, meeting metadata, weekly schedule, attendance).

Runs the real controller logic against an in-memory FakeSupabase (the repo's
`mem` fixture references a missing module, so these are self-contained).
"""
import datetime

import pytest
from fastapi import HTTPException

from app.attendance import controller
import app.projects.controller as projects_controller
from tests.fake_supabase import FakeSupabase


INSTR = "instructor-1"
TA1 = "ta-1"
S1 = "student-1"
S2 = "student-2"
S3 = "student-3"
CLASS = "class-1"
P1 = "proj-1"
P2 = "proj-2"


def _profile(uid, first):
    return {"id": uid, "email": f"{uid}@ucsc.edu", "first_name": first, "last_name": "X", "image_url": None}


@pytest.fixture
def db(monkeypatch):
    """Seed a class with two projects; TA1 is a class TA assigned to P1.

    Members:  P1 = {S1, S2},  P2 = {S1, S3}  (S1 is in both projects).
    """
    start = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()  # → week 2
    fake = FakeSupabase(
        profiles=[_profile(INSTR, "Ina"), _profile(TA1, "Tara"),
                  _profile(S1, "Sam"), _profile(S2, "Sara"), _profile(S3, "Sid")],
        classes=[{"id": CLASS, "created_by": INSTR, "term": "fall", "start_date": start}],
        class_enrollments=[{"class_id": CLASS, "user_id": u} for u in (TA1, S1, S2, S3)],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1,
             "zoom_url": None, "meeting_day": "wednesday", "meeting_time": "2:00 PM", "num_members": 2},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None,
             "zoom_url": None, "meeting_day": None, "meeting_time": None, "num_members": 2},
        ],
        project_members=[
            {"project_id": P1, "user_id": S1, "role": "member"},
            {"project_id": P1, "user_id": S2, "role": "member"},
            {"project_id": P2, "user_id": S1, "role": "member"},
            {"project_id": P2, "user_id": S3, "role": "member"},
        ],
        class_tas=[{"class_id": CLASS, "user_id": TA1}],
        attendance=[],
    )
    # Patch both modules: attendance._client() and projects._is_instructor read
    # their own module-level service_client/supabase.
    for mod in (controller, projects_controller):
        monkeypatch.setattr(mod, "service_client", fake, raising=False)
        monkeypatch.setattr(mod, "supabase", fake, raising=False)
    return fake


# --------------------------------------------------------------------------
# Week helpers
# --------------------------------------------------------------------------

def test_term_max_weeks():
    # Meeting weeks follow the class's TSR convention (app.classes.controller):
    # full terms => _FULL_TSR_COUNT, summer/unknown => _SUMMER_TSR_COUNT.
    assert controller._term_max_weeks("fall") == 5
    assert controller._term_max_weeks("Winter") == 5
    assert controller._term_max_weeks("summer") == 3
    assert controller._term_max_weeks(None) == 3


def test_current_term_week_clamps():
    today = datetime.date.today()
    assert controller._current_term_week(today.isoformat(), "fall") == 1
    assert controller._current_term_week((today - datetime.timedelta(days=7)).isoformat(), "fall") == 2
    # Far in the past clamps to max weeks (5 for fall, per the TSR convention).
    assert controller._current_term_week((today - datetime.timedelta(days=400)).isoformat(), "fall") == 5


# --------------------------------------------------------------------------
# Class TA designation
# --------------------------------------------------------------------------

def test_designate_and_list_class_ta(db):
    controller.set_class_ta(CLASS, INSTR, S2, True)
    tas = controller.list_class_tas(CLASS, INSTR, "instructor")
    flags = {t["user_id"]: t["is_ta"] for t in tas}
    assert flags[TA1] is True
    assert flags[S2] is True
    assert flags[S1] is False


def test_designate_requires_enrollment(db):
    with pytest.raises(HTTPException) as exc:
        controller.set_class_ta(CLASS, INSTR, "not-enrolled", True)
    assert exc.value.status_code == 400


def test_designate_requires_instructor(db):
    with pytest.raises(HTTPException) as exc:
        controller.set_class_ta(CLASS, S1, S2, True)
    assert exc.value.status_code == 403


def test_undesignate_clears_project_assignment(db):
    # TA1 is assigned to P1; removing TA1 as class TA clears that assignment.
    controller.set_class_ta(CLASS, INSTR, TA1, False)
    assert controller.is_class_ta(TA1, CLASS) is False
    p1 = next(p for p in db.rows("projects") if p["id"] == P1)
    assert p1["assigned_ta_id"] is None


# --------------------------------------------------------------------------
# Project TA assignment
# --------------------------------------------------------------------------

def test_assign_project_ta_requires_designated_ta(db):
    # S1 is enrolled but not a class TA → cannot be assigned.
    with pytest.raises(HTTPException) as exc:
        controller.assign_project_ta(P2, INSTR, S1)
    assert exc.value.status_code == 400


def test_assign_and_unassign_project_ta(db):
    controller.assign_project_ta(P2, INSTR, TA1)
    p2 = next(p for p in db.rows("projects") if p["id"] == P2)
    assert p2["assigned_ta_id"] == TA1
    controller.assign_project_ta(P2, INSTR, None)
    p2 = next(p for p in db.rows("projects") if p["id"] == P2)
    assert p2["assigned_ta_id"] is None


def test_assign_project_ta_requires_instructor(db):
    with pytest.raises(HTTPException) as exc:
        controller.assign_project_ta(P1, TA1, TA1)
    assert exc.value.status_code == 403


# --------------------------------------------------------------------------
# Meeting / Zoom metadata
# --------------------------------------------------------------------------

def test_update_meeting_by_assigned_ta(db):
    controller.update_project_meeting(P1, TA1, zoom_url="https://zoom.us/j/1", meeting_time="2:00–2:30 PM")
    p1 = next(p for p in db.rows("projects") if p["id"] == P1)
    assert p1["zoom_url"] == "https://zoom.us/j/1"
    assert p1["meeting_time"] == "2:00–2:30 PM"


def test_update_meeting_denied_for_unassigned_ta(db):
    # TA1 is not assigned to P2 → cannot edit it.
    with pytest.raises(HTTPException) as exc:
        controller.update_project_meeting(P2, TA1, zoom_url="https://zoom.us/j/2")
    assert exc.value.status_code == 403


def test_update_meeting_rejects_bad_day(db):
    with pytest.raises(HTTPException) as exc:
        controller.update_project_meeting(P1, INSTR, meeting_day="someday")
    assert exc.value.status_code == 400


# --------------------------------------------------------------------------
# Attendance
# --------------------------------------------------------------------------

def test_mark_attendance_by_instructor_and_assigned_ta(db):
    controller.upsert_attendance(P1, INSTR, S1, 3, "present")
    controller.upsert_attendance(P1, TA1, S2, 3, "late")
    rows = [a for a in db.rows("attendance") if a["project_id"] == P1 and a["week_number"] == 3]
    statuses = {a["user_id"]: a["status"] for a in rows}
    assert statuses == {S1: "present", S2: "late"}


def test_mark_attendance_denied_for_unassigned_ta(db):
    with pytest.raises(HTTPException) as exc:
        controller.upsert_attendance(P2, TA1, S1, 3, "present")
    assert exc.value.status_code == 403


def test_mark_attendance_rejects_non_member(db):
    # S3 is not a member of P1.
    with pytest.raises(HTTPException) as exc:
        controller.upsert_attendance(P1, INSTR, S3, 3, "present")
    assert exc.value.status_code == 400


def test_mark_attendance_idempotent(db):
    controller.upsert_attendance(P1, INSTR, S1, 3, "present")
    controller.upsert_attendance(P1, INSTR, S1, 3, "absent")  # re-mark same slot
    rows = [a for a in db.rows("attendance") if a["project_id"] == P1 and a["user_id"] == S1 and a["week_number"] == 3]
    assert len(rows) == 1
    assert rows[0]["status"] == "absent"


def test_attendance_separate_per_project(db):
    # S1 is in both P1 and P2 → independent rows for the same week.
    controller.upsert_attendance(P1, INSTR, S1, 3, "present")
    controller.upsert_attendance(P2, INSTR, S1, 3, "absent")
    rows = [a for a in db.rows("attendance") if a["user_id"] == S1 and a["week_number"] == 3]
    assert len(rows) == 2
    by_proj = {a["project_id"]: a["status"] for a in rows}
    assert by_proj == {P1: "present", P2: "absent"}


def test_mark_attendance_rejects_out_of_range_week(db):
    with pytest.raises(HTTPException) as exc:
        controller.upsert_attendance(P1, INSTR, S1, 99, "present")
    assert exc.value.status_code == 400


def test_mark_all_present(db):
    records = controller.mark_all_present(P1, INSTR, 4)
    assert len(records) == 2  # S1, S2
    rows = [a for a in db.rows("attendance") if a["project_id"] == P1 and a["week_number"] == 4]
    assert all(a["status"] == "present" for a in rows)
    assert {a["user_id"] for a in rows} == {S1, S2}


# --------------------------------------------------------------------------
# Schedule + attendance reads
# --------------------------------------------------------------------------

def test_schedule_all_for_instructor_with_summary(db):
    controller.upsert_attendance(P1, INSTR, S1, 3, "present")
    sched = controller.get_ta_schedule(CLASS, INSTR, "instructor", week_number=3, scope="all")
    assert sched["week_number"] == 3
    assert sched["total_weeks"] == 5
    teams = {t["project_id"]: t for t in sched["teams"]}
    assert teams[P1]["attendance_present"] == 1
    assert teams[P1]["attendance_total"] == 2
    assert teams[P1]["assigned_ta"]["id"] == TA1


def test_schedule_all_denied_for_student(db):
    with pytest.raises(HTTPException) as exc:
        controller.get_ta_schedule(CLASS, S1, "student", week_number=3, scope="all")
    assert exc.value.status_code == 403


def test_schedule_mine_filters_to_assigned(db):
    sched = controller.get_ta_schedule(CLASS, TA1, "student", week_number=3, scope="mine")
    ids = {t["project_id"] for t in sched["teams"]}
    assert ids == {P1}  # TA1 only assigned to P1


def test_schedule_my_team_filters_to_membership(db):
    sched = controller.get_ta_schedule(CLASS, S3, "student", week_number=3, scope="my-team")
    ids = {t["project_id"] for t in sched["teams"]}
    assert ids == {P2}  # S3 only in P2


def test_team_attendance_member_sees_only_self(db):
    controller.upsert_attendance(P1, INSTR, S1, 3, "present")
    controller.upsert_attendance(P1, INSTR, S2, 3, "absent")
    res = controller.get_team_attendance(P1, S1, 3)
    assert [e["person_id"] for e in res["entries"]] == [S1]
    assert res["entries"][0]["status"] == "present"


def test_team_attendance_editor_sees_all(db):
    res = controller.get_team_attendance(P1, INSTR, 3)
    ids = {e["person_id"] for e in res["entries"]}
    assert ids == {S1, S2}
    assert all(e["status"] == "unmarked" for e in res["entries"])


def test_team_attendance_non_member_denied(db):
    with pytest.raises(HTTPException) as exc:
        controller.get_team_attendance(P1, S3, 3)
    assert exc.value.status_code == 403
