"""
Project management business logic
"""
import logging
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase

logger = logging.getLogger(__name__)


def _increment_project_num_members(client, project_id: str, delta: int) -> None:
    """Update projects.num_members by delta (+1 or -1)."""
    # DEBUG: the num_members counter is maintained by hand (see CODE_REVIEW.md #12);
    # if it drifts from the actual project_members count, this trace is where to look.
    proj = client.table('projects').select('num_members').eq('id', project_id).execute()
    if not proj.data:
        logger.warning(
            "_increment_project_num_members: project not found | project_id=%s delta=%d",
            project_id, delta,
        )
        return
    current = proj.data[0].get('num_members')
    if current is None:
        current = 0
    new_val = max(0, int(current) + delta)
    logger.debug(
        "num_members: %d -> %d (delta=%+d) | project_id=%s",
        int(current), new_val, delta, project_id,
    )
    client.table('projects').update({'num_members': new_val}).eq('id', project_id).execute()

def _is_instructor(user_id, class_id):
    try:
        client = service_client if service_client else supabase
        classes_result = (
            client.table('classes').select('created_by')
            .eq('created_by', str(user_id)).eq('id', str(class_id))
            .execute()
        )
        result = len(classes_result.data) > 0
        logger.debug(
            "_is_instructor: user=%s class=%s -> %s", user_id, class_id, result
        )
        return result
    except Exception:
        logger.exception(
            "_is_instructor failed | user_id=%s class_id=%s", user_id, class_id
        )
        # NOTE: returns None on error, which callers treat as falsy — OK for now
        # but this inconsistency is tracked in CODE_REVIEW.md #17.
        return None

def _is_admin(user_id, project_id):
    """Checks if user has admin privillges for a project"""
    try:
        client = service_client if service_client else supabase

        # WARN: This check is NOT scoped to project_id — it matches any project
        # where the user is an 'owner'. See CODE_REVIEW.md finding #9. Fix pending.
        # The DEBUG log below will show you when this branch fires so you can spot
        # incorrect admin grants at runtime.
        enrollment_result = (
            client.table('project_members').select('user_id')
            .eq('user_id', str(user_id)).eq('role', "owner")
            .execute()
        )
        if enrollment_result.data:
            logger.warning(
                "_is_admin: granting admin via owner role without project scope | "
                "user=%s requested_project=%s — BUG: check not scoped to project_id",
                user_id, project_id,
            )
            return True

        #fetch class_id
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            logger.debug("_is_admin: project %s not found", project_id)
            return False

        class_id = class_result.data[0]['class_id']
        # check is user is teacher of the class
        is_teacher = _is_instructor(user_id, class_id)
        logger.debug(
            "_is_admin: user=%s project=%s class=%s -> %s",
            user_id, project_id, class_id, is_teacher,
        )
        return is_teacher

    except Exception:
        logger.exception(
            "_is_admin failed | user_id=%s project_id=%s", user_id, project_id
        )
        return None

def create_project(
    class_id: UUID,
    name: str,
    description: str,
    user_id: str,
    team_size: int,
    looking_for_roles: Optional[List[str]] = None,
    skills: Optional[List[str]] = None,
    sponsor_name: Optional[str] = None,
    sponsor_company: Optional[str] = None,
    sponsor_email: Optional[str] = None,
    sponsor_website: Optional[str] = None,
    sponsor_description: Optional[str] = None,
) -> dict:
    """
    Create a new project within a class.

    Instructors who own the class may create projects with full sponsor information.
    Enrolled students may also create projects, but sponsor fields are excluded.

    Args:
        class_id: Class unique identifier
        name: Project name
        description: Project description
        user_id: ID of the user creating the project
        team_size: Maximum team size
        looking_for_roles: Optional list of role names (stored as JSONB)
        skills: Optional list of skill names (stored as JSONB)
        sponsor_name: Optional sponsor contact name (instructor only)
        sponsor_company: Optional sponsor company/organization (instructor only)
        sponsor_email: Optional sponsor email (instructor only)
        sponsor_website: Optional sponsor website URL (instructor only)
        sponsor_description: Optional description of the sponsor (instructor only)

    Returns:
        Dictionary containing project data

    Raises:
        HTTPException: If class not found, user lacks permission, or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        # Verify the class exists
        class_result = client.table('classes').select('id, created_by').eq('id', str(class_id)).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")

        class_row = class_result.data[0]
        profile = client.table('profiles').select('role').eq('id', user_id).execute()
        user_role = profile.data[0].get('role') if profile.data else None

        is_instructor = user_role == 'instructor' and class_row.get('created_by') == user_id

        if not is_instructor:
            if user_role != 'student':
                raise HTTPException(
                    status_code=403,
                    detail="Only the class instructor or enrolled students can create projects"
                )
            # Verify the student is enrolled in the class
            enrollment = (
                client.table('class_enrollments').select('id')
                .eq('class_id', str(class_id)).eq('user_id', user_id)
                .execute()
            )
            if not enrollment.data:
                raise HTTPException(
                    status_code=403,
                    detail="You must be enrolled in the class to create a project"
                )

        project_data = {
            "class_id": str(class_id),
            "name": name,
            "description": description,
            "created_by": user_id,
            "team_size": team_size,
            "num_members": 0,
        }
        if looking_for_roles is not None:
            project_data["looking_for_roles"] = looking_for_roles
        if skills is not None:
            project_data["skills"] = skills

        # Sponsor fields are only applied for instructors
        if is_instructor:
            if sponsor_name is not None:
                project_data["sponsor_name"] = sponsor_name
            if sponsor_company is not None:
                project_data["sponsor_company"] = sponsor_company
            if sponsor_email is not None:
                project_data["sponsor_email"] = sponsor_email
            if sponsor_website is not None:
                project_data["sponsor_website"] = sponsor_website
            if sponsor_description is not None:
                project_data["sponsor_description"] = sponsor_description

        result = client.table('projects').insert(project_data).execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create project")

        project = result.data[0]

        # Students who create a project are automatically added as product owner
        if not is_instructor:
            client.table('project_members').insert({
                "project_id": project['id'],
                "user_id": user_id,
                "role": "product owner",
            }).execute()
            _increment_project_num_members(client, project['id'], 1)

        logger.info(
            "Project created | project_id=%s name=%r class_id=%s created_by=%s is_instructor=%s",
            project.get('id'), name, class_id, user_id, is_instructor,
        )
        return project
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error creating project | name=%r class_id=%s", name, class_id)
        raise HTTPException(status_code=500, detail="Failed to create project")


def update_project(
    project_id: UUID,
    user_id: str,
    team_size: int | None = None,
    name: str | None = None,
    description: str | None = None,
    sponsor_name: str | None = None,
    sponsor_company: str | None = None,
    sponsor_email: str | None = None,
    sponsor_website: str | None = None,
    sponsor_description: str | None = None,
) -> dict:
    """
    Update a project's fields (team_size, description, sponsor info).

    Who can edit:
    - Product owner or admin (project members with elevated roles)
    - Instructors who own the class the project belongs to

    At least one field must be provided.
    """
    all_none = all(v is None for v in [
        team_size, description, sponsor_name, sponsor_company,
        sponsor_email, sponsor_website, sponsor_description,
    ])
    if all_none:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")

    try:
        client = service_client if service_client else supabase

        project_result = client.table('projects').select('id, class_id').eq('id', str(project_id)).execute()
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        class_id = project_result.data[0].get('class_id')

        # Check if the user is an instructor who owns the class
        is_class_instructor = False
        if class_id:
            profile = client.table('profiles').select('role').eq('id', user_id).execute()
            user_role = profile.data[0].get('role') if profile.data else None
            if user_role == 'instructor':
                class_check = client.table('classes').select('id').eq('id', str(class_id)).eq('created_by', user_id).execute()
                is_class_instructor = bool(class_check.data)

        if not is_class_instructor:
            # Fall back to project membership check
            membership = client.table('project_members').select('role').eq(
                'project_id', str(project_id)
            ).eq('user_id', user_id).execute()
            if not membership.data:
                raise HTTPException(status_code=403, detail="Not a member of this project")
            member_role = membership.data[0]['role']
            if member_role not in ('owner', 'product owner', 'admin'):
                raise HTTPException(status_code=403, detail="Only product owners, admins, or class instructors can update the project")

        updates: dict = {}
        if team_size is not None:
            updates['team_size'] = team_size
        if name is not None:
            updates['name'] = name
        if name is not None:
            updates['name'] = name
        if description is not None:
            updates['description'] = description
        if sponsor_name is not None:
            updates['sponsor_name'] = sponsor_name
        if sponsor_company is not None:
            updates['sponsor_company'] = sponsor_company
        if sponsor_email is not None:
            updates['sponsor_email'] = sponsor_email
        if sponsor_website is not None:
            updates['sponsor_website'] = sponsor_website
        if sponsor_description is not None:
            updates['sponsor_description'] = sponsor_description

        result = client.table('projects').update(updates).eq('id', str(project_id)).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update project")
        logger.info(
            "Project updated | project_id=%s updated_by=%s fields=%s",
            project_id, user_id, list(updates.keys()),
        )
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error updating project | project_id=%s user_id=%s", project_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to update project")


def delete_project(project_id: UUID, user_id: str) -> dict:
    """
    Delete a project.

    Who can delete:
    - Product owner or admin (project members with elevated roles)
    - The class instructor

    Raises:
        HTTPException: 404 if project not found, 403 if user lacks permission.
    """
    try:
        client = service_client if service_client else supabase

        project_result = (
            client.table('projects').select('id, class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        class_id = project_result.data[0]['class_id']

        is_instructor = _is_instructor(user_id, class_id)
        if not is_instructor:
            membership = (
                client.table('project_members').select('role')
                .eq('project_id', str(project_id)).eq('user_id', user_id)
                .execute()
            )
            if not membership.data:
                raise HTTPException(status_code=403, detail="Not a member of this project")
            member_role = membership.data[0]['role']
            if member_role not in ('product owner', 'admin'):
                raise HTTPException(
                    status_code=403,
                    detail="Only product owners, admins, or the class instructor can delete this project"
                )

        client.table('projects').delete().eq('id', str(project_id)).execute()

        logger.info(
            "Project deleted | project_id=%s deleted_by=%s is_instructor=%s",
            project_id, user_id, is_instructor,
        )
        return {"message": "Project deleted successfully", "project_id": str(project_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error deleting project | project_id=%s user_id=%s", project_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to delete project")


def get_projects_for_user(user_id: str, class_id: UUID = None) -> list:
    """
    Get all projects for a user, optionally filtered by class.

    Returns id, name, and member_count for each project.

    - With class_id: returns all projects in the class (instructor or enrolled student).
    - Without class_id: returns only projects the user is a member of.
    """
    try:
        client = service_client if service_client else supabase

        if class_id:
            class_result = client.table('classes').select('id, created_by').eq('id', str(class_id)).execute()
            if not class_result.data:
                raise HTTPException(status_code=404, detail="Class not found")

            class_row = class_result.data[0]
            has_access = class_row.get('created_by') == user_id

            if not has_access:
                enrollment = client.table('class_enrollments').select('id').eq(
                    'class_id', str(class_id)
                ).eq('user_id', user_id).execute()
                has_access = bool(enrollment.data)

            if not has_access:
                raise HTTPException(status_code=403, detail="You do not have access to this class projects list")

            projects_result = client.table('projects').select(
                'id, name'
            ).eq('class_id', str(class_id)).order('created_at', desc=True).execute()

            projects = projects_result.data or []
        else:
            memberships = client.table('project_members').select(
                'project_id, projects ( id, name )'
            ).eq('user_id', user_id).execute()

            projects = []
            for row in memberships.data or []:
                project = row.get('projects')
                if project:
                    projects.append(project)

        if not projects:
            return []

        # Fetch member counts for all projects in one query
        project_ids = [p['id'] for p in projects]
        members_result = client.table('project_members').select(
            'project_id'
        ).in_('project_id', project_ids).execute()

        count_map: dict[str, int] = {}
        for m in members_result.data or []:
            pid = m['project_id']
            count_map[pid] = count_map.get(pid, 0) + 1

        role_rows = client.table('project_members').select(
            'project_id, role'
        ).eq('user_id', user_id).in_('project_id', project_ids).execute()
        role_map: dict[str, str] = {
            r['project_id']: r['role'] for r in (role_rows.data or [])
        }

        return [
            {
                'id': p['id'],
                'name': p.get('name'),
                'member_count': count_map.get(p['id'], 0),
                'user_role': role_map.get(p['id']),
            }
            for p in projects
        ]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching projects | user_id=%s class_id=%s", user_id, class_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


def get_project_by_id(project_id: UUID, user_id: str = None) -> dict:
    """
    Get a specific project by ID
    
    Args:
        project_id: Project unique identifier
        user_id: Optional user ID to include membership info
        
    Returns:
        Project dictionary
        
    Raises:
        HTTPException: If project not found or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        result = client.table('projects').select('*').eq('id', str(project_id)).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project = result.data[0]
        
        # If user_id provided, include their role in the project
        if user_id:
            membership = client.table('project_members').select('role').eq(
                'project_id', str(project_id)
            ).eq('user_id', user_id).execute()
            
            if membership.data and len(membership.data) > 0:
                project['user_role'] = membership.data[0]['role']
            else:
                project['user_role'] = None
        
        return project
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching project | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch project")



def request_to_join_project(project_id: UUID, user_id: str) -> dict:
    """
    Create a request to join a project
    
    Args:
        project_id: Project unique identifier
        user_id: User's unique identifier
        
    Returns:
        Dictionary with message and request data
        
    Raises:
        HTTPException: If project not found, already a member, or pending request exists
    """
    try:
        client = service_client if service_client else supabase
        
        # Verify the project exists
        project_result = client.table('projects').select('id, name').eq('id', str(project_id)).execute()
        if not project_result.data or len(project_result.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project = project_result.data[0]
        
        # Check if user is already a member
        existing_member = client.table('project_members').select('id').eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).execute()
        
        if existing_member.data and len(existing_member.data) > 0:
            raise HTTPException(status_code=400, detail="Already a member of this project")
        
        # Check if there's already a pending request
        existing_request = client.table('project_join_requests').select('id, request_status').eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).eq('request_status', 'pending').execute()
        
        if existing_request.data and len(existing_request.data) > 0:
            raise HTTPException(status_code=400, detail="Join request already pending")
        
        # Create the join request
        request_data = {
            "project_id": str(project_id),
            "user_id": user_id,
            "request_status": "pending",
            "reviewer_id": None,
            "reviewed_at": None,
        }
        
        result = client.table('project_join_requests').insert(request_data).execute()

        logger.info(
            "Join request created | project_id=%s user_id=%s request_id=%s",
            project_id, user_id, result.data[0].get('id') if result.data else None,
        )
        return {
            "message": "Join request submitted successfully",
            "request": result.data[0],
            "project": project
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error creating join request | project_id=%s user_id=%s", project_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to create join request")


def accept_join_request(request_id: UUID, reviewer_id: str) -> dict:
    """
    Accept a project join request (product owner/admin only)
    
    Args:
        request_id: Join request unique identifier
        reviewer_id: ID of the user accepting the request
        
    Returns:
        Dictionary with success message
        
    Raises:
        HTTPException: If request not found, no permission, or database error
    """
    try:
        client = service_client if service_client else supabase
        
        # Get the join request
        request_result = client.table('project_join_requests').select(
            'id, project_id, user_id, request_status'
        ).eq('id', str(request_id)).execute()
        
        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")
        
        join_request = request_result.data[0]
        
        # Check if request is still pending
        if join_request['request_status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Request already {join_request['request_status']}")
        
        # Verify the reviewer is a product owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', join_request['project_id']
        ).eq('user_id', reviewer_id).execute()
        
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'product owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only product owners and admins can accept join requests")
        
        # WARN: The next 3 statements are NOT atomic (see CODE_REVIEW.md #10).
        # If any one of them fails after the first succeeds we get an inconsistent
        # state (approved request with no membership row, or member without
        # num_members increment). Trace via these DEBUG logs to triage.
        logger.debug(
            "accept_join_request: begin multi-step commit | request_id=%s project_id=%s user_id=%s",
            request_id, join_request['project_id'], join_request['user_id'],
        )

        # Update the request status
        update_data = {
            "request_status": "approved",
            "reviewed_at": "now()",
            "reviewer_id": reviewer_id
        }

        client.table('project_join_requests').update(update_data).eq('id', str(request_id)).execute()
        logger.debug("accept_join_request: request status updated | request_id=%s", request_id)

        # Add user as project member
        member_data = {
            "project_id": join_request['project_id'],
            "user_id": join_request['user_id'],
            "role": "member"
        }

        client.table('project_members').insert(member_data).execute()
        logger.debug("accept_join_request: member inserted | user_id=%s", join_request['user_id'])

        # Increment num_members on the project
        _increment_project_num_members(client, join_request['project_id'], 1)

        logger.info(
            "Join request accepted | request_id=%s project_id=%s new_member=%s reviewer=%s",
            request_id, join_request['project_id'], join_request['user_id'], reviewer_id,
        )
        return {
            "message": "Join request accepted successfully",
            "user_id": join_request['user_id']
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error accepting join request | request_id=%s reviewer_id=%s",
            request_id, reviewer_id,
        )
        raise HTTPException(status_code=500, detail="Failed to accept join request")


def reject_join_request(request_id: UUID, reviewer_id: str) -> dict:
    """
    Reject a project join request (product owner/admin only)
    
    Args:
        request_id: Join request unique identifier
        reviewer_id: ID of the user rejecting the request
        
    Returns:
        Dictionary with success message
        
    Raises:
        HTTPException: If request not found, no permission, or database error
    """
    try:
        client = service_client if service_client else supabase
        
        # Get the join request
        request_result = client.table('project_join_requests').select(
            'id, project_id, user_id, request_status'
        ).eq('id', str(request_id)).execute()
        
        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")
        
        join_request = request_result.data[0]
        
        # Check if request is still pending
        if join_request['request_status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Request already {join_request['request_status']}")
        
        # Verify the reviewer is a product owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', join_request['project_id']
        ).eq('user_id', reviewer_id).execute()
        
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'product owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only product owners and admins can reject join requests")
        
        # Update the request status
        update_data = {
            "request_status": "rejected",
            "reviewed_at": "now()",
            "reviewer_id": reviewer_id
        }
        
        client.table('project_join_requests').update(update_data).eq('id', str(request_id)).execute()

        logger.info(
            "Join request rejected | request_id=%s project_id=%s user_id=%s reviewer=%s",
            request_id, join_request['project_id'], join_request['user_id'], reviewer_id,
        )
        return {
            "message": "Join request rejected successfully",
            "user_id": join_request['user_id']
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error rejecting join request | request_id=%s reviewer_id=%s",
            request_id, reviewer_id,
        )
        raise HTTPException(status_code=500, detail="Failed to reject join request")


def get_project_members(project_id: UUID) -> list:
    """
    Get all members of a project
    
    Args:
        project_id: Project unique identifier
        
    Returns:
        List of member dictionaries with user info
        
    Raises:
        HTTPException: If project not found or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        # Verify the project exists
        project_result = client.table('projects').select('id').eq('id', str(project_id)).execute()
        if not project_result.data or len(project_result.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get project members with user info
        members = client.table('project_members').select(
            'user_id, role, created_at'
        ).eq('project_id', str(project_id)).execute()
        
        if not members.data or len(members.data) == 0:
            return []
        
        # Fetch user details
        user_ids = [m['user_id'] for m in members.data]
        users = client.table('profiles').select('id, email, role').in_('id', user_ids).execute()
        
        # Combine member and user data
        user_map = {u['id']: u for u in users.data} if users.data else {}
        
        result = []
        for member in members.data:
            user_info = user_map.get(member['user_id'], {})
            result.append({
                "user_id": member['user_id'],
                "email": user_info.get('email'),
                "user_role": user_info.get('role'),
                "project_role": member['role'],
                "joined_at": member['created_at']
            })
        
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching project members | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch project members")


def get_pending_join_requests(project_id: UUID, reviewer_id: str) -> list:
    """
    Get all pending join requests for a project (owner/admin only)
    
    Args:
        project_id: Project unique identifier
        reviewer_id: ID of the user requesting the list
        
    Returns:
        List of pending join requests
        
    Raises:
        HTTPException: If no permission or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        # Verify the reviewer is a product owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', str(project_id)
        ).eq('user_id', reviewer_id).execute()
        
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'product owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only product owners and admins can view join requests")
        
        # Get pending requests
        requests = client.table('project_join_requests').select(
            'id, user_id, created_at, request_status'
        ).eq('project_id', str(project_id)).eq('request_status', 'pending').execute()
        
        if not requests.data or len(requests.data) == 0:
            return []
        
        # Fetch user details
        user_ids = [r['user_id'] for r in requests.data]
        users = client.table('profiles').select('id, email, role').in_('id', user_ids).execute()
        
        # Combine request and user data
        user_map = {u['id']: u for u in users.data} if users.data else {}
        
        result = []
        for request in requests.data:
            user_info = user_map.get(request['user_id'], {})
            result.append({
                "request_id": request['id'],
                "user_id": request['user_id'],
                "email": user_info.get('email'),
                "user_role": user_info.get('role'),
                "requested_at": request.get('created_at'),
                "status": request['request_status']
            })
        
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching join requests | project_id=%s reviewer_id=%s",
            project_id, reviewer_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch join requests")

def instructor_add_member(project_id:UUID, requester_id:str, target_user_id:str, role = "member"):
    """
    Add member to project (instructor only)

    Args:
        project_id: Project unique identifier
        requester_id: ID of instructor requesting this
        target_user_id: ID of user to add
        role: role of newly added user

    Returns:
        Dict of successful request

    Raises:
        HTTPException: If no permission or database error occurs
    """
    logger.debug(
        "instructor_add_member called | project_id=%s requester=%s target=%s role=%r",
        project_id, requester_id, target_user_id, role,
    )
    try:
        client = service_client if service_client else supabase

        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            # NOTE: returning False here is a contract mismatch — the view layer
            # expects a dict. Tracked in CODE_REVIEW.md #17.
            logger.warning(
                "instructor_add_member: project not found | project_id=%s", project_id
            )
            return False

        class_id = class_result.data[0]['class_id']
        # check is user is teacher of the class
        if not _is_instructor(requester_id, class_id):
            logger.warning(
                "instructor_add_member: forbidden (not class instructor) | "
                "requester=%s class_id=%s project_id=%s",
                requester_id, class_id, project_id,
            )
            raise HTTPException(status_code=403, detail="Not the instructor of this project")

        # WARN: This membership check is NOT scoped to project_id — it returns true
        # if the target user is a member of ANY project. See CODE_REVIEW.md #BUG-1.
        # If you see the "update role" branch fire for a user who was never in this
        # project, this is why.
        res = (client.table('project_members').select('user_id')
            .eq('user_id', target_user_id)
            .execute()
        )
        logger.debug(
            "instructor_add_member: pre-check membership rows=%d (NOT scoped to project — BUG)",
            len(res.data) if res.data else 0,
        )

        if len(res.data) > 0: # update role if already in project
            # WARN: This update targets `requester_id` (the instructor), not
            # `target_user_id`. The instructor's own role gets overwritten.
            # See CODE_REVIEW.md #BUG-2 and the walkthrough in chat.
            logger.warning(
                "instructor_add_member: ROLE UPDATE path firing — BUG: updates "
                "requester (%s) instead of target (%s) | project_id=%s new_role=%r",
                requester_id, target_user_id, project_id, role,
            )
            response = (client.table("project_members")
                .update({"role": role})
                .eq("user_id", requester_id).eq("project_id", str(project_id))
                .execute()
            )

            #only one scrum master or owner, set old one as member
            if role in ["scrum master", "owner"]:
                # WARN: Same bug — this demotes everyone EXCEPT the requester,
                # not everyone except the actual new holder of the role.
                logger.warning(
                    "instructor_add_member: demoting old %s holders (excluding requester, "
                    "should exclude target) | project_id=%s",
                    role, project_id,
                )
                (client.table("project_members")
                    .update({"role": "member"})
                    .neq("user_id", requester_id).eq("project_id", str(project_id)).eq("role", role)
                    .execute()
                )
            logger.info(
                "Changed roles (BUG path) | project_id=%s affected_rows=%d role=%r",
                project_id, len(response.data) if response.data else 0, role,
            )
            return {
                "message": "Changed roles successfully",
                "member": requester_id,
                "role": role
            }
        else: # otherwise add user as project member
            member_data = {
                "project_id": str(project_id),
                "user_id": str(target_user_id),
                "role": role
            }

            client.table('project_members').insert(member_data).execute()

            # Increment num_members on the project
            _increment_project_num_members(client, str(project_id), 1)

            logger.info(
                "Member added | project_id=%s user_id=%s role=%r added_by=%s",
                project_id, target_user_id, role, requester_id,
            )
            return {
                "message": "Added member successfully",
                "user_id": target_user_id,
                "role": role
            }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error in instructor_add_member | project_id=%s requester=%s target=%s role=%r",
            project_id, requester_id, target_user_id, role,
        )
        raise HTTPException(status_code=500, detail="Failed to update member")

def instructor_remove_member(project_id:UUID, requester_id:str, target_user_id:str):
    """
    Remove member from project (instructor only)

    Args:
        project_id: Project unique identifier
        requester_id: ID of instructor requesting this
        target_user_id: ID of user to remove

    Returns:
        Dict of successful request
    Raises:
        HTTPException: If no permission or database error occurs
    """
    logger.debug(
        "instructor_remove_member called | project_id=%s requester=%s target=%s",
        project_id, requester_id, target_user_id,
    )
    try:
        client = service_client if service_client else supabase
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            logger.warning(
                "instructor_remove_member: project not found | project_id=%s", project_id
            )
            return False
        class_id = class_result.data[0]['class_id']
        # check is user is teacher of the class
        if not _is_instructor(requester_id, class_id):
            logger.warning(
                "instructor_remove_member: forbidden (not class instructor) | "
                "requester=%s class_id=%s",
                requester_id, class_id,
            )
            raise HTTPException(status_code=403, detail="Not the instructor of this project")
        # WARN: This requires the instructor to ALSO hold the 'owner' project_member
        # role, which is almost never true. Instructors who own the class can't
        # remove members unless they're also project owners. See CODE_REVIEW.md #18.
        membership = (
            client.table('project_members').select('role')
            .eq('project_id', str(project_id)).eq('user_id', str(requester_id))
            .execute()
        )
        if not membership.data or membership.data[0].get('role') != 'owner':
            logger.warning(
                "instructor_remove_member: forbidden (class instructor lacks 'owner' "
                "project_member row) | requester=%s project_id=%s has_row=%s",
                requester_id, project_id, bool(membership.data),
            )
            raise HTTPException(status_code=403, detail="Not the owner of this project")
        # Remove user as project member
        delete_result = (client.table('project_members').delete()
            .eq('project_id', str(project_id)).eq('user_id', str(target_user_id))
            .execute()
        )
        # Decrement num_members on the project
        _increment_project_num_members(client, str(project_id), -1)
        logger.info(
            "Member removed | project_id=%s user_id=%s removed_by=%s deleted_rows=%d",
            project_id, target_user_id, requester_id,
            len(delete_result.data) if delete_result.data else 0,
        )
        return {
            "message": "Removed member successfully",
            "user_id": target_user_id
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error removing member | project_id=%s requester=%s target=%s",
            project_id, requester_id, target_user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to remove member")

