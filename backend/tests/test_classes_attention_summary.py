"""``GET /api/classes/attention-summary``: roster alerts for the instructor home page.

The page used to request ``GET /api/classes/{id}/roster`` for every active class
and count, per class, the rows ``summarizeRoster().notOnRoster`` counts
(frontend/src/features/app/components/Dashboard/dashboardData.ts): not a TA,
registered on GrepThink, and not on the official roster. The summary returns that
count and the roster's ``uploaded_at`` for every class the caller created, in a
number of queries that does not depend on how many classes there are.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR, NOBODY = "instr", "instr-2", "no-classes"
CLASS_A, CLASS_B, CLASS_C, CLASS_OTHER = "class-a", "class-b", "class-c", "class-other"

# CLASS_A: roster uploaded
TA_A = "ta-a"  # a TA who is not on the roster: never counted
A_ENROLLED, A_WAITLISTED, A_DROPPED = "a-enrolled", "a-waitlisted", "a-dropped"
A_NOT_ON_ROSTER = "a-not-on-roster"
A_BY_PRIMARY = "a-by-primary"  # roster lists their primary email, profile has an edu_email
A_BY_ID = "a-by-id"  # roster row under an old email, matched only by matched_profile_id
# CLASS_B: no roster
TA_B, B1, B2 = "ta-b", "b1", "b2"

MANUAL_UPLOADED_AT = "2026-01-09T00:00:00+00:00"
CSV_UPLOADED_AT = "2026-01-05T00:00:00+00:00"

RELATIONS = {
    ("classes", "class_enrollments"): ("id", "class_id", True),
    ("classes", "roster_entries"): ("id", "course_id", True),
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid, *, edu=None):
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "edu_email": edu,
        "role": "student",
        "first_name": uid.title(),
        "last_name": "X",
    }


def _enroll(class_id, uid, role="student"):
    return {
        "id": f"e-{class_id}-{uid}",
        "class_id": class_id,
        "user_id": uid,
        "enrollment_role": role,
    }


def _roster(class_id, email, status, matched=None, uploaded_at=CSV_UPLOADED_AT, manual=False):
    return {
        "id": f"r-{class_id}-{email}",
        "course_id": class_id,
        "email": email,
        "status": status,
        "matched_profile_id": matched,
        "uploaded_at": uploaded_at,
        "first_name": None,
        "last_name": None,
        "is_manual": manual,
    }


def _world() -> dict:
    return {
        "profiles": [
            _profile(INSTR),
            _profile(OTHER_INSTR),
            _profile(TA_A),
            _profile(A_ENROLLED),
            _profile(A_WAITLISTED),
            _profile(A_DROPPED),
            _profile(A_NOT_ON_ROSTER),
            _profile(A_BY_PRIMARY, edu="a-by-primary-edu@ucsc.edu"),
            _profile(A_BY_ID),
            _profile(TA_B),
            _profile(B1),
            _profile(B2),
        ],
        "classes": [
            {"id": CLASS_A, "created_by": INSTR, "status": "active"},
            {"id": CLASS_B, "created_by": INSTR, "status": "active"},
            {"id": CLASS_C, "created_by": INSTR, "status": "complete"},
            {"id": CLASS_OTHER, "created_by": OTHER_INSTR, "status": "active"},
        ],
        "class_enrollments": [
            _enroll(CLASS_A, TA_A, "ta"),
            _enroll(CLASS_A, A_ENROLLED),
            _enroll(CLASS_A, A_WAITLISTED),
            _enroll(CLASS_A, A_DROPPED),
            _enroll(CLASS_A, A_NOT_ON_ROSTER),
            _enroll(CLASS_A, A_BY_PRIMARY),
            _enroll(CLASS_A, A_BY_ID),
            _enroll(CLASS_B, TA_B, "ta"),
            _enroll(CLASS_B, B1),
            _enroll(CLASS_B, B2, role=None),
            _enroll(CLASS_OTHER, B1),
        ],
        "roster_entries": [
            _roster(CLASS_A, f"{A_ENROLLED}@ucsc.edu", "enrolled", A_ENROLLED),
            _roster(CLASS_A, f"{A_WAITLISTED}@ucsc.edu", "waitlisted"),
            _roster(CLASS_A, f"{A_DROPPED}@ucsc.edu", "dropped", A_DROPPED),
            _roster(CLASS_A, "stranger@ucsc.edu", "enrolled"),  # matches nobody
            _roster(CLASS_A, f"{A_BY_PRIMARY}@ucsc.edu", "enrolled"),
            _roster(CLASS_A, "old-address@ucsc.edu", "enrolled", A_BY_ID),
            _roster(
                CLASS_A, "manual@ucsc.edu", "manual", uploaded_at=MANUAL_UPLOADED_AT, manual=True
            ),
            _roster(CLASS_OTHER, "someone@ucsc.edu", "enrolled"),
        ],
        "projects": [],
        "project_members": [],
        "relations": RELATIONS,
    }


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(**_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _not_on_roster(roster: dict) -> int:
    """summarizeRoster().notOnRoster, applied to get_class_roster's students."""
    return sum(
        1
        for s in roster["students"]
        if s["enrollment_role"] != "ta"
        and s["grepthink_status"] == "registered"
        and s["class_status"] == "not_on_roster"
    )


def test_summary_matches_what_the_roster_page_counts(db):
    summary = classes.get_attention_summary(INSTR)
    assert set(summary) == {"classes"}
    by_class = {entry["class_id"]: entry for entry in summary["classes"]}
    assert len(by_class) == len(summary["classes"])
    # Every class the caller created, whatever its status; nobody else's.
    assert set(by_class) == {CLASS_A, CLASS_B, CLASS_C}

    for class_id, entry in by_class.items():
        roster = classes.get_class_roster(class_id, INSTR)
        assert entry == {
            "class_id": class_id,
            "roster_uploaded_at": roster["uploaded_at"],
            "not_on_roster": _not_on_roster(roster),
        }

    # Concretely: A counts A_NOT_ON_ROSTER, and A_BY_ID, whose roster row only matches
    # by id so the roster page lists them a second time as not on the roster. The
    # latest upload is the manual row. B has no roster, so both students count.
    assert {cid: (e["not_on_roster"], e["roster_uploaded_at"]) for cid, e in by_class.items()} == {
        CLASS_A: (2, MANUAL_UPLOADED_AT),
        CLASS_B: (2, None),
        CLASS_C: (0, None),
    }


def test_summary_query_count_does_not_grow_with_classes(db):
    classes.get_attention_summary(INSTR)
    first = db.executes
    assert first <= 5, _trace(db)

    for n in range(5):
        cid = f"extra-{n}"
        db.rows("classes").append({"id": cid, "created_by": INSTR, "status": "active"})
        db.rows("class_enrollments").append(_enroll(cid, B1))
        db.rows("roster_entries").append(_roster(cid, "stranger@ucsc.edu", "enrolled"))
    db.reset_counter()
    summary = classes.get_attention_summary(INSTR)
    assert len(summary["classes"]) == 8
    assert db.executes == first, _trace(db)


def test_a_caller_without_classes_gets_an_empty_list(db):
    assert classes.get_attention_summary(NOBODY) == {"classes": []}
    assert db.executes <= 1, _trace(db)


@patch("app.classes.views.controller.get_attention_summary")
def test_route_passes_the_caller_and_is_not_shadowed_by_class_id(mock_fn, client, auth_header):
    mock_fn.return_value = {"classes": []}
    r = client.get("/api/classes/attention-summary", headers=auth_header)
    assert r.status_code == 200, r.text
    assert r.json() == {"classes": []}
    assert mock_fn.call_args.kwargs == {"user_id": "user-abc"}
