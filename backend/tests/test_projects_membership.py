"""Behaviour + round-trip budgets for project membership and role management.

Replaces the MagicMock-chain tests in the former test_projects_instructor_add_member.py
(BUG-1: membership pre-check scoped to the project; BUG-2: role change targets the
target, demotion excludes the target; missing project → 404) with the same guards run
against the in-memory FakeSupabase, plus:

- `num_members` is derived from the real member rows after every write (no drift:
  removing a non-member no longer decrements the counter);
- role changes demote the previous holder with ONE update instead of one per row;
- the six role endpoints no longer leak exception text into the 500 body;
- each path has an upper bound on Supabase round trips.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.projects import controller as projects
from tests.fake_supabase import FakeSupabase

INSTR = "instr"
TA1 = "ta-1"
S1, S2, S3, S4, S5 = "s1", "s2", "s3", "s4", "s5"
OUTSIDER = "outsider"
CLASS = "class-1"
OTHER_CLASS = "class-2"
P1, P2 = "proj-1", "proj-2"

RELATIONS = {
    ("projects", "classes"): ("class_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
    ("project_members", "projects"): ("project_id", "id", False),
    ("project_members", "profiles"): ("user_id", "id", False),
    ("project_join_requests", "projects"): ("project_id", "id", False),
}

WRITE_OPS = {"insert", "update", "upsert", "delete"}


def _profile(uid: str) -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "role": "instructor" if uid == INSTR else "student",
        "first_name": uid.upper(),
        "last_name": "X",
        "linkedin": None,
        "github": None,
        "image_url": None,
        "edu_email": f"{uid}@ucsc.edu",
    }


@pytest.fixture
def db(monkeypatch):
    """P1 = {S1 product owner, S2 member} (no scrum master); P2 = {S3 scrum master, S5 product owner}."""
    fake = FakeSupabase(
        profiles=[_profile(u) for u in (INSTR, TA1, S1, S2, S3, S4, S5, OUTSIDER)],
        classes=[
            {"id": CLASS, "created_by": INSTR, "name": "CSE 115A"},
            {"id": OTHER_CLASS, "created_by": "someone-else", "name": "Other"},
        ],
        class_enrollments=[
            {
                "id": f"e-{u}",
                "class_id": CLASS,
                "user_id": u,
                "enrollment_role": "ta" if u == TA1 else "student",
            }
            for u in (TA1, S1, S2, S3, S4, S5)
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "team_size": 5,
                "image_url": None,
                "num_members": 2,
                "created_at": "2026-01-02T00:00:00+00:00",
            },
            {
                "id": P2,
                "class_id": CLASS,
                "name": "Beta",
                "team_size": 4,
                "image_url": "b.png",
                "num_members": 2,
                "created_at": "2026-01-01T00:00:00+00:00",
            },
        ],
        project_members=[
            {
                "id": "m1",
                "project_id": P1,
                "user_id": S1,
                "role": "product owner",
                "created_at": "2026-01-03T00:00:00+00:00",
            },
            {
                "id": "m2",
                "project_id": P1,
                "user_id": S2,
                "role": "member",
                "created_at": "2026-01-04T00:00:00+00:00",
            },
            {
                "id": "m3",
                "project_id": P2,
                "user_id": S3,
                "role": "scrum master",
                "created_at": "2026-01-03T00:00:00+00:00",
            },
            {
                "id": "m5",
                "project_id": P2,
                "user_id": S5,
                "role": "product owner",
                "created_at": "2026-01-03T00:00:00+00:00",
            },
        ],
        project_join_requests=[],
        notifications=[],
        relations=RELATIONS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _members(db, pid):
    return {r["user_id"]: r["role"] for r in db.rows("project_members") if r["project_id"] == pid}


def _num_members(db, pid):
    return next(p for p in db.rows("projects") if p["id"] == pid)["num_members"]


# ------------------------------------------------------------ instructor_add_member


def test_instructor_adds_member_promotes_to_scrum_master_when_none_and_syncs_count(db):
    out = projects.instructor_add_member(P1, INSTR, S4, role="member")
    assert out == {"message": "Added member successfully", "user_id": S4, "role": "member"}
    assert _members(db, P1)[S4] == "scrum master"  # first member of a team without one
    assert _num_members(db, P1) == 3  # derived from rows, not incremented blindly
    assert db.executes <= 5, [q["table"] + ":" + q["op"] for q in db.queries]


def test_instructor_adds_member_keeps_role_when_scrum_master_exists(db):
    projects.instructor_add_member(P2, INSTR, S4, role="member")
    assert _members(db, P2)[S4] == "member"
    assert _num_members(db, P2) == 3
    assert db.executes <= 4


def test_precheck_is_scoped_to_the_project(db):
    """BUG-1 regression: S1 is a member of P1 only, so adding S1 to P2 is a NEW membership."""
    out = projects.instructor_add_member(P2, INSTR, S1, role="member")
    assert out["message"] == "Added member successfully"
    assert S1 in _members(db, P2)
    assert _members(db, P1)[S1] == "product owner"  # untouched


def test_role_change_targets_the_target_not_the_requester(db):
    """BUG-2 regression."""
    out = projects.instructor_add_member(P1, INSTR, S2, role="admin")
    assert out == {"message": "Changed roles successfully", "member": S2, "role": "admin"}
    assert _members(db, P1) == {S1: "product owner", S2: "admin"}
    assert INSTR not in _members(db, P1)
    assert db.executes <= 3


def test_scrum_master_change_demotes_previous_holder_but_not_target(db):
    projects.instructor_add_member(P2, INSTR, S5, role="scrum master")
    assert _members(db, P2) == {S3: "member", S5: "scrum master"}
    updates = [q for q in db.queries if q["op"] == "update"]
    assert len(updates) == 2  # promote target + one demotion statement, not one per holder


def test_elevated_member_adding_a_member_creates_a_pending_invite(db):
    out = projects.instructor_add_member(P1, S1, S4, role="member")  # S1 = product owner
    assert out["message"] == "Invitation sent; user must accept before joining"
    assert out["user_id"] == S4 and out["role"] == "member"
    assert out["request"]["invited_by"] == S1
    assert S4 not in _members(db, P1)
    reqs = db.rows("project_join_requests")
    assert len(reqs) == 1 and reqs[0]["request_status"] == "pending"
    assert db.executes <= 4


def test_duplicate_pending_invite_or_request_is_rejected(db):
    db.rows("project_join_requests").append(
        {"id": "r1", "project_id": P1, "user_id": S4, "request_status": "pending", "invited_by": S1}
    )
    with pytest.raises(HTTPException) as exc:
        projects.instructor_add_member(P1, S1, S4, role="member")
    assert exc.value.status_code == 400 and "invitation" in exc.value.detail
    db.rows("project_join_requests")[0]["invited_by"] = None
    with pytest.raises(HTTPException) as exc2:
        projects.instructor_add_member(P1, S1, S4, role="member")
    assert exc2.value.status_code == 400 and "join request" in exc2.value.detail


def test_elevated_member_can_add_with_a_non_member_role_directly(db):
    out = projects.instructor_add_member(P1, S1, S4, role="scrum master")
    assert out["message"] == "Added member successfully"
    assert _members(db, P1)[S4] == "scrum master"
    assert db.rows("project_join_requests") == []


def test_plain_member_cannot_add(db):
    with pytest.raises(HTTPException) as exc:
        projects.instructor_add_member(P1, S2, S4, role="member")
    assert exc.value.status_code == 403
    assert not any(q["op"] in WRITE_OPS for q in db.queries)


def test_add_member_missing_project_404(db):
    with pytest.raises(HTTPException) as exc:
        projects.instructor_add_member("nope", INSTR, S4, role="member")
    assert exc.value.status_code == 404


# --------------------------------------------------------- instructor_remove_member


def test_instructor_removes_member_and_syncs_count(db):
    out = projects.instructor_remove_member(P1, INSTR, S2)
    assert out == {"message": "Removed member successfully", "user_id": S2}
    assert _members(db, P1) == {S1: "product owner"}
    assert _num_members(db, P1) == 1
    assert db.executes <= 4


def test_self_removal_and_elevated_removal_allowed_plain_member_forbidden(db):
    projects.instructor_remove_member(P1, S2, S2)  # self
    assert S2 not in _members(db, P1)
    projects.instructor_add_member(P1, INSTR, S2, role="member")
    projects.instructor_remove_member(P1, S1, S2)  # product owner removes member
    assert S2 not in _members(db, P1)
    with pytest.raises(HTTPException) as exc:
        projects.instructor_remove_member(P2, S3, S5)  # scrum master is not elevated
    assert exc.value.status_code == 403


def test_removing_a_non_member_does_not_touch_the_counter(db):
    projects.instructor_remove_member(P1, INSTR, S4)  # S4 is not on P1
    assert _num_members(db, P1) == 2  # was decremented unconditionally before


def test_remove_member_missing_project_404(db):
    with pytest.raises(HTTPException) as exc:
        projects.instructor_remove_member("nope", INSTR, S2)
    assert exc.value.status_code == 404


# ----------------------------------------------------------------- role endpoints


def test_assign_product_owner_demotes_previous_holder_in_one_update(db):
    out = projects.assign_product_owner(P1, INSTR, S2)
    assert out == {"role": "product owner", "user_id": S2}
    assert _members(db, P1) == {S1: "member", S2: "product owner"}
    assert [q["op"] for q in db.queries].count("update") == 2
    assert db.executes <= 4


def test_assign_product_owner_permissions(db):
    projects.assign_product_owner(P1, S1, S2)  # current product owner may reassign
    assert _members(db, P1)[S2] == "product owner"
    with pytest.raises(HTTPException) as exc:
        projects.assign_product_owner(P1, S1, S2)  # S1 is now a plain member
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as nm:
        projects.assign_product_owner(P1, INSTR, S4)  # not a member
    assert nm.value.status_code == 404


def test_assign_scrum_master_demotes_previous_and_remove_requires_current_holder(db):
    projects.assign_scrum_master(P2, INSTR, S5)
    assert _members(db, P2) == {S3: "member", S5: "scrum master"}
    with pytest.raises(HTTPException) as exc:
        projects.remove_scrum_master(P2, INSTR, S3)  # S3 no longer holds the role
    assert exc.value.status_code == 400
    assert projects.remove_scrum_master(P2, INSTR, S5) == {"role": "member", "user_id": S5}
    assert _members(db, P2)[S5] == "member"


def test_admin_role_requires_instructor_or_class_ta(db):
    with pytest.raises(HTTPException) as exc:
        projects.assign_admin(P1, S1, S2)  # product owner may not
    assert exc.value.status_code == 403
    assert projects.assign_admin(P1, TA1, S2) == {"role": "admin", "user_id": S2}
    assert _members(db, P1)[S2] == "admin"
    assert projects.remove_admin(P1, INSTR, S2) == {"role": "member", "user_id": S2}
    with pytest.raises(HTTPException) as exc2:
        projects.remove_admin(P1, INSTR, S2)  # no longer admin
    assert exc2.value.status_code == 400


def test_role_endpoint_errors_do_not_leak_exception_text(db, monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("duplicate key value violates unique constraint project_members_pkey")

    monkeypatch.setattr(projects.authz, "load_project", boom)
    for fn in (
        projects.assign_product_owner,
        projects.assign_scrum_master,
        projects.assign_admin,
        projects.remove_product_owner,
        projects.remove_scrum_master,
        projects.remove_admin,
    ):
        with pytest.raises(HTTPException) as exc:
            fn(P1, INSTR, S2)
        assert exc.value.status_code == 500
        assert "constraint" not in exc.value.detail
        assert "project_members_pkey" not in exc.value.detail


# ------------------------------------------------------------ get_projects_for_user


def test_class_projects_for_instructor_in_two_queries(db):
    out = projects.get_projects_for_user(INSTR, CLASS)
    assert [p["id"] for p in out] == [P1, P2]  # created_at desc
    assert out[0] == {
        "id": P1,
        "name": "Alpha",
        "team_size": 5,
        "image_url": None,
        "member_count": 2,
        "user_role": None,
    }
    assert db.executes <= 2


def test_class_projects_for_enrolled_student_carry_their_role(db):
    out = projects.get_projects_for_user(S1, CLASS)
    roles = {p["id"]: p["user_role"] for p in out}
    assert roles == {P1: "product owner", P2: None}
    assert db.executes <= 3


def test_class_projects_access_rules(db):
    with pytest.raises(HTTPException) as exc:
        projects.get_projects_for_user(OUTSIDER, CLASS)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as missing:
        projects.get_projects_for_user(INSTR, "nope")
    assert missing.value.status_code == 404


def test_my_projects_without_class_filter(db):
    out = projects.get_projects_for_user(S3)
    assert out == [
        {
            "id": P2,
            "name": "Beta",
            "team_size": None,
            "image_url": None,
            "member_count": 2,
            "user_role": "scrum master",
        }
    ]
    assert db.executes <= 2


# --------------------------------------------------------------- get_project_members


def test_project_members_in_one_query_with_full_shape(db):
    out = projects.get_project_members(P1)
    assert db.executes == 1
    assert {m["user_id"] for m in out} == {S1, S2}
    s1 = next(m for m in out if m["user_id"] == S1)
    assert s1 == {
        "user_id": S1,
        "email": "s1@ucsc.edu",
        "user_role": "student",
        "project_role": "product owner",
        "joined_at": "2026-01-03T00:00:00+00:00",
        "first_name": "S1",
        "last_name": "X",
        "linkedin": None,
        "github": None,
        "image_url": None,
        "edu_email": "s1@ucsc.edu",
    }


def test_project_members_missing_project_404_and_empty_team(db):
    with pytest.raises(HTTPException) as exc:
        projects.get_project_members("nope")
    assert exc.value.status_code == 404
    db.rows("projects").append({"id": "p-empty", "class_id": CLASS, "name": "Empty"})
    assert projects.get_project_members("p-empty") == []


# ------------------------------------------------------------- accept_join_request


def test_accept_student_request_moves_them_and_notifies_old_product_owner(db):
    db.rows("project_join_requests").append(
        {
            "id": "r1",
            "project_id": P1,
            "user_id": S3,
            "request_status": "pending",
            "invited_by": None,
        }
    )
    out = projects.accept_join_request("r1", INSTR)
    assert out == {"message": "Join request accepted successfully", "user_id": S3}
    assert _members(db, P1)[S3] == "scrum master"  # P1 had no scrum master
    assert S3 not in _members(db, P2)
    assert _num_members(db, P1) == 3 and _num_members(db, P2) == 1
    req = db.rows("project_join_requests")[0]
    assert req["request_status"] == "approved" and req["reviewer_id"] == INSTR
    notes = db.rows("notifications")
    assert [n["user_id"] for n in notes] == [S5]  # P2's product owner
    assert notes[0]["type"] == "join_request" and notes[0]["title"] == "Member left your project"
    assert "Beta" in notes[0]["body"] and "Alpha" in notes[0]["body"]
    assert db.executes <= 11, [q["table"] + ":" + q["op"] for q in db.queries]


def test_accept_request_permissions_and_state(db):
    db.rows("project_join_requests").append(
        {
            "id": "r1",
            "project_id": P1,
            "user_id": S4,
            "request_status": "pending",
            "invited_by": None,
        }
    )
    with pytest.raises(HTTPException) as exc:
        projects.accept_join_request("r1", S2)  # plain member may not review
    assert exc.value.status_code == 403
    projects.accept_join_request("r1", S1)  # product owner may
    assert S4 in _members(db, P1)
    with pytest.raises(HTTPException) as again:
        projects.accept_join_request("r1", S1)
    assert again.value.status_code == 400  # already approved


def test_accept_team_invite_only_by_invitee(db):
    db.rows("project_join_requests").append(
        {"id": "r2", "project_id": P1, "user_id": S4, "request_status": "pending", "invited_by": S1}
    )
    with pytest.raises(HTTPException) as exc:
        projects.accept_join_request("r2", INSTR)
    assert exc.value.status_code == 403
    projects.accept_join_request("r2", S4)
    assert S4 in _members(db, P1)
