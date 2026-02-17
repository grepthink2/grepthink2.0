"""
Project management endpoints
"""
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends, Query
from app.dependencies import verify_supabase_token
from app.projects.models import CreateProjectRequest, UpdateProjectRequest, JoinProjectRequest, AcceptJoinRequestRequest
from app.projects import controller

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post('')
def create_project_endpoint(data: CreateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    """Create a new project within a class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    result = controller.create_project(
        data.class_id,
        data.name,
        data.description,
        user_id,
        data.team_size,
        data.looking_for_roles,
        data.skills,
    )
    return {
        "message": "Project created successfully",
        "project": result
    }


@router.get('')
def get_projects_endpoint(
    class_id: UUID = Query(None, description="Filter projects by class ID"),
    payload: dict = Depends(verify_supabase_token)
):
    """Get all projects for the current user, optionally filtered by class"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    projects = controller.get_projects_for_user(user_id, class_id)
    return {"projects": projects}


@router.get('/{project_id}')
def get_project_endpoint(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get details of a specific project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    project = controller.get_project_by_id(project_id, user_id)
    return {"project": project}


@router.patch('/{project_id}')
def update_project_endpoint(project_id: UUID, data: UpdateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    """Update a project (e.g. team_size). Owner/admin only."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    project = controller.update_project(project_id, user_id, data.team_size)
    return {
        "message": "Project updated successfully",
        "project": project
    }


@router.post('/request-join')
def request_join_endpoint(data: JoinProjectRequest, payload: dict = Depends(verify_supabase_token)):
    """Request to join a project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    return controller.request_to_join_project(data.project_id, user_id)


@router.post('/accept-request')
def accept_request_endpoint(data: AcceptJoinRequestRequest, payload: dict = Depends(verify_supabase_token)):
    """Accept a join request (project owner/admin only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    return controller.accept_join_request(data.request_id, user_id)


@router.post('/reject-request')
def reject_request_endpoint(data: AcceptJoinRequestRequest, payload: dict = Depends(verify_supabase_token)):
    """Reject a join request (project owner/admin only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    return controller.reject_join_request(data.request_id, user_id)


@router.get('/{project_id}/members')
def get_project_members_endpoint(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get all members of a project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    members = controller.get_project_members(project_id)
    return {"members": members}


@router.get('/{project_id}/join-requests')
def get_join_requests_endpoint(project_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Get pending join requests for a project (owner/admin only)"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = payload.get('sub')
    
    requests = controller.get_pending_join_requests(project_id, user_id)
    return {"requests": requests}
