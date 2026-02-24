"""
Project management business logic
"""
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase


def create_project(
    class_id: UUID,
    name: str,
    description: str,
    user_id: str,
    team_size: int,
    looking_for_roles: Optional[List[str]] = None,
    skills: Optional[List[str]] = None,
) -> dict:
    """
    Create a new project within a class

    Args:
        class_id: Class unique identifier
        name: Project name
        description: Project description
        user_id: ID of the user creating the project
        team_size: Maximum team size
        looking_for_roles: Optional list of role names (stored as JSONB)
        skills: Optional list of skill names (stored as JSONB)

    Returns:
        Dictionary containing project data

    Raises:
        HTTPException: If class not found or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        # Verify the class exists
        class_result = client.table('classes').select('id').eq('id', str(class_id)).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")

        # Create the project (lists sent as JSON to DB for JSONB columns)
        project_data = {
            "class_id": str(class_id),
            "name": name,
            "description": description,
            "created_by": user_id,
            "team_size": team_size,
        }
        if looking_for_roles is not None:
            project_data["looking_for_roles"] = looking_for_roles
        if skills is not None:
            project_data["skills"] = skills

        result = client.table('projects').insert(project_data).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create project")
        
        project = result.data[0]
        
        # Automatically add creator as project member with 'product owner' role
        member_data = {
            "project_id": project['id'],
            "user_id": user_id,
            "role": "product owner"
        }
        client.table('project_members').insert(member_data).execute()
        
        return project
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


def update_project(project_id: UUID, user_id: str, team_size: int) -> dict:
    """
    Update a project (e.g. team_size). Caller must be project owner or admin.

    Args:
        project_id: Project unique identifier
        user_id: ID of the user making the update
        team_size: New team size

    Returns:
        Updated project dictionary

    Raises:
        HTTPException: If project not found, no permission, or database error
    """
    try:
        client = service_client if service_client else supabase

        # Verify the project exists
        project_result = client.table('projects').select('id').eq('id', str(project_id)).execute()
        if not project_result.data or len(project_result.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")

        # Verify the user is project owner or admin
        membership = client.table('project_members').select('role').eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).execute()
        if not membership.data or len(membership.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        role = membership.data[0]['role']
        if role not in ('product owner', 'owner', 'admin'):
            raise HTTPException(status_code=403, detail="Only project owners and admins can update the project")

        result = client.table('projects').update({"team_size": team_size}).eq('id', str(project_id)).execute()
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to update project")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update project: {str(e)}")


# Do we want to filter by class_id? potentially multiple functions for getting projects, depending on what view they are in??
def get_projects_for_user(user_id: str, class_id: UUID = None) -> list:
    """
    Get all projects for a user, optionally filtered by class
    
    Args:
        user_id: User's unique identifier
        class_id: Optional class ID to filter projects
        
    Returns:
        List of project dictionaries
        
    Raises:
        HTTPException: If database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        # Get projects where user is a member
        query = client.table('project_members').select(
            'project_id, role, projects ( id, name, description, class_id, created_by, created_at, team_size, looking_for_roles, skills )'
        ).eq('user_id', user_id)
        
        memberships = query.execute()
        
        if not memberships.data:
            return []
        
        projects = []
        for row in memberships.data:
            project = row.get('projects')
            if not project:
                continue
            
            # Filter by class_id if provided
            if class_id and project.get('class_id') != str(class_id):
                continue
            
            # Add user's role to project data
            project['user_role'] = row.get('role')
            projects.append(project)
        
        return projects
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
        existing_request = client.table('project_join_requests').select('id, status').eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).eq('status', 'pending').execute()
        
        if existing_request.data and len(existing_request.data) > 0:
            raise HTTPException(status_code=400, detail="Join request already pending")
        
        # Create the join request
        request_data = {
            "project_id": str(project_id),
            "user_id": user_id,
            "status": "pending"
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
            'id, project_id, user_id, status'
        ).eq('id', str(request_id)).execute()
        
        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")
        
        join_request = request_result.data[0]
        
        # Check if request is still pending
        if join_request['status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Request already {join_request['status']}")
        
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
            "status": "approved",
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
            'id, project_id, user_id, status'
        ).eq('id', str(request_id)).execute()
        
        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")
        
        join_request = request_result.data[0]
        
        # Check if request is still pending
        if join_request['status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Request already {join_request['status']}")
        
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
            "status": "rejected",
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
            'id, user_id, requested_at, status'
        ).eq('project_id', str(project_id)).eq('status', 'pending').execute()
        
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
                "requested_at": request['requested_at'],
                "status": request['status']
            })
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching join requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch join requests: {str(e)}")

def set_project_role(user_id: UUID, target_id: UUID, project_id: UUID, role: str):
    """
    Set the role of a given user (owner/admin only)
    
    Args:
        user_id: user unique indentifier
        target_id: target unique identifier
        project_id: Project unique identifier
        role: name of role to set to 
        
    Returns:
        Dictionary of success message
        
    Raises:
        HTTPException: If no permission or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        membership = client.table('project_members').select('role').eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).execute()
        
        reviewer_role = membership.data[0]['role']
        if reviewer_role not in ['owner', 'admin']:
            raise HTTPException(status_code=403, detail="Only project owners and admins can view join requests")

        # update user role
        response = (
            client.table("project_members")
            .update({"role": role})
            .eq("user_id", target_id).eq("project_id", project_id)
            .execute()
        )
        if response.data:
            return {
                "message": "Changed roles successfully",
                "member": target_id,
                "role": role
            }
        else:
            raise HTTPException(status_code=404, detail=f'Could not find project member')
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to review project join request: {str(e)}")
    