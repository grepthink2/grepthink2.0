"""
Projects views — parameter handling and responses
"""
from uuid import UUID
from typing import Optional
from fastapi import HTTPException, Depends, Query
from app.dependencies import verify_supabase_token
from app.projects.models import CreateProjectRequest, UpdateProjectRequest, JoinProjectRequest, AcceptJoinRequestRequest, ManageProjectMemberRequest
from app.projects import controller



def create_project(data: CreateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    result = controller.create_project(
        data.class_id, data.name, data.description, user_id,
        data.team_size, data.looking_for_roles, data.skills,
    )
    return {"message": "Project created successfully", "project": result}


def get_projects(class_id: Optional[UUID] = Query(None, description="Filter projects by class ID"), payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    projects = controller.get_projects_for_user(payload.get('sub'), class_id)
    return {"projects": projects}


def get_project(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    project = controller.get_project_by_id(project_id, payload.get('sub'))
    return {"project": project}


def update_project(project_id: UUID, data: UpdateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    project = controller.update_project(
        project_id,
        payload.get('sub'),
        team_size=data.team_size,
        description=data.description,
    )
    return {"message": "Project updated successfully", "project": project}


def request_join(data: JoinProjectRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.request_to_join_project(data.project_id, payload.get('sub'))


def accept_request(data: AcceptJoinRequestRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.accept_join_request(data.request_id, payload.get('sub'))


def reject_request(data: AcceptJoinRequestRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.reject_join_request(data.request_id, payload.get('sub'))


def get_project_members(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    members = controller.get_project_members(project_id)
    return {"members": members}


def get_join_requests(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    requests = controller.get_pending_join_requests(project_id, payload.get('sub'))
    return {"requests": requests}


def add_project_member(project_id: UUID, data: ManageProjectMemberRequest, payload: dict = Depends(verify_supabase_token)):
    """Add a user to a project, or update their role if already a member (instructor or product owner only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    result = controller.admin_add_member(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user=str(data.user_id),
        role=data.role,
    )
    return result


def remove_project_member(project_id: UUID, user_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Remove a user from a project (instructor or product owner only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.admin_remove_member(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user=str(user_id),
    )