"""Behaviour + round-trip budgets for app.assignments (previously untested).

Covers the class assignment list (instructor stats / student view), TSR entry
edits, the instructor/TA TSR overview, the feedback overview, and the new
``my-submissions`` read that replaces the per-assignment fan-outs on the
student Assignments page and dashboard.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.assignments import controller as assignments
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
TA1 = "ta-1"
S1, S2, S3, OUTSIDER = "s1", "s2", "s3", "outsider"
CLASS = "class-1"
P1, P2, P3 = "proj-1", "proj-2", "proj-3"
A_TSR, A_DRAFT, A_FB, A_FORM = "a-tsr", "a-draft", "a-feedback", "a-form"


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid: str, first: str, role: str = "student") -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "first_name": first,
        "last_name": "X",
        "role": role,
    }


@pytest.fixture
def db(monkeypatch):
    """P1 (TA1) = {S1, S2}; P2 = {S3}; P3 has no members. S1 submitted TSRs about
    S2 (twice: an old and a newer row) and a feedback response; S2 reviewed S1."""
    fake = FakeSupabase(
        profiles=[
            _profile(INSTR, "Ina", "instructor"),
            _profile(OTHER_INSTR, "Ivo", "instructor"),
            _profile(TA1, "Tara"),
            _profile(S1, "Sam"),
            _profile(S2, "Sara"),
            _profile(S3, "Sid"),
            _profile(OUTSIDER, "Oz"),
        ],
        classes=[{"id": CLASS, "created_by": INSTR}],
        class_enrollments=[
            {
                "id": f"e-{u}",
                "class_id": CLASS,
                "user_id": u,
                "enrollment_role": "ta" if u == TA1 else "student",
            }
            for u in (TA1, S1, S2, S3)
        ],
        projects=[
            {"id": P1, "class_id": CLASS, "name": "Alpha", "assigned_ta_id": TA1},
            {"id": P2, "class_id": CLASS, "name": "Beta", "assigned_ta_id": None},
            {"id": P3, "class_id": CLASS, "name": "Gamma", "assigned_ta_id": None},
        ],
        project_members=[
            {"project_id": P1, "user_id": S1, "role": "member"},
            {"project_id": P1, "user_id": S2, "role": "scrum master"},
            {"project_id": P2, "user_id": S3, "role": "member"},
        ],
        assignments=[
            {
                "id": A_TSR,
                "class_id": CLASS,
                "Title": "TSR 1",
                "assignment_type": "tsr",
                "status": "publish",
                "open_date": "2026-01-01",
                "close_date": "2026-01-08",
                "created_at": "2026-01-01T00:00:00+00:00",
            },
            {
                "id": A_DRAFT,
                "class_id": CLASS,
                "Title": "TSR 2",
                "assignment_type": "tsr",
                "status": "draft",
                "open_date": "2026-02-01",
                "close_date": "2026-02-08",
                "created_at": "2026-01-02T00:00:00+00:00",
            },
            {
                "id": A_FB,
                "class_id": CLASS,
                "Title": "Feedback",
                "assignment_type": "feedback",
                "status": "publish",
                "open_date": "2026-03-01",
                "close_date": "2026-03-08",
                "created_at": "2026-01-03T00:00:00+00:00",
            },
            {
                "id": A_FORM,
                "class_id": CLASS,
                "Title": "Interest",
                "assignment_type": "interest_form",
                "status": "publish",
                "open_date": "2026-01-01",
                "close_date": "2026-01-02",
                "created_at": "2026-01-04T00:00:00+00:00",
            },
        ],
        TSRs=[
            {
                "id": "t-old",
                "assignment_id": A_TSR,
                "project_id": P1,
                "evaluator_id": S1,
                "evaluatee_id": S2,
                "percent_contribution": 40,
                "positive_feedback": "old",
                "constructive_feedback": None,
                "scrum_master_tickets": None,
                "scrum_master_assessment": None,
                "scrum_master_notes": None,
                "created_at": "2026-01-02T00:00:00+00:00",
            },
            {
                "id": "t-new",
                "assignment_id": A_TSR,
                "project_id": P1,
                "evaluator_id": S1,
                "evaluatee_id": S2,
                "percent_contribution": 50,
                "positive_feedback": "new",
                "constructive_feedback": "c",
                "scrum_master_tickets": None,
                "scrum_master_assessment": None,
                "scrum_master_notes": None,
                "created_at": "2026-01-03T00:00:00+00:00",
            },
            {
                "id": "t-s2",
                "assignment_id": A_TSR,
                "project_id": P1,
                "evaluator_id": S2,
                "evaluatee_id": S1,
                "percent_contribution": 50,
                "positive_feedback": "p",
                "constructive_feedback": None,
                "scrum_master_tickets": "T-1",
                "scrum_master_assessment": None,
                "scrum_master_notes": None,
                "created_at": "2026-01-03T00:00:00+00:00",
            },
        ],
        feedback_submissions=[
            {
                "id": "f1",
                "assignment_id": A_FB,
                "student_id": S1,
                "q1_liked": "a",
                "q2_frustrating": "b",
                "q3_missing_feature": "c",
                "q4_bugs": "d",
                "q5_suggestions": "e",
                "created_at": "2026-03-02T00:00:00+00:00",
                "updated_at": "2026-03-02T00:00:00+00:00",
            },
        ],
        relations={
            ("projects", "classes"): ("class_id", "id", False),
            ("projects", "project_members"): ("id", "project_id", True),
            ("TSRs", "projects"): ("project_id", "id", False),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


# ------------------------------------------------------- assignment list


def test_instructor_list_has_stats_and_is_bounded(db):
    out = {a["id"]: a for a in assignments.get_assignments_for_class(INSTR, CLASS)}
    assert set(out) == {A_TSR, A_DRAFT, A_FB, A_FORM}
    assert (
        out[A_TSR]["has_tsr_responses"],
        out[A_TSR]["teams_submitted"],
        out[A_TSR]["teams_total"],
    ) == (True, 1, 2)
    assert (out[A_DRAFT]["has_tsr_responses"], out[A_DRAFT]["teams_submitted"]) == (False, 0)
    assert (out[A_FB]["feedback_submitted"], out[A_FB]["feedback_total"]) == (1, 4)
    assert "teams_total" not in out[A_FB] and "feedback_total" not in out[A_TSR]
    assert "teams_total" not in out[A_FORM] and "feedback_total" not in out[A_FORM]
    assert [a["id"] for a in assignments.get_assignments_for_class(INSTR, CLASS)] == [
        A_FORM,
        A_FB,
        A_DRAFT,
        A_TSR,
    ]
    db.reset_counter()
    assignments.get_assignments_for_class(INSTR, CLASS)
    # the class, the enrollment and the assignments, then the four stat reads
    assert db.executes <= 7, _trace(db)


def test_stat_keys_are_absent_when_a_type_has_no_assignments(db):
    db.rows("assignments")[:] = [a for a in db.rows("assignments") if a["assignment_type"] == "tsr"]
    out = assignments.get_assignments_for_class(INSTR, CLASS)
    assert all("feedback_total" not in a for a in out)
    assert all("teams_total" in a for a in out)


def test_student_list_is_published_only_and_bounded(db):
    out = assignments.get_assignments_for_class(S1, CLASS)
    assert [a["id"] for a in out] == [A_FORM, A_FB, A_TSR]
    assert all("teams_total" not in a and "feedback_total" not in a for a in out)
    assert db.executes <= 3, _trace(db)


def test_list_access_rules(db):
    # Another class's instructor is not enrolled here: the account role opens nothing.
    for caller in (OTHER_INSTR, OUTSIDER):
        with pytest.raises(HTTPException) as exc:
            assignments.get_assignments_for_class(caller, CLASS)
        assert (exc.value.status_code, exc.value.detail) == (
            403,
            "You are not enrolled in this class",
        )


def test_a_ta_whose_account_is_an_instructor_sees_published_assignments(db):
    # Make TA1's account an instructor: the list must still treat them as enrolled, not refuse.
    next(p for p in db.rows("profiles") if p["id"] == TA1)["role"] = "instructor"
    out = assignments.get_assignments_for_class(TA1, CLASS)
    assert out and all(a["status"] == "publish" for a in out)


def test_the_class_owner_sees_every_status_whatever_the_account_role(db):
    next(p for p in db.rows("profiles") if p["id"] == INSTR)["role"] = "student"
    out = {a["id"]: a for a in assignments.get_assignments_for_class(INSTR, CLASS)}
    assert set(out) == {A_TSR, A_DRAFT, A_FB, A_FORM}
    assert out[A_TSR]["teams_total"] == 2


# ------------------------------------------------------------ TSR entry edit


def test_evaluator_edit_returns_the_entry_with_its_project_and_is_bounded(db):
    entry = assignments.update_tsr_entry(
        S1, A_TSR, "t-new", percent_contribution=60, constructive_feedback="better"
    )
    assert entry["tsr_id"] == "t-new"
    assert entry["project_id"] == P1  # was None: the re-select omitted the column
    assert (entry["percent_contribution"], entry["constructive_feedback"]) == (60, "better")
    assert (entry["evaluator_name"], entry["evaluatee_name"]) == ("Sam X", "Sara X")
    assert entry["scrum_master_tickets"] == ""
    assert next(r for r in db.rows("TSRs") if r["id"] == "t-new")["percent_contribution"] == 60
    assert db.executes <= 3, _trace(db)


def test_instructor_may_edit_others_may_not(db):
    assignments.update_tsr_entry(INSTR, A_TSR, "t-s2", positive_feedback="edited")
    assert next(r for r in db.rows("TSRs") if r["id"] == "t-s2")["positive_feedback"] == "edited"
    for caller in (S3, TA1, OTHER_INSTR):
        with pytest.raises(HTTPException) as exc:
            assignments.update_tsr_entry(caller, A_TSR, "t-s2", positive_feedback="nope")
        assert exc.value.status_code == 403


def test_tsr_edit_validation(db):
    with pytest.raises(HTTPException) as missing:
        assignments.update_tsr_entry(S1, A_TSR, "no-such-tsr", percent_contribution=1)
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as wrong_assignment:
        assignments.update_tsr_entry(S1, A_DRAFT, "t-new", percent_contribution=1)
    assert wrong_assignment.value.status_code == 400
    with pytest.raises(HTTPException) as nothing:
        assignments.update_tsr_entry(S1, A_TSR, "t-new")
    assert nothing.value.status_code == 400
    assert not any(q["op"] == "update" for q in db.queries)


# ------------------------------------------------------------- TSR overview


def test_instructor_overview_shape_and_budget(db):
    out = assignments.get_instructor_tsr_overview(INSTR, A_TSR)
    assert out["assignment"]["id"] == A_TSR and set(out["assignment"]) == {
        "id",
        "Title",
        "open_date",
        "close_date",
        "status",
        "class_id",
        "assignment_type",
    }
    assert out["projects"] == [
        {"id": P1, "name": "Alpha"},
        {"id": P2, "name": "Beta"},
        {"id": P3, "name": "Gamma"},
    ]
    by_id = {e["tsr_id"]: e for e in out["entries"]}
    assert set(by_id) == {"t-new", "t-s2"}  # latest row per evaluator/evaluatee/project
    assert by_id["t-new"]["evaluatee_name"] == "Sara X"
    # P1: both members submitted; P2: S3 did not; P3 has no members, so no key.
    assert out["non_submitters_by_project"] == {P1: [], P2: [{"id": S3, "name": "Sid X"}]}
    assert db.executes <= 6, _trace(db)


def test_ta_overview_is_scoped_to_assigned_teams(db):
    out = assignments.get_instructor_tsr_overview(TA1, A_TSR)
    assert out["projects"] == [{"id": P1, "name": "Alpha"}]
    assert {e["project_id"] for e in out["entries"]} == {P1}
    assert set(out["non_submitters_by_project"]) == {P1}
    assert db.executes <= 6, _trace(db)


def test_overview_access_and_type_checks(db):
    for caller in (S1, OUTSIDER):
        with pytest.raises(HTTPException) as exc:
            assignments.get_instructor_tsr_overview(caller, A_TSR)
        assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as not_tsr:
        assignments.get_instructor_tsr_overview(INSTR, A_FB)
    assert not_tsr.value.status_code == 400
    with pytest.raises(HTTPException) as missing:
        assignments.get_instructor_tsr_overview(INSTR, "no-such-assignment")
    assert missing.value.status_code == 404


# -------------------------------------------------------- feedback overview


def test_feedback_overview_shape_and_budget(db):
    out = assignments.get_feedback_overview(INSTR, A_FB)
    assert (out["submitted_count"], out["total_count"]) == (1, 4)
    assert out["submissions"][0]["student_name"] == "Sam X"
    assert set(out["submissions"][0]) == {
        "id",
        "student_id",
        "student_name",
        "q1_liked",
        "q2_frustrating",
        "q3_missing_feature",
        "q4_bugs",
        "q5_suggestions",
        "created_at",
        "updated_at",
    }
    assert out["non_submitters"] == [
        {"id": S2, "name": "Sara X"},
        {"id": S3, "name": "Sid X"},
        {"id": TA1, "name": "Tara X"},
    ]
    assert db.executes <= 5, _trace(db)


def test_feedback_overview_denies_non_owner(db):
    with pytest.raises(HTTPException) as exc:
        assignments.get_feedback_overview(OTHER_INSTR, A_FB)
    assert exc.value.status_code == 403


def test_feedback_submission_timestamp_is_timezone_aware(db):
    row = assignments.submit_feedback(S2, A_FB, "a", "b", "c", "d", "e")
    assert row["updated_at"].endswith("+00:00")


# ----------------------------------------------------------- my submissions


def test_my_submissions_lists_only_the_callers_rows(db):
    out = assignments.get_my_submissions(S1, CLASS)
    assert out == {
        "tsrs": [{"assignment_id": A_TSR, "project_id": P1}],
        "feedback_assignment_ids": [A_FB],
    }
    assert db.executes <= 5, _trace(db)
    assert assignments.get_my_submissions(S3, CLASS) == {"tsrs": [], "feedback_assignment_ids": []}


def test_my_submissions_access(db):
    with pytest.raises(HTTPException) as outsider:
        assignments.get_my_submissions(OUTSIDER, CLASS)
    assert outsider.value.status_code == 403
    with pytest.raises(HTTPException) as missing:
        assignments.get_my_submissions(S1, "no-such-class")
    assert missing.value.status_code == 404


CLASS_UUID = "cccccccc-0000-0000-0000-000000000001"


@patch("app.assignments.views.controller.get_my_submissions")
def test_my_submissions_route_is_not_shadowed(mock_fn, client, auth_header):
    mock_fn.return_value = {"tsrs": [], "feedback_assignment_ids": []}
    r = client.get(f"/api/assignments/my-submissions?class_id={CLASS_UUID}", headers=auth_header)
    assert r.status_code == 200, r.text
    assert mock_fn.call_args.kwargs == {"user_id": "user-abc", "class_id": UUID(CLASS_UUID)}
