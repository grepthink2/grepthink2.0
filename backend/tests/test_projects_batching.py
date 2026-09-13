"""Behaviour + round-trip budgets for the project detail read and the join-request lists.

Each ``*_budget`` test bounds the Supabase round trips and checks that every read
ran in a single ``fan_out`` wave (about one round trip of latency). The other tests
pin today's response shapes, status codes and ``detail`` strings so the batching
cannot change what the endpoints answer.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core.db import fan_out
from app.projects import controller as projects
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
S1, S2, S3, S4, S5 = "s1", "s2", "s3", "s4", "s5"
OUTSIDER = "outsider"
CLASS, OTHER_CLASS = "class-1", "class-2"
P1, P2, P3, P4 = "proj-1", "proj-2", "proj-3", "proj-4"

R_JOIN_S4_P1 = "r-join-s4-p1"
R_JOIN_S5_P1 = "r-join-s5-p1"
R_REJ_S4_P2 = "r-rej-s4-p2"
R_APPR_S2_P2 = "r-appr-s2-p2"
R_INV_S4_P2 = "r-inv-s4-p2"
R_INV_DECLINED_S3_P1 = "r-inv-declined-s3-p1"
R_INV_S4_P3 = "r-inv-s4-p3"
R_JOIN_S4_P4 = "r-join-s4-p4"

REVIEW_DENIED = "Only the class instructor or project owners/admins can review join requests"

RELATIONS = {
    ("projects", "classes"): ("class_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
    ("project_members", "projects"): ("project_id", "id", False),
    ("project_join_requests", "projects"): ("project_id", "id", False),
    ("project_join_requests", "profiles!project_join_requests_invited_by_fkey"): (
        "invited_by",
        "id",
        False,
    ),
    ("project_join_requests", "profiles!project_join_requests_user_id_fkey"): (
        "user_id",
        "id",
        False,
    ),
}

WRITE_OPS = {"insert", "update", "upsert", "delete"}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid: str) -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "role": "instructor" if uid in (INSTR, OTHER_INSTR) else "student",
        "first_name": uid.upper(),
        "last_name": "X",
        "edu_email": f"{uid}@ucsc.edu",
    }


def _project(pid, class_id, name, **extra) -> dict:
    row = {
        "id": pid,
        "class_id": class_id,
        "name": name,
        "description": None,
        "created_by": INSTR,
        "created_at": "2026-01-01T00:00:00+00:00",
        "team_size": 5,
        "num_members": 0,
        "sponsor_company": None,
        "image_url": None,
        "assigned_ta_id": None,
    }
    row.update(extra)
    return row


def _request(rid, pid, uid, status, invited_by=None, created_at=None, message=None) -> dict:
    return {
        "id": rid,
        "project_id": pid,
        "user_id": uid,
        "request_status": status,
        "invited_by": invited_by,
        "reviewer_id": None,
        "reviewed_at": None,
        "message": message,
        "created_at": created_at,
    }


@pytest.fixture
def db(monkeypatch):
    """CLASS: P1 = {S1 product owner, S2 member}, P2 = {S3 owner}.
    OTHER_CLASS: P3 = {S5 admin}, P4 = {}.

    S4 has a pending request to P1, a rejected request to P2, a pending invite
    from P2, and a pending invite / request in OTHER_CLASS. S5 has a pending
    request to P1. S2 was approved into P2 once; S3 declined an invite to P1.
    """
    fake = FakeSupabase(
        profiles=[_profile(u) for u in (INSTR, OTHER_INSTR, S1, S2, S3, S4, S5, OUTSIDER)],
        classes=[
            {"id": CLASS, "created_by": INSTR, "name": "CSE 115A", "term": "fall", "year": 2026},
            {
                "id": OTHER_CLASS,
                "created_by": OTHER_INSTR,
                "name": "CSE 115B",
                "term": "spring",
                "year": 2027,
            },
        ],
        class_enrollments=[
            {"id": f"e-{u}", "class_id": CLASS, "user_id": u, "enrollment_role": "student"}
            for u in (S1, S2, S3, S4, S5)
        ]
        + [
            {"id": f"e2-{u}", "class_id": OTHER_CLASS, "user_id": u, "enrollment_role": "student"}
            for u in (S4, S5)
        ],
        projects=[
            _project(
                P1,
                CLASS,
                "Alpha",
                description="first",
                created_by=S1,
                num_members=2,
                sponsor_company="Acme",
                image_url="alpha.png",
            ),
            _project(P2, CLASS, "Beta", num_members=None, team_size=4),
            _project(P3, OTHER_CLASS, "Gamma", num_members=1),
            _project(P4, OTHER_CLASS, "Delta"),
        ],
        project_members=[
            {"id": "m1", "project_id": P1, "user_id": S1, "role": "product owner"},
            {"id": "m2", "project_id": P1, "user_id": S2, "role": "member"},
            {"id": "m3", "project_id": P2, "user_id": S3, "role": "owner"},
            {"id": "m5", "project_id": P3, "user_id": S5, "role": "admin"},
        ],
        project_join_requests=[
            _request(
                R_JOIN_S4_P1,
                P1,
                S4,
                "pending",
                created_at="2026-02-02T09:00:00+00:00",
                message="Let me in",
            ),
            _request(R_JOIN_S5_P1, P1, S5, "pending", created_at="2026-02-01T09:00:00+00:00"),
            _request(R_REJ_S4_P2, P2, S4, "rejected", created_at="2026-01-20T09:00:00+00:00"),
            _request(R_APPR_S2_P2, P2, S2, "approved", created_at="2026-01-10T09:00:00+00:00"),
            _request(
                R_INV_S4_P2,
                P2,
                S4,
                "pending",
                invited_by=S3,
                created_at="2026-02-03T09:00:00+00:00",
            ),
            _request(
                R_INV_DECLINED_S3_P1,
                P1,
                S3,
                "rejected",
                invited_by=S1,
                created_at="2026-01-15T09:00:00+00:00",
            ),
            _request(
                R_INV_S4_P3,
                P3,
                S4,
                "pending",
                invited_by=S5,
                created_at="2026-02-04T09:00:00+00:00",
            ),
            _request(R_JOIN_S4_P4, P4, S4, "pending", created_at="2026-02-05T09:00:00+00:00"),
        ],
        notifications=[],
        relations=RELATIONS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    # notify_join_request / notify_join_request_rejected talk through the
    # notifications module's own client; keep them on the double too.
    monkeypatch.setattr("app.notifications.controller.service_client", fake, raising=False)
    return fake


@pytest.fixture
def waves(monkeypatch):
    """Number of jobs in each ``fan_out`` wave the projects controller issues."""
    sizes: list[int] = []

    def recording(jobs):
        sizes.append(len(jobs))
        return fan_out(jobs)

    monkeypatch.setattr(projects, "fan_out", recording, raising=False)
    return sizes


def _one_wave(db, waves) -> bool:
    """Every round trip ran inside a single concurrent wave."""
    return len(waves) == 1 and waves[0] == db.executes


def _denied(fn, *args) -> tuple[int, str]:
    with pytest.raises(HTTPException) as exc:
        fn(*args)
    return exc.value.status_code, exc.value.detail


# ---------------------------------------------------------------- get_project_by_id


def test_project_by_id_returns_the_row_plus_the_callers_role(db):
    p1 = next(p for p in db.rows("projects") if p["id"] == P1)
    assert projects.get_project_by_id(P1, S1) == {**p1, "user_role": "product owner"}
    assert projects.get_project_by_id(P1, OUTSIDER) == {**p1, "user_role": None}
    assert projects.get_project_by_id(P1) == p1  # no user -> no user_role key
    assert _denied(projects.get_project_by_id, "no-such-project", S1) == (404, "Project not found")


def test_project_by_id_budget(db, waves):
    projects.get_project_by_id(P1, S1)
    assert db.executes <= 2 and _one_wave(db, waves), (waves, _trace(db))
    db.reset_counter()
    projects.get_project_by_id(P1)
    assert db.executes == 1, _trace(db)


# ------------------------------------------------- get_pending_team_invites_for_user


def test_team_invites_for_user_are_class_scoped_with_inviter_details(db):
    assert projects.get_pending_team_invites_for_user(S4, CLASS) == [
        {
            "request_id": R_INV_S4_P2,
            "user_id": S4,
            "email": "s3@ucsc.edu",
            "user_role": "student",
            "requested_at": "2026-02-03T09:00:00+00:00",
            "status": "pending",
            "project_id": P2,
            "project_name": "Beta",
        }
    ]
    assert projects.get_pending_team_invites_for_user(S4, OTHER_CLASS) == [
        {
            "request_id": R_INV_S4_P3,
            "user_id": S4,
            "email": "s5@ucsc.edu",
            "user_role": "student",
            "requested_at": "2026-02-04T09:00:00+00:00",
            "status": "pending",
            "project_id": P3,
            "project_name": "Gamma",
        }
    ]
    assert projects.get_pending_team_invites_for_user(S3, CLASS) == []  # declined invite
    assert projects.get_pending_team_invites_for_user(INSTR, CLASS) == []


def test_team_invites_for_user_access_rules(db):
    fn = projects.get_pending_team_invites_for_user
    assert _denied(fn, OUTSIDER, CLASS) == (403, "You do not have access to this class")
    assert _denied(fn, S1, OTHER_CLASS) == (403, "You do not have access to this class")
    assert _denied(fn, S4, "no-such-class") == (404, "Class not found")


def test_team_invites_for_user_budget(db, waves):
    projects.get_pending_team_invites_for_user(S4, CLASS)
    assert db.executes <= 3 and _one_wave(db, waves), (waves, _trace(db))


# --------------------------------------------- get_my_pending_join_requests_for_user


def test_my_join_requests_carry_project_and_course_details(db):
    out = {r["request_id"]: r for r in projects.get_my_pending_join_requests_for_user(S4, CLASS)}
    assert out == {
        R_JOIN_S4_P1: {
            "request_id": R_JOIN_S4_P1,
            "user_id": S4,
            "requested_at": "2026-02-02T09:00:00+00:00",
            "status": "pending",
            "project_id": P1,
            "project_name": "Alpha",
            "member_count": 2,
            "sponsor_company": "Acme",
            "course_label": "2026 fall CSE 115A",
            "image_url": "alpha.png",
        },
        R_REJ_S4_P2: {
            "request_id": R_REJ_S4_P2,
            "user_id": S4,
            "requested_at": "2026-01-20T09:00:00+00:00",
            "status": "rejected",
            "project_id": P2,
            "project_name": "Beta",
            "member_count": 0,  # num_members is NULL
            "sponsor_company": None,
            "course_label": "2026 fall CSE 115A",
            "image_url": None,
        },
    }
    other = projects.get_my_pending_join_requests_for_user(S4, OTHER_CLASS)
    assert [(r["request_id"], r["course_label"]) for r in other] == [
        (R_JOIN_S4_P4, "2027 spring CSE 115B")
    ]
    assert projects.get_my_pending_join_requests_for_user(S2, CLASS) == []  # approved only
    assert projects.get_my_pending_join_requests_for_user(S3, CLASS) == []  # invite, not a request
    assert projects.get_my_pending_join_requests_for_user(INSTR, CLASS) == []


def test_my_join_requests_access_rules(db):
    fn = projects.get_my_pending_join_requests_for_user
    assert _denied(fn, OUTSIDER, CLASS) == (403, "You do not have access to this class")
    assert _denied(fn, S4, "no-such-class") == (404, "Class not found")


def test_my_join_requests_budget(db, waves):
    projects.get_my_pending_join_requests_for_user(S4, CLASS)
    assert db.executes <= 3 and _one_wave(db, waves), (waves, _trace(db))


# ------------------------------------------------------- get_project_pending_invites


def test_project_pending_invites_list_invitees(db):
    expected = [
        {
            "request_id": R_INV_S4_P2,
            "user_id": S4,
            "email": "s4@ucsc.edu",
            "invited_at": "2026-02-03T09:00:00+00:00",
        }
    ]
    assert projects.get_project_pending_invites(P2, S3) == expected  # owner
    assert projects.get_project_pending_invites(P2, INSTR) == expected  # class instructor
    assert projects.get_project_pending_invites(P1, S1) == []  # only a declined invite
    assert projects.get_project_pending_invites(P3, S5) == [
        {
            "request_id": R_INV_S4_P3,
            "user_id": S4,
            "email": "s4@ucsc.edu",
            "invited_at": "2026-02-04T09:00:00+00:00",
        }
    ]


def test_project_pending_invites_access_rules(db):
    fn = projects.get_project_pending_invites
    assert _denied(fn, P1, S2) == (403, REVIEW_DENIED)  # plain member
    assert _denied(fn, P1, S3) == (403, REVIEW_DENIED)  # owner of another project
    assert _denied(fn, P2, OTHER_INSTR) == (403, REVIEW_DENIED)  # another class's instructor
    assert _denied(fn, "no-such-project", INSTR) == (404, "Project not found")


def test_project_pending_invites_budget(db, waves):
    projects.get_project_pending_invites(P2, S3)
    assert db.executes <= 2 and _one_wave(db, waves), (waves, _trace(db))


# --------------------------------------------------------- get_pending_join_requests


def test_pending_join_requests_are_student_initiated_with_requester_details(db):
    expected = {
        R_JOIN_S4_P1: {
            "request_id": R_JOIN_S4_P1,
            "user_id": S4,
            "email": "s4@ucsc.edu",
            "user_role": "student",
            "requested_at": "2026-02-02T09:00:00+00:00",
            "status": "pending",
            "message": "Let me in",
        },
        R_JOIN_S5_P1: {
            "request_id": R_JOIN_S5_P1,
            "user_id": S5,
            "email": "s5@ucsc.edu",
            "user_role": "student",
            "requested_at": "2026-02-01T09:00:00+00:00",
            "status": "pending",
            "message": None,
        },
    }
    for reviewer in (S1, INSTR):
        out = projects.get_pending_join_requests(P1, reviewer)
        assert {r["request_id"]: r for r in out} == expected
    # P2 has a pending invite, an approved and a rejected request: none is listed.
    assert projects.get_pending_join_requests(P2, S3) == []
    assert projects.get_pending_join_requests(P3, S5) == []  # admin; only an invite pending


def test_pending_join_requests_access_rules(db):
    fn = projects.get_pending_join_requests
    assert _denied(fn, P1, S2) == (403, REVIEW_DENIED)
    assert _denied(fn, P1, S3) == (403, REVIEW_DENIED)
    assert _denied(fn, P1, OUTSIDER) == (403, REVIEW_DENIED)
    assert _denied(fn, "no-such-project", S1) == (404, "Project not found")


def test_pending_join_requests_budget(db, waves):
    projects.get_pending_join_requests(P1, S1)
    assert db.executes <= 2 and _one_wave(db, waves), (waves, _trace(db))
    db.reset_counter()
    waves.clear()
    projects.get_pending_join_requests(P1, INSTR)
    assert db.executes <= 2 and _one_wave(db, waves), (waves, _trace(db))
