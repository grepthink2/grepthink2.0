"""
Assignment views — parameter handling and HTTP responses
"""
from uuid import UUID
from fastapi import Depends, Query
from app.dependencies import require_user
from app.assignments.models import (
    CreateAssignmentRequest,
    UpdateAssignmentRequest,
    UpdateTSREntryRequest,
    SubmitFeedbackRequest,
)
from app.assignments import controller


def create_assignment(
    data: CreateAssignmentRequest,
    user_id: str = Depends(require_user),
):
    assignment = controller.create_assignment(
        user_id=user_id,
        class_id=data.class_id,
        title=data.title,
        open_date=data.open_date,
        close_date=data.close_date,
        status=data.status,
        assignment_type=data.assignment_type,
    )
    return {"message": "Assignment created successfully", "assignment": assignment}


def update_assignment(
    assignment_id: UUID,
    data: UpdateAssignmentRequest,
    user_id: str = Depends(require_user),
):
    assignment = controller.update_assignment(
        user_id=user_id,
        assignment_id=assignment_id,
        title=data.title,
        open_date=data.open_date,
        close_date=data.close_date,
        status=data.status,
        assignment_type=data.assignment_type,
    )
    return {"message": "Assignment updated successfully", "assignment": assignment}


def update_tsr_entry(
    assignment_id: UUID,
    tsr_id: UUID,
    data: UpdateTSREntryRequest,
    user_id: str = Depends(require_user),
):
    entry = controller.update_tsr_entry(
        user_id=user_id,
        assignment_id=assignment_id,
        tsr_id=tsr_id,
        percent_contribution=data.percent_contribution,
        positive_feedback=data.positive_feedback,
        constructive_feedback=data.constructive_feedback,
        scrum_master_tickets=data.scrum_master_tickets,
        scrum_master_assessment=data.scrum_master_assessment,
        scrum_master_notes=data.scrum_master_notes,
    )
    return {"message": "TSR updated successfully", "tsr": entry}


def get_my_tsrs(
    assignment_id: UUID,
    user_id: str = Depends(require_user),
):
    """Return all TSR submissions the authenticated user made for this assignment."""
    entries = controller.get_my_tsr_entries(
        user_id=user_id,
        assignment_id=assignment_id,
    )
    return {"tsrs": entries}


def get_tsr_overview(
    assignment_id: UUID,
    user_id: str = Depends(require_user),
):
    """All TSR responses for an assignment, by project (instructor only)."""
    overview = controller.get_instructor_tsr_overview(
        user_id=user_id,
        assignment_id=assignment_id,
    )
    return overview


def get_tsrs_about_user(
    assignment_id: UUID,
    evaluatee_id: UUID,
    user_id: str = Depends(require_user),
):
    """Return all TSR responses about a specific user for this assignment (instructor only)."""
    entries = controller.get_tsr_responses_about_user(
        user_id=user_id,
        assignment_id=assignment_id,
        evaluatee_id=evaluatee_id,
    )
    return {"tsrs": entries}


def get_assignments(
    class_id: UUID = Query(..., description="Class ID to fetch assignments for"),
    user_id: str = Depends(require_user),
):
    assignments = controller.get_assignments_for_class(
        user_id=user_id,
        class_id=class_id,
    )
    return {"assignments": assignments}


def submit_feedback(
    assignment_id: UUID,
    data: SubmitFeedbackRequest,
    user_id: str = Depends(require_user),
):
    submission = controller.submit_feedback(
        user_id=user_id,
        assignment_id=assignment_id,
        q1_liked=data.q1_liked,
        q2_frustrating=data.q2_frustrating,
        q3_missing_feature=data.q3_missing_feature,
        q4_bugs=data.q4_bugs,
        q5_suggestions=data.q5_suggestions,
    )
    return {"message": "Feedback submitted successfully", "submission": submission}


def get_my_feedback(
    assignment_id: UUID,
    user_id: str = Depends(require_user),
):
    """Return the authenticated student's feedback submission (null if not yet submitted)."""
    submission = controller.get_my_feedback(
        user_id=user_id,
        assignment_id=assignment_id,
    )
    return {"submission": submission}


def get_feedback_overview(
    assignment_id: UUID,
    user_id: str = Depends(require_user),
):
    """All feedback submissions for an assignment (instructor only)."""
    return controller.get_feedback_overview(
        user_id=user_id,
        assignment_id=assignment_id,
    )
