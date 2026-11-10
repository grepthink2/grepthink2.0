"""What ``GET /api/schedule`` sends each lens, and what it costs.

One class at a school on UTC-8 (``Etc/GMT+8``, a fixed offset), term Mon Sep 28 to Fri Dec 4,
one TA meeting a week of 30 minutes. The week asked for is Mon Nov 9 to Mon Nov 16 at the school.

* Alpha (P1): S1 and S2; meeting TA = TA; Review TA = TA2; Tuesday 3 PM slot; a team meeting;
  final review Thu Nov 12; its own Sprint 4 starts Nov 9.
* Beta (P2): S4; meeting TA = TA2; Wednesday 10 AM slot; a team meeting; no review slot.
* Gamma (P3): S2; no meeting TA; Thursday 9 AM slot created in week 4; final review Fri Nov 13.
* S3 is enrolled and on no team.
* A published TSR due at the end of Friday, a draft due the same day.
* The class sprint schedule: five two-week sprints from Sep 28, so Sprint 4 starts Nov 9.

Who is refused (404 / 403) lives in tests/test_authz_status_policy.py.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.schedule import controller as schedule
from tests.fake_supabase import FakeSupabase

SCHOOL = "00000000-0000-4000-8000-0000000000e8"
INSTR = "10000000-0000-0000-0000-000000000001"
TA = "20000000-0000-0000-0000-000000000001"
TA2 = "20000000-0000-0000-0000-000000000002"
S1 = "30000000-0000-0000-0000-000000000001"
S2 = "30000000-0000-0000-0000-000000000002"
S3 = "30000000-0000-0000-0000-000000000003"
S4 = "30000000-0000-0000-0000-000000000004"
CLASS = "c0000000-0000-0000-0000-000000000001"
P1, P2, P3 = (f"d0000000-0000-0000-0000-00000000000{i}" for i in (1, 2, 3))
SLOT1, SLOT2, SLOT3 = (f"e0000000-0000-0000-0000-00000000000{i}" for i in (1, 2, 3))
TM1, TM2 = "e1000000-0000-0000-0000-000000000001", "e1000000-0000-0000-0000-000000000002"
TSR, DRAFT = "a0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000002"

LO = datetime(2026, 11, 9, 8, tzinfo=UTC)  # Mon Nov 9, midnight at the school
HI = LO + timedelta(days=7)

NAMES = {INSTR: "Ines", TA: "Tara", TA2: "Theo", S1: "Sam", S2: "Sol", S3: "Sky", S4: "Sid"}


def _profile(uid: str) -> dict:
    return {
        "id": uid,
        "email": f"{NAMES[uid].lower()}@ucsc.edu",
        "first_name": NAMES[uid],
        "last_name": "Lee",
        "image_url": None,
    }


def _slot(sid, pid, day, at, created="2026-09-20T18:00:00+00:00", sequence=1):
    return {
        "id": sid,
        "class_id": CLASS,
        "project_id": pid,
        "kind": "ta_meeting",
        "cadence": "weekly",
        "sequence": sequence,
        "day_of_week": day,
        "start_time": at,
        "duration_minutes": 30,
        "zoom_url": f"https://zoom.example/{pid[-1]}",
        "location": None,
        "created_at": created,
    }


def _team_meeting(mid, pid, scheduled_at, created_by):
    return {
        "id": mid,
        "class_id": CLASS,
        "project_id": pid,
        "kind": "team_meeting",
        "cadence": "once",
        "title": "Sprint planning",
        "scheduled_at": scheduled_at,
        "duration_minutes": 60,
        "location": "BE 312",
        "zoom_url": None,
        "note": "Bring the backlog",
        "created_by": created_by,
    }


@pytest.fixture
def db(monkeypatch):
    from app.institutions import controller as institutions

    school = {"id": SCHOOL, "name": "Test U", "timezone": "Etc/GMT+8", "email_domains": []}
    monkeypatch.setattr(institutions, "_cache", (float("inf"), [school]))
    fake = FakeSupabase(
        relations={("projects", "project_members"): ("id", "project_id", True)},
        profiles=[_profile(uid) for uid in NAMES],
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "term": "fall",
                "start_date": "2026-09-28",
                "end_date": "2026-12-04",
                "institution_id": SCHOOL,
                "meetings_per_week": 1,
                "meeting_duration_minutes": 30,
                "review_zoom_url": "https://zoom.example/reviews",
                "sprints_start_on": "2026-09-28",
                "sprint_count": 5,
                "sprint_frequency": "biweekly",
            }
        ],
        class_enrollments=[
            {"class_id": CLASS, "user_id": uid, "enrollment_role": role}
            for uid, role in (
                (TA, "ta"),
                (TA2, "ta"),
                (S1, "student"),
                (S2, "student"),
                (S3, "student"),
                (S4, "student"),
            )
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "assigned_ta_id": TA,
                "final_review_at": "2026-11-12T22:00:00+00:00",
            },
            {
                "id": P2,
                "class_id": CLASS,
                "name": "Beta",
                "assigned_ta_id": TA2,
                "final_review_at": None,
            },
            {
                "id": P3,
                "class_id": CLASS,
                "name": "Gamma",
                "assigned_ta_id": None,
                "final_review_at": "2026-11-13T18:00:00+00:00",
            },
        ],
        project_members=[
            {"project_id": P1, "user_id": S1},
            {"project_id": P1, "user_id": S2},
            {"project_id": P2, "user_id": S4},
            {"project_id": P3, "user_id": S2},
        ],
        project_review_tas=[{"class_id": CLASS, "project_id": P1, "user_id": TA2}],
        meetings=[
            _slot(SLOT1, P1, "tuesday", "15:00:00"),
            _slot(SLOT2, P2, "wednesday", "10:00:00"),
            _slot(SLOT3, P3, "thursday", "09:00:00", created="2026-10-20T06:00:00+00:00"),
            # A second weekly slot from when the class met twice a week: not a meeting now.
            _slot("e0000000-0000-0000-0000-0000000000ff", P1, "friday", "09:00:00", sequence=2),
            _team_meeting(TM1, P1, "2026-11-11T02:00:00+00:00", S1),
            _team_meeting(TM2, P2, "2026-11-11T02:00:00+00:00", S4),
        ],
        attendance=[
            {
                "meeting_id": SLOT1,
                "project_id": P1,
                "user_id": S1,
                "week_number": 6,
                "status": "present",
            },
            {
                "meeting_id": SLOT1,
                "project_id": P1,
                "user_id": S2,
                "week_number": 6,
                "status": "late",
            },
        ],
        assignments=[
            {
                "id": TSR,
                "class_id": CLASS,
                "Title": "TSR 4",
                "assignment_type": "tsr",
                "status": "publish",
                "due_at": "2026-11-14T08:00:00+00:00",
            },
            {
                "id": DRAFT,
                "class_id": CLASS,
                "Title": "TSR 5",
                "assignment_type": "tsr",
                "status": "draft",
                "due_at": "2026-11-14T08:00:00+00:00",
            },
        ],
        sprints=[
            {
                "id": "sp-4",
                "project_id": P1,
                "name": "Sprint 4",
                "starts_at": "2026-11-09",
                "ends_at": "2026-11-22",
            },
            {
                "id": "sp-b",
                "project_id": P2,
                "name": "Beta sprint",
                "starts_at": "2026-11-10",
                "ends_at": "2026-11-20",
            },
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def person(uid, *, you=False, **extra):
    return {"id": uid, "name": f"{NAMES[uid]} Lee", "avatar_url": None, "you": you, **extra}


def ta_meeting(slot, pid, team, starts_at, host, attendance, weekday):
    start = datetime.fromisoformat(starts_at)
    return {
        "id": f"ta_meeting:{slot}:{start.astimezone(schedule.ZoneInfo('Etc/GMT+8')).date()}",
        "kind": "ta_meeting",
        "title": "TA meeting",
        "starts_at": starts_at,
        "ends_at": (start + timedelta(minutes=30)).isoformat(),
        "all_day": False,
        "project_id": pid,
        "team_name": team,
        "location": None,
        "zoom_url": f"https://zoom.example/{pid[-1]}",
        "host": host,
        "recurrence_label": f"Weekly · {weekday}",
        "attendance": attendance,
    }


def final_review(pid, team, starts_at, reviewers):
    return {
        "id": f"final_review:{pid}",
        "kind": "final_review",
        "title": "Final review",
        "starts_at": starts_at,
        "ends_at": (datetime.fromisoformat(starts_at) + timedelta(hours=1)).isoformat(),
        "all_day": False,
        "project_id": pid,
        "team_name": team,
        "zoom_url": "https://zoom.example/reviews",
        "reviewers": reviewers,
    }


TSR_DEADLINE = {
    "id": f"deadline:{TSR}",
    "kind": "deadline",
    "title": "TSR 4 due",
    "starts_at": "2026-11-14T07:59:00+00:00",
    "ends_at": None,
    "all_day": False,
    "assignment_id": TSR,
    "assignment_type": "tsr",
}
ALPHA_MEETING = {
    "id": f"meeting:{TM1}",
    "kind": "meeting",
    "title": "Sprint planning",
    "starts_at": "2026-11-11T02:00:00+00:00",
    "ends_at": "2026-11-11T03:00:00+00:00",
    "all_day": False,
    "project_id": P1,
    "team_name": "Alpha",
    "location": "BE 312",
    "zoom_url": None,
    "host": person(S1, role="Organizer"),
    "note": "Bring the backlog",
    "scope": "team",
}
CLASS_SPRINT_4 = {
    "id": f"sprint:{CLASS}:Sprint 4:start",
    "kind": "sprint",
    "title": "Sprint 4",
    "starts_at": "2026-11-09T08:00:00+00:00",
    "ends_at": None,
    "all_day": True,
    "date": "2026-11-09",
    "sprint": {"name": "Sprint 4", "edge": "start"},
}
ALPHA_SPRINT_4 = {**CLASS_SPRINT_4, "id": "sprint:sp-4:start", "project_id": P1}
ALPHA_TUESDAY = "2026-11-10T23:00:00+00:00"
ALPHA_REVIEW = "2026-11-12T22:00:00+00:00"
GAMMA_REVIEW = "2026-11-13T18:00:00+00:00"


def test_a_student_sees_their_teams_meetings_review_sprint_and_the_deadlines(db):
    sam = {**ALPHA_MEETING, "host": person(S1, you=True, role="Organizer")}
    out = schedule.get_schedule(S1, CLASS, LO, HI)
    assert out == {
        "lens": "student",
        "items": [
            ALPHA_SPRINT_4,
            ta_meeting(SLOT1, P1, "Alpha", ALPHA_TUESDAY, person(TA, role="TA"), "unmarked", "Tue"),
            sam,
            final_review(
                P1, "Alpha", ALPHA_REVIEW, [person(TA, slot="home"), person(TA2, slot="review")]
            ),
            TSR_DEADLINE,
        ],
    }
    assert db.executes == 10


def test_a_student_on_two_teams_gets_both_teams_items(db):
    kinds = [
        (it["kind"], it.get("team_name"))
        for it in schedule.get_schedule(S2, CLASS, LO, HI)["items"]
    ]
    assert kinds == [
        ("sprint", None),
        ("ta_meeting", "Alpha"),
        ("meeting", "Alpha"),
        ("ta_meeting", "Gamma"),  # Thursday 9 AM: the slot set in week 4 meets by now
        ("final_review", "Alpha"),
        ("final_review", "Gamma"),
        ("deadline", None),
    ]


def test_a_student_on_no_team_gets_the_deadlines_only(db):
    out = schedule.get_schedule(S3, CLASS, LO, HI)
    assert out == {"lens": "student", "items": [TSR_DEADLINE]}
    assert db.executes == 7  # nothing to read in a second wave


def test_a_student_whose_team_holds_no_review_slot_has_no_final_review(db):
    kinds = [it["kind"] for it in schedule.get_schedule(S4, CLASS, LO, HI)["items"]]
    assert kinds == ["sprint", "meeting", "ta_meeting", "deadline"]


def test_a_ta_sees_the_teams_they_run_and_review_and_the_class_sprints(db):
    out = schedule.get_schedule(TA, CLASS, LO, HI)
    assert out == {
        "lens": "ta",
        "items": [
            CLASS_SPRINT_4,
            ta_meeting(
                SLOT1,
                P1,
                "Alpha",
                ALPHA_TUESDAY,
                person(TA, you=True, role="TA"),
                {"present": 0, "total": 2},
                "Tue",
            ),
            final_review(
                P1,
                "Alpha",
                ALPHA_REVIEW,
                [person(TA, you=True, slot="home"), person(TA2, slot="review")],
            ),
            TSR_DEADLINE,
        ],
    }
    assert db.executes == 9


def test_a_review_ta_sees_the_review_and_their_own_teams_meeting(db):
    items = schedule.get_schedule(TA2, CLASS, LO, HI)["items"]
    assert [(it["kind"], it.get("team_name")) for it in items] == [
        ("sprint", None),
        ("ta_meeting", "Beta"),
        ("final_review", "Alpha"),
        ("deadline", None),
    ]
    review = next(it for it in items if it["kind"] == "final_review")
    assert review["reviewers"][1] == person(TA2, you=True, slot="review")


def test_an_instructor_sees_every_booked_review_the_deadlines_and_the_class_sprints(db):
    out = schedule.get_schedule(INSTR, CLASS, LO, HI)
    assert out == {
        "lens": "instructor",
        "items": [
            CLASS_SPRINT_4,
            final_review(
                P1, "Alpha", ALPHA_REVIEW, [person(TA, slot="home"), person(TA2, slot="review")]
            ),
            final_review(P3, "Gamma", GAMMA_REVIEW, []),
            TSR_DEADLINE,
        ],
    }
    assert db.executes == 8


@pytest.mark.parametrize(
    ("caller", "expected"),
    [
        (S1, "present"),
        (S2, "late"),
        (TA, {"present": 1, "total": 2}),
    ],
)
def test_a_past_meeting_carries_attendance_by_term_week(db, caller, expected):
    # Week 6 at the school: Tuesday, Nov 3.
    lo = LO - timedelta(days=7)
    items = schedule.get_schedule(caller, CLASS, lo, LO)["items"]
    meeting = next(it for it in items if it["kind"] == "ta_meeting" and it["team_name"] == "Alpha")
    assert meeting["starts_at"] == "2026-11-03T23:00:00+00:00"
    assert meeting["attendance"] == expected


def test_twice_a_week_numbers_each_meeting(db):
    db.rows("classes")[0]["meetings_per_week"] = 2
    meetings = [
        (it["starts_at"], it["meeting_index"], it["meetings_per_week"])
        for it in schedule.get_schedule(S1, CLASS, LO, HI)["items"]
        if it["kind"] == "ta_meeting"
    ]
    assert meetings == [(ALPHA_TUESDAY, 1, 2), ("2026-11-13T17:00:00+00:00", 2, 2)]


def test_the_class_meeting_length_wins_over_the_slots(db):
    db.rows("classes")[0]["meeting_duration_minutes"] = 45
    meeting = next(
        it for it in schedule.get_schedule(S1, CLASS, LO, HI)["items"] if it["kind"] == "ta_meeting"
    )
    assert meeting["ends_at"] == "2026-11-10T23:45:00+00:00"


def test_a_class_with_no_start_date_sends_no_ta_meetings(db):
    db.rows("classes")[0]["start_date"] = None
    kinds = [it["kind"] for it in schedule.get_schedule(S1, CLASS, LO, HI)["items"]]
    assert "ta_meeting" not in kinds


def test_a_class_with_no_end_date_meets_for_the_terms_ten_weeks(db):
    db.rows("classes")[0]["end_date"] = None
    # Sep 28 + 10 weeks: the last day is Sun Dec 6, so Tuesday Dec 1 still meets and Dec 8 does not.
    lo = datetime(2026, 11, 30, 8, tzinfo=UTC)
    days = [
        it["starts_at"]
        for it in schedule.get_schedule(S1, CLASS, lo, lo + timedelta(days=14))["items"]
        if it["kind"] == "ta_meeting"
    ]
    assert days == ["2026-12-01T23:00:00+00:00"]


@pytest.mark.parametrize(
    ("lo", "hi", "kept"),
    [
        # The range ends as Tuesday's meeting starts: it is not sent.
        (LO, datetime.fromisoformat(ALPHA_TUESDAY), False),
        # The range starts as it ends: not sent either.
        (datetime.fromisoformat(ALPHA_TUESDAY) + timedelta(minutes=30), HI, False),
        # The range starts one minute before it ends: sent.
        (datetime.fromisoformat(ALPHA_TUESDAY) + timedelta(minutes=29), HI, True),
    ],
)
def test_a_meeting_is_sent_only_when_it_overlaps_the_range(db, lo, hi, kept):
    kinds = [it["kind"] for it in schedule.get_schedule(S1, CLASS, lo, hi)["items"]]
    assert ("ta_meeting" in kinds) is kept


def test_a_sprint_edge_carries_the_schools_calendar_day(db, monkeypatch):
    # At UTC+5 the school's Monday starts on Sunday in UTC: the day sent is still Monday.
    from app.institutions import controller as institutions

    school = {"id": SCHOOL, "name": "Test U", "timezone": "Etc/GMT-5", "email_domains": []}
    monkeypatch.setattr(institutions, "_cache", (float("inf"), [school]))
    lo = datetime(2026, 11, 8, 19, tzinfo=UTC)  # Mon Nov 9, midnight at the school
    edges = [
        (it["date"], it["starts_at"])
        for it in schedule.get_schedule(TA, CLASS, lo, lo + timedelta(days=1))["items"]
        if it["kind"] == "sprint"
    ]
    assert edges == [("2026-11-09", "2026-11-08T19:00:00+00:00")]
