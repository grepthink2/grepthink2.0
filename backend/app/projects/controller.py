"""
Project management business logic
"""
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase


def _increment_project_num_members(client, project_id: str, delta: int) -> None:
    """Update projects.num_members by delta (+1 or -1)."""
    proj = client.table('projects').select('num_members').eq('id', project_id).execute()
    if not proj.data:
        return
    current = proj.data[0].get('num_members')
    if current is None:
        current = 0
    new_val = max(0, int(current) + delta)
    client.table('projects').update({'num_members': new_val}).eq('id', project_id).execute()

def _is_instructor(user_id, class_id):
    try:
        client = service_client if service_client else supabase
        classes_result = (
            client.table('classes').select('created_by')
            .eq('created_by', str(user_id)).eq('id', str(class_id))
            .execute()
        )
        return len(classes_result.data) > 0
    except Exception as e:
        print(f"Error checking if user is teacher: {e}")

def _is_admin(user_id, project_id):
    """Checks if user has admin privillges for a project"""
    try:
        client = service_client if service_client else supabase
                
        # check if you are the owner of the project
        enrollment_result = (
            client.table('project_members').select('user_id')
            .eq('user_id', str(user_id)).eq('role', "owner")
            .execute()
        )
        if enrollment_result.data:
            return True
        
        #fetch class_id
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            return False
        
        class_id = class_result.data[0]['class_id']
        # check is user is teacher of the class
        return _is_instructor(user_id, class_id)

    except Exception as e:
        print(f"Error checking if user is admin of project: {e}")

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

    Only instructors (teachers) who own the class are allowed to create projects.

    Args:
        class_id: Class unique identifier
        name: Project name
        description: Project description
        user_id: ID of the user creating the project
        team_size: Maximum team size
        looking_for_roles: Optional list of role names (stored as JSONB)
        skills: Optional list of skill names (stored as JSONB)
        sponsor_name: Optional sponsor contact name
        sponsor_company: Optional sponsor company/organization
        sponsor_email: Optional sponsor email
        sponsor_website: Optional sponsor website URL
        sponsor_description: Optional description of the sponsor

    Returns:
        Dictionary containing project data

    Raises:
        HTTPException: If class not found, user not instructor, or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        # Verify the class exists
        class_result = client.table('classes').select('id, created_by').eq('id', str(class_id)).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")

        # Enforce teacher-only project creation
        class_row = class_result.data[0]
        profile = client.table('profiles').select('role').eq('id', user_id).execute()
        user_role = profile.data[0].get('role') if profile.data else None
        if user_role != 'instructor' or class_row.get('created_by') != user_id:
            raise HTTPException(
                status_code=403,
                detail="Only the class instructor can create projects"
            )

        # Create the project (lists sent as JSON to DB for JSONB columns)
        # num_members = 0 because instructors create/manage projects but are not team members
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

        # Sponsor fields
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

        return project
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


def update_project(
    project_id: UUID,
    user_id: str,
    team_size: int | None = None,
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
    - Project owner or admin (project members with elevated roles)
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
                raise HTTPException(status_code=403, detail="Only project owners, admins, or class instructors can update the project")

        updates: dict = {}
        if team_size is not None:
            updates['team_size'] = team_size
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
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update project: {str(e)}")



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

        return [
            {
                'id': p['id'],
                'name': p.get('name'),
                'member_count': count_map.get(p['id'], 0),
            }
            for p in projects
        ]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching projects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")


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
    except Exception as e:
        print(f"Error fetching project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch project: {str(e)}")



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
        
        return {
            "message": "Join request submitted successfully",
            "request": result.data[0],
            "project": project
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create join request: {str(e)}")


def accept_join_request(request_id: UUID, reviewer_id: str) -> dict:
    """
    Accept a project join request (project owner/admin only)
    
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
        
        # Verify the reviewer is a project owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', join_request['project_id']
        ).eq('user_id', reviewer_id).execute()
        
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only project owners and admins can accept join requests")
        
        # Update the request status
        update_data = {
            "request_status": "approved",
            "reviewed_at": "now()",
            "reviewer_id": reviewer_id
        }
        
        client.table('project_join_requests').update(update_data).eq('id', str(request_id)).execute()
        
        # Add user as project member
        member_data = {
            "project_id": join_request['project_id'],
            "user_id": join_request['user_id'],
            "role": "member"
        }
        
        client.table('project_members').insert(member_data).execute()

        # Increment num_members on the project
        _increment_project_num_members(client, join_request['project_id'], 1)
        
        return {
            "message": "Join request accepted successfully",
            "user_id": join_request['user_id']
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error accepting join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to accept join request: {str(e)}")


def reject_join_request(request_id: UUID, reviewer_id: str) -> dict:
    """
    Reject a project join request (project owner/admin only)
    
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
        
        # Verify the reviewer is a project owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', join_request['project_id']
        ).eq('user_id', reviewer_id).execute()
        
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only project owners and admins can reject join requests")
        
        # Update the request status
        update_data = {
            "request_status": "rejected",
            "reviewed_at": "now()",
            "reviewer_id": reviewer_id
        }
        
        client.table('project_join_requests').update(update_data).eq('id', str(request_id)).execute()
        
        return {
            "message": "Join request rejected successfully",
            "user_id": join_request['user_id']
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error rejecting join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reject join request: {str(e)}")


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
    except Exception as e:
        print(f"Error fetching project members: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch project members: {str(e)}")


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
        
        # Verify the reviewer is a project owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', str(project_id)
        ).eq('user_id', reviewer_id).execute()
        
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only project owners and admins can view join requests")
        
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
    except Exception as e:
        print(f"Error fetching join requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch join requests: {str(e)}")

def admin_add_member(project_id:UUID, requester_id:str, target_user:str, role = "member"):
    """
    Add member to project (instructor or product owner only)
    
    Args:
        project_id: Project unique identifier
        requester_id: ID of user requesting this
        target_user: ID of user to add
        role: role of newly added user
        
    Returns:
        Dict of successful request
        
    Raises:
        HTTPException: If no permission or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        class_id = class_result.data[0]['class_id']
        # check if user is teacher or product owner of the class
        if not _is_admin(requester_id, class_id):
            raise HTTPException(status_code=403, detail="Not the instructor or product owner of this project")
        
        # Check if user is already a member of this project
        res = (client.table('project_members').select('user_id')
            .eq('user_id', target_user)
            .eq('project_id', str(project_id))
            .execute()
        )
        if len(res.data) > 0:  # update role if already in project
            response = (client.table("project_members")
                .update({"role": role})
                .eq("user_id", target_user)
                .eq("project_id", str(project_id))
                .execute()
            )

            # only one scrum master or owner, set old one as member
            if role in ["scrum master", "owner"]:
                (client.table("project_members")
                    .update({"role": "member"})
                    .neq("user_id", target_user)
                    .eq("project_id", str(project_id))
                    .eq("role", role)
                    .execute()
                )
            return {
                "message": "Changed roles successfully",
                "member": target_user,
                "role": role
            }
        else:  # otherwise add user as project member
            member_data = {
                "project_id": str(project_id),
                "user_id": target_user,
                "role": role
            }
            
            client.table('project_members').insert(member_data).execute()

            # Increment num_members on the project
            _increment_project_num_members(client, str(project_id), 1)
            
            return {
                "message": "Added member successfully",
                "user_id": target_user,
                "role": role
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error update member: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update member: {str(e)}")

def admin_remove_member(project_id:UUID, requester_id:str, target_user:str):
    """
    Remove member from project (instructor or product owner only)
    
    Args:
        project_id: Project unique identifier
        requester_id: ID of user requesting this
        target_user: ID of user to remove
        
    Returns:
        Dict of successful request
    Raises:
        HTTPException: If no permission or database error occurs
    """
    # block from removing self
    if requester_id == target_user:
        raise HTTPException(status_code=403, detail="Cannot remove self")
    try:
        
        client = service_client if service_client else supabase
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            raise HTTPException(status_code=404, detail="Project not found")
        class_id = class_result.data[0]['class_id']
        # check if user is teacher or product owner of the class
        if not _is_admin(requester_id, class_id):
            raise HTTPException(status_code=403, detail="Not the instructor or product owner of this project")
        # Remove user as project member
        delete_result = (client.table('project_members').delete()
            .eq('project_id', str(project_id)).eq('user_id', str(target_user))
            .execute()
        )
        if delete_result.data:
            # Decrement num_members on the project
            _increment_project_num_members(client, str(project_id), -1)
            return {
                "message": "Removed member successfully",
                "user_id": target_user
            }
        else:
            raise HTTPException(status_code=404, detail="User not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing member: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove member: {str(e)}")
