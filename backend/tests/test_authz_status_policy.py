"""404 for a missing resource, 403 for denied access, in every module.

The policy is written down in ``app/core/authz.py``: 404 means the class or
project the request addresses does not exist; 403 means it exists and the
signed-in caller lacks the relationship or role the action needs. Existence is
not hidden, and one condition answers one ``detail`` everywhere.

Each row runs a real controller (or an authz helper) against ``FakeSupabase``
and pins the exact status and detail for a representative endpoint of every
module whose answers were normalized. A denied call must also write nothing.
"""

from __future__ import annotations

import datetime

import pytest
from fastapi import HTTPException

from app import dependencies
from app.assignments import controller as assignments
from app.attendance import controller as attendance
from app.core import authz
from app.projects import controller as projects
from app.staffing import controller as staffing
from app.tas import controller as tas
from app.tsr import controller as tsr
from app.tsr.models import CreateTSRRequest
from tests.fake_supabase import FakeSupabase

# The detail each condition answers, in every module.
CLASS_NOT_FOUND = "Class not found"
NOT_CLASS_INSTRUCTOR = "Only the class instructor can do this"
NOT_CLASS_MEMBER = "You do not have access to this class"
NOT_ENROLLED = "You are not enrolled in this class"
INSTRUCTOR_ROLE_REQUIRED = "Instructor role required"
PROJECT_NOT_FOUND = "Project not found"
NOT_PROJECT_MEMBER = "Not a member of this project"

INSTR = "10000000-0000-0000-0000-000000000001"
OTHER_INSTR = "10000000-0000-0000-0000-000000000002"
TA1 = "20000000-0000-0000-0000-000000000001"
S1 = "30000000-0000-0000-0000-000000000001"
OUTSIDER = "40000000-0000-0000-0000-000000000001"
CLASS = "c0000000-0000-0000-0000-000000000001"
MISSING_CLASS = "c0000000-0000-0000-0000-00000000dead"
P1 = "d0000000-0000-0000-0000-000000000001"
MISSING_PROJECT = "d0000000-0000-0000-0000-00000000dead"
A_FEEDBACK = "a0000000-0000-0000-0000-000000000001"
A_ORPHAN = "a0000000-0000-0000-0000-000000000002"  # its class row no longer exists

ROLES = {
    INSTR: "instructor",
    OTHER_INSTR: "instructor",
    TA1: "student",
    S1: "student",
    OUTSIDER: "student",
}
WRITE_OPS = {"insert", "update", "upsert", "delete"}
OCT_1, OCT_8 = datetime.date(2026, 10, 1), datetime.date(2026, 10, 8)


def _feedback_assignment(aid: str, class_id: str) -> dict:
    return {
        "id": aid,
        "class_id": class_id,
        "Title": "Feedback",
        "assignment_type": "feedback",
        "status": "publish",
        "open_date": OCT_1.isoformat(),
        "close_date": OCT_8.isoformat(),
    }


@pytest.fixture
def db(monkeypatch):
    """CLASS belongs to INSTR. TA1 (ta) and S1 (student) are enrolled; S1 is on P1,
    whose assigned TA is TA1. OTHER_INSTR and OUTSIDER have no tie to CLASS."""
    fake = FakeSupabase(
        profiles=[
            {
                "id": uid,
                "email": f"{uid}@ucsc.edu",
                "role": role,
                "first_name": "First",
                "last_name": "Last",
                "image_url": None,
            }
            for uid, role in ROLES.items()
        ],
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "name": "CSE 115A",
                "status": "active",
                "term": "fall",
                "start_date": "2026-09-24",
                "meetings_per_week": 1,
                "meeting_duration_minutes": 30,
                "review_period_open": False,
                "review_zoom_url": None,
            }
        ],
        class_enrollments=[
            {"id": "e-ta", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e-s1", "class_id": CLASS, "user_id": S1, "enrollment_role": "student"},
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "assigned_ta_id": TA1,
                "team_size": 4,
                "num_members": 1,
            }
        ],
        project_members=[{"id": "m-s1", "project_id": P1, "user_id": S1, "role": "member"}],
        assignments=[
            _feedback_assignment(A_FEEDBACK, CLASS),
            _feedback_assignment(A_ORPHAN, MISSING_CLASS),
        ],
        relations={
            ("projects", "classes"): ("class_id", "id", False),
            ("projects", "project_members"): ("id", "project_id", True),
            ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): (
                "user_id",
                "id",
                False,
            ),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    # create_project reads the role through the process-wide role cache.
    monkeypatch.setattr(projects, "get_user_role", ROLES.get)
    return fake


def _tsr(project_id: str) -> CreateTSRRequest:
    return CreateTSRRequest(
        evaluatee_id=S1,
        project_id=project_id,
        week=1,
        percent_contribution=50,
        positive_feedback="p",
        constructive_feedback="c",
    )


CASES = {
    # app.core.authz: the helpers every controller goes through
    "authz.require_class_instructor/missing-class": (
        lambda db: authz.require_class_instructor(db, INSTR, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "authz.require_class_instructor/enrolled-ta": (
        lambda db: authz.require_class_instructor(db, TA1, CLASS),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "authz.require_class_access/missing-class": (
        lambda db: authz.require_class_access(db, S1, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "authz.require_class_access/outsider": (
        lambda db: authz.require_class_access(db, OUTSIDER, CLASS),
        403,
        NOT_CLASS_MEMBER,
    ),
    # app.assignments
    "assignments.list/missing-class-instructor": (
        lambda db: assignments.get_assignments_for_class(INSTR, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "assignments.list/missing-class-student": (
        lambda db: assignments.get_assignments_for_class(S1, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "assignments.list/other-instructor": (
        lambda db: assignments.get_assignments_for_class(OTHER_INSTR, CLASS),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "assignments.list/not-enrolled": (
        lambda db: assignments.get_assignments_for_class(OUTSIDER, CLASS),
        403,
        NOT_ENROLLED,
    ),
    "assignments.create/missing-class": (
        lambda db: assignments.create_assignment(INSTR, MISSING_CLASS, "T", OCT_1, OCT_8, "draft"),
        404,
        CLASS_NOT_FOUND,
    ),
    "assignments.create/other-instructor": (
        lambda db: assignments.create_assignment(OTHER_INSTR, CLASS, "T", OCT_1, OCT_8, "draft"),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "assignments.create/student-profile": (
        lambda db: assignments.create_assignment(S1, CLASS, "T", OCT_1, OCT_8, "draft"),
        403,
        INSTRUCTOR_ROLE_REQUIRED,
    ),
    "assignments.feedback_overview/missing-class": (
        lambda db: assignments.get_feedback_overview(INSTR, A_ORPHAN),
        404,
        CLASS_NOT_FOUND,
    ),
    "assignments.feedback_overview/other-instructor": (
        lambda db: assignments.get_feedback_overview(OTHER_INSTR, A_FEEDBACK),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    # app.staffing
    "staffing.pref_by_student/missing-class": (
        lambda db: staffing.pref_by_student(INSTR, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "staffing.pref_by_student/enrolled-ta": (
        lambda db: staffing.pref_by_student(TA1, CLASS),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "staffing.submit_interest/missing-class": (
        lambda db: staffing.submit_interest(S1, MISSING_CLASS, P1, 3),
        404,
        CLASS_NOT_FOUND,
    ),
    "staffing.submit_interest/outsider": (
        lambda db: staffing.submit_interest(OUTSIDER, CLASS, P1, 3),
        403,
        NOT_CLASS_MEMBER,
    ),
    # app.attendance
    "attendance.set_meeting_cadence/missing-class": (
        lambda db: attendance.set_meeting_cadence(MISSING_CLASS, INSTR, meetings_per_week=2),
        404,
        CLASS_NOT_FOUND,
    ),
    "attendance.set_meeting_cadence/enrolled-ta": (
        lambda db: attendance.set_meeting_cadence(CLASS, TA1, meetings_per_week=2),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "attendance.list_class_tas/missing-class": (
        lambda db: attendance.list_class_tas(MISSING_CLASS, S1),
        404,
        CLASS_NOT_FOUND,
    ),
    "attendance.list_class_tas/outsider": (
        lambda db: attendance.list_class_tas(CLASS, OUTSIDER),
        403,
        NOT_CLASS_MEMBER,
    ),
    "attendance.team_attendance/not-on-the-team": (
        lambda db: attendance.get_team_attendance(P1, OUTSIDER, 1),
        403,
        NOT_PROJECT_MEMBER,
    ),
    # app.classes: every instructor-only route and every class read is pinned, the same way,
    # in test_classes_authz.py.
    "tas.set_review_window/missing-class": (
        lambda db: tas.set_review_window(INSTR, MISSING_CLASS, True),
        404,
        CLASS_NOT_FOUND,
    ),
    "tas.set_review_window/enrolled-ta": (
        lambda db: tas.set_review_window(TA1, CLASS, True),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_final_review_time/enrolled-ta": (
        lambda db: tas.set_final_review_time(TA1, P1, None),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.review_targets/missing-class": (
        lambda db: tas.get_ta_review_targets(TA1, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "tas.review_targets/enrolled-student": (
        lambda db: tas.get_ta_review_targets(S1, CLASS),
        403,
        "You are not a TA in this class",
    ),
    # app.projects
    "projects.create/missing-class": (
        lambda db: projects.create_project(MISSING_CLASS, "New", "d", S1, 4),
        404,
        CLASS_NOT_FOUND,
    ),
    "projects.create/not-enrolled": (
        lambda db: projects.create_project(CLASS, "New", "d", OUTSIDER, 4),
        403,
        NOT_ENROLLED,
    ),
    # app.tsr
    "tsr.create/missing-project": (
        lambda db: tsr.create_tsr(S1, _tsr(MISSING_PROJECT)),
        404,
        PROJECT_NOT_FOUND,
    ),
    "tsr.create/not-enrolled": (
        lambda db: tsr.create_tsr(OUTSIDER, _tsr(P1)),
        403,
        NOT_ENROLLED,
    ),
    "tsr.view/missing-project": (
        lambda db: tsr.view_tsrs(S1, MISSING_PROJECT),
        404,
        PROJECT_NOT_FOUND,
    ),
    "tsr.view/not-a-member": (
        lambda db: tsr.view_tsrs(OUTSIDER, P1),
        403,
        NOT_PROJECT_MEMBER,
    ),
}


@pytest.mark.parametrize("case", sorted(CASES))
def test_missing_resources_answer_404_and_denied_callers_403(db, case):
    call, status, detail = CASES[case]
    with pytest.raises(HTTPException) as exc:
        call(db)
    assert (exc.value.status_code, exc.value.detail) == (status, detail)
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]


def test_the_instructor_role_dependency_uses_the_same_message(monkeypatch):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    with pytest.raises(HTTPException) as exc:
        dependencies.require_instructor(S1)
    assert (exc.value.status_code, exc.value.detail) == (403, INSTRUCTOR_ROLE_REQUIRED)
