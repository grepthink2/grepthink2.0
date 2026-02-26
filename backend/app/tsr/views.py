"""
TSR views — parameter handling and HTTP responses
"""
from uuid import UUID
from typing import Optional
from fastapi import HTTPException, Depends, Query
from app.dependencies import verify_supabase_token
from app.tsr.models import CreateTSRRequest
from app.tsr import controller


def submit_tsr(data: CreateTSRRequest, payload: dict = Depends(verify_supabase_token)):
    """Submit a new TSR. project_id and assignment_id are in the request body."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    tsr = controller.create_tsr(payload.get('sub'), data)
    return {"tsr": tsr}


def view_project_tsrs(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """View all TSRs for a project. Admins/scrum masters see all; others see their own."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    tsrs = controller.view_tsrs(payload.get('sub'), project_id)
    return {"tsrs": tsrs}


def get_submitted_tsrs(
    project_id: UUID,
    user_id: Optional[UUID] = Query(None, description="Target user (admin/scrum master only; defaults to self)"),
    week: Optional[int] = Query(None, description="Filter by week number"),
    payload: dict = Depends(verify_supabase_token),
):
    """TSRs submitted (evaluator) by a user in a project, optionally filtered by week."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    tsrs = controller.get_tsrs_submitted_by(
        requester_id=payload.get('sub'),
        project_id=project_id,
        target_user_id=str(user_id) if user_id else None,
        week=week,
    )
    return {"tsrs": tsrs}


def get_received_tsrs(
    project_id: UUID,
    user_id: Optional[UUID] = Query(None, description="Target user (admin/scrum master only; defaults to self)"),
    week: Optional[int] = Query(None, description="Filter by week number"),
    payload: dict = Depends(verify_supabase_token),
):
    """TSRs received (evaluatee) by a user in a project, optionally filtered by week."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    tsrs = controller.get_tsrs_received_by(
        requester_id=payload.get('sub'),
        project_id=project_id,
        target_user_id=str(user_id) if user_id else None,
        week=week,
    )
    return {"tsrs": tsrs}
