"""
Assignment views — parameter handling and HTTP responses
"""
from uuid import UUID
from fastapi import Depends, HTTPException, Query
from app.dependencies import verify_supabase_token
from app.assignments.models import CreateAssignmentRequest, UpdateAssignmentRequest
from app.assignments import controller


def create_assignment(
    data: CreateAssignmentRequest,
    payload: dict = Depends(verify_supabase_token),
):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    assignment = controller.create_assignment(
        user_id=payload.get('sub'),
        class_id=data.class_id,
        title=data.title,
        open_date=data.open_date,
        close_date=data.close_date,
        status=data.status,
    )
    return {"message": "Assignment created successfully", "assignment": assignment}


def update_assignment(
    assignment_id: UUID,
    data: UpdateAssignmentRequest,
    payload: dict = Depends(verify_supabase_token),
):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    assignment = controller.update_assignment(
        user_id=payload.get('sub'),
        assignment_id=assignment_id,
        title=data.title,
        open_date=data.open_date,
        close_date=data.close_date,
        status=data.status,
    )
    return {"message": "Assignment updated successfully", "assignment": assignment}


def get_assignments(
    class_id: UUID = Query(..., description="Class ID to fetch assignments for"),
    payload: dict = Depends(verify_supabase_token),
):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    assignments = controller.get_assignments_for_class(
        user_id=payload.get('sub'),
        class_id=class_id,
    )
    return {"assignments": assignments}
