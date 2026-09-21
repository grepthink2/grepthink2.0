"""Response shapes + round-trip budgets for the class reads that are open to the
instructor and to enrolled members: students, roster, projects, projects-overview.

Before: every read issued the class row, the full enrollment list and the
projects in one concurrent wave, then profiles and project members in a second
(get_class_projects needed a third for owner / scrum-master profiles): 5-6
queries each. Access is now ``authz.require_class_access`` (one read for the
instructor, two for a member) running alongside the data reads, and profiles /
members arrive embedded in the enrollment and project rows, so every read is a
single wave.

Access codes and messages are pinned in test_classes_authz.py.
"""

from __future__ import annotations

import pytest

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR = "instr"
TA1, S1, S2, S3, S4 = "ta-1", "s1", "s2", "s3", "s4"
GHOST = "ghost"  # owns a project but is not enrolled in the class
OUTSIDER = "outsider"
CLASS, EMPTY_CLASS = "class-1", "class-empty"
P1, P2, P3 = "proj-1", "proj-2", "proj-3"
R_S1, R_S2, R_DROPPED, R_MANUAL, R_S4, R_GHOST = (
    "r-s1",
    "r-s2",
    "r-drop",
    "r-manual",
    "r-s4",
    "r-ghost",
)

RELATIONS = {
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
    ("project_members", "profiles!project_members_user_id_fkey"): ("user_id", "id", False),
}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid, email, first, last, *, edu=None, role="student"):
    return {
        "id": uid,
        "email": email,
        "edu_email": edu,
        "role": role,
        "first_name": first,
        "last_name": last,
    }


def _roster(rid, email, status, matched, uploaded_at, first=None, last=None, manual=False):
    return {
        "id": rid,
        "course_id": CLASS,
        "email": email,
        "status": status,
        "matched_profile_id": matched,
        "uploaded_at": uploaded_at,
        "first_name": first,
        "last_name": last,
        "is_manual": manual,
    }


def _project(pid, name, created_at, team_size, sentiment, image_url):
    return {
        "id": pid,
        "class_id": CLASS,
        "name": name,
        "created_at": created_at,
        "team_size": team_size,
        "sentiment": sentiment,
        "image_url": image_url,
    }


@pytest.fixture
def db(monkeypatch):
    """P1 Alpha = S1 (product owner) + S2 (scrum master); P2 Beta = S3 (owner, no
    name on file); P3 Gamma = GHOST (owner, not enrolled). TA1 and S4 are on no team.
    The roster matches S1 by edu_email, S2 by a messy primary email, S4 only by
    matched_profile_id, and GHOST (not enrolled); it also has a dropped stranger and
    a manual row. TA1 and S3 are registered but not on it."""
    fake = FakeSupabase(
        profiles=[
            _profile(INSTR, "instr@ucsc.edu", "Ina", "Structor", role="instructor"),
            _profile(TA1, "ta1@ucsc.edu", "Tara", "Aide"),
            _profile(S1, "s1@gmail.com", "Sam", "One", edu="s1@ucsc.edu"),
            _profile(S2, "s2@ucsc.edu", "Sara", "Two"),
            _profile(S3, "s3@ucsc.edu", "", ""),
            _profile(S4, "s4@ucsc.edu", "Sid", "Four"),
            _profile(GHOST, "ghost@ucsc.edu", "Gus", "Ghost"),
            _profile(OUTSIDER, "out@ucsc.edu", "Oz", "Out"),
        ],
        classes=[
            {"id": CLASS, "created_by": INSTR, "name": "CSE 115C"},
            {"id": EMPTY_CLASS, "created_by": INSTR, "name": "CSE 110"},
        ],
        class_enrollments=[
            {"id": "e-ta1", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e-s1", "class_id": CLASS, "user_id": S1, "enrollment_role": "student"},
            {"id": "e-s2", "class_id": CLASS, "user_id": S2, "enrollment_role": None},
            {"id": "e-s3", "class_id": CLASS, "user_id": S3, "enrollment_role": "student"},
            {"id": "e-s4", "class_id": CLASS, "user_id": S4, "enrollment_role": "student"},
        ],
        roster_entries=[
            _roster(
                R_S1, "s1@ucsc.edu", "enrolled", S1, "2026-01-05T00:00:00+00:00", "Samuel", "One"
            ),
            _roster(R_S2, " S2@UCSC.edu ", "waitlisted", None, "2026-01-06T00:00:00+00:00"),
            _roster(
                R_DROPPED,
                "nobody@ucsc.edu",
                "dropped",
                None,
                "2026-01-05T00:00:00+00:00",
                "No",
                "Body",
            ),
            _roster(
                R_MANUAL,
                "manual@ucsc.edu",
                "manual",
                None,
                "2026-01-07T00:00:00+00:00",
                "Manny",
                "Al",
                True,
            ),
            _roster(R_S4, "old-s4@ucsc.edu", "enrolled", S4, "2026-01-05T00:00:00+00:00"),
            _roster(R_GHOST, "ghost@ucsc.edu", "enrolled", GHOST, "2026-01-05T00:00:00+00:00"),
        ],
        projects=[
            _project(P1, "Alpha", "2026-01-01T00:00:00+00:00", 4, "happy", "a.png"),
            _project(P2, "Beta", "2026-01-03T00:00:00+00:00", 5, "sad", None),
            _project(P3, "Gamma", "2026-01-02T00:00:00+00:00", 3, None, None),
        ],
        project_members=[
            {"id": "m1", "project_id": P1, "user_id": S1, "role": "product owner"},
            {"id": "m2", "project_id": P1, "user_id": S2, "role": "scrum master"},
            {"id": "m3", "project_id": P2, "user_id": S3, "role": "owner"},
            {"id": "m4", "project_id": P3, "user_id": GHOST, "role": "owner"},
        ],
        relations=RELATIONS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _role(caller: str) -> str:
    return "instructor" if caller == INSTR else "student"


def students(caller, class_id=CLASS):
    return classes.get_class_students(class_id, caller)


def roster(caller, class_id=CLASS):
    return classes.get_class_roster(class_id, caller)


def projects(caller, class_id=CLASS):
    return classes.get_class_projects(class_id, caller, _role(caller))


def overview(caller, class_id=CLASS):
    return classes.get_class_projects_overview(class_id, caller, _role(caller))


def _student(uid, email, first, last, enrollment_role="student", project=None):
    pid, pname = project or (None, None)
    return {
        "id": uid,
        "email": email,
        "role": "student",
        "enrollment_role": enrollment_role,
        "first_name": first,
        "last_name": last,
        "project_id": pid,
        "project_name": pname,
    }


EXPECTED_STUDENTS = {
    TA1: _student(TA1, "ta1@ucsc.edu", "Tara", "Aide", "ta"),
    S1: _student(S1, "s1@gmail.com", "Sam", "One", project=(P1, "Alpha")),
    S2: _student(S2, "s2@ucsc.edu", "Sara", "Two", project=(P1, "Alpha")),
    S3: _student(S3, "s3@ucsc.edu", "", "", project=(P2, "Beta")),
    S4: _student(S4, "s4@ucsc.edu", "Sid", "Four"),
}


def _card(pid, name, team_size, image_url, members, sentiment, owner, scrum):
    return {
        "id": pid,
        "name": name,
        "team_size": team_size,
        "image_url": image_url,
        "member_count": members,
        "sentiment": sentiment,
        "product_owner_name": owner[0],
        "product_owner_email": owner[1],
        "scrum_master_name": scrum[0],
        "scrum_master_email": scrum[1],
    }


NONE_PAIR = (None, None)


def _cards(*, instructor: bool, ghost_owner: tuple):
    """Newest project first. S3 has no name on file, so the email stands in."""
    return [
        _card(
            P2,
            "Beta",
            5,
            None,
            1,
            "sad" if instructor else None,
            ("s3@ucsc.edu", "s3@ucsc.edu"),
            NONE_PAIR,
        ),
        _card(P3, "Gamma", 3, None, 1, None, ghost_owner, NONE_PAIR),
        _card(
            P1,
            "Alpha",
            4,
            "a.png",
            2,
            "happy" if instructor else None,
            ("Sam One", "s1@gmail.com"),
            ("Sara Two", "s2@ucsc.edu"),
        ),
    ]


def _row(
    uid,
    name,
    email,
    first,
    last,
    roster_email,
    gt_email,
    status,
    registered,
    role,
    projs,
    entry=None,
):
    return {
        "id": uid,
        "name": name,
        "email": email,
        "first_name": first,
        "last_name": last,
        "roster_email": roster_email,
        "grepthink_email": gt_email,
        "project": ", ".join(projs),
        "class_status": status,
        "grepthink_status": "registered" if registered else "not_registered",
        "enrollment_role": role,
        "projects": projs,
        "roster_entry_id": entry,
    }


# Sorted by (name.lower(), email). S4 appears twice: once through its roster row's
# matched_profile_id and once as "not on roster", because the second pass only
# compares emails. That is today's behaviour and the shape is pinned as is.
EXPECTED_ROSTER = [
    _row(
        R_GHOST,
        "Ghost",
        "ghost@ucsc.edu",
        "",
        "",
        "ghost@ucsc.edu",
        "",
        "enrolled",
        False,
        "student",
        [],
    ),
    _row(
        R_MANUAL,
        "Manny Al",
        "manual@ucsc.edu",
        "Manny",
        "Al",
        "manual@ucsc.edu",
        "",
        "manual",
        False,
        "student",
        [],
        R_MANUAL,
    ),
    _row(
        R_DROPPED,
        "No Body",
        "nobody@ucsc.edu",
        "No",
        "Body",
        "nobody@ucsc.edu",
        "",
        "dropped",
        False,
        "student",
        [],
    ),
    _row(
        S3,
        "S3",
        "s3@ucsc.edu",
        "",
        "",
        "",
        "s3@ucsc.edu",
        "not_on_roster",
        True,
        "student",
        ["Beta"],
    ),
    _row(
        S1,
        "Sam One",
        "s1@ucsc.edu",
        "Samuel",
        "One",
        "s1@ucsc.edu",
        "s1@gmail.com",
        "enrolled",
        True,
        "student",
        ["Alpha"],
    ),
    _row(
        S2,
        "Sara Two",
        "s2@ucsc.edu",
        "Sara",
        "Two",
        "s2@ucsc.edu",
        "s2@ucsc.edu",
        "waitlisted",
        True,
        "student",
        ["Alpha"],
    ),
    _row(
        S4,
        "Sid Four",
        "old-s4@ucsc.edu",
        "Sid",
        "Four",
        "old-s4@ucsc.edu",
        "s4@ucsc.edu",
        "enrolled",
        True,
        "student",
        [],
    ),
    _row(
        S4,
        "Sid Four",
        "s4@ucsc.edu",
        "Sid",
        "Four",
        "",
        "s4@ucsc.edu",
        "not_on_roster",
        True,
        "student",
        [],
    ),
    _row(
        TA1,
        "Tara Aide",
        "ta1@ucsc.edu",
        "Tara",
        "Aide",
        "",
        "ta1@ucsc.edu",
        "not_on_roster",
        True,
        "ta",
        [],
    ),
]


# Each read is open to the instructor, a TA and a student (who is refused is pinned in
# test_classes_authz.py). One test per read: what each of them gets back, and what it costs.
# A member who is not the instructor pays one more read, for their enrollment.
CALLERS = [(INSTR, 0), (TA1, 1), (S1, 1)]


@pytest.mark.parametrize(("caller", "extra"), CALLERS)
def test_students(db, caller, extra):
    out = students(caller)

    assert len(out) == len(EXPECTED_STUDENTS)
    assert {s["id"]: s for s in out} == EXPECTED_STUDENTS
    assert db.executes <= 3 + extra, _trace(db)


@pytest.mark.parametrize(("caller", "extra"), CALLERS)
def test_roster(db, caller, extra):
    out = roster(caller)

    assert out["uploaded_at"] == "2026-01-07T00:00:00+00:00"  # manual rows count too
    assert out["students"] == EXPECTED_ROSTER
    assert db.executes <= 4 + extra, _trace(db)


@pytest.mark.parametrize(("caller", "extra"), CALLERS)
def test_project_cards(db, caller, extra):
    # A project's owner profile is shown even when the owner is not enrolled.
    ghost = ("Gus Ghost", "ghost@ucsc.edu")

    assert projects(caller) == _cards(instructor=caller == INSTR, ghost_owner=ghost)
    assert db.executes <= 2 + extra, _trace(db)


@pytest.mark.parametrize(("caller", "extra"), CALLERS)
def test_overview(db, caller, extra):
    out = overview(caller)

    assert set(out) == {"projects", "students"}
    # Unlike get_class_projects, the overview names owners from the enrolled
    # profiles only, so the unenrolled owner of Gamma shows no name or email.
    assert out["projects"] == _cards(instructor=caller == INSTR, ghost_owner=NONE_PAIR)
    assert {s["id"]: s for s in out["students"]} == EXPECTED_STUDENTS
    assert len(out["students"]) == len(EXPECTED_STUDENTS)
    assert db.executes <= 3 + extra, _trace(db)


# ------------------------------------------------------------- empty class


def test_an_empty_class_reads_as_empty(db):
    assert students(INSTR, EMPTY_CLASS) == []
    assert roster(INSTR, EMPTY_CLASS) == {"students": [], "uploaded_at": None}
    assert projects(INSTR, EMPTY_CLASS) == []
    assert overview(INSTR, EMPTY_CLASS) == {"projects": [], "students": []}
