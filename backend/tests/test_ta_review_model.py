"""
Tests for the unified TA-review model:
  * TSR-overview visibility + TA Review targets now key off
    ``projects.assigned_ta_id`` (the single operational TA per team).
  * The end-of-quarter "additional reviewer" (``project_review_tas``):
    self-appoint (window-gated), instructor override, one-per-team cap,
    must-differ-from-main, owner-only release, and the demote cascade.

Runs the real controllers against the in-memory FakeSupabase.
"""
import pytest
from fastapi import HTTPException

import app.tas.controller as tas
import app.assignments.controller as assignments
from tests.fake_supabase import FakeSupabase


INSTR = "instructor-1"
TA1 = "ta-1"   # assigned TA (main reviewer) of P1
TA2 = "ta-2"
TA3 = "ta-3"
S1 = "student-1"
CLASS = "class-1"
P1 = "proj-1"  # assigned_ta_id = TA1
P2 = "proj-2"  # no assigned TA


def _profile(uid, first):
    return {"id": uid, "email": f"{uid}@ucsc.edu", "first_name": first, "last_name": "X", "image_url": None}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        profiles=[_profile(INSTR, "Ina"), _profile(TA1, "Tara"), _profile(TA2, "Tess"),
                  _profile(TA3, "Tom"), _profile(S1, "Sam")],
        classes=[{"id": CLASS, "created_by": INSTR, "review_period_open": False}],
        class_enrollments=[
            {"id": f"enr-{u}", "class_id": CLASS, "user_id": u,
             "enrollment_role": ("ta" if u in (TA1, TA2, TA3) else "student")}
            for u in (TA1, TA2, TA3, S1)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None},
        ],
        assignments=[
            {"id": "a1", "class_id": CLASS, "Title": "TSR 1", "assignment_type": "tsr",
             "open_date": "2026-07-01", "close_date": "2026-07-08", "status": "open"},
        ],
        project_review_tas=[],
    )
    for mod in (tas, assignments):
        monkeypatch.setattr(mod, "service_client", fake, raising=False)
        monkeypatch.setattr(mod, "supabase", fake, raising=False)
    return fake


# --------------------------------------------------------------------------
# TSR-overview access + TA Review targets read projects.assigned_ta_id
# --------------------------------------------------------------------------

def test_tsr_access_instructor_unrestricted(db):
    assert assignments._resolve_tsr_overview_access(db, INSTR, CLASS) is None


def test_tsr_access_ta_scoped_to_assigned(db):
    assert assignments._resolve_tsr_overview_access(db, TA1, CLASS) == {P1}
    # TA2 is a class TA but isn't the assigned TA of any team -> empty scope.
    assert assignments._resolve_tsr_overview_access(db, TA2, CLASS) == set()


def test_tsr_access_non_ta_forbidden(db):
    with pytest.raises(HTTPException) as exc:
        assignments._resolve_tsr_overview_access(db, S1, CLASS)
    assert exc.value.status_code == 403


def test_review_targets_read_scalar(db):
    out = tas.get_ta_review_targets(TA1, CLASS)
    assert {p["id"] for p in out["projects"]} == {P1}
    assert [a["id"] for a in out["assignments"]] == ["a1"]
    with pytest.raises(HTTPException) as exc:
        tas.get_ta_review_targets(S1, CLASS)
    assert exc.value.status_code == 403


def test_list_project_tas_reads_scalar(db):
    assigned = tas.list_project_tas(INSTR, P1)
    assert [t["user_id"] for t in assigned] == [TA1]
    assert tas.list_project_tas(INSTR, P2) == []


def test_demote_clears_assigned_and_review(db):
    db.rows("project_review_tas").append(
        {"id": "prt-x", "class_id": CLASS, "project_id": P2, "user_id": TA1}
    )
    tas.demote_ta(INSTR, CLASS, TA1)
    p1 = next(p for p in db.rows("projects") if p["id"] == P1)
    assert p1["assigned_ta_id"] is None
    assert not [r for r in db.rows("project_review_tas") if r["user_id"] == TA1]
    # TSR access is revoked too (TA1 is now a student).
    with pytest.raises(HTTPException):
        assignments._resolve_tsr_overview_access(db, TA1, CLASS)


# --------------------------------------------------------------------------
# End-of-quarter additional-reviewer mechanics
# --------------------------------------------------------------------------

def test_self_appoint_blocked_when_window_closed(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(TA2, P1)  # self-appoint, window closed
    assert exc.value.status_code == 403


def test_self_appoint_when_window_open(db):
    tas.set_review_window(INSTR, CLASS, True)
    tas.set_review_ta(TA2, P1)
    rows = [r for r in db.rows("project_review_tas") if r["project_id"] == P1]
    assert [r["user_id"] for r in rows] == [TA2]


def test_additional_must_differ_from_main(db):
    tas.set_review_window(INSTR, CLASS, True)
    # TA1 is P1's assigned (main) TA -> cannot also be its additional reviewer.
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(TA1, P1)
    assert exc.value.status_code == 400


def test_cap_one_additional_reviewer(db):
    tas.set_review_window(INSTR, CLASS, True)
    tas.set_review_ta(TA2, P1)
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(TA3, P1)  # slot already taken
    assert exc.value.status_code == 409
    # Re-appointing the same TA is idempotent (no error, no duplicate row).
    tas.set_review_ta(TA2, P1)
    assert len([r for r in db.rows("project_review_tas") if r["project_id"] == P1]) == 1


def test_owner_only_release(db):
    tas.set_review_window(INSTR, CLASS, True)
    tas.set_review_ta(TA2, P1)
    # A different TA cannot release TA2's slot.
    with pytest.raises(HTTPException) as exc:
        tas.release_review_ta(TA3, P1, TA2)
    assert exc.value.status_code == 403
    # The reviewer can release themselves.
    tas.release_review_ta(TA2, P1, TA2)
    assert [r for r in db.rows("project_review_tas") if r["project_id"] == P1] == []


def test_instructor_override_bypasses_window_and_replaces(db):
    # Window closed; instructor appoints TA2 (override bypasses the window).
    tas.set_review_ta(INSTR, P1, TA2)
    assert [r["user_id"] for r in db.rows("project_review_tas") if r["project_id"] == P1] == [TA2]
    # Instructor replaces the additional reviewer with TA3.
    tas.set_review_ta(INSTR, P1, TA3)
    assert [r["user_id"] for r in db.rows("project_review_tas") if r["project_id"] == P1] == [TA3]
    # Instructor can release anyone.
    tas.release_review_ta(INSTR, P1, TA3)
    assert [r for r in db.rows("project_review_tas") if r["project_id"] == P1] == []


def test_instructor_cannot_appoint_non_ta(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(INSTR, P1, S1)  # S1 is a student, not a TA
    assert exc.value.status_code == 400


def test_list_review_tas_returns_both(db):
    tas.set_review_ta(INSTR, P1, TA2)
    out = tas.list_project_review_tas(INSTR, P1)
    by_role = {r["role"]: r["user_id"] for r in out["reviewers"]}
    assert by_role == {"assigned": TA1, "additional": TA2}
    assert out["review_period_open"] is False
