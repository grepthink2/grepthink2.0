"""Response shapes + round-trip budgets for the roster timeline and TSR turn-in stats.

Before: ``get_class_roster_timeline`` issued six strictly sequential reads (class,
enrollments, roster, projects, profiles, members) and ``get_class_turn_in_stats``
five (class, assignments, projects, members, TSRs) and read the TSRs even when no
team had members. Both now read everything they can at once, with profiles and
members embedded, and turn-in stats skips the TSR read when there are no teams.

Access codes and messages are pinned in test_classes_authz.py.
"""

from __future__ import annotations

import datetime

import pytest

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR = "instr"
S1, S2, S3, S4, S5, S6, TA1, OUTSIDER = "s1", "s2", "s3", "s4", "s5", "s6", "ta-1", "outsider"
CLASS, OTHER_CLASS = "class-1", "class-2"
P1, P2, P3, P4, P9 = "proj-1", "proj-2", "proj-3", "proj-4", "proj-9"

RELATIONS = {
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _ts(day: int) -> str:
    return f"2026-01-{day:02d}T00:00:00+00:00"


def _profile(uid, email, first, last, edu=None):
    return {
        "id": uid,
        "email": email,
        "edu_email": edu,
        "role": "student",
        "first_name": first,
        "last_name": last,
    }


def _enrollment(uid, day, role="student"):
    return {
        "id": f"e-{uid}",
        "class_id": CLASS,
        "user_id": uid,
        "enrolled_at": _ts(day),
        "enrollment_role": role,
    }


def _member(pid, uid, created_at):
    return {"id": f"m-{pid}-{uid}", "project_id": pid, "user_id": uid, "created_at": created_at}


# ------------------------------------------------------------------ timeline


@pytest.fixture
def timeline_db(monkeypatch):
    """S1 joined Beta before Alpha; S2 is dropped on the roster under a messy email;
    S4 is on the roster only through matched_profile_id and has a membership with
    no timestamp; a dropped stranger has no account; S3, TA1 and S5 are enrolled
    but not on the roster; OUTSIDER is on a team without being enrolled."""
    fake = FakeSupabase(
        profiles=[
            _profile(INSTR, "instr@ucsc.edu", "Ina", "Structor"),
            _profile(S1, "s1@gmail.com", "Sam", "One", edu="s1@ucsc.edu"),
            _profile(S2, "s2@ucsc.edu", "Sara", "Two"),
            _profile(S3, "s3@ucsc.edu", "Sid", "Three"),
            _profile(S4, "s4@ucsc.edu", "Sue", "Four"),
            _profile(S5, "s5@ucsc.edu", "Sal", "Five"),
            _profile(TA1, "ta1@ucsc.edu", "Tara", "Aide"),
            _profile(OUTSIDER, "out@ucsc.edu", "Oz", "Out"),
        ],
        classes=[{"id": CLASS, "created_by": INSTR}],
        class_enrollments=[
            _enrollment(TA1, 1, "ta"),
            _enrollment(S1, 2),
            _enrollment(S2, 3),
            _enrollment(S3, 4),
            _enrollment(S4, 5),
            _enrollment(S5, 6),
        ],
        roster_entries=[
            {
                "id": "r1",
                "course_id": CLASS,
                "email": "s1@ucsc.edu",
                "status": "enrolled",
                "matched_profile_id": S1,
                "uploaded_at": "2026-02-01T00:00:00+00:00",
                "first_name": "Samuel",
                "last_name": "One",
            },
            {
                "id": "r2",
                "course_id": CLASS,
                "email": " S2@UCSC.edu",
                "status": "dropped",
                "matched_profile_id": None,
                "uploaded_at": "2026-02-01T00:00:00+00:00",
                "first_name": None,
                "last_name": None,
            },
            {
                "id": "r3",
                "course_id": CLASS,
                "email": "old-s4@ucsc.edu",
                "status": "enrolled",
                "matched_profile_id": S4,
                "uploaded_at": "2026-02-01T00:00:00+00:00",
                "first_name": None,
                "last_name": None,
            },
            {
                "id": "r4",
                "course_id": CLASS,
                "email": "gone@ucsc.edu",
                "status": "dropped",
                "matched_profile_id": None,
                "uploaded_at": "2026-02-02T00:00:00+00:00",
                "first_name": "Gone",
                "last_name": "Person",
            },
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha"},
            {"id": P2, "class_id": CLASS, "name": "Beta"},
            {"id": P3, "class_id": CLASS, "name": "Gamma"},
        ],
        project_members=[
            _member(P1, S1, _ts(10)),
            _member(P1, S3, _ts(12)),
            _member(P2, S1, _ts(8)),
            _member(P2, S2, _ts(9)),
            _member(P3, S4, None),
            _member(P3, OUTSIDER, _ts(1)),
        ],
        relations=RELATIONS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _line(uid, name, email, status, enrolled, joined=None, project=None, dropped=None):
    return {
        "id": uid,
        "name": name,
        "email": email,
        "class_status": status,
        "enrolled_at": enrolled,
        "team_joined_at": joined,
        "project_name": project,
        "dropped_at": dropped,
    }


EXPECTED_TIMELINE = [
    _line(
        "gone@ucsc.edu",
        "Gone Person",
        "gone@ucsc.edu",
        "dropped",
        None,
        dropped="2026-02-02T00:00:00+00:00",
    ),
    _line(S5, "Sal Five", "s5@ucsc.edu", "not_on_roster", _ts(6)),
    _line(S1, "Sam One", "s1@ucsc.edu", "enrolled", _ts(2), _ts(8), "Beta"),
    _line(
        S2,
        "Sara Two",
        "s2@ucsc.edu",
        "dropped",
        _ts(3),
        _ts(9),
        "Beta",
        "2026-02-01T00:00:00+00:00",
    ),
    _line(S3, "Sid Three", "s3@ucsc.edu", "not_on_roster", _ts(4), _ts(12), "Alpha"),
    _line(S4, "Sue Four", "old-s4@ucsc.edu", "enrolled", _ts(5)),
    _line(TA1, "Tara Aide", "ta1@ucsc.edu", "not_on_roster", _ts(1)),
]


def test_roster_timeline_shape_order_and_cost(timeline_db):
    assert classes.get_class_roster_timeline(CLASS, INSTR) == {"students": EXPECTED_TIMELINE}
    # class, enrollments with profiles, roster rows, projects with members: one wave
    assert timeline_db.executes <= 4, _trace(timeline_db)


def test_roster_timeline_of_an_empty_class(timeline_db):
    timeline_db.rows("classes").append({"id": OTHER_CLASS, "created_by": INSTR})
    assert classes.get_class_roster_timeline(OTHER_CLASS, INSTR) == {"students": []}


# ------------------------------------------------------------------ turn-in

TODAY = datetime.date.today()


def _day(offset: int) -> str:
    return (TODAY + datetime.timedelta(days=offset)).isoformat()


def _assignment(aid, title, open_offset, close_offset, status="publish", kind="tsr"):
    return {
        "id": aid,
        "class_id": CLASS,
        "Title": title,
        "open_date": _day(open_offset),
        "close_date": _day(close_offset),
        "status": status,
        "assignment_type": kind,
    }


def _tsr(aid, pid, evaluator):
    return {"assignment_id": aid, "project_id": pid, "evaluator_id": evaluator}


@pytest.fixture
def turnin_db(monkeypatch):
    """TSR 2 is open today. P1 {S1, S2} both submitted it (S1 twice), P2 {S3, S4} half,
    P3 {S5} only submitted TSR 1, P4 has no members. P9 belongs to another class."""
    fake = FakeSupabase(
        classes=[{"id": CLASS, "created_by": INSTR}],
        assignments=[
            _assignment("a-past", "TSR 1", -30, -23),
            _assignment("a-cur", "TSR 2", -1, 2),
            _assignment("a-next", "TSR 3", 6, 9),
            _assignment("a-draft", "TSR draft", -1, 2, status="draft"),
            _assignment("a-feedback", "Feedback", -1, 2, kind="feedback"),
        ],
        projects=[
            {"id": P1, "class_id": CLASS},
            {"id": P2, "class_id": CLASS},
            {"id": P3, "class_id": CLASS},
            {"id": P4, "class_id": CLASS},
            {"id": P9, "class_id": OTHER_CLASS},
        ],
        project_members=[
            _member(P1, S1, None),
            _member(P1, S2, None),
            _member(P2, S3, None),
            _member(P2, S4, None),
            _member(P3, S5, None),
            _member(P9, S6, None),
        ],
        TSRs=[
            _tsr("a-cur", P1, S1),
            _tsr("a-cur", P1, S1),
            _tsr("a-cur", P1, S2),
            _tsr("a-cur", P2, S3),
            _tsr("a-past", P3, S5),
            _tsr("a-cur", P9, S6),
        ],
        relations=RELATIONS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _stats(rate, full, partial, total, title, close):
    return {
        "rate": rate,
        "teamsSubmitted": {"count": full, "total": total},
        "partialSubmissions": {"count": partial, "total": total},
        "currentAssignment": title,
        "closeDate": close,
    }


def test_turn_in_stats_for_the_open_tsr(turnin_db):
    out = classes.get_class_turn_in_stats(CLASS, INSTR)
    assert out == _stats(33, 1, 1, 3, "TSR 2", _day(2))
    # class, assignments and projects-with-members together, then the TSRs
    assert turnin_db.executes <= 4, _trace(turnin_db)


def test_turn_in_stats_skip_the_tsr_read_when_no_team_has_members(turnin_db):
    turnin_db.rows("project_members")[:] = [
        m for m in turnin_db.rows("project_members") if m["project_id"] == P9
    ]
    assert classes.get_class_turn_in_stats(CLASS, INSTR) == _stats(0, 0, 0, 0, "TSR 2", _day(2))
    assert not [q for q in turnin_db.queries if q["table"] == "TSRs"], _trace(turnin_db)
    assert turnin_db.executes <= 3, _trace(turnin_db)


def test_turn_in_stats_without_projects(turnin_db):
    turnin_db.rows("projects")[:] = [p for p in turnin_db.rows("projects") if p["id"] == P9]
    assert classes.get_class_turn_in_stats(CLASS, INSTR) == _stats(0, 0, 0, 0, "TSR 2", _day(2))
    assert turnin_db.executes <= 3, _trace(turnin_db)


def test_turn_in_stats_pick_the_next_then_the_latest_tsr(turnin_db):
    rows = turnin_db.rows("assignments")
    rows[:] = [a for a in rows if a["id"] != "a-cur"]
    assert classes.get_class_turn_in_stats(CLASS, INSTR) == _stats(0, 0, 0, 3, "TSR 3", _day(9))
    rows[:] = [a for a in rows if a["id"] != "a-next"]
    # TSR 1: P3's only member submitted it
    assert classes.get_class_turn_in_stats(CLASS, INSTR) == _stats(33, 1, 0, 3, "TSR 1", _day(-23))


def test_turn_in_stats_without_a_published_tsr(turnin_db):
    turnin_db.rows("assignments")[:] = [
        a for a in turnin_db.rows("assignments") if a["id"] in ("a-draft", "a-feedback")
    ]
    assert classes.get_class_turn_in_stats(CLASS, INSTR) == _stats(0, 0, 0, 0, None, None)
    assert turnin_db.executes <= 3, _trace(turnin_db)
