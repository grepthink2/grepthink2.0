"""
Projects views — parameter handling and responses
"""
from uuid import UUID
from typing import Optional
from fastapi import HTTPException, Depends, Query
from app.dependencies import verify_supabase_token
from app.projects.models import CreateProjectRequest, UpdateProjectRequest, JoinProjectRequest, AcceptJoinRequestRequest, ManageProjectMemberRequest, AssignRoleRequest
from app.projects import controller


def test_create_project(data: CreateProjectRequest, payload: dict = Depends(verify_supabase_token)):
    """Test endpoint for project creation without teacher-only enforcement."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')

    try:
        from app.database.client import service_client, supabase as sb_client
        client = service_client if service_client else sb_client

        # Verify class exists
        class_result = client.table('classes').select('id').eq('id', str(data.class_id)).execute()
        if not class_result.data:
            raise HTTPException(status_code=404, detail="Class not found")

        project_data = {
            "class_id": str(data.class_id),
            "name": data.name,
            "description": data.description,
            "created_by": user_id,
            "team_size": data.team_size,
            "num_members": 0,
        }
        if data.looking_for_roles is not None:
            project_data["looking_for_roles"] = data.looking_for_roles
        if data.skills is not None:
            project_data["skills"] = data.skills
        if data.sponsor_name is not None:
            project_data["sponsor_name"] = data.sponsor_name
        if data.sponsor_company is not None:
            project_data["sponsor_company"] = data.sponsor_company
        if data.sponsor_email is not None:
            project_data["sponsor_email"] = data.sponsor_email
        if data.sponsor_website is not None:
            project_data["sponsor_website"] = data.sponsor_website
        if data.sponsor_description is not None:
            project_data["sponsor_description"] = data.sponsor_description

        result = client.table('projects').insert(project_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return {"message": "Test project created (no role check)", "project": result.data[0]}
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
        name=data.name,
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


def assign_product_owner(project_id: UUID, data: AssignRoleRequest, payload: dict = Depends(verify_supabase_token)):
    """Assign the product owner role to a project member (owner, product owner, admin, or instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.assign_product_owner(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(data.user_id),
    )


def assign_scrum_master(project_id: UUID, data: AssignRoleRequest, payload: dict = Depends(verify_supabase_token)):
    """Assign the scrum master role to a project member (owner, product owner, admin, or instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.assign_scrum_master(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(data.user_id),
    )


def assign_admin(project_id: UUID, data: AssignRoleRequest, payload: dict = Depends(verify_supabase_token)):
    """Assign the admin role to a project member (owner, product owner, admin, or instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.assign_admin(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(data.user_id),
    )


def remove_scrum_master(project_id: UUID, data: AssignRoleRequest, payload: dict = Depends(verify_supabase_token)):
    """Demote the scrum master back to member (product owner, admin, or instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.remove_scrum_master(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(data.user_id),
    )


def remove_admin(project_id: UUID, data: AssignRoleRequest, payload: dict = Depends(verify_supabase_token)):
    """Demote an admin back to member (product owner, admin, or instructor only)."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return controller.remove_admin(
        project_id=project_id,
        requester_id=payload.get('sub'),
        target_user_id=str(data.user_id),
    )