"""A team meeting never reaches the TA-meeting code.

A team meeting is a ``meetings`` row with ``kind = 'team_meeting'`` and ``cadence = 'once'``
(2026-10-18_team_meetings.sql). Its ``sequence`` is the column default, 1, so to a query that
does not say ``cadence = 'weekly'`` it looks like the team's first weekly TA slot. Every read and
write of ``meetings`` in ``app/attendance/controller.py`` says it; these tests keep it that way at
the places that reach the table: the schedule, an attendance read, and the get-or-create behind an
attendance mark and a slot edit.
"""

from __future__ import annotations

import pytest

from app.attendance import controller
from tests.fake_supabase import FakeSupabase

INSTR = "instructor-1"
TA1 = "ta-1"
S1, S2 = "student-1", "student-2"
CLASS = "class-1"
P1, P2 = "proj-1", "proj-2"
TEAM_MEETING = "tm1"
NAMES = {INSTR: "Ina", TA1: "Tara", S1: "Sam", S2: "Sara"}


@pytest.fixture
def db(monkeypatch):
    """Fall class, 2 meetings/week. TA1 is P1's assigned TA. P1 = {S1, S2}, P2 = {S1}. No meetings."""
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
                "start_date": "2026-09-28",
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
            for u in (TA1, S1, S2)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1, "num_members": 2},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None, "num_members": 1},
        ],
        project_members=[
            {"project_id": P1, "user_id": S1, "role": "member"},
            {"project_id": P1, "user_id": S2, "role": "member"},
            {"project_id": P2, "user_id": S1, "role": "member"},
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


def _seed_team_meeting(db) -> dict:
    """A Product Owner's one-off for P1, with the sequence the column default gives it."""
    row = {
        "id": TEAM_MEETING,
        "class_id": CLASS,
        "project_id": P1,
        "kind": "team_meeting",
        "cadence": "once",
        "title": "Sprint 3 planning",
        "scheduled_at": "2026-10-20T22:00:00+00:00",
        "duration_minutes": 60,
        "sequence": 1,
    }
    db.rows("meetings").append(row)
    return dict(row)


def _team_meeting_row(db) -> dict:
    return next(m for m in db.rows("meetings") if m["id"] == TEAM_MEETING)


def test_a_team_meeting_never_reaches_the_ta_schedule(db):
    _seed_team_meeting(db)
    out = controller.get_ta_schedule(CLASS, INSTR, week_number=3, scope="all", meeting_in_week=1)
    team = next(t for t in out["teams"] if t["project_id"] == P1)
    assert team["meeting_id"] != TEAM_MEETING and team["meeting_day"] is None


def test_a_team_meeting_never_reaches_the_ta_attendance_read(db):
    _seed_team_meeting(db)
    # Attendance taken for the team meeting hangs off its meeting_id; the TA view must not show it.
    db.rows("attendance").append(
        {
            "id": "a1",
            "meeting_id": TEAM_MEETING,
            "project_id": P1,
            "user_id": S1,
            "week_number": 3,
            "status": "present",
        }
    )
    out = controller.get_team_attendance(P1, INSTR, 3, 1)
    assert {e["person_id"]: e["status"] for e in out["entries"]} == {
        S1: "unmarked",
        S2: "unmarked",
    }


def test_ta_attendance_marks_never_land_on_a_team_meeting(db):
    team_meeting = _seed_team_meeting(db)
    mark = controller.upsert_attendance(P1, INSTR, S1, 3, "present")
    slot = next(m for m in db.rows("meetings") if m["id"] == mark["meeting_id"])
    assert slot["id"] != TEAM_MEETING and slot["cadence"] == "weekly"
    assert _team_meeting_row(db) == team_meeting


def test_editing_the_ta_slot_leaves_a_team_meeting_alone(db):
    team_meeting = _seed_team_meeting(db)
    out = controller.upsert_meeting(
        P1, INSTR, meeting_in_week=1, zoom_url="https://ucsc.zoom.us/j/1", meeting_day="friday"
    )
    assert out["meeting_id"] != TEAM_MEETING
    assert _team_meeting_row(db) == team_meeting
