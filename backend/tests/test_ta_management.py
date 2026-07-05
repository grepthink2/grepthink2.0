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
import app.tas.controller as tas_controller
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
        classes=[{"id": CLASS, "created_by": INSTR, "term": "fall", "start_date": start,
                  "meetings_per_week": 2, "meeting_duration_minutes": 30}],
        class_enrollments=[
            {"id": f"enr-{u}", "class_id": CLASS, "user_id": u,
             "enrollment_role": ("ta" if u == TA1 else "student")}
            for u in (TA1, S1, S2, S3)
        ],
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
        attendance=[],
    )
    # Patch every module whose _client() these controllers reach: attendance
    # delegates class-TA writes to tas_controller, and projects._is_instructor
    # reads its own module-level client.
    for mod in (controller, projects_controller, tas_controller):
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


def test_meeting_weeks():
    # TA meetings span the working term (wider than the TSR window).
    assert controller._meeting_weeks("fall") == 10
    assert controller._meeting_weeks("Spring") == 10
    assert controller._meeting_weeks("summer") == 6
    assert controller._meeting_weeks(None) == 6


def test_current_term_week_clamps():
    today = datetime.date.today()
    assert controller._current_term_week(today.isoformat(), "fall") == 1
    assert controller._current_term_week((today - datetime.timedelta(days=7)).isoformat(), "fall") == 2
    # Far in the past clamps to the meeting-week count (10 for a full term).
    assert controller._current_term_week((today - datetime.timedelta(days=400)).isoformat(), "fall") == 10


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


def test_undesignate_clears_assigned_and_review(db):
    # TA1 is P1's assigned TA (meeting + attendance + TSR review) and also holds
    # an end-of-quarter review claim on P2. Removing TA1 as a class TA flips
    # enrollment_role back to student and clears BOTH roles.
    db.rows("project_review_tas").append(
        {"id": "prt-1", "class_id": CLASS, "project_id": P2, "user_id": TA1}
    )
    controller.set_class_ta(CLASS, INSTR, TA1, False)
    assert controller.is_class_ta(TA1, CLASS) is False
    p1 = next(p for p in db.rows("projects") if p["id"] == P1)
    assert p1["assigned_ta_id"] is None
    assert not [r for r in db.rows("project_review_tas") if r["user_id"] == TA1]


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
    out = controller.upsert_meeting(P1, TA1, meeting_in_week=1,
                                    zoom_url="https://zoom.us/j/1", meeting_day="tuesday", meeting_time="2:00 PM")
    assert out["zoom_url"] == "https://zoom.us/j/1"
    assert out["meeting_day"] == "tuesday"
    assert out["meeting_time"] == "2:00 PM"
    # a meetings row was created for (P1, sequence 1)
    m = next(r for r in db.rows("meetings") if r["project_id"] == P1 and r["sequence"] == 1)
    assert m["day_of_week"] == "tuesday" and m["zoom_url"] == "https://zoom.us/j/1"


def test_update_meeting_denied_for_unassigned_ta(db):
    # TA1 is not assigned to P2 → cannot edit it.
    with pytest.raises(HTTPException) as exc:
        controller.upsert_meeting(P2, TA1, zoom_url="https://zoom.us/j/2")
    assert exc.value.status_code == 403


def test_update_meeting_rejects_bad_day(db):
    with pytest.raises(HTTPException) as exc:
        controller.upsert_meeting(P1, INSTR, meeting_day="someday")
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
    assert sched["total_weeks"] == 10
    assert sched["meetings_per_week"] == 2
    assert sched["meeting_in_week"] == 1
    assert sched["total_meetings"] == 20  # 10 weeks x 2 meetings
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


# --------------------------------------------------------------------------
# Per-meeting cadence (meetings_per_week)
# --------------------------------------------------------------------------

def test_attendance_distinct_per_meeting(db):
    # Same (project, person, week) but different meeting-in-week → independent rows.
    controller.upsert_attendance(P1, INSTR, S1, 3, "present", meeting_in_week=1)
    controller.upsert_attendance(P1, INSTR, S1, 3, "absent", meeting_in_week=2)
    rows = [a for a in db.rows("attendance")
            if a["project_id"] == P1 and a["user_id"] == S1 and a["week_number"] == 3]
    assert len(rows) == 2
    # meeting 1 and meeting 2 resolve to distinct meetings -> distinct meeting_ids
    seq_by_mid = {m["id"]: m["sequence"] for m in db.rows("meetings") if m["project_id"] == P1}
    by_seq = {seq_by_mid[a["meeting_id"]]: a["status"] for a in rows}
    assert by_seq == {1: "present", 2: "absent"}


def test_mark_attendance_rejects_out_of_range_meeting(db):
    # Class is 2 meetings/week → meeting 3 is invalid.
    with pytest.raises(HTTPException) as exc:
        controller.upsert_attendance(P1, INSTR, S1, 3, "present", meeting_in_week=3)
    assert exc.value.status_code == 400


def test_team_attendance_filtered_by_meeting(db):
    controller.upsert_attendance(P1, INSTR, S1, 3, "present", meeting_in_week=1)
    controller.upsert_attendance(P1, INSTR, S1, 3, "absent", meeting_in_week=2)
    m1 = controller.get_team_attendance(P1, INSTR, 3, 1)
    m2 = controller.get_team_attendance(P1, INSTR, 3, 2)
    assert m1["meeting_in_week"] == 1
    assert {e["person_id"]: e["status"] for e in m1["entries"]}[S1] == "present"
    assert {e["person_id"]: e["status"] for e in m2["entries"]}[S1] == "absent"


def test_schedule_summary_is_per_meeting(db):
    controller.upsert_attendance(P1, INSTR, S1, 3, "present", meeting_in_week=2)
    s1 = controller.get_ta_schedule(CLASS, INSTR, "instructor", week_number=3, scope="all", meeting_in_week=1)
    s2 = controller.get_ta_schedule(CLASS, INSTR, "instructor", week_number=3, scope="all", meeting_in_week=2)
    p1_m1 = next(t for t in s1["teams"] if t["project_id"] == P1)
    p1_m2 = next(t for t in s2["teams"] if t["project_id"] == P1)
    assert p1_m1["attendance_present"] == 0
    assert p1_m2["attendance_present"] == 1


def test_set_meeting_cadence(db):
    controller.set_meeting_cadence(CLASS, INSTR, meetings_per_week=1, meeting_duration_minutes=45)
    cls = next(c for c in db.rows("classes") if c["id"] == CLASS)
    assert cls["meetings_per_week"] == 1
    assert cls["meeting_duration_minutes"] == 45


def test_set_meeting_cadence_requires_instructor(db):
    with pytest.raises(HTTPException) as exc:
        controller.set_meeting_cadence(CLASS, TA1, meetings_per_week=3)
    assert exc.value.status_code == 403


def test_set_meeting_cadence_rejects_bad_value(db):
    with pytest.raises(HTTPException) as exc:
        controller.set_meeting_cadence(CLASS, INSTR, meetings_per_week=9)
    assert exc.value.status_code == 400


def test_current_meeting_in_week_advances_with_time(db):
    """Auto meeting-in-week tracks the clock: M1 early week, in-progress M1 wins,
    M2 mid-week, then rolls back to next week's M1 once both are done."""
    controller.upsert_meeting(P1, INSTR, meeting_in_week=1, meeting_day="tuesday", meeting_time="9:00 AM")
    controller.upsert_meeting(P1, INSTR, meeting_in_week=2, meeting_day="friday", meeting_time="3:00 PM")

    # Snap to a Monday 08:00 so weekday math is deterministic regardless of run date.
    base = datetime.datetime(2026, 7, 6, 8, 0)
    monday = base - datetime.timedelta(days=base.weekday())

    def at(days, hour, minute=0):
        return monday + datetime.timedelta(days=days, hours=hour - 8, minutes=minute)

    assert controller._current_meeting_in_week(db, [P1], 2, now=monday) == 1          # Mon → next is Tue M1
    assert controller._current_meeting_in_week(db, [P1], 2, now=at(1, 9, 10)) == 1     # Tue 09:10 → M1 in progress
    assert controller._current_meeting_in_week(db, [P1], 2, now=at(2, 12)) == 2        # Wed → Fri M2 upcoming
    assert controller._current_meeting_in_week(db, [P1], 2, now=at(4, 16)) == 1        # Fri late → rolls to next Tue M1


def test_current_meeting_in_week_edge_cases(db):
    controller.upsert_meeting(P1, INSTR, meeting_in_week=1, meeting_day="tuesday", meeting_time="9:00 AM")
    assert controller._current_meeting_in_week(db, [P1], 1) == 1   # single cadence → always 1
    assert controller._current_meeting_in_week(db, [], 2) == 1     # no teams → 1
