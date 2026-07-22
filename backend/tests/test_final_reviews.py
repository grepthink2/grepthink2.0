"""
Tests for the Final Reviews schedule layer on top of the review model:
  * classes.review_zoom_url — ONE shared Zoom room per class (instructor-set).
  * projects.final_review_at — a team's single end-of-quarter review slot
    (instructor set/clear; no attendance).
  * The per-class schedule read (instructor + class TAs only): teams ordered by
    review time (unscheduled last), each with its Home TA and Review TA, plus
    the class Zoom/window state and the viewer's review count.

Controller logic runs against the in-memory FakeSupabase (same harness as
test_ta_review_model.py); endpoint routing/role-gating uses TestClient + mocks.
"""
import datetime
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import app.tas.controller as tas
from tests.fake_supabase import FakeSupabase


INSTR = "instructor-1"
TA1 = "ta-1"   # Home TA (assigned_ta_id) of P1 and P3
TA2 = "ta-2"
TA3 = "ta-3"
S1 = "student-1"
CLASS = "class-1"
P1 = "proj-1"  # review at 22:00Z, home TA1
P2 = "proj-2"  # review at 20:00Z, no home TA
P3 = "proj-3"  # unscheduled, home TA1

ZOOM = "https://ucsc.zoom.us/j/123?pwd=abc"
T_2000 = datetime.datetime(2026, 7, 22, 20, 0, tzinfo=datetime.timezone.utc)
T_2200 = datetime.datetime(2026, 7, 22, 22, 0, tzinfo=datetime.timezone.utc)


def _profile(uid, first):
    return {"id": uid, "email": f"{uid}@ucsc.edu", "first_name": first, "last_name": "X", "image_url": None}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        profiles=[_profile(INSTR, "Ina"), _profile(TA1, "Tara"), _profile(TA2, "Tess"),
                  _profile(TA3, "Tom"), _profile(S1, "Sam")],
        classes=[{"id": CLASS, "created_by": INSTR, "review_period_open": False,
                  "review_zoom_url": None}],
        class_enrollments=[
            {"id": f"enr-{u}", "class_id": CLASS, "user_id": u,
             "enrollment_role": ("ta" if u in (TA1, TA2, TA3) else "student")}
            for u in (TA1, TA2, TA3, S1)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1,
             "final_review_at": T_2200.isoformat()},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None,
             "final_review_at": T_2000.isoformat()},
            {"id": P3, "class_id": CLASS, "name": "Gamma", "assigned_ta_id": TA1,
             "final_review_at": None},
        ],
        project_review_tas=[],
    )
    monkeypatch.setattr(tas, "service_client", fake, raising=False)
    monkeypatch.setattr(tas, "supabase", fake, raising=False)
    return fake


def _class_row(db):
    return next(c for c in db.rows("classes") if c["id"] == CLASS)


def _project(db, pid):
    return next(p for p in db.rows("projects") if p["id"] == pid)


# --------------------------------------------------------------------------
# Shared Zoom (classes.review_zoom_url)
# --------------------------------------------------------------------------

def test_set_review_zoom_updates_class(db):
    out = tas.set_review_zoom(INSTR, CLASS, ZOOM)
    assert out["review_zoom_url"] == ZOOM
    assert _class_row(db)["review_zoom_url"] == ZOOM


def test_set_review_zoom_clears_with_none_or_blank(db):
    tas.set_review_zoom(INSTR, CLASS, ZOOM)
    tas.set_review_zoom(INSTR, CLASS, None)
    assert _class_row(db)["review_zoom_url"] is None
    tas.set_review_zoom(INSTR, CLASS, ZOOM)
    tas.set_review_zoom(INSTR, CLASS, "   ")
    assert _class_row(db)["review_zoom_url"] is None


def test_set_review_zoom_instructor_only(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_review_zoom(TA1, CLASS, ZOOM)
    assert exc.value.status_code == 403
    assert _class_row(db)["review_zoom_url"] is None


# --------------------------------------------------------------------------
# Per-team review slot (projects.final_review_at)
# --------------------------------------------------------------------------

def test_set_final_review_time_sets_and_clears(db):
    when = datetime.datetime(2026, 7, 24, 18, 0, tzinfo=datetime.timezone.utc)
    out = tas.set_final_review_time(INSTR, P3, when)
    assert out["final_review_at"] == when.isoformat()
    assert _project(db, P3)["final_review_at"] == when.isoformat()

    out = tas.set_final_review_time(INSTR, P3, None)
    assert out["final_review_at"] is None
    assert _project(db, P3)["final_review_at"] is None


def test_set_final_review_time_instructor_only(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_final_review_time(TA1, P1, T_2000)
    assert exc.value.status_code == 403
    assert _project(db, P1)["final_review_at"] == T_2200.isoformat()


def test_set_final_review_time_unknown_project_404(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_final_review_time(INSTR, "proj-missing", T_2000)
    assert exc.value.status_code == 404


# --------------------------------------------------------------------------
# Schedule read (instructor + class TAs)
# --------------------------------------------------------------------------

def test_schedule_forbidden_for_students_and_outsiders(db):
    for uid in (S1, "not-enrolled"):
        with pytest.raises(HTTPException) as exc:
            tas.get_final_review_schedule(uid, CLASS)
        assert exc.value.status_code == 403


def test_schedule_orders_by_time_with_unscheduled_last(db):
    out = tas.get_final_review_schedule(INSTR, CLASS)
    assert [t["project_id"] for t in out["teams"]] == [P2, P1, P3]


def test_schedule_includes_tas_zoom_and_window(db):
    tas.set_review_zoom(INSTR, CLASS, ZOOM)
    tas.set_review_window(INSTR, CLASS, True)
    tas.set_review_ta(INSTR, P1, TA2)

    out = tas.get_final_review_schedule(TA1, CLASS)
    assert out["review_zoom_url"] == ZOOM
    assert out["review_period_open"] is True

    by_id = {t["project_id"]: t for t in out["teams"]}
    assert by_id[P1]["home_ta"]["user_id"] == TA1
    assert by_id[P1]["home_ta"]["name"]
    assert by_id[P1]["review_ta"]["user_id"] == TA2
    assert by_id[P1]["review_ta"]["email"] == f"{TA2}@ucsc.edu"
    assert by_id[P2]["home_ta"] is None      # no assigned TA
    assert by_id[P2]["review_ta"] is None    # open slot
    assert by_id[P1]["final_review_at"] == T_2200.isoformat()
    assert by_id[P3]["final_review_at"] is None


def test_schedule_my_review_count(db):
    tas.set_review_ta(INSTR, P1, TA2)
    tas.set_review_ta(INSTR, P3, TA2)

    assert tas.get_final_review_schedule(TA2, CLASS)["my_review_count"] == 2
    assert tas.get_final_review_schedule(TA3, CLASS)["my_review_count"] == 0
    assert tas.get_final_review_schedule(INSTR, CLASS)["my_review_count"] == 0


# --------------------------------------------------------------------------
# Endpoint routing + role gating
# --------------------------------------------------------------------------

CLASS_UUID = "aaaaaaaa-0000-0000-0000-000000000001"
PROJ_UUID = "bbbbbbbb-0000-0000-0000-000000000001"


@patch("app.tas.views.controller.get_final_review_schedule")
def test_schedule_endpoint_routes(mock_fn, client, auth_header):
    mock_fn.return_value = {"class_id": CLASS_UUID, "teams": []}
    r = client.get(f"/api/tas/classes/{CLASS_UUID}/final-reviews", headers=auth_header)
    assert r.status_code == 200
    assert r.json()["teams"] == []
    mock_fn.assert_called_once()


@patch("app.tas.views.controller.set_review_zoom")
@patch("app.auth.controller.get_user_role")
def test_review_zoom_endpoint_requires_instructor(mock_role, mock_fn, client, auth_header):
    mock_role.return_value = "student"
    r = client.post(
        f"/api/tas/classes/{CLASS_UUID}/review-zoom",
        headers=auth_header, json={"zoom_url": ZOOM},
    )
    assert r.status_code == 403
    mock_fn.assert_not_called()

    mock_role.return_value = "instructor"
    mock_fn.return_value = {"review_zoom_url": ZOOM}
    r = client.post(
        f"/api/tas/classes/{CLASS_UUID}/review-zoom",
        headers=auth_header, json={"zoom_url": ZOOM},
    )
    assert r.status_code == 200
    mock_fn.assert_called_once()


@patch("app.tas.views.controller.set_final_review_time")
@patch("app.auth.controller.get_user_role")
def test_review_time_endpoint_requires_instructor(mock_role, mock_fn, client, auth_header):
    mock_role.return_value = "student"
    r = client.post(
        f"/api/tas/projects/{PROJ_UUID}/review-time",
        headers=auth_header, json={"scheduled_at": "2026-07-22T20:00:00Z"},
    )
    assert r.status_code == 403
    mock_fn.assert_not_called()

    mock_role.return_value = "instructor"
    mock_fn.return_value = {"final_review_at": "2026-07-22T20:00:00+00:00"}
    r = client.post(
        f"/api/tas/projects/{PROJ_UUID}/review-time",
        headers=auth_header, json={"scheduled_at": None},
    )
    assert r.status_code == 200
    mock_fn.assert_called_once()
