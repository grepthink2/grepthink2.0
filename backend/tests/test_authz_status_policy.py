"""404 for a missing resource, 403 for denied access, in every module.

The policy is written down in ``app/core/authz.py``: 404 means the class or
project the request addresses does not exist; 403 means it exists and the
signed-in caller lacks the relationship or role the action needs. Existence is
not hidden, and one condition answers one status and one ``detail`` everywhere
(409 when the class instructor would enrol in their own class, by code or by
invite).

Each row runs a real controller (or an authz helper) against ``FakeSupabase``
and pins the exact status and detail one caller gets from one endpoint, for
every module whose answers were normalized; the modules' own tests do not
assert these refusals again. A denied call must also write nothing.
"""

from __future__ import annotations

import datetime

import pytest
from fastapi import HTTPException

from app import dependencies
from app.analytics import controller as analytics
from app.assignments import controller as assignments
from app.assignments import deadlines
from app.attendance import controller as attendance
from app.config import settings
from app.core import authz
from app.messages import controller as messages
from app.projects import controller as projects
from app.schedule import controller as schedule
from app.staffing import controller as staffing
from app.tas import controller as tas
from app.tas import review_slots
from app.team_meetings import controller as team_meetings
from app.team_meetings.models import TeamMeetingCreate, TeamMeetingUpdate
from app.tsr import controller as tsr
from app.tsr.models import CreateTSRRequest
from tests.conftest import ISTINYE_INSTITUTION, UCSC_INSTITUTION
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
NOT_LATE_WINDOW_EDITOR = "Only the instructor or a TA with permission may change the late window"
# Details that several rows of one module share.
NOT_MEETING_EDITOR = "Only the class instructor or this team's assigned TA can edit this team"
TSR_OVERVIEW_DENIED = "You do not have access to this assignment's TSR responses"
TSR_EDIT_DENIED = "Only the TSR submitter or class instructor can update this TSR"
FINAL_REVIEW_STAFF_ONLY = "Only the instructor or class TAs can access final-review details"
WRONG_SCORER = "You cannot enter scores for this role on this team"
NOTES_REVIEW_TA_ONLY = "Only the team's Review TA or the instructor can edit review notes"
ANALYTICS_FORBIDDEN = "Analytics is available to instructors and maintainers"

INSTR = "10000000-0000-0000-0000-000000000001"
OTHER_INSTR = "10000000-0000-0000-0000-000000000002"
TA1 = "20000000-0000-0000-0000-000000000001"
TA2 = "20000000-0000-0000-0000-000000000002"  # P1's Review TA
TA3 = "20000000-0000-0000-0000-000000000003"  # a TA in CLASS with no role on P1
S1 = "30000000-0000-0000-0000-000000000001"
PO2 = "30000000-0000-0000-0000-000000000002"  # P2's Product Owner
SM2 = "30000000-0000-0000-0000-000000000003"  # P2's Scrum Master, enrolled in CLASS
OUTSIDER = "40000000-0000-0000-0000-000000000001"
MAINTAINER, MAINTAINER_EMAIL = "50000000-0000-0000-0000-000000000001", "maintainer@grepthink.dev"
CLASS = "c0000000-0000-0000-0000-000000000001"
TA1_CLASS = "c0000000-0000-0000-0000-000000000002"  # TA1 teaches it
MISSING_CLASS = "c0000000-0000-0000-0000-00000000dead"
P1 = "d0000000-0000-0000-0000-000000000001"
P2 = "d0000000-0000-0000-0000-000000000002"  # PO2's team; no assigned TA
MISSING_PROJECT = "d0000000-0000-0000-0000-00000000dead"
MEETING = "e0000000-0000-0000-0000-000000000001"
A_FEEDBACK = "a0000000-0000-0000-0000-000000000001"
A_ORPHAN = "a0000000-0000-0000-0000-000000000002"  # its class row no longer exists
A_TSR = "a0000000-0000-0000-0000-000000000003"  # a published TSR assignment in CLASS
MISSING_ASSIGNMENT = "a0000000-0000-0000-0000-00000000dead"
TSR = "b0000000-0000-0000-0000-000000000001"  # S1's review on P1, for A_TSR
JOIN_REQUEST = "b1000000-0000-0000-0000-000000000001"  # SM2 asks to join P1
TEAM_INVITE = "b1000000-0000-0000-0000-000000000002"  # PO2 invites S1 to P2
CONV_DM = "b2000000-0000-0000-0000-000000000001"  # S1 and OUTSIDER, who share no class
SCHOOL = UCSC_INSTITUTION["id"]  # TA1_CLASS's
OTHER_SCHOOL = ISTINYE_INSTITUTION["id"]
MISSING_SCHOOL = "99999999-9999-4999-8999-999999999999"

ROLES = {
    INSTR: "instructor",
    OTHER_INSTR: "instructor",
    # This branch's main scenario: a TA in CLASS whose account is an instructor's, teaching a
    # class of their own. Every "enrolled-ta" row below is that caller.
    TA1: "instructor",
    TA2: "student",
    TA3: "student",
    S1: "student",
    SM2: "student",
    OUTSIDER: "student",
}
WRITE_OPS = {"insert", "update", "upsert", "delete"}
OCT_1, OCT_8 = datetime.date(2026, 10, 1), datetime.date(2026, 10, 8)
LATE_UNTIL = datetime.datetime(2026, 10, 12, 8, tzinfo=datetime.UTC)  # a late window's end
SCHEDULE_FROM = datetime.datetime(2026, 11, 9, 8, tzinfo=datetime.UTC)
SCHEDULE_TO = SCHEDULE_FROM + datetime.timedelta(days=7)

# Final-review slots (app.tas.review_slots), in a block of their own. CLASS has sign-ups closed;
# a row wrapped in _signups_open() opens them first. The clock reads SLOT_NOW: SLOT_A has started
# and SLOT_TEAM's review is over, and SLOT_LATER is the next day.
SLOT_PO = "51000000-0000-0000-0000-000000000001"  # SLOT_TEAM's Product Owner
SLOT_MEMBER = "51000000-0000-0000-0000-000000000002"  # on SLOT_TEAM with no role (NULL)
SLOT_UNBOOKED_PO = "51000000-0000-0000-0000-000000000003"  # SLOT_UNBOOKED_TEAM's Product Owner
SLOT_TEAM = "d1000000-0000-0000-0000-000000000001"  # in CLASS; holds SLOT_BOOKED
SLOT_UNBOOKED_TEAM = "d1000000-0000-0000-0000-000000000002"  # in CLASS; holds no slot
SLOT_A = "f1000000-0000-0000-0000-00000000000a"  # a free slot in CLASS
SLOT_BOOKED = "f1000000-0000-0000-0000-00000000000b"
SLOT_LATER = "f1000000-0000-0000-0000-00000000000c"  # a free slot in CLASS, the next day
SLOT_ELSEWHERE = "f1000000-0000-0000-0000-0000000000c2"  # a free slot in TA1_CLASS
SLOT_MISSING = "f1000000-0000-0000-0000-00000000dead"
SLOT_START = datetime.datetime(2026, 12, 7, 17, tzinfo=datetime.UTC)
SLOT_BOOKED_AT = (SLOT_START + datetime.timedelta(hours=1)).isoformat()
SLOT_NOW = SLOT_START + datetime.timedelta(hours=2)
SLOT_NOT_FOUND = "Slot not found"
SLOT_ONLY_PO_BOOKS = "Only the team's Product Owner can book a slot."
SLOT_ONLY_PO_RELEASES = "Only the team's Product Owner can release a slot."
SLOT_SIGNUPS_CLOSED = "Sign-ups aren't open."
SLOT_RELEASE_FIRST = "Release the team before deleting its slot."
SLOT_TIME_PASSED = "Your team's review time has passed."
SLOT_STARTED = "That slot has already started."
SLOT_NOT_BOOKED = "This team hasn't booked a review slot yet."


def _assignment(aid: str, class_id: str, kind: str = "feedback") -> dict:
    return {
        "id": aid,
        "class_id": class_id,
        "Title": kind.title(),
        "assignment_type": kind,
        "status": "publish",
        "open_date": OCT_1.isoformat(),
        "close_date": OCT_8.isoformat(),
    }


@pytest.fixture
def db(monkeypatch):
    """CLASS belongs to INSTR. TA1, TA2 and TA3 (tas) and S1 and SM2 (students) are enrolled;
    S1 is on P1, whose assigned TA is TA1 and whose Review TA is TA2. TA1 also created
    TA1_CLASS, at SCHOOL. P2's members are its Product Owner, PO2, and its Scrum Master, SM2,
    and it has no assigned TA. OTHER_INSTR and OUTSIDER have no tie to CLASS. S1 wrote TSR;
    SM2 has asked to join P1 and PO2 has invited S1 to P2; S1 and OUTSIDER share CONV_DM."""
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
            {
                "id": TA1_CLASS,
                "created_by": TA1,
                "name": "CSE 101",
                "status": "active",
                "institution_id": SCHOOL,
            },
        ],
        institutions=[dict(UCSC_INSTITUTION), dict(ISTINYE_INSTITUTION)],
        class_enrollments=[
            {"id": "e-ta", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e-ta2", "class_id": CLASS, "user_id": TA2, "enrollment_role": "ta"},
            {"id": "e-ta3", "class_id": CLASS, "user_id": TA3, "enrollment_role": "ta"},
            {"id": "e-s1", "class_id": CLASS, "user_id": S1, "enrollment_role": "student"},
            {"id": "e-sm2", "class_id": CLASS, "user_id": SM2, "enrollment_role": "student"},
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
            {"id": "m-sm2", "project_id": P2, "user_id": SM2, "role": "scrum master"},
        ],
        project_review_tas=[{"id": "rt-ta2", "class_id": CLASS, "project_id": P1, "user_id": TA2}],
        assignments=[
            _assignment(A_FEEDBACK, CLASS),
            _assignment(A_ORPHAN, MISSING_CLASS),
            _assignment(A_TSR, CLASS, "tsr"),
        ],
        TSRs=[
            {
                "id": TSR,
                "assignment_id": A_TSR,
                "project_id": P1,
                "evaluator_id": S1,
                "evaluatee_id": S1,
                "positive_feedback": "p",
            }
        ],
        project_join_requests=[
            {
                "id": JOIN_REQUEST,
                "project_id": P1,
                "user_id": SM2,
                "request_status": "pending",
                "invited_by": None,
            },
            {
                "id": TEAM_INVITE,
                "project_id": P2,
                "user_id": S1,
                "request_status": "pending",
                "invited_by": PO2,
            },
        ],
        conversations=[
            {"id": CONV_DM, "type": "dm", "user_a": S1, "user_b": OUTSIDER, "project_id": None}
        ],
        conversation_participants=[
            {"conversation_id": CONV_DM, "user_id": S1, "role": "member"},
            {"conversation_id": CONV_DM, "user_id": OUTSIDER, "role": "member"},
        ],
        relations={
            ("projects", "classes"): ("class_id", "id", False),
            ("projects", "project_members"): ("id", "project_id", True),
            ("conversations", "projects"): ("project_id", "id", False),
            ("project_join_requests", "projects"): ("project_id", "id", False),
            ("TSRs", "projects"): ("project_id", "id", False),
            ("TSRs", "assignments"): ("assignment_id", "id", False),
            ("assignments", "classes"): ("class_id", "id", False),
            ("classes", "institutions"): ("institution_id", "id", False),
            ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): (
                "user_id",
                "id",
                False,
            ),
            # Invites load the instructor's profile with the class.
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    )
    # Final-review slots: SLOT_TEAM, with a Product Owner and a member whose role is NULL, holds
    # SLOT_BOOKED; SLOT_UNBOOKED_TEAM, with a Product Owner, holds none. SLOT_A and SLOT_LATER are
    # free, and SLOT_ELSEWHERE is free in another class.
    fake.relations[("final_review_slots", "classes")] = ("class_id", "id", False)
    fake.rows("projects").extend(
        [
            {
                "id": SLOT_TEAM,
                "class_id": CLASS,
                "name": "Gamma",
                "assigned_ta_id": None,
                "final_review_at": SLOT_BOOKED_AT,
            },
            {
                "id": SLOT_UNBOOKED_TEAM,
                "class_id": CLASS,
                "name": "Delta",
                "assigned_ta_id": None,
                "final_review_at": None,
            },
        ]
    )
    fake.rows("project_members").extend(
        [
            {
                "id": "m-slot-po",
                "project_id": SLOT_TEAM,
                "user_id": SLOT_PO,
                "role": "product owner",
            },
            {"id": "m-slot-member", "project_id": SLOT_TEAM, "user_id": SLOT_MEMBER, "role": None},
            {
                "id": "m-slot-unbooked-po",
                "project_id": SLOT_UNBOOKED_TEAM,
                "user_id": SLOT_UNBOOKED_PO,
                "role": "product owner",
            },
        ]
    )
    fake.rows("final_review_slots").extend(
        [
            {
                "id": SLOT_A,
                "class_id": CLASS,
                "starts_at": SLOT_START.isoformat(),
                "project_id": None,
            },
            {
                "id": SLOT_BOOKED,
                "class_id": CLASS,
                "starts_at": SLOT_BOOKED_AT,
                "project_id": SLOT_TEAM,
            },
            {
                "id": SLOT_LATER,
                "class_id": CLASS,
                "starts_at": (SLOT_START + datetime.timedelta(days=1)).isoformat(),
                "project_id": None,
            },
            {
                "id": SLOT_ELSEWHERE,
                "class_id": TA1_CLASS,
                "starts_at": SLOT_START.isoformat(),
                "project_id": None,
            },
        ]
    )
    monkeypatch.setattr(deadlines, "now_utc", lambda: SLOT_NOW)
    monkeypatch.setattr(settings, "ANALYTICS_ADMIN_EMAILS", frozenset({MAINTAINER_EMAIL}))
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _signups_open(call):
    """``call`` with CLASS's sign-ups open, for the slot refusals that come after that check."""

    def run(db):
        next(c for c in db.rows("classes") if c["id"] == CLASS)["review_period_open"] = True
        return call(db)

    return run


def _tsr(project_id: str) -> CreateTSRRequest:
    return CreateTSRRequest(
        evaluatee_id=S1,
        project_id=project_id,
        week=1,
        percent_contribution=50,
        positive_feedback="p",
        constructive_feedback="c",
    )


def _scores(caller: str, role: str):
    """``caller`` saving one score row of ``role`` for S1 on P1."""
    entry = {"student_id": S1, "product": 4.0, "team": 4.0, "scrum": 4.0}
    if role != "home":
        entry = {"student_id": S1, "overall": 4.2}
    return lambda db: tas.save_final_review_scores(caller, P1, role, [entry])


def _dashboard(user_id: str, institution_id: str, email: str | None = None) -> dict:
    return analytics.get_dashboard(
        user_id,
        email or f"{user_id}@ucsc.edu",
        institution_id=institution_id,
        class_id=None,
        window="30d",
        custom_from=None,
        custom_to=None,
        fresh=False,
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
    # A late window: the class instructor, or a TA of the class with the permission (TA1 has none).
    "authz.late_window/missing-class": (
        lambda db: authz.require_late_window_access(db, INSTR, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "authz.late_window/enrolled-ta": (
        lambda db: authz.require_late_window_access(db, TA1, CLASS),
        403,
        NOT_LATE_WINDOW_EDITOR,
    ),
    "authz.late_window/enrolled-student": (
        lambda db: authz.require_late_window_access(db, S1, CLASS),
        403,
        NOT_LATE_WINDOW_EDITOR,
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
    "assignments.set_late_window/missing-class": (
        lambda db: assignments.set_late_window(INSTR, A_ORPHAN, LATE_UNTIL),
        404,
        CLASS_NOT_FOUND,
    ),
    "assignments.set_late_window/enrolled-ta": (
        lambda db: assignments.set_late_window(TA1, A_FEEDBACK, LATE_UNTIL),
        403,
        NOT_LATE_WINDOW_EDITOR,
    ),
    "assignments.set_late_window/enrolled-student": (
        lambda db: assignments.set_late_window(S1, A_FEEDBACK, LATE_UNTIL),
        403,
        NOT_LATE_WINDOW_EDITOR,
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
    "assignments.my_submissions/missing-class": (
        lambda db: assignments.get_my_submissions(S1, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "assignments.my_submissions/outsider": (
        lambda db: assignments.get_my_submissions(OUTSIDER, CLASS),
        403,
        NOT_CLASS_MEMBER,
    ),
    # A TSR overview is the class instructor's, and a TA's for the teams they are assigned to.
    "assignments.tsr_overview/missing-assignment": (
        lambda db: assignments.get_instructor_tsr_overview(INSTR, MISSING_ASSIGNMENT),
        404,
        "Assignment not found",
    ),
    "assignments.tsr_overview/enrolled-student": (
        lambda db: assignments.get_instructor_tsr_overview(S1, A_TSR),
        403,
        TSR_OVERVIEW_DENIED,
    ),
    "assignments.tsr_overview/outsider": (
        lambda db: assignments.get_instructor_tsr_overview(OUTSIDER, A_TSR),
        403,
        TSR_OVERVIEW_DENIED,
    ),
    # A TSR is edited by the student who wrote it or by the class instructor.
    "assignments.update_tsr/classmate-on-another-team": (
        lambda db: assignments.update_tsr_entry(SM2, A_TSR, TSR, positive_feedback="nope"),
        403,
        TSR_EDIT_DENIED,
    ),
    "assignments.update_tsr/teams-assigned-ta": (
        lambda db: assignments.update_tsr_entry(TA1, A_TSR, TSR, positive_feedback="nope"),
        403,
        TSR_EDIT_DENIED,
    ),
    "assignments.update_tsr/other-instructor": (
        lambda db: assignments.update_tsr_entry(OTHER_INSTR, A_TSR, TSR, positive_feedback="nope"),
        403,
        TSR_EDIT_DENIED,
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
    "staffing.assign/enrolled-ta": (
        lambda db: staffing.assign_user(TA1, CLASS, SM2, P1),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "staffing.assign/missing-project": (
        lambda db: staffing.assign_user(INSTR, CLASS, SM2, MISSING_PROJECT),
        404,
        PROJECT_NOT_FOUND,
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
    "attendance.team_attendance/classmate-on-another-team": (
        lambda db: attendance.get_team_attendance(P1, SM2, 3, 1),
        403,
        NOT_PROJECT_MEMBER,
    ),
    # Naming a class TA and a team's TA is the class instructor's; a team's meeting and its
    # attendance are the instructor's and that team's assigned TA's (TA1 has P1, not P2).
    "attendance.set_class_ta/enrolled-student": (
        lambda db: attendance.set_class_ta(CLASS, S1, SM2, True),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "attendance.assign_project_ta/enrolled-ta": (
        lambda db: attendance.assign_project_ta(P1, TA1, TA1),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "attendance.upsert_meeting/ta-of-another-team": (
        lambda db: attendance.upsert_meeting(P2, TA1, zoom_url="https://zoom.us/j/2"),
        403,
        NOT_MEETING_EDITOR,
    ),
    "attendance.upsert_attendance/ta-of-another-team": (
        lambda db: attendance.upsert_attendance(P2, TA1, S1, 3, "present"),
        403,
        NOT_MEETING_EDITOR,
    ),
    # Every team's schedule is for the instructor and the class TAs; a student's own team's
    # for anyone in the class.
    "attendance.ta_schedule/missing-class": (
        lambda db: attendance.get_ta_schedule(MISSING_CLASS, INSTR, week_number=3, scope="all"),
        404,
        CLASS_NOT_FOUND,
    ),
    "attendance.ta_schedule/every-team-for-a-student": (
        lambda db: attendance.get_ta_schedule(CLASS, S1, week_number=3, scope="all"),
        403,
        "Only the instructor or a class TA can view this schedule",
    ),
    "attendance.ta_schedule/own-team-for-an-outsider": (
        lambda db: attendance.get_ta_schedule(CLASS, OUTSIDER, week_number=3, scope="my-team"),
        403,
        NOT_CLASS_MEMBER,
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
    "tas.set_late_window_permission/missing-class": (
        lambda db: tas.set_ta_late_window_permission(INSTR, MISSING_CLASS, TA1, True),
        404,
        CLASS_NOT_FOUND,
    ),
    "tas.set_late_window_permission/enrolled-ta": (
        lambda db: tas.set_ta_late_window_permission(TA1, CLASS, TA1, True),
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
    # A team's Review TA is removed by that TA or the instructor, not by a team member.
    "tas.release_review_ta/enrolled-student": (
        lambda db: tas.release_review_ta(S1, P1, TA1),
        403,
        "Only the reviewer themselves or the instructor can remove this Review TA",
    ),
    "tas.release_review_ta/another-ta": (
        lambda db: tas.release_review_ta(TA3, P1, TA2),
        403,
        "Only the reviewer themselves or the instructor can remove this Review TA",
    ),
    "tas.set_review_zoom/enrolled-ta": (
        lambda db: tas.set_review_zoom(TA1, CLASS, "https://zoom.us/j/1"),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    # Final reviews: the instructor and the class TAs read the schedule and a team's review. On
    # P1 the Home TA (TA1, its assigned TA) enters the category scores, the Review TA (TA2) an
    # overall score and the notes, and the instructor any of them.
    "tas.final_review_schedule/enrolled-student": (
        lambda db: tas.get_final_review_schedule(S1, CLASS),
        403,
        "Only the instructor or class TAs can view the final-review schedule",
    ),
    "tas.final_review_schedule/outsider": (
        lambda db: tas.get_final_review_schedule(OUTSIDER, CLASS),
        403,
        "Only the instructor or class TAs can view the final-review schedule",
    ),
    "tas.final_review_detail/missing-project": (
        lambda db: tas.get_final_review_detail(INSTR, MISSING_PROJECT),
        404,
        PROJECT_NOT_FOUND,
    ),
    "tas.final_review_detail/enrolled-student": (
        lambda db: tas.get_final_review_detail(S1, P1),
        403,
        FINAL_REVIEW_STAFF_ONLY,
    ),
    "tas.final_review_detail/outsider": (
        lambda db: tas.get_final_review_detail(OUTSIDER, P1),
        403,
        FINAL_REVIEW_STAFF_ONLY,
    ),
    "tas.final_review_scores/home-by-the-review-ta": (_scores(TA2, "home"), 403, WRONG_SCORER),
    "tas.final_review_scores/home-by-another-ta": (_scores(TA3, "home"), 403, WRONG_SCORER),
    "tas.final_review_scores/home-by-a-student": (
        _scores(S1, "home"),
        403,
        FINAL_REVIEW_STAFF_ONLY,
    ),
    "tas.final_review_scores/review-by-the-home-ta": (
        _scores(TA1, "review"),
        403,
        WRONG_SCORER,
    ),
    "tas.final_review_scores/review-by-another-ta": (_scores(TA3, "review"), 403, WRONG_SCORER),
    "tas.final_review_scores/review-by-a-student": (
        _scores(S1, "review"),
        403,
        FINAL_REVIEW_STAFF_ONLY,
    ),
    "tas.final_review_scores/instructor-by-the-home-ta": (
        _scores(TA1, "instructor"),
        403,
        WRONG_SCORER,
    ),
    "tas.final_review_scores/instructor-by-the-review-ta": (
        _scores(TA2, "instructor"),
        403,
        WRONG_SCORER,
    ),
    "tas.final_review_scores/instructor-by-another-ta": (
        _scores(TA3, "instructor"),
        403,
        WRONG_SCORER,
    ),
    "tas.final_review_notes/home-ta": (
        lambda db: tas.save_final_review_notes(TA1, P1, {"project_scope": "x"}, 1),
        403,
        NOTES_REVIEW_TA_ONLY,
    ),
    "tas.final_review_notes/another-ta": (
        lambda db: tas.save_final_review_notes(TA3, P1, {"project_scope": "x"}, 1),
        403,
        NOTES_REVIEW_TA_ONLY,
    ),
    "tas.final_review_notes/enrolled-student": (
        lambda db: tas.save_final_review_notes(S1, P1, {"project_scope": "x"}, 1),
        403,
        FINAL_REVIEW_STAFF_ONLY,
    ),
    # app.tas.review_slots: the class reads the slots, the instructor posts and deletes them, and
    # only a team's Product Owner (while sign-ups are open) or the instructor books and releases.
    "review_slots.list/missing-class": (
        lambda db: review_slots.get_review_slots(S1, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "review_slots.list/outsider": (
        lambda db: review_slots.get_review_slots(OUTSIDER, CLASS),
        403,
        NOT_CLASS_MEMBER,
    ),
    "review_slots.create/enrolled-ta": (
        lambda db: review_slots.create_review_slots(TA1, CLASS, [SLOT_START]),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "review_slots.delete/missing-slot": (
        lambda db: review_slots.delete_review_slot(INSTR, SLOT_MISSING),
        404,
        SLOT_NOT_FOUND,
    ),
    "review_slots.delete/enrolled-ta": (
        lambda db: review_slots.delete_review_slot(TA1, SLOT_A),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "review_slots.delete/other-instructor": (
        lambda db: review_slots.delete_review_slot(OTHER_INSTR, SLOT_A),
        403,
        NOT_CLASS_INSTRUCTOR,
    ),
    "review_slots.delete/booked-slot": (
        lambda db: review_slots.delete_review_slot(INSTR, SLOT_BOOKED),
        409,
        SLOT_RELEASE_FIRST,
    ),
    "review_slots.book/missing-slot": (
        lambda db: review_slots.book_review_slot(SLOT_PO, SLOT_MISSING, SLOT_TEAM),
        404,
        SLOT_NOT_FOUND,
    ),
    "review_slots.book/missing-project": (
        lambda db: review_slots.book_review_slot(SLOT_PO, SLOT_A, MISSING_PROJECT),
        404,
        PROJECT_NOT_FOUND,
    ),
    "review_slots.book/member-without-a-role": (
        lambda db: review_slots.book_review_slot(SLOT_MEMBER, SLOT_A, SLOT_TEAM),
        403,
        SLOT_ONLY_PO_BOOKS,
    ),
    # A role is a role on one team: SLOT_PO cannot book for P1.
    "review_slots.book/product-owner-of-another-team": (
        lambda db: review_slots.book_review_slot(SLOT_PO, SLOT_A, P1),
        403,
        SLOT_ONLY_PO_BOOKS,
    ),
    "review_slots.book/product-owner-while-closed": (
        lambda db: review_slots.book_review_slot(SLOT_PO, SLOT_A, SLOT_TEAM),
        403,
        SLOT_SIGNUPS_CLOSED,
    ),
    # A slot is booked only for a team in its own class.
    "review_slots.book/slot-in-another-class": (
        lambda db: review_slots.book_review_slot(SLOT_PO, SLOT_ELSEWHERE, SLOT_TEAM),
        404,
        SLOT_NOT_FOUND,
    ),
    # With sign-ups open, a Product Owner still can't move or release once the team's review
    # time has come, or book a slot that has started.
    "review_slots.book/product-owner-after-the-review": (
        _signups_open(lambda db: review_slots.book_review_slot(SLOT_PO, SLOT_LATER, SLOT_TEAM)),
        403,
        SLOT_TIME_PASSED,
    ),
    "review_slots.book/product-owner-on-a-started-slot": (
        _signups_open(
            lambda db: review_slots.book_review_slot(SLOT_UNBOOKED_PO, SLOT_A, SLOT_UNBOOKED_TEAM)
        ),
        409,
        SLOT_STARTED,
    ),
    "review_slots.release/missing-project": (
        lambda db: review_slots.release_review_slot(SLOT_PO, MISSING_PROJECT),
        404,
        PROJECT_NOT_FOUND,
    ),
    "review_slots.release/member": (
        lambda db: review_slots.release_review_slot(S1, P1),
        403,
        SLOT_ONLY_PO_RELEASES,
    ),
    "review_slots.release/product-owner-while-closed": (
        lambda db: review_slots.release_review_slot(SLOT_PO, SLOT_TEAM),
        403,
        SLOT_SIGNUPS_CLOSED,
    ),
    "review_slots.release/product-owner-after-the-review": (
        _signups_open(lambda db: review_slots.release_review_slot(SLOT_PO, SLOT_TEAM)),
        403,
        SLOT_TIME_PASSED,
    ),
    # A TA signs up to review a team only once it holds a slot, even with sign-ups open.
    "tas.set_review_ta/enrolled-ta-before-the-team-books": (
        _signups_open(lambda db: tas.set_review_ta(TA1, SLOT_UNBOOKED_TEAM)),
        403,
        SLOT_NOT_BOOKED,
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
    "projects.list/missing-class": (
        lambda db: projects.get_projects_for_user(INSTR, MISSING_CLASS),
        404,
        CLASS_NOT_FOUND,
    ),
    "projects.list/outsider": (
        lambda db: projects.get_projects_for_user(OUTSIDER, CLASS),
        403,
        NOT_CLASS_MEMBER,
    ),
    "projects.members/missing-project": (
        lambda db: projects.get_project_members(MISSING_PROJECT, INSTR),
        404,
        PROJECT_NOT_FOUND,
    ),
    # A member is added by the class instructor or a team's owner, Product Owner or admin, and
    # removed by those or by themselves: a plain member or a Scrum Master adds nobody and removes
    # only themselves.
    "projects.add_member/missing-project": (
        lambda db: projects.instructor_add_member(MISSING_PROJECT, INSTR, SM2, role="member"),
        404,
        PROJECT_NOT_FOUND,
    ),
    "projects.add_member/plain-member": (
        lambda db: projects.instructor_add_member(P1, S1, SM2, role="member"),
        403,
        "Only instructors, product owners, and admins can add members",
    ),
    "projects.remove_member/missing-project": (
        lambda db: projects.instructor_remove_member(MISSING_PROJECT, INSTR, S1),
        404,
        PROJECT_NOT_FOUND,
    ),
    "projects.remove_member/scrum-master": (
        lambda db: projects.instructor_remove_member(P2, SM2, PO2),
        403,
        "Not the instructor of this project",
    ),
    "projects.assign_product_owner/plain-member": (
        lambda db: projects.assign_product_owner(P1, S1, S1),
        403,
        "Insufficient permissions to manage project roles",
    ),
    # An admin is named by the class instructor or a class TA, never by a team role.
    "projects.assign_admin/product-owner": (
        lambda db: projects.assign_admin(P2, PO2, SM2),
        403,
        "Only the class instructor or a TA can manage project admins",
    ),
    # A student's request to join is accepted by the class instructor or the team's owner,
    # Product Owner or admin; a team's invitation only by the student it invites.
    "projects.accept_request/plain-member": (
        lambda db: projects.accept_join_request(JOIN_REQUEST, S1),
        403,
        "Only the class instructor or project owners/admins can review join requests",
    ),
    "projects.accept_invite/class-instructor": (
        lambda db: projects.accept_join_request(TEAM_INVITE, INSTR),
        403,
        "Only the invited user can accept this invitation",
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
    # app.schedule: the class instructor or anyone enrolled reads their own schedule
    "schedule.get/missing-class": (
        lambda db: schedule.get_schedule(S1, MISSING_CLASS, SCHEDULE_FROM, SCHEDULE_TO),
        404,
        CLASS_NOT_FOUND,
    ),
    "schedule.get/other-instructor": (
        lambda db: schedule.get_schedule(OTHER_INSTR, CLASS, SCHEDULE_FROM, SCHEDULE_TO),
        403,
        NOT_CLASS_MEMBER,
    ),
    "schedule.get/outsider": (
        lambda db: schedule.get_schedule(OUTSIDER, CLASS, SCHEDULE_FROM, SCHEDULE_TO),
        403,
        NOT_CLASS_MEMBER,
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
    # app.messages: a direct conversation is open only while its two people share a class.
    "messages.send/direct-conversation-without-a-shared-class": (
        lambda db: messages.send_message(sender_id=OUTSIDER, conversation_id=CONV_DM, body="hi"),
        403,
        "Cannot message this user",
    ),
    # app.analytics: an instructor sees the schools of the classes they created (TA1: SCHOOL),
    # a maintainer every school, and only a maintainer is told that a school does not exist.
    "analytics.dashboard/enrolled-student": (
        lambda db: _dashboard(S1, SCHOOL),
        403,
        ANALYTICS_FORBIDDEN,
    ),
    "analytics.dashboard/instructor-at-another-school": (
        lambda db: _dashboard(TA1, OTHER_SCHOOL),
        403,
        ANALYTICS_FORBIDDEN,
    ),
    "analytics.dashboard/missing-school-instructor": (
        lambda db: _dashboard(TA1, MISSING_SCHOOL),
        403,
        ANALYTICS_FORBIDDEN,
    ),
    "analytics.dashboard/missing-school-maintainer": (
        lambda db: _dashboard(MAINTAINER, MISSING_SCHOOL, MAINTAINER_EMAIL),
        404,
        "institution does not exist",
    ),
}


@pytest.mark.parametrize("case", sorted(CASES))
def test_missing_resources_answer_404_and_denied_callers_403(db, case):
    call, status, detail = CASES[case]
    with pytest.raises(HTTPException) as exc:
        call(db)
    assert (exc.value.status_code, exc.value.detail) == (status, detail)
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]


@pytest.mark.parametrize("role", ["student", None], ids=["student", "no-role-yet"])
def test_the_instructor_role_dependency_uses_the_same_message(monkeypatch, role):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: role)
    with pytest.raises(HTTPException) as exc:
        dependencies.require_instructor(S1)
    assert (exc.value.status_code, exc.value.detail) == (403, INSTRUCTOR_ROLE_REQUIRED)
