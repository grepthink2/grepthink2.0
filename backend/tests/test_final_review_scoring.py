"""
Tests for final-review scoring + the Review-TA notes form:
  * final_review_scores — per (project, student, role) rows. Home TA enters
    product/team/scrum; the Review TA and the instructor each enter one
    overall score. 1.0–5.0, 0.1 granularity (values are rounded). Optional
    per-student note. Role-gated writes, instructor may write any role.
  * final_review_notes — one structured-notes doc per project (jsonb),
    written by the team's Review TA (or instructor).
  * The detail read (project header + members + scores + notes) is visible
    to the instructor and any class TA; students get 403.

Controller logic runs against the in-memory FakeSupabase (same harness as
test_final_reviews.py); endpoint routing uses TestClient + mocks.
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import app.tas.controller as tas
from tests.fake_supabase import FakeSupabase


INSTR = "instructor-1"
TA1 = "ta-1"   # Home TA of P1
TA2 = "ta-2"   # Review TA of P1
TA3 = "ta-3"   # class TA, no role on P1
S1 = "student-1"
S2 = "student-2"
S3 = "student-3"  # enrolled, but NOT a member of P1
CLASS = "class-1"
P1 = "proj-1"


def _profile(uid, first):
    return {"id": uid, "email": f"{uid}@ucsc.edu", "first_name": first, "last_name": "X", "image_url": None}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        profiles=[_profile(INSTR, "Ina"), _profile(TA1, "Tara"), _profile(TA2, "Tess"),
                  _profile(TA3, "Tom"), _profile(S1, "Sam"), _profile(S2, "Sara"), _profile(S3, "Sid")],
        classes=[{"id": CLASS, "created_by": INSTR, "review_period_open": True,
                  "review_zoom_url": "https://zoom.example/room"}],
        class_enrollments=[
            {"id": f"enr-{u}", "class_id": CLASS, "user_id": u,
             "enrollment_role": ("ta" if u in (TA1, TA2, TA3) else "student")}
            for u in (TA1, TA2, TA3, S1, S2, S3)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1,
             "final_review_at": "2026-07-24T20:00:00+00:00"},
        ],
        project_members=[
            {"project_id": P1, "user_id": S1, "role": "member"},
            {"project_id": P1, "user_id": S2, "role": "owner"},
        ],
        project_review_tas=[
            {"id": "prt-1", "class_id": CLASS, "project_id": P1, "user_id": TA2,
             "assigned_by": INSTR, "claimed_at": "2026-07-20T00:00:00+00:00"},
        ],
        final_review_scores=[],
        final_review_notes=[],
    )
    monkeypatch.setattr(tas, "service_client", fake, raising=False)
    monkeypatch.setattr(tas, "supabase", fake, raising=False)
    return fake


def _score_rows(db, role=None):
    rows = [r for r in db.rows("final_review_scores") if r["project_id"] == P1]
    return [r for r in rows if r["role"] == role] if role else rows


# --------------------------------------------------------------------------
# Detail read
# --------------------------------------------------------------------------

def test_detail_forbidden_for_students_and_outsiders(db):
    for uid in (S1, "not-enrolled"):
        with pytest.raises(HTTPException) as exc:
            tas.get_final_review_detail(uid, P1)
        assert exc.value.status_code == 403


def test_detail_viewer_roles(db):
    assert tas.get_final_review_detail(INSTR, P1)["viewer_role"] == "instructor"
    assert tas.get_final_review_detail(TA1, P1)["viewer_role"] == "home"
    assert tas.get_final_review_detail(TA2, P1)["viewer_role"] == "review"
    assert tas.get_final_review_detail(TA3, P1)["viewer_role"] == "ta"


def test_detail_shape(db):
    out = tas.get_final_review_detail(TA3, P1)
    assert out["project"]["name"] == "Alpha"
    assert out["project"]["final_review_at"] == "2026-07-24T20:00:00+00:00"
    assert out["review_zoom_url"] == "https://zoom.example/room"
    assert out["home_ta"]["user_id"] == TA1
    assert out["review_ta"]["user_id"] == TA2
    assert {m["user_id"] for m in out["members"]} == {S1, S2}
    assert all(m["name"] for m in out["members"])
    assert out["scores"] == []
    assert out["notes"] is None


def test_detail_unknown_project_404(db):
    with pytest.raises(HTTPException) as exc:
        tas.get_final_review_detail(INSTR, "proj-missing")
    assert exc.value.status_code == 404


# --------------------------------------------------------------------------
# Scores: home TA (product / team / scrum)
# --------------------------------------------------------------------------

def test_home_scores_save_and_upsert(db):
    entries = [
        {"student_id": S1, "product": 4.5, "team": 4.0, "scrum": 3.5, "notes": "solid"},
        {"student_id": S2, "product": 4.5, "team": 4.0, "scrum": 3.5},
    ]
    out = tas.save_final_review_scores(TA1, P1, "home", entries)
    assert out["saved"] == 2
    rows = _score_rows(db, "home")
    assert len(rows) == 2
    s1 = next(r for r in rows if r["student_id"] == S1)
    assert (s1["product"], s1["team"], s1["scrum"]) == (4.5, 4.0, 3.5)
    assert s1["overall"] is None
    assert s1["notes"] == "solid"
    assert s1["scored_by"] == TA1

    # Re-saving updates in place — no duplicate rows.
    tas.save_final_review_scores(TA1, P1, "home", [
        {"student_id": S1, "product": 3.0, "team": 3.0, "scrum": 3.0},
    ])
    rows = _score_rows(db, "home")
    assert len(rows) == 2
    s1 = next(r for r in rows if r["student_id"] == S1)
    assert s1["product"] == 3.0
    assert s1["notes"] is None  # full-role-row replace semantics


def test_home_scores_role_gating(db):
    entry = [{"student_id": S1, "product": 4.0, "team": 4.0, "scrum": 4.0}]
    for caller in (TA2, TA3, S1):
        with pytest.raises(HTTPException) as exc:
            tas.save_final_review_scores(caller, P1, "home", entry)
        assert exc.value.status_code == 403
    # Instructor override may write the home row.
    tas.save_final_review_scores(INSTR, P1, "home", entry)
    assert _score_rows(db, "home")[0]["scored_by"] == INSTR


# --------------------------------------------------------------------------
# Scores: review TA + instructor (single overall)
# --------------------------------------------------------------------------

def test_review_overall_save_and_gating(db):
    entry = [{"student_id": S1, "overall": 4.2}]
    for caller in (TA1, TA3, S1):
        with pytest.raises(HTTPException) as exc:
            tas.save_final_review_scores(caller, P1, "review", entry)
        assert exc.value.status_code == 403

    tas.save_final_review_scores(TA2, P1, "review", entry)
    row = _score_rows(db, "review")[0]
    assert row["overall"] == 4.2
    assert row["product"] is None and row["team"] is None and row["scrum"] is None


def test_instructor_overall_gating(db):
    entry = [{"student_id": S1, "overall": 3.9}]
    for caller in (TA1, TA2, TA3):
        with pytest.raises(HTTPException) as exc:
            tas.save_final_review_scores(caller, P1, "instructor", entry)
        assert exc.value.status_code == 403
    tas.save_final_review_scores(INSTR, P1, "instructor", entry)
    assert _score_rows(db, "instructor")[0]["overall"] == 3.9


# --------------------------------------------------------------------------
# Scores: validation
# --------------------------------------------------------------------------

def test_score_bounds_and_shape_validation(db):
    bad_cases = [
        ("home", {"student_id": S1, "product": 5.5, "team": 4.0, "scrum": 4.0}),   # out of range
        ("home", {"student_id": S1, "product": 0.9, "team": 4.0, "scrum": 4.0}),   # out of range
        ("home", {"student_id": S1, "product": 4.0, "team": 4.0}),                  # missing scrum
        ("home", {"student_id": S1, "product": 4.0, "team": 4.0, "scrum": 4.0, "overall": 4.0}),  # overall not allowed
        ("review", {"student_id": S1, "overall": 4.0, "product": 4.0}),             # category not allowed
        ("review", {"student_id": S1}),                                             # missing overall
    ]
    for role, entry in bad_cases:
        caller = TA1 if role == "home" else TA2
        with pytest.raises(HTTPException) as exc:
            tas.save_final_review_scores(caller, P1, role, [entry])
        assert exc.value.status_code == 400, (role, entry)

    with pytest.raises(HTTPException) as exc:
        tas.save_final_review_scores(TA1, P1, "bogus", [{"student_id": S1, "overall": 4.0}])
    assert exc.value.status_code == 400


def test_scores_rounded_to_tenths(db):
    tas.save_final_review_scores(TA2, P1, "review", [{"student_id": S1, "overall": 4.26}])
    assert _score_rows(db, "review")[0]["overall"] == 4.3


def test_scores_require_project_membership(db):
    with pytest.raises(HTTPException) as exc:
        tas.save_final_review_scores(TA1, P1, "home",
                                     [{"student_id": S3, "product": 4.0, "team": 4.0, "scrum": 4.0}])
    assert exc.value.status_code == 400


def test_scores_appear_in_detail(db):
    tas.save_final_review_scores(TA1, P1, "home", [
        {"student_id": S1, "product": 4.5, "team": 4.0, "scrum": 3.5},
    ])
    tas.save_final_review_scores(TA2, P1, "review", [{"student_id": S1, "overall": 4.0}])
    out = tas.get_final_review_detail(TA3, P1)
    roles = {(s["student_id"], s["role"]) for s in out["scores"]}
    assert roles == {(S1, "home"), (S1, "review")}


# --------------------------------------------------------------------------
# Review-TA notes form
# --------------------------------------------------------------------------

def test_notes_gating_and_upsert(db):
    content = {"project_scope": "Travel app", "member_contributions": {S1: "UI work"}}
    for caller in (TA1, TA3, S1):
        with pytest.raises(HTTPException) as exc:
            tas.save_final_review_notes(caller, P1, content, 1)
        assert exc.value.status_code == 403

    out = tas.save_final_review_notes(TA2, P1, content, 1)
    assert out["notes"]["content"]["project_scope"] == "Travel app"
    assert len(db.rows("final_review_notes")) == 1

    # Instructor override updates the same row.
    tas.save_final_review_notes(INSTR, P1, {"project_scope": "Edited"}, 1)
    rows = db.rows("final_review_notes")
    assert len(rows) == 1
    assert rows[0]["content"]["project_scope"] == "Edited"
    assert rows[0]["updated_by"] == INSTR

    detail = tas.get_final_review_detail(TA3, P1)
    assert detail["notes"]["content"]["project_scope"] == "Edited"
    assert detail["notes"]["template_version"] == 1


# --------------------------------------------------------------------------
# Endpoint routing
# --------------------------------------------------------------------------

PROJ_UUID = "bbbbbbbb-0000-0000-0000-000000000001"
STUD_UUID = "cccccccc-0000-0000-0000-000000000001"


@patch("app.tas.views.controller.get_final_review_detail")
def test_detail_endpoint_routes(mock_fn, client, auth_header):
    mock_fn.return_value = {"project": {}, "scores": [], "notes": None}
    r = client.get(f"/api/tas/projects/{PROJ_UUID}/final-review", headers=auth_header)
    assert r.status_code == 200
    mock_fn.assert_called_once()


@patch("app.tas.views.controller.save_final_review_scores")
def test_scores_endpoint_routes(mock_fn, client, auth_header):
    mock_fn.return_value = {"message": "ok", "saved": 1}
    r = client.put(
        f"/api/tas/projects/{PROJ_UUID}/final-review/scores",
        headers=auth_header,
        json={"role": "review", "scores": [{"student_id": STUD_UUID, "overall": 4.2}]},
    )
    assert r.status_code == 200
    mock_fn.assert_called_once()


@patch("app.tas.views.controller.save_final_review_notes")
def test_notes_endpoint_routes(mock_fn, client, auth_header):
    mock_fn.return_value = {"message": "ok", "notes": {"content": {}}}
    r = client.put(
        f"/api/tas/projects/{PROJ_UUID}/final-review/notes",
        headers=auth_header,
        json={"content": {"project_scope": "x"}, "template_version": 1},
    )
    assert r.status_code == 200
    mock_fn.assert_called_once()
