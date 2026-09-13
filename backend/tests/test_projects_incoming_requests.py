"""GET /api/projects/incoming-join-requests: the pending requests the caller reviews in a class.

Replaces the web client's fan-out of one ``GET /api/projects/{id}/join-requests`` per
reviewable project. Pins the row shape (the per-project endpoint's seven keys plus
``project_id`` / ``project_name`` / ``member_count``), the review scope (owner / product
owner / admin members, compared trimmed and lowercased like ``canReviewJoinRequests``),
the ordering, a query budget that does not grow with the number of projects, and the
route wiring.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import UUID

import pytest

from app.projects import controller as projects
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
S1, S2, S3, S4, S5, S6, S7, S8 = "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"
OUTSIDER = "outsider"
CLASS, OTHER_CLASS = "class-1", "class-2"
PA, PB, PC, PD, PE = "proj-a", "proj-b", "proj-c", "proj-d", "proj-e"

ROW_KEYS = ("request_id", "user_id", "email", "user_role", "requested_at", "status", "message")

RELATIONS = {
    ("projects", "classes"): ("class_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
    ("project_join_requests", "profiles!project_join_requests_user_id_fkey"): (
        "user_id",
        "id",
        False,
    ),
}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _member(pid, uid, role) -> dict:
    return {"id": f"m-{pid}-{uid}", "project_id": pid, "user_id": uid, "role": role}


def _project(pid, class_id, name, created_at="2026-01-01T00:00:00+00:00") -> dict:
    return {"id": pid, "class_id": class_id, "name": name, "created_at": created_at}


def _request(rid, pid, uid, status="pending", invited_by=None, created_at=None, message=None):
    return {
        "id": rid,
        "project_id": pid,
        "user_id": uid,
        "request_status": status,
        "invited_by": invited_by,
        "message": message,
        "created_at": created_at,
    }


@pytest.fixture
def db(monkeypatch):
    """CLASS (instructor INSTR):
        PA Alpha = {INSTR owner, S1 'Product Owner ', S2 member}
        PB Beta  = {INSTR ' admin', S3 member}
        PC Gamma = {INSTR member, S4 product owner}
        PD Delta = {S5 owner}  (INSTR is not a member)
    OTHER_CLASS: PE Epsilon = {INSTR owner}
    """
    fake = FakeSupabase(
        profiles=[
            {
                "id": u,
                "email": f"{u}@ucsc.edu",
                "role": "instructor" if u in (INSTR, OTHER_INSTR) else "student",
            }
            for u in (INSTR, OTHER_INSTR, S1, S2, S3, S4, S5, S6, S7, S8, OUTSIDER)
        ],
        classes=[
            {"id": CLASS, "created_by": INSTR},
            {"id": OTHER_CLASS, "created_by": OTHER_INSTR},
        ],
        class_enrollments=[
            {"id": f"e-{u}", "class_id": CLASS, "user_id": u, "enrollment_role": "student"}
            for u in (S1, S2, S3, S4, S5, S6, S7, S8)
        ],
        projects=[
            _project(PA, CLASS, "Alpha", "2026-01-05T00:00:00+00:00"),
            _project(PB, CLASS, "Beta", "2026-01-04T00:00:00+00:00"),
            _project(PC, CLASS, "Gamma", "2026-01-03T00:00:00+00:00"),
            _project(PD, CLASS, "Delta", "2026-01-02T00:00:00+00:00"),
            _project(PE, OTHER_CLASS, "Epsilon"),
        ],
        project_members=[
            _member(PA, INSTR, "owner"),
            _member(PA, S1, "Product Owner "),
            _member(PA, S2, "member"),
            _member(PB, INSTR, " admin"),
            _member(PB, S3, "member"),
            _member(PC, INSTR, "member"),
            _member(PC, S4, "product owner"),
            _member(PD, S5, "owner"),
            _member(PE, INSTR, "owner"),
        ],
        project_join_requests=[
            _request("ra1", PA, S6, created_at="2026-03-02T10:00:00+00:00", message="pick me"),
            _request("ra2", PA, S7),  # no timestamp
            _request("rb1", PB, S8, created_at="2026-03-01T08:00:00+00:00"),
            # excluded: a team invite, requests that are no longer pending
            _request("rb-invite", PB, S6, invited_by=INSTR, created_at="2026-02-01T00:00:00+00:00"),
            _request("ra-rejected", PA, S8, "rejected", created_at="2026-02-01T00:00:00+00:00"),
            _request("ra-approved", PA, S2, "approved", created_at="2026-01-06T00:00:00+00:00"),
            # excluded for INSTR: plain member of PC, not a member of PD, PE is another class
            _request("rc1", PC, S6, created_at="2026-03-03T00:00:00+00:00"),
            _request("rd1", PD, S7, created_at="2026-03-04T00:00:00+00:00"),
            _request("re1", PE, S8, created_at="2026-03-05T00:00:00+00:00"),
        ],
        relations=RELATIONS,
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _ids(rows) -> list[str]:
    return [r["request_id"] for r in rows]


def test_instructor_gets_pending_student_requests_on_the_projects_they_review(db):
    assert projects.get_incoming_join_requests(INSTR, CLASS) == [
        {
            "request_id": "ra2",
            "user_id": S7,
            "email": "s7@ucsc.edu",
            "user_role": "student",
            "requested_at": None,
            "status": "pending",
            "message": None,
            "project_id": PA,
            "project_name": "Alpha",
            "member_count": 3,
        },
        {
            "request_id": "rb1",
            "user_id": S8,
            "email": "s8@ucsc.edu",
            "user_role": "student",
            "requested_at": "2026-03-01T08:00:00+00:00",
            "status": "pending",
            "message": None,
            "project_id": PB,
            "project_name": "Beta",
            "member_count": 2,
        },
        {
            "request_id": "ra1",
            "user_id": S6,
            "email": "s6@ucsc.edu",
            "user_role": "student",
            "requested_at": "2026-03-02T10:00:00+00:00",
            "status": "pending",
            "message": "pick me",
            "project_id": PA,
            "project_name": "Alpha",
            "member_count": 3,
        },
    ]


def test_rows_match_the_per_project_endpoint_and_the_projects_list(db):
    out = projects.get_incoming_join_requests(INSTR, CLASS)
    counts = {p["id"]: p["member_count"] for p in projects.get_projects_for_user(INSTR, CLASS)}
    assert out
    for row in out:
        assert set(row) == {*ROW_KEYS, "project_id", "project_name", "member_count"}
        per_project = {
            r["request_id"]: r for r in projects.get_pending_join_requests(row["project_id"], INSTR)
        }
        assert {k: row[k] for k in ROW_KEYS} == per_project[row["request_id"]]
        assert row["member_count"] == counts[row["project_id"]]


def test_review_scope_follows_the_callers_project_role(db):
    assert _ids(projects.get_incoming_join_requests(S4, CLASS)) == ["rc1"]
    # 'Product Owner ' qualifies once trimmed and lowercased, like canReviewJoinRequests.
    assert _ids(projects.get_incoming_join_requests(S1, CLASS)) == ["ra2", "ra1"]
    # Membership decides, not class ownership: INSTR owns PE in a class they did not create.
    assert _ids(projects.get_incoming_join_requests(INSTR, OTHER_CLASS)) == ["re1"]
    assert projects.get_incoming_join_requests(S2, CLASS) == []  # plain member
    assert projects.get_incoming_join_requests(OUTSIDER, CLASS) == []
    assert projects.get_incoming_join_requests(INSTR, "no-such-class") == []


def test_sorted_oldest_first_with_missing_timestamps_first(db):
    db.rows("project_join_requests").extend(
        [
            # 08:10+01:00 is 07:10 UTC: before rb1 although it sorts after it as text.
            _request("rb-offset", PB, S4, created_at="2026-03-01T08:10:00+01:00"),
            _request("rb-fraction", PB, S5, created_at="2026-03-01T08:30:00.5Z"),
        ]
    )
    assert _ids(projects.get_incoming_join_requests(INSTR, CLASS)) == [
        "ra2",
        "rb-offset",
        "rb1",
        "rb-fraction",
        "ra1",
    ]


def test_query_budget_does_not_grow_with_the_number_of_projects(db):
    projects.get_incoming_join_requests(INSTR, CLASS)
    assert db.executes <= 3, _trace(db)

    for i in range(20):
        pid = f"extra-{i}"
        db.rows("projects").append(_project(pid, CLASS, f"Extra {i}"))
        db.rows("project_members").append(_member(pid, INSTR, "product owner"))
        db.rows("project_join_requests").append(
            _request(f"rx-{i}", pid, S6, created_at=f"2026-04-{i + 1:02d}T00:00:00+00:00")
        )
    db.reset_counter()
    assert len(projects.get_incoming_join_requests(INSTR, CLASS)) == 23
    assert db.executes <= 3, _trace(db)

    db.reset_counter()
    assert projects.get_incoming_join_requests(S2, CLASS) == []
    assert db.executes == 1, _trace(db)  # nothing reviewable: no requests read


# ------------------------------------------------------------------ view wiring

CLASS_UUID = "cccccccc-0000-0000-0000-0000000000aa"


@patch("app.projects.views.controller.get_incoming_join_requests")
def test_route_passes_the_caller_and_class_through(mock_fn, client, auth_header):
    mock_fn.return_value = [{"request_id": "r1"}]
    r = client.get(
        f"/api/projects/incoming-join-requests?class_id={CLASS_UUID}", headers=auth_header
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"requests": [{"request_id": "r1"}]}
    assert mock_fn.call_args.kwargs == {"user_id": "user-abc", "class_id": UUID(CLASS_UUID)}


@patch("app.projects.views.controller.get_incoming_join_requests")
def test_route_requires_a_class_id(mock_fn, client, auth_header):
    r = client.get("/api/projects/incoming-join-requests", headers=auth_header)
    assert r.status_code == 422, r.text
    mock_fn.assert_not_called()
