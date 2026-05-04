"""
Staffing views — parameter handling and HTTP responses.

Thin layer over ``app.staffing.controller``. The controller owns
permission checks (instructor vs. student vs. enrolled) so these
handlers are mostly param plumbing.
"""
from uuid import UUID

from fastapi import Depends

from app.dependencies import require_user
from app.staffing import controller
from app.staffing.models import (
    AssignUserRequest,
    SubmitInterestFormRequest,
    SubmitInterestRequest,
    UnassignUserRequest,
)


# --------------------------------------------------------------------------- student-facing

def submit_interest(
    data: SubmitInterestRequest,
    user_id: str = Depends(require_user),
):
    """Upsert a single ranked preference for the authenticated user."""
    interest = controller.submit_interest(
        user_id=user_id,
        class_id=data.class_id,
        project_id=data.project_id,
        interest_value=data.interest_value,
        interest_reason=data.interest_reason,
    )
    return {"message": "Interest recorded", "interest": interest}


def submit_form(
    class_id: UUID,
    data: SubmitInterestFormRequest,
    user_id: str = Depends(require_user),
):
    """Upsert the entire interest-form submission for the authenticated user."""
    submission = controller.submit_form(
        user_id=user_id,
        class_id=class_id,
        taking_115c=data.taking_115c,
        previous_project_name=data.previous_project_name,
        previous_project_link=data.previous_project_link,
        notes=data.notes,
        ranked_projects=data.ranked_projects,
        work_with=data.work_with,
        dont_work_with=data.dont_work_with,
        submitted=data.submitted,
    )
    return {"message": "Interest form submitted", "submission": submission}


def get_my_interests(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Ranked-project rows for the authenticated user in the class."""
    interests = controller.get_my_interests(user_id=user_id, class_id=class_id)
    return {"interests": interests}


def get_my_submission(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Full interest-form payload for the authenticated user in the class."""
    submission = controller.get_my_submission(user_id=user_id, class_id=class_id)
    return {"submission": submission}


# --------------------------------------------------------------------------- instructor-facing

def get_pref_by_student(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor view: students grouped with their preferences."""
    rows = controller.pref_by_student(user_id=user_id, class_id=class_id)
    return {"students": rows}


def get_pref_by_project(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor view: projects grouped with their interested students."""
    rows = controller.pref_by_project(user_id=user_id, class_id=class_id)
    return {"projects": rows}


def get_project_rank(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor view: per-project breadth/depth/strength + ranks."""
    rows = controller.project_rank(user_id=user_id, class_id=class_id)
    return {"projects": rows}


def get_project_availability(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor view: per-(student, project) interest + availability."""
    rows = controller.get_project_availability(user_id=user_id, class_id=class_id)
    return {"rows": rows}


def get_assignments(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor view: every enrolled student and their current assignment."""
    rows = controller.get_assignments(user_id=user_id, class_id=class_id)
    return {"assignments": rows}


def get_students_with_interest(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor view: full per-student data for the Assign UI."""
    rows = controller.get_class_students_with_interest(
        user_id=user_id, class_id=class_id
    )
    return {"students": rows}


def assign(
    class_id: UUID,
    data: AssignUserRequest,
    user_id: str = Depends(require_user),
):
    """Instructor: assign a student to a project in this class."""
    return controller.assign_user(
        user_id=user_id,
        class_id=class_id,
        target_user_id=data.user_id,
        project_id=data.project_id,
    )


def unassign(
    class_id: UUID,
    data: UnassignUserRequest,
    user_id: str = Depends(require_user),
):
    """Instructor: remove a student from their project assignment in this class."""
    return controller.unassign_user(
        user_id=user_id,
        class_id=class_id,
        target_user_id=data.user_id,
    )


def auto_assign(
    class_id: UUID,
    user_id: str = Depends(require_user),
):
    """Instructor: run the greedy auto-assignment algorithm for the class."""
    placements = controller.auto_assign(user_id=user_id, class_id=class_id)
    return {"placements": placements}
