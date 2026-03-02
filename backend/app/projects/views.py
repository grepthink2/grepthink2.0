"""
Projects views — parameter handling and responses
"""
from uuid import UUID
from typing import Optional
from fastapi import HTTPException, Depends, Query
from app.dependencies import verify_supabase_token
from app.projects.models import CreateProjectRequest, UpdateProjectRequest, JoinProjectRequest, AcceptJoinRequestRequest, ManageProjectMemberRequest
from app.projects import controller


def test_create_project(data: CreateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    """Test endpoint for project creation with the same teacher-only checks as production create."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')

    try:
        result = controller.create_project(
            class_id=data.class_id,
            name=data.name,
            description=data.description,
            user_id=user_id,
            team_size=data.team_size,
            looking_for_roles=data.looking_for_roles,
            skills=data.skills,
            sponsor_name=data.sponsor_name,
            sponsor_company=data.sponsor_company,
            sponsor_email=data.sponsor_email,
            sponsor_website=data.sponsor_website,
            sponsor_description=data.sponsor_description,
        )
        return {"message": "Test project created", "project": result}
    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        if "sponsor_" in err and ("column" in err.lower() or "schema" in err.lower()):
            raise HTTPException(
                status_code=500,
                detail="Sponsor columns are missing in the projects table. Run the sponsor migration first."
            )
        raise HTTPException(status_code=500, detail=f"Failed to create test project: {err}")



def create_project(data: CreateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')
    result = controller.create_project(
        data.class_id, data.name, data.description, user_id,
        data.team_size, data.looking_for_roles, data.skills,
        sponsor_name=data.sponsor_name,
        sponsor_company=data.sponsor_company,
        sponsor_email=data.sponsor_email,
        sponsor_website=data.sponsor_website,
        sponsor_description=data.sponsor_description,
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
        sponsor_name=data.sponsor_name,
        sponsor_company=data.sponsor_company,
        sponsor_email=data.sponsor_email,
        sponsor_website=data.sponsor_website,
        sponsor_description=data.sponsor_description,
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
    """Add a user to a project, or update their role if already a member (instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    result = controller.instructor_add_member(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(data.user_id),
        role=data.role,
    )
    return result


def remove_project_member(project_id: UUID, user_id: UUID, payload: dict = Depends(verify_supabase_token)):
    """Remove a user from a project (instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.instructor_remove_member(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(user_id),
    )