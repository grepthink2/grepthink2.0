"""
Projects views — parameter handling and responses
"""
import logging
from uuid import UUID
from typing import Optional
from fastapi import HTTPException, Depends, Query
from app.dependencies import require_user
from app.projects.models import CreateProjectRequest, UpdateProjectRequest, JoinProjectRequest, AcceptJoinRequestRequest, ManageProjectMemberRequest, AssignRoleRequest
from app.projects import controller

logger = logging.getLogger(__name__)


def test_create_project(data: CreateProjectRequest, user_id: str = Depends(require_user)):
    """Test endpoint for project creation without teacher-only enforcement."""
    # WARN: This endpoint bypasses ALL role checks. It's registered on the public
    # router. Anyone with a valid JWT can create projects in any class.
    # See CODE_REVIEW.md #7. Remove before production.
    logger.warning(
        "test_create_project called — this endpoint bypasses role checks | "
        "user_id=%s class_id=%s name=%r",
        user_id,
        getattr(data, 'class_id', None),
        getattr(data, 'name', None),
    )

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
        logger.info(
            "Test project created (no role check) | project_id=%s class_id=%s",
            result.data[0].get('id'), data.class_id,
        )
        return {"message": "Test project created (no role check)", "project": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        logger.exception("test_create_project failed | class_id=%s", data.class_id)
        if "sponsor_" in err and ("column" in err.lower() or "schema" in err.lower()):
            raise HTTPException(
                status_code=500,
                detail="Sponsor columns are missing in the projects table. Run the sponsor migration first."
            )
        raise HTTPException(status_code=500, detail="Failed to create test project")



def create_project(data: CreateProjectRequest, user_id: str = Depends(require_user)):
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


def get_projects(
    class_id: Optional[UUID] = Query(None, description="Filter projects by class ID"),
    user_id: str = Depends(require_user),
):
    projects = controller.get_projects_for_user(user_id, class_id)
    return {"projects": projects}


def get_pending_team_invites(
    class_id: UUID = Query(..., description="Class scope for pending invitations to the current user"),
    user_id: str = Depends(require_user),
):
    """Team invites where the current user is the invitee (awaiting accept/decline)."""
    requests = controller.get_pending_team_invites_for_user(user_id, class_id)
    return {"requests": requests}


def get_project(project_id: UUID, user_id: str = Depends(require_user)):
    project = controller.get_project_by_id(project_id, user_id)
    return {"project": project}


def delete_project(project_id: UUID, user_id: str = Depends(require_user)):
    """Delete a project (product owner, admin, or class instructor only)."""
    return controller.delete_project(project_id, user_id)


def update_project(
    project_id: UUID,
    data: UpdateProjectRequest,
    user_id: str = Depends(require_user),
):
    project = controller.update_project(
        project_id,
        user_id,
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


def request_join(data: JoinProjectRequest, user_id: str = Depends(require_user)):
    return controller.request_to_join_project(data.project_id, user_id)


def accept_request(data: AcceptJoinRequestRequest, user_id: str = Depends(require_user)):
    return controller.accept_join_request(data.request_id, user_id)


def reject_request(data: AcceptJoinRequestRequest, user_id: str = Depends(require_user)):
    return controller.reject_join_request(data.request_id, user_id)


def get_project_members(project_id: UUID, user_id: str = Depends(require_user)):
    members = controller.get_project_members(project_id)
    return {"members": members}


def get_join_requests(project_id: UUID, user_id: str = Depends(require_user)):
    """
    List pending **student-initiated** join requests for a project.

    Allowed callers: **class instructor** for the project’s class, or a project
    member with role **owner**, **product owner**, or **admin**.
    """
    requests = controller.get_pending_join_requests(project_id, user_id)
    return {"requests": requests}


def add_project_member(
    project_id: UUID,
    data: ManageProjectMemberRequest,
    user_id: str = Depends(require_user),
):
    """
    Add someone to a project or change their role if they are already a member.

    - **Class instructor**: adds or updates the role **immediately**.
    - **Owner / product owner / admin** (not the class instructor): adding role
      **member** creates a **pending team invite**; the invitee accepts via
      ``POST /api/projects/accept-request``.
    """
    result = controller.instructor_add_member(
        project_id=project_id,
        requester_id=user_id,
        target_user_id=str(data.user_id),
        role=data.role,
    )
    return result


def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    requester_id: str = Depends(require_user),
):
    """Remove a user from a project (instructor only)."""
    return controller.instructor_remove_member(
        project_id=project_id,
        requester_id=requester_id,
        target_user_id=str(user_id),
    )


def assign_product_owner(
    project_id: UUID,
    data: AssignRoleRequest,
    user_id: str = Depends(require_user),
):
    """Assign the product owner role to a project member (owner, product owner, admin, or instructor only)."""
    return controller.assign_product_owner(
        project_id=project_id,
        requester_id=user_id,
        target_user_id=str(data.user_id),
    )


def assign_scrum_master(
    project_id: UUID,
    data: AssignRoleRequest,
    user_id: str = Depends(require_user),
):
    """Assign the scrum master role to a project member (owner, product owner, admin, or instructor only)."""
    return controller.assign_scrum_master(
        project_id=project_id,
        requester_id=user_id,
        target_user_id=str(data.user_id),
    )


def assign_admin(
    project_id: UUID,
    data: AssignRoleRequest,
    user_id: str = Depends(require_user),
):
    """Assign the admin role to a project member (owner, product owner, admin, or instructor only)."""
    return controller.assign_admin(
        project_id=project_id,
        requester_id=user_id,
        target_user_id=str(data.user_id),
    )


def remove_scrum_master(
    project_id: UUID,
    data: AssignRoleRequest,
    user_id: str = Depends(require_user),
):
    """Demote the scrum master back to member (product owner, admin, or instructor only)."""
    return controller.remove_scrum_master(
        project_id=project_id,
        requester_id=user_id,
        target_user_id=str(data.user_id),
    )


def remove_admin(
    project_id: UUID,
    data: AssignRoleRequest,
    user_id: str = Depends(require_user),
):
    """Demote an admin back to member (product owner, admin, or instructor only)."""
    return controller.remove_admin(
        project_id=project_id,
        requester_id=user_id,
        target_user_id=str(data.user_id),
    )
