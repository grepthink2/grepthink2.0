"""404 for a missing resource, 403 for denied access, in every module.

The policy is written down in ``app/core/authz.py``: 404 means the class or
project the request addresses does not exist; 403 means it exists and the
signed-in caller lacks the relationship or role the action needs. Existence is
not hidden, and one condition answers one status and one ``detail`` everywhere
(409 when the class instructor would enrol in their own class, by code or by
invite).

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
from app.team_meetings import controller as team_meetings
from app.team_meetings.models import TeamMeetingCreate, TeamMeetingUpdate
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
ONLY_PRODUCT_OWNER = "Only the team's Product Owner can change meetings."

INSTR = "10000000-0000-0000-0000-000000000001"
OTHER_INSTR = "10000000-0000-0000-0000-000000000002"
TA1 = "20000000-0000-0000-0000-000000000001"
S1 = "30000000-0000-0000-0000-000000000001"
PO2 = "30000000-0000-0000-0000-000000000002"  # P2's Product Owner
OUTSIDER = "40000000-0000-0000-0000-000000000001"
CLASS = "c0000000-0000-0000-0000-000000000001"
TA1_CLASS = "c0000000-0000-0000-0000-000000000002"  # TA1 teaches it
MISSING_CLASS = "c0000000-0000-0000-0000-00000000dead"
P1 = "d0000000-0000-0000-0000-000000000001"
P2 = "d0000000-0000-0000-0000-000000000002"  # PO2's team; no assigned TA
MISSING_PROJECT = "d0000000-0000-0000-0000-00000000dead"
MEETING = "e0000000-0000-0000-0000-000000000001"
A_FEEDBACK = "a0000000-0000-0000-0000-000000000001"
A_ORPHAN = "a0000000-0000-0000-0000-000000000002"  # its class row no longer exists

ROLES = {
    INSTR: "instructor",
    OTHER_INSTR: "instructor",
    # This branch's main scenario: a TA in CLASS whose account is an instructor's, teaching a
    # class of their own. Every "enrolled-ta" row below is that caller.
    TA1: "instructor",
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
    whose assigned TA is TA1, who also created TA1_CLASS. P2's only member is its Product
    Owner, PO2, and it has no assigned TA. OTHER_INSTR and OUTSIDER have no tie to CLASS."""
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
                "course_code": "ABCD1234",
                "status": "active",
                "term": "fall",
                "start_date": "2026-09-24",
                "meetings_per_week": 1,
                "meeting_duration_minutes": 30,
                "review_period_open": False,
                "review_zoom_url": None,
            },
            {"id": TA1_CLASS, "created_by": TA1, "name": "CSE 101", "status": "active"},
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
            },
            {
                "id": P2,
                "class_id": CLASS,
                "name": "Beta",
                "assigned_ta_id": None,
                "team_size": 4,
                "num_members": 1,
            },
        ],
        project_members=[
            {"id": "m-s1", "project_id": P1, "user_id": S1, "role": "member"},
            {"id": "m-po2", "project_id": P2, "user_id": PO2, "role": "product owner"},
        ],
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
            # Invites load the instructor's profile with the class.
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
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


def _meeting() -> TeamMeetingCreate:
    # The refusals below come before the clock is read, so this date can go stale.
    return TeamMeetingCreate(
        title="Sprint 3 planning",
        starts_at=datetime.datetime(2026, 10, 20, 22, tzinfo=datetime.UTC),
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
        NOT_ENROLLED,
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
    "assignments.create/enrolled-student": (
        lambda db: assignments.create_assignment(S1, CLASS, "T", OCT_1, OCT_8, "draft"),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "assignments.update/enrolled-student": (
        lambda db: assignments.update_assignment(S1, A_FEEDBACK, "T", None, None, None),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "assignments.delete/enrolled-student": (
        lambda db: assignments.delete_assignment(S1, A_FEEDBACK),
        403,
        NOT_CLASS_INSTRUCTOR,
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
    # app.classes: every instructor-only route, every class read and the class instructor's own
    # 409s are pinned in test_classes_authz.py, test_classes_invites.py and the join tests.
    # app.tas
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
    "tas.promote/enrolled-ta": (
        lambda db: tas.promote_to_ta(TA1, CLASS, S1),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.demote/enrolled-ta": (
        lambda db: tas.demote_ta(TA1, CLASS, TA1),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.list_class_tas/enrolled-ta": (
        lambda db: tas.list_class_tas(TA1, CLASS),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.promote/enrolled-student": (
        lambda db: tas.promote_to_ta(S1, CLASS, TA1),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.demote/enrolled-student": (
        lambda db: tas.demote_ta(S1, CLASS, TA1),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.list_class_tas/enrolled-student": (
        lambda db: tas.list_class_tas(S1, CLASS),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_review_window/enrolled-student": (
        lambda db: tas.set_review_window(S1, CLASS, True),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_review_zoom/enrolled-student": (
        lambda db: tas.set_review_zoom(S1, CLASS, "https://zoom.us/j/1"),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "tas.set_final_review_time/enrolled-student": (
        lambda db: tas.set_final_review_time(
            S1, P1, datetime.datetime(2026, 12, 1, 20, tzinfo=datetime.UTC)
        ),
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
    # An instructor account is not enrolled anywhere by being one.
    "projects.create/other-instructor": (
        lambda db: projects.create_project(CLASS, "New", "d", OTHER_INSTR, 4),
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
    # app.team_meetings: the team, its class instructor and its assigned TA read; only a member
    # whose role on that team is Product Owner writes. P1 has no Product Owner in this fixture.
    "team_meetings.list/missing-project": (
        lambda db: team_meetings.list_team_meetings(MISSING_PROJECT, S1),
        404,
        PROJECT_NOT_FOUND,
    ),
    "team_meetings.list/not-on-the-team": (
        lambda db: team_meetings.list_team_meetings(P1, OUTSIDER),
        403,
        NOT_PROJECT_MEMBER,
    ),
    # A class TA reads the teams they are assigned to (TA1 is P1's), not every team in the class.
    "team_meetings.list/class-ta-of-another-team": (
        lambda db: team_meetings.list_team_meetings(P2, TA1),
        403,
        NOT_PROJECT_MEMBER,
    ),
    "team_meetings.create/missing-project": (
        lambda db: team_meetings.create_team_meeting(MISSING_PROJECT, S1, _meeting()),
        404,
        PROJECT_NOT_FOUND,
    ),
    "team_meetings.update/missing-project": (
        lambda db: team_meetings.update_team_meeting(
            MISSING_PROJECT, MEETING, S1, TeamMeetingUpdate(title="Moved")
        ),
        404,
        PROJECT_NOT_FOUND,
    ),
    "team_meetings.delete/missing-project": (
        lambda db: team_meetings.delete_team_meeting(MISSING_PROJECT, MEETING, S1),
        404,
        PROJECT_NOT_FOUND,
    ),
    "team_meetings.create/not-on-the-team": (
        lambda db: team_meetings.create_team_meeting(P1, OUTSIDER, _meeting()),
        403,
        NOT_PROJECT_MEMBER,
    ),
    "team_meetings.create/member-who-is-not-product-owner": (
        lambda db: team_meetings.create_team_meeting(P1, S1, _meeting()),
        403,
        ONLY_PRODUCT_OWNER,
    ),
    "team_meetings.create/class-instructor": (
        lambda db: team_meetings.create_team_meeting(P1, INSTR, _meeting()),
        403,
        ONLY_PRODUCT_OWNER,
    ),
    "team_meetings.create/assigned-ta": (
        lambda db: team_meetings.create_team_meeting(P1, TA1, _meeting()),
        403,
        ONLY_PRODUCT_OWNER,
    ),
    # The Product Owner of another team has no say here: a role is a role on one project.
    "team_meetings.create/product-owner-of-another-team": (
        lambda db: team_meetings.create_team_meeting(P1, PO2, _meeting()),
        403,
        NOT_PROJECT_MEMBER,
    ),
    "team_meetings.update/product-owner-of-another-team": (
        lambda db: team_meetings.update_team_meeting(
            P1, MEETING, PO2, TeamMeetingUpdate(title="Moved")
        ),
        403,
        NOT_PROJECT_MEMBER,
    ),
    "team_meetings.delete/product-owner-of-another-team": (
        lambda db: team_meetings.delete_team_meeting(P1, MEETING, PO2),
        403,
        NOT_PROJECT_MEMBER,
    ),
    "team_meetings.update/member-who-is-not-product-owner": (
        lambda db: team_meetings.update_team_meeting(
            P1, MEETING, S1, TeamMeetingUpdate(title="Moved")
        ),
        403,
        ONLY_PRODUCT_OWNER,
    ),
    "team_meetings.delete/member-who-is-not-product-owner": (
        lambda db: team_meetings.delete_team_meeting(P1, MEETING, S1),
        403,
        ONLY_PRODUCT_OWNER,
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
