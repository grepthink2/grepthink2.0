"""Round-trip budgets + behaviour for the attendance module after batching.

Before: ``mark_all_present`` issued a select and an update/insert per member
(5 + 2N round trips), ``upsert_attendance`` 7-8, ``get_ta_schedule`` 9-11
sequential reads (the class row and the caller's enrollment were each read
twice), ``get_team_attendance`` 6, and the student schedule view followed up
with one ``get_team_attendance`` request per team just to learn its own status.

Behavioural coverage of the same functions lives in test_ta_management.py; this
file pins the shape of the work and the new ``viewer_status`` field.
"""

from __future__ import annotations

import datetime
from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.attendance import controller
from tests.fake_supabase import FakeSupabase

INSTR = "instructor-1"
TA1 = "ta-1"
S1, S2, S3 = "student-1", "student-2", "student-3"
OUTSIDER = "outsider"
CLASS = "class-1"
P1, P2 = "proj-1", "proj-2"

WRITE_OPS = {"insert", "update", "upsert", "delete"}
NAMES = {INSTR: "Ina", TA1: "Tara", S1: "Sam", S2: "Sara", S3: "Sid", OUTSIDER: "Oz"}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


@pytest.fixture
def db(monkeypatch):
    """Fall class, 2 meetings/week. TA1 is P1's assigned TA. P1 = {S1, S2}, P2 = {S1, S3}."""
    start = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
    fake = FakeSupabase(
        profiles=[
            {
                "id": uid,
                "email": f"{uid}@ucsc.edu",
                "first_name": first,
                "last_name": "X",
                "image_url": None,
            }
            for uid, first in NAMES.items()
        ],
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "term": "fall",
                "start_date": start,
                "meetings_per_week": 2,
                "meeting_duration_minutes": 30,
            }
        ],
        class_enrollments=[
            {
                "id": f"enr-{u}",
                "class_id": CLASS,
                "user_id": u,
                "enrollment_role": "ta" if u == TA1 else "student",
            }
            for u in (TA1, S1, S2, S3)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1, "num_members": 2},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None, "num_members": 2},
        ],
        project_members=[
            {"project_id": P1, "user_id": S1, "role": "member"},
            {"project_id": P1, "user_id": S2, "role": "member"},
            {"project_id": P2, "user_id": S1, "role": "member"},
            {"project_id": P2, "user_id": S3, "role": "member"},
        ],
        meetings=[],
        attendance=[],
        relations={
            ("projects", "classes"): ("class_id", "id", False),
            ("projects", "project_members"): ("id", "project_id", True),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _rows(db, pid, week):
    return [a for a in db.rows("attendance") if a["project_id"] == pid and a["week_number"] == week]


def _seed_meeting(db, pid, seq, day, time):
    mid = f"m-{pid}-{seq}"
    db.rows("meetings").append(
        {
            "id": mid,
            "class_id": CLASS,
            "project_id": pid,
            "sequence": seq,
            "day_of_week": day,
            "start_time": time,
            "zoom_url": None,
            "duration_minutes": 30,
            "cadence": "weekly",
            "scheduled_at": None,
            "title": None,
        }
    )
    return mid


# ------------------------------------------------------------------ writes


def test_mark_all_present_is_one_bulk_upsert(db):
    records = controller.mark_all_present(P1, INSTR, 4)
    assert {r["user_id"] for r in records} == {S1, S2}
    rows = _rows(db, P1, 4)
    assert {r["user_id"]: r["status"] for r in rows} == {S1: "present", S2: "present"}
    assert all(r["marked_by"] == INSTR and r["meeting_id"] for r in rows)
    ops = [q["op"] for q in db.queries]
    assert ops.count("upsert") == 1 and "update" not in ops
    # project+class, members, meeting lookup, meeting create, upsert
    assert db.executes <= 5, _trace(db)


def test_mark_all_present_overwrites_existing_marks_without_duplicates(db):
    controller.upsert_attendance(P1, INSTR, S1, 4, "absent")
    controller.mark_all_present(P1, TA1, 4)
    rows = _rows(db, P1, 4)
    assert len(rows) == 2
    assert {r["user_id"]: r["status"] for r in rows} == {S1: "present", S2: "present"}
    assert {r["marked_by"] for r in rows} == {TA1}


def test_upsert_attendance_budget(db):
    record = controller.upsert_attendance(P1, TA1, S2, 3, "late")
    assert record["status"] == "late" and record["user_id"] == S2
    assert db.executes <= 5, _trace(db)
    db.reset_counter()
    controller.upsert_attendance(P1, TA1, S1, 3, "present")
    assert db.executes <= 4, _trace(db)  # the meeting slot exists now


def test_invalid_attendance_writes_nothing(db):
    for args, kwargs, status in (
        ((P1, INSTR, S1, 99, "present"), {}, 400),  # week outside the term
        ((P1, INSTR, S1, 3, "present"), {"meeting_in_week": 3}, 400),  # 2 meetings/week
        ((P1, INSTR, S3, 3, "present"), {}, 400),  # not a member of P1
        ((P2, TA1, S1, 3, "present"), {}, 403),  # TA1 is not P2's TA
        ((P1, INSTR, S1, 3, "maybe"), {}, 400),  # bad status
    ):
        with pytest.raises(HTTPException) as exc:
            controller.upsert_attendance(*args, **kwargs)
        assert exc.value.status_code == status, (args, kwargs)
    assert not any(q["op"] in WRITE_OPS for q in db.queries)
    assert db.rows("meetings") == [] and db.rows("attendance") == []


def test_editor_check_uses_the_embedded_class_row(db):
    with pytest.raises(HTTPException) as exc:
        controller.mark_all_present(P2, TA1, 3)
    assert exc.value.status_code == 403
    assert db.executes == 1, _trace(db)  # no separate classes read for the instructor check


# ---------------------------------------------------------------- schedule


def test_schedule_for_instructor_is_bounded_and_marks_viewer_status_none(db):
    m1 = _seed_meeting(db, P1, 1, "tuesday", "09:00:00")
    db.rows("attendance").append(
        {
            "id": "a1",
            "meeting_id": m1,
            "project_id": P1,
            "user_id": S1,
            "week_number": 3,
            "status": "present",
        }
    )
    sched = controller.get_ta_schedule(CLASS, INSTR, week_number=3, scope="all", meeting_in_week=1)
    teams = {t["project_id"]: t for t in sched["teams"]}
    assert teams[P1]["attendance_present"] == 1 and teams[P1]["attendance_total"] == 2
    assert teams[P1]["meeting_id"] == m1
    assert (teams[P1]["meeting_day"], teams[P1]["meeting_time"]) == ("tuesday", "9:00 AM")
    assert teams[P1]["assigned_ta"] == {
        "id": TA1,
        "name": "Tara X",
        "email": "ta-1@ucsc.edu",
        "image_url": None,
    }
    assert teams[P2]["assigned_ta"] is None and teams[P2]["meeting_id"] is None
    assert teams[P1]["viewer_status"] is None and teams[P2]["viewer_status"] is None
    assert sched["meeting_in_week"] == 1 and sched["total_meetings"] == 20
    assert db.executes <= 6, _trace(db)


def test_schedule_auto_meeting_pick_reads_meetings_once(db):
    _seed_meeting(db, P1, 1, "tuesday", "09:00:00")
    _seed_meeting(db, P1, 2, "friday", "15:00:00")
    sched = controller.get_ta_schedule(CLASS, INSTR, week_number=3, scope="all")
    assert sched["meeting_in_week"] in (1, 2)
    assert sum(1 for q in db.queries if q["table"] == "meetings") == 1, _trace(db)
    assert db.executes <= 6, _trace(db)


def test_my_team_schedule_carries_the_viewers_own_status(db):
    m1 = _seed_meeting(db, P1, 1, "tuesday", "09:00:00")
    db.rows("attendance").append(
        {
            "id": "a1",
            "meeting_id": m1,
            "project_id": P1,
            "user_id": S1,
            "week_number": 3,
            "status": "late",
        }
    )
    sched = controller.get_ta_schedule(CLASS, S1, week_number=3, scope="my-team", meeting_in_week=1)
    assert {t["project_id"]: t["viewer_status"] for t in sched["teams"]} == {
        P1: "late",
        P2: "unmarked",
    }
    assert db.executes <= 6, _trace(db)


def test_schedule_access_rules(db):
    with pytest.raises(HTTPException) as student_all:
        controller.get_ta_schedule(CLASS, S1, week_number=3, scope="all")
    assert student_all.value.status_code == 403
    with pytest.raises(HTTPException) as outsider:
        controller.get_ta_schedule(CLASS, OUTSIDER, week_number=3, scope="my-team")
    assert outsider.value.status_code == 403
    with pytest.raises(HTTPException) as missing:
        controller.get_ta_schedule("no-such-class", INSTR, week_number=3, scope="all")
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as bad_scope:
        controller.get_ta_schedule(CLASS, INSTR, week_number=3, scope="everything")
    assert bad_scope.value.status_code == 400
    mine = controller.get_ta_schedule(CLASS, TA1, week_number=3, scope="mine")
    assert [t["project_id"] for t in mine["teams"]] == [P1]


def test_schedule_with_no_teams_still_returns_meta(db):
    db.rows("projects").clear()
    sched = controller.get_ta_schedule(CLASS, INSTR, week_number=2, scope="all")
    assert sched["teams"] == [] and sched["week_number"] == 2 and sched["total_weeks"] == 10


# ------------------------------------------------------------ attendance read


def test_team_attendance_budget_and_visibility(db):
    m1 = _seed_meeting(db, P1, 1, "tuesday", "09:00:00")
    db.rows("attendance").append(
        {
            "id": "a1",
            "meeting_id": m1,
            "project_id": P1,
            "user_id": S2,
            "week_number": 3,
            "status": "absent",
        }
    )
    editor = controller.get_team_attendance(P1, TA1, 3, 1)
    assert [(e["person_id"], e["status"]) for e in editor["entries"]] == [
        (S1, "unmarked"),
        (S2, "absent"),
    ]
    assert db.executes <= 5, _trace(db)

    db.reset_counter()
    own = controller.get_team_attendance(P1, S2, 3, 1)
    assert [(e["person_id"], e["status"]) for e in own["entries"]] == [(S2, "absent")]
    assert db.executes <= 5, _trace(db)

    with pytest.raises(HTTPException) as exc:
        controller.get_team_attendance(P1, S3, 3, 1)
    assert exc.value.status_code == 403


# ------------------------------------------------------ TA roster + metadata


def test_list_class_tas_budget(db):
    out = controller.list_class_tas(CLASS, S1)
    assert out[0] == {
        "user_id": TA1,
        "name": "Tara X",
        "email": "ta-1@ucsc.edu",
        "image_url": None,
        "is_ta": True,
    }
    assert db.executes <= 3, _trace(db)
    with pytest.raises(HTTPException) as exc:
        controller.list_class_tas(CLASS, OUTSIDER)
    assert exc.value.status_code == 403


def test_assign_ta_and_meeting_edit_skip_the_extra_class_read(db):
    controller.assign_project_ta(P2, INSTR, TA1)
    assert next(p for p in db.rows("projects") if p["id"] == P2)["assigned_ta_id"] == TA1
    assert db.executes <= 3, _trace(db)

    db.reset_counter()
    out = controller.upsert_meeting(
        P1, TA1, meeting_in_week=2, meeting_day="friday", meeting_time="3:00 PM"
    )
    assert (out["meeting_day"], out["meeting_time"]) == ("friday", "3:00 PM")
    assert db.executes <= 4, _trace(db)


# -------------------------------------------------------------- time helpers


def test_current_term_week_is_deterministic_with_an_injected_date():
    today = datetime.date(2026, 10, 15)
    assert controller._current_term_week("2026-10-15", "fall", today=today) == 1
    assert controller._current_term_week("2026-10-08", "fall", today=today) == 2
    assert controller._current_term_week("2025-01-01", "fall", today=today) == 10
    assert controller._current_term_week("2025-01-01", "summer", today=today) == 6
    assert controller._current_term_week(None, "fall", today=today) == 1


def test_class_today_uses_pacific_time():
    # 03:00 UTC on Oct 16 is still Oct 15 in Santa Cruz (PDT = UTC-7).
    late_evening = datetime.datetime(2026, 10, 16, 3, 0, tzinfo=datetime.UTC)
    assert controller._class_today(now=late_evening) == datetime.date(2026, 10, 15)


# ------------------------------------------------------------ view wiring

CLASS_UUID = "aaaaaaaa-0000-0000-0000-000000000001"


@patch("app.attendance.views.controller.get_ta_schedule")
def test_schedule_endpoints_call_the_controller_without_a_role_lookup(
    mock_sched, client, auth_header
):
    mock_sched.return_value = {"teams": []}
    for suffix, scope in (("", "all"), ("/mine", "mine"), ("/my-team", "my-team")):
        r = client.get(f"/api/classes/{CLASS_UUID}/ta-schedule{suffix}?week=2", headers=auth_header)
        assert r.status_code == 200, r.text
        args, kwargs = mock_sched.call_args
        assert args == (UUID(CLASS_UUID), "user-abc")
        assert kwargs == {"week_number": 2, "scope": scope, "meeting_in_week": None}


@patch("app.attendance.views.controller.list_class_tas")
def test_class_ta_list_endpoint_calls_the_controller_without_a_role(mock_list, client, auth_header):
    mock_list.return_value = []
    r = client.get(f"/api/classes/{CLASS_UUID}/tas", headers=auth_header)
    assert r.status_code == 200, r.text
    assert mock_list.call_args.args == (UUID(CLASS_UUID), "user-abc")
