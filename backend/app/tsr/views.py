"""
TSR views — parameter handling and HTTP responses
"""
from uuid import UUID
from typing import Optional
from fastapi import Depends, Query
from app.dependencies import require_user
from app.tsr.models import CreateTSRRequest
from app.tsr import controller


def submit_tsr(data: CreateTSRRequest, user_id: str = Depends(require_user)):
    """Submit a new TSR. project_id and assignment_id are in the request body."""
    tsr = controller.create_tsr(user_id, data)
    return {"tsr": tsr}


def view_project_tsrs(project_id: UUID, user_id: str = Depends(require_user)):
    """View all TSRs for a project. Admins/scrum masters see all; others see their own."""
    tsrs = controller.view_tsrs(user_id, project_id)
    return {"tsrs": tsrs}


def get_submitted_tsrs(
    project_id: UUID,
    user_id: Optional[UUID] = Query(None, description="Target user (admin/scrum master only; defaults to self)"),
    week: Optional[int] = Query(None, description="Filter by week number"),
    requester_id: str = Depends(require_user),
):
    """TSRs submitted (evaluator) by a user in a project, optionally filtered by week."""
    tsrs = controller.get_tsrs_submitted_by(
        requester_id=requester_id,
        project_id=project_id,
        target_user_id=str(user_id) if user_id else None,
        week=week,
    )
    return {"tsrs": tsrs}


def get_received_tsrs(
    project_id: UUID,
    user_id: Optional[UUID] = Query(None, description="Target user (admin/scrum master only; defaults to self)"),
    week: Optional[int] = Query(None, description="Filter by week number"),
    requester_id: str = Depends(require_user),
):
    """TSRs received (evaluatee) by a user in a project, optionally filtered by week."""
    tsrs = controller.get_tsrs_received_by(
        requester_id=requester_id,
        project_id=project_id,
        target_user_id=str(user_id) if user_id else None,
        week=week,
    )
    return {"tsrs": tsrs}
