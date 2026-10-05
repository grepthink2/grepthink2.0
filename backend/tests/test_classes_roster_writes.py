"""Roster writes: taking dropped students off their teams after a roster upload,
and removing a student from a class (by the instructor, or by leaving).

Before: ``_remove_dropped_roster_students_from_teams`` handled one membership at a
time: re-read the team, delete the row, recount ``num_members`` and insert one
notification per teammate (3 reads + about 6 round trips per removal).
``_purge_student_from_class`` read the memberships before deleting them and did
a read-then-write decrement of ``num_members`` per project.
"""

from __future__ import annotations

from collections import Counter

import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
S1, S2, S3, S4, S5, S6, S7, TA1 = "s1", "s2", "s3", "s4", "s5", "s6", "s7", "ta-1"
CLASS, OTHER_CLASS = "class-1", "class-2"
P1, P2, P3, P9 = "proj-1", "proj-2", "proj-3", "proj-9"

WRITE_OPS = {"insert", "update", "upsert", "delete"}
UPLOADED = "2026-01-05T00:00:00+00:00"


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid: str) -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "edu_email": None,
        "role": "student",
        "first_name": "",
        "last_name": "",
    }


def _roster(email, status, matched, first=None, last=None) -> dict:
    return {
        "id": f"r-{email}",
        "course_id": CLASS,
        "email": email,
        "status": status,
        "matched_profile_id": matched,
        "first_name": first,
        "last_name": last,
        "uploaded_at": UPLOADED,
        "is_manual": False,
    }


def _member(pid: str, uid: str) -> dict:
    return {"id": f"m-{pid}-{uid}", "project_id": pid, "user_id": uid, "role": "member"}


def _request(rid: str, uid: str, pid: str, status: str) -> dict:
    return {"id": rid, "user_id": uid, "project_id": pid, "request_status": status}


@pytest.fixture
def db(monkeypatch):
    """P1 Alpha = S1, S3, S4; P2 Beta = S2, S5, S7; P3 Gamma = S6 with TA1 as its TA.
    The roster marks S3, S2 and S5 dropped (S5's row has no name) and has a dropped
    row that matches no profile. S3 is also on P9, a team in another class."""
    fake = FakeSupabase(
        profiles=[_profile(u) for u in (INSTR, OTHER_INSTR, S1, S2, S3, S4, S5, S6, S7, TA1)],
        classes=[
            {"id": CLASS, "created_by": INSTR, "name": "CSE 115C"},
            {"id": OTHER_CLASS, "created_by": OTHER_INSTR, "name": "CSE 110"},
        ],
        class_enrollments=[
            {
                "id": f"e-{u}",
                "class_id": CLASS,
                "user_id": u,
                "enrollment_role": "ta" if u == TA1 else "student",
            }
            for u in (S1, S2, S3, S4, S5, S6, S7, TA1)
        ],
        roster_entries=[
            _roster("s1@ucsc.edu", "enrolled", S1, "Sam", "One"),
            _roster("s3@ucsc.edu", "dropped", S3, "Sid", "Three"),
            _roster("s2@ucsc.edu", "dropped", S2, "Sara", "Two"),
            _roster("s5@ucsc.edu", "dropped", S5),
            _roster("unknown@ucsc.edu", "dropped", None),
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "num_members": 3,
                "assigned_ta_id": None,
            },
            {"id": P2, "class_id": CLASS, "name": "Beta", "num_members": 3, "assigned_ta_id": None},
            {"id": P3, "class_id": CLASS, "name": "Gamma", "num_members": 1, "assigned_ta_id": TA1},
            {
                "id": P9,
                "class_id": OTHER_CLASS,
                "name": "Other",
                "num_members": 1,
                "assigned_ta_id": None,
            },
        ],
        project_members=[
            _member(P1, S1),
            _member(P1, S3),
            _member(P1, S4),
            _member(P2, S2),
            _member(P2, S5),
            _member(P2, S7),
            _member(P3, S6),
            _member(P9, S3),
        ],
        project_join_requests=[
            _request("jr-s3-p3", S3, P3, "pending"),
            _request("jr-s3-p9", S3, P9, "pending"),
            _request("jr-s2-p1", S2, P1, "approved"),
            _request("jr-s1-p2", S1, P2, "pending"),
            _request("jr-s1-p3", S1, P3, "approved"),
        ],
        project_review_tas=[
            {"id": "prt-1", "class_id": CLASS, "project_id": P3, "user_id": TA1},
            {"id": "prt-2", "class_id": OTHER_CLASS, "project_id": P9, "user_id": TA1},
        ],
        notifications=[],
        relations={("projects", "project_members"): ("id", "project_id", True)},
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    # notifications._client() reads its own module global; point it at the fake too.
    monkeypatch.setattr("app.notifications.controller.service_client", fake, raising=False)
    return fake


def _members(db, pid: str) -> list[str]:
    return sorted(m["user_id"] for m in db.rows("project_members") if m["project_id"] == pid)


def _num_members(db, pid: str) -> int:
    return next(p for p in db.rows("projects") if p["id"] == pid)["num_members"]


def _notified(db, pid: str) -> Counter:
    return Counter(n["user_id"] for n in db.rows("notifications") if n["entity_id"] == pid)


# -------------------------------------------------- dropped students on teams


def test_dropped_students_leave_their_teams_and_only_those_who_stay_hear_about_it(db):
    assert classes._remove_dropped_roster_students_from_teams(db, CLASS) == 3

    # Counted before anything below touches the fake: roster + projects-with-members reads,
    # one membership delete, a recount read and one update per affected project (2), one
    # notification insert, one request delete.
    assert db.executes <= 8, _trace(db)
    assert [q["op"] for q in db.queries if q["table"] == "notifications"] == ["insert"]
    assert [
        q["op"] for q in db.queries if q["table"] == "project_members" and q["op"] in WRITE_OPS
    ] == ["delete"]

    assert _members(db, P1) == [S1, S4]
    assert _members(db, P2) == [S7]
    assert _members(db, P3) == [S6]  # the unmatched dropped row changes nothing
    assert _members(db, P9) == [S3]  # other classes' teams are untouched
    assert (_num_members(db, P1), _num_members(db, P2), _num_members(db, P3)) == (2, 1, 1)

    alpha = [n for n in db.rows("notifications") if n["entity_id"] == P1]
    assert sorted(n["user_id"] for n in alpha) == [S1, S4]
    for note in alpha:
        assert {k: note[k] for k in ("type", "title", "body", "entity_type", "entity_id")} == {
            "type": "member_removed",
            "title": "Team member removed",
            "body": 'Sid Three has dropped the course and was removed from "Alpha".',
            "entity_type": "project",
            "entity_id": P1,
        }
    assert sorted(n["body"] for n in db.rows("notifications") if n["user_id"] == S7) == [
        'Sara Two has dropped the course and was removed from "Beta".',
        # no name on the roster row: the email stands in
        's5@ucsc.edu has dropped the course and was removed from "Beta".',
    ]
    # S2 and S5 both left Beta. Only S7, who stays, is told (about each of them).
    assert _notified(db, P2) == Counter({S7: 2})

    # Their pending join requests are cancelled; nothing else is.
    assert sorted(r["id"] for r in db.rows("project_join_requests")) == [
        "jr-s1-p2",
        "jr-s1-p3",
        "jr-s2-p1",  # not pending
        "jr-s3-p9",  # another class's project
    ]


def test_nothing_happens_without_dropped_students(db):
    db.rows("roster_entries")[:] = [
        r for r in db.rows("roster_entries") if r["status"] != "dropped"
    ]
    assert classes._remove_dropped_roster_students_from_teams(db, CLASS) == 0
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]
    assert db.executes <= 2, _trace(db)


def test_dropped_students_on_no_team_change_nothing(db):
    # As before, pending join requests are only cleared when someone left a team.
    db.rows("project_members")[:] = [
        m for m in db.rows("project_members") if m["user_id"] not in (S2, S3, S5)
    ]
    assert classes._remove_dropped_roster_students_from_teams(db, CLASS) == 0
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]
    assert len(db.rows("project_join_requests")) == 5


def test_roster_upload_reports_how_many_students_left_teams(db):
    csv = (
        "Email Address,Status,First Name,Last Name\n"
        "s1@ucsc.edu,Enrolled,Sam,One\n"
        "s3@ucsc.edu,Dropped,Sid,Three\n"
    )
    out = classes.upload_class_roster(CLASS, csv, INSTR)
    assert out == {
        "message": "Roster uploaded successfully",
        "inserted_count": 2,
        "matched_count": 2,
        "removed_from_teams": 1,
    }
    assert _members(db, P1) == [S1, S4]
    assert _notified(db, P1) == Counter({S1: 1, S4: 1})


# ---------------------------------------------------------- student removal


def test_removing_a_student_clears_their_class_state(db):
    next(p for p in db.rows("projects") if p["id"] == P1)["num_members"] = 9  # drifted

    out = classes.remove_student_from_class(CLASS, S1, INSTR)

    assert out == {"message": "Student removed successfully", "student_id": S1}
    # The memberships are deleted without being read first: class, projects, membership
    # delete, recount read + 1 update, join requests, assigned TA, review TAs, enrollment.
    assert [q["op"] for q in db.queries if q["table"] == "project_members"][0] == "delete"
    assert db.executes <= 9, _trace(db)
    assert _members(db, P1) == [S3, S4]
    assert _num_members(db, P1) == 2  # recounted from the rows, not decremented from 9
    # the pending request is cancelled; the approved one stays
    assert [r["id"] for r in db.rows("project_join_requests") if r["user_id"] == S1] == ["jr-s1-p3"]
    assert S1 not in {e["user_id"] for e in db.rows("class_enrollments")}


def test_removing_a_ta_clears_their_team_assignment_and_review_claims(db):
    classes.remove_student_from_class(CLASS, TA1, INSTR)
    assert next(p for p in db.rows("projects") if p["id"] == P3)["assigned_ta_id"] is None
    assert [r["id"] for r in db.rows("project_review_tas")] == ["prt-2"]
    assert TA1 not in {e["user_id"] for e in db.rows("class_enrollments")}
    # on no team: no recount; class, projects, delete, requests, TA, reviews, enrollment
    assert db.executes <= 7, _trace(db)


def test_a_student_can_leave_once(db):
    out = classes.leave_class(CLASS, S4)
    assert out == {"message": "You have left the class", "class_id": CLASS}
    assert _members(db, P1) == [S1, S3]
    assert _num_members(db, P1) == 2
    assert db.executes <= 9, _trace(db)

    db.reset_counter()
    with pytest.raises(HTTPException) as exc:
        classes.leave_class(CLASS, S4)
    assert (exc.value.status_code, exc.value.detail) == (404, "You are not enrolled in this class")
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]
