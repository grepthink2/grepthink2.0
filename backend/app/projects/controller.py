"""
Project management business logic
"""
from datetime import datetime, timezone
import logging
from typing import Iterable, List, Optional
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.auth.controller import get_user_role
from app.database.client import (
    query_pool,
    retry_on_disconnect,
    service_client,
    supabase,
)


# Project member roles. Keep in sync with the DB CHECK constraint on project_members.role.
ROLE_OWNER = "owner"
ROLE_PRODUCT_OWNER = "product owner"
ROLE_ADMIN = "admin"
ROLE_SCRUM_MASTER = "scrum master"
ROLE_MEMBER = "member"

# The "elevated" set used by most write actions on a project.
ELEVATED_ROLES = (ROLE_OWNER, ROLE_PRODUCT_OWNER, ROLE_ADMIN)


def _require_member_role(
    client,
    project_id: str,
    user_id: str,
    allowed_roles: Iterable[str],
    *,
    forbidden_detail: str,
) -> str:
    """Verify caller is a project member with one of `allowed_roles`. Returns the role.

    Raises 403 if not a member or if the member's role isn't in the allowed set.
    """
    membership = (
        client.table('project_members').select('role')
        .eq('project_id', project_id).eq('user_id', user_id)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    role = membership.data[0]['role']
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail=forbidden_detail)
    return role

logger = logging.getLogger(__name__)


# Transient Supabase HTTP/2 errors. We let these propagate from controllers
# that are decorated with ``@retry_on_disconnect`` so the retry can fire;
# everything else still maps to HTTPException(500).
_TRANSIENT_HTTPX_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.ReadTimeout,
)


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
        cid = str(class_id)

        # Fan out the two independent verifications. The enrollment lookup
        # is only needed for non-instructors but it's a cheap select on an
        # indexed pair (``class_id``, ``user_id``); pre-fetching it in
        # parallel removes a sequential round-trip from the student create
        # path without measurably hurting the instructor path.
        class_future = query_pool.submit(
            lambda: client.table('classes')
            .select('id, created_by')
            .eq('id', cid)
            .execute()
        )
        enrollment_future = query_pool.submit(
            lambda: client.table('class_enrollments')
            .select('id')
            .eq('class_id', cid)
            .eq('user_id', user_id)
            .execute()
        )
        # ``get_user_role`` is itself in-process cached, so this is usually
        # a memory hit. Calling it directly (rather than via the executor)
        # keeps the cache check off the worker thread.
        user_role = get_user_role(user_id)

        class_result = class_future.result()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")

        class_row = class_result.data[0]

        is_instructor = user_role == 'instructor' and class_row.get('created_by') == user_id

        if not is_instructor:
            if user_role != 'student':
                raise HTTPException(
                    status_code=403,
                    detail="Only the class instructor or enrolled students can create projects"
                )
            enrollment = enrollment_future.result()
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


@retry_on_disconnect()
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
            _require_member_role(
                client, str(project_id), user_id, ELEVATED_ROLES,
                forbidden_detail="Only product owners, admins, or class instructors can update the project",
            )

        updates: dict = {}
        if team_size is not None:
            updates['team_size'] = team_size
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
    except _TRANSIENT_HTTPX_ERRORS:
        # Bubble to @retry_on_disconnect; if the retry also fails the
        # decorator re-raises and the framework returns 500.
        raise
    except Exception:
        logger.exception(
            "Error updating project | project_id=%s user_id=%s", project_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to update project")


def _delete_project_dependencies(client, project_id: str) -> None:
    """Remove rows that reference a project before deleting the project itself."""
    pid = str(project_id)
    client.table('interest_form').delete().eq('project_id', pid).execute()
    client.table('TSRs').delete().eq('project_id', pid).execute()
    client.table('project_join_requests').delete().eq('project_id', pid).execute()
    client.table('project_members').delete().eq('project_id', pid).execute()


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

        if not _is_instructor(user_id, class_id):
            # Note: 'owner' is intentionally excluded from delete authority.
            _require_member_role(
                client, str(project_id), user_id, (ROLE_PRODUCT_OWNER, ROLE_ADMIN),
                forbidden_detail="Only product owners, admins, or the class instructor can delete this project",
            )

        _delete_project_dependencies(client, str(project_id))
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


def _assert_can_review_student_join_request(client, reviewer_id: str, project_id: str) -> None:
    """
    Permission to list / accept / reject **student-initiated** join requests
    (``project_join_requests`` with ``invited_by`` unset).

    Allowed: **class instructor** (``classes.created_by``) for the project's class, or
    a **project member** with role ``owner``, ``product owner``, or ``admin``.
    """
    proj = client.table('projects').select('class_id').eq('id', str(project_id)).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")
    class_id = proj.data[0]['class_id']
    if _is_instructor(reviewer_id, class_id):
        return
    mem = (
        client.table('project_members')
        .select('role')
        .eq('project_id', str(project_id))
        .eq('user_id', str(reviewer_id))
        .execute()
    )
    if not mem.data or mem.data[0].get('role') not in ('owner', 'product owner', 'admin'):
        raise HTTPException(
            status_code=403,
            detail="Only the class instructor or project owners/admins can review join requests",
        )


def _notify_product_owners_of_departure(
    client,
    leaving_user_id: str,
    old_project_id: str,
    old_project_name: str,
    new_project_name: str,
) -> None:
    """
    Send a notification message from the leaving user to each product owner
    of the project they just left. Failures are non-fatal and only logged.
    """
    po_rows = (
        client.table('project_members')
        .select('user_id')
        .eq('project_id', old_project_id)
        .eq('role', 'product owner')
        .neq('user_id', leaving_user_id)
        .execute()
    )
    po_ids = [r['user_id'] for r in (po_rows.data or [])]
    if not po_ids:
        logger.info(
            "departure_notify: no product owner to notify | old_project=%s leaver=%s",
            old_project_id, leaving_user_id,
        )
        return

    profile_res = (
        client.table('profiles')
        .select('first_name, last_name, email')
        .eq('id', leaving_user_id)
        .maybe_single()
        .execute()
    )
    up = profile_res.data if profile_res else None
    if up:
        user_name = f"{up.get('first_name') or ''} {up.get('last_name') or ''}".strip() or up.get('email', 'A student')
    else:
        user_name = 'A student'

    body = (
        f"{user_name} has left \"{old_project_name}\" and submitted a join request "
        f"for \"{new_project_name}\"."
    )

    from app.messages.controller import send_message  # local import — avoids circular dep
    for po_id in po_ids:
        try:
            send_message(sender_id=leaving_user_id, to_user_id=po_id, body=body)
            logger.info(
                "departure_notify: message sent | from=%s to=%s old_project=%s",
                leaving_user_id, po_id, old_project_id,
            )
        except Exception:
            logger.warning(
                "departure_notify: failed to notify PO (non-fatal) | from=%s to=%s",
                leaving_user_id, po_id,
            )


def _leave_current_project_in_class(
    client,
    user_id: str,
    target_project_id: str,
    class_id: str,
    new_project_name: str,
) -> None:
    """
    If the user is already a member of any project in *class_id* (other than
    *target_project_id*), remove them from that project and notify its product
    owner(s).  Only the first membership found is acted on — a student should
    only ever be in one project per class.
    """
    # Fetch every project in this class except the one they're requesting to join.
    sibling_res = (
        client.table('projects')
        .select('id, name')
        .eq('class_id', str(class_id))
        .neq('id', str(target_project_id))
        .execute()
    )
    sibling_projects = sibling_res.data or []
    if not sibling_projects:
        return

    sibling_ids = [p['id'] for p in sibling_projects]
    sibling_name = {p['id']: p.get('name', 'Unknown project') for p in sibling_projects}

    membership_res = (
        client.table('project_members')
        .select('project_id')
        .eq('user_id', user_id)
        .in_('project_id', sibling_ids)
        .execute()
    )
    memberships = membership_res.data or []
    if not memberships:
        return

    for m in memberships:
        old_pid = m['project_id']
        old_name = sibling_name.get(old_pid, 'Unknown project')

        # Remove from old project
        client.table('project_members').delete().eq(
            'project_id', old_pid
        ).eq('user_id', user_id).execute()
        _increment_project_num_members(client, old_pid, -1)

        logger.info(
            "Auto-removed user from previous project | user=%s old_project=%s new_project=%s",
            user_id, old_pid, target_project_id,
        )

        # Notify product owner(s) of the old project
        _notify_product_owners_of_departure(
            client,
            leaving_user_id=user_id,
            old_project_id=old_pid,
            old_project_name=old_name,
            new_project_name=new_project_name,
        )


def request_to_join_project(project_id: UUID, user_id: str) -> dict:
    """
    Create a request to join a project.

    Before creating the request the function checks whether the user is already
    a member of any other project in the **same class**.  If so, they are
    automatically removed from that project and the project's product owner(s)
    receive a notification message.

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

        # Verify the project exists; fetch class_id for the cross-project check below
        project_result = (
            client.table('projects')
            .select('id, name, class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        project = project_result.data[0]
        class_id = project.get('class_id')
        new_project_name = project.get('name', 'the new project')

        # Check if user is already a member of THIS project
        existing_member = client.table('project_members').select('id').eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).execute()

        if existing_member.data:
            raise HTTPException(status_code=400, detail="Already a member of this project")

        # Auto-leave any other project the user is in within the same class and
        # notify that project's product owner(s).
        if class_id:
            _leave_current_project_in_class(
                client,
                user_id=user_id,
                target_project_id=str(project_id),
                class_id=str(class_id),
                new_project_name=new_project_name,
            )

        # Check if there's already a pending row (student request or team invite)
        existing_request = client.table('project_join_requests').select(
            'id, request_status, invited_by'
        ).eq(
            'project_id', str(project_id)
        ).eq('user_id', user_id).eq('request_status', 'pending').execute()

        for row in existing_request.data or []:
            if row.get('invited_by'):
                raise HTTPException(
                    status_code=400,
                    detail="You have a pending invitation to this project. Accept or decline it first.",
                )
            raise HTTPException(status_code=400, detail="Join request already pending")

        # Create the join request (student-initiated; invited_by stays null)
        request_data = {
            "project_id": str(project_id),
            "user_id": user_id,
            "request_status": "pending",
            "reviewer_id": None,
            "reviewed_at": None,
            "invited_by": None,
        }

        result = client.table('project_join_requests').insert(request_data).execute()

        logger.info(
            "Join request created | project_id=%s user_id=%s request_id=%s",
            project_id, user_id, result.data[0].get('id') if result.data else None,
        )
        return {
            "message": "Join request submitted successfully",
            "request": result.data[0],
            "project": project,
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
    Accept a pending project_join_requests row.

    - **Student-initiated** (``invited_by`` null): **class instructor** or project
      **owner** / **product owner** / **admin** may accept.
    - **Team invite** (``invited_by`` set): only the invitee (``user_id`` on the row) may accept.
    """
    try:
        client = service_client if service_client else supabase
        
        # Get the join request
        request_result = client.table('project_join_requests').select(
            'id, project_id, user_id, request_status, invited_by'
        ).eq('id', str(request_id)).execute()
        
        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")
        
        join_request = request_result.data[0]
        
        # Check if request is still pending
        if join_request['request_status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Request already {join_request['request_status']}")

        invited_by = join_request.get('invited_by')

        if invited_by:
            if str(reviewer_id) != str(join_request['user_id']):
                raise HTTPException(
                    status_code=403,
                    detail="Only the invited user can accept this invitation",
                )
        else:
            _assert_can_review_student_join_request(
                client, reviewer_id, join_request['project_id']
            )
        
        # WARN: The next 3 statements are NOT atomic (see CODE_REVIEW.md #10).
        # If any one of them fails after the first succeeds we get an inconsistent
        # state (approved request with no membership row, or member without
        # num_members increment). Trace via these DEBUG logs to triage.
        logger.debug(
            "accept_join_request: begin multi-step commit | request_id=%s project_id=%s user_id=%s invited_by=%s",
            request_id, join_request['project_id'], join_request['user_id'], invited_by,
        )

        # Safety net: if the joining user is still in another project in the same
        # class (e.g. they were added directly after submitting this request),
        # auto-remove them and notify that project's product owner before we add
        # them to the new project.
        project_res = client.table('projects').select('class_id, name').eq(
            'id', join_request['project_id']
        ).maybe_single().execute()
        if project_res and project_res.data:
            class_id = project_res.data.get('class_id')
            new_project_name = project_res.data.get('name', 'the new project')
            if class_id:
                _leave_current_project_in_class(
                    client,
                    user_id=join_request['user_id'],
                    target_project_id=join_request['project_id'],
                    class_id=str(class_id),
                    new_project_name=new_project_name,
                )

        # Update the request status
        update_data = {
            "request_status": "approved",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "reviewer_id": reviewer_id,
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
    Reject a pending project_join_requests row.

    - **Student-initiated**: **class instructor** or project **owner** / **product owner** / **admin**.
    - **Team invite**: only the invitee may decline.
    """
    try:
        client = service_client if service_client else supabase
        
        # Get the join request
        request_result = client.table('project_join_requests').select(
            'id, project_id, user_id, request_status, invited_by'
        ).eq('id', str(request_id)).execute()
        
        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")
        
        join_request = request_result.data[0]
        
        # Check if request is still pending
        if join_request['request_status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Request already {join_request['request_status']}")

        invited_by = join_request.get('invited_by')

        if invited_by:
            if str(reviewer_id) != str(join_request['user_id']):
                raise HTTPException(
                    status_code=403,
                    detail="Only the invited user can decline this invitation",
                )
        else:
            _assert_can_review_student_join_request(
                client, reviewer_id, join_request['project_id']
            )
        
        # Update the request status
        update_data = {
            "request_status": "rejected",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
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


# ---------------------------------------------------------------------------
# Product owner / scrum master / admin role management
# ---------------------------------------------------------------------------


def _pm_client():
    return service_client if service_client else supabase


def _require_project_role_manager(client, requester_id: str, project_id: str) -> None:
    """Allow class instructor or project member with product owner / admin / owner."""
    proj = client.table('projects').select('class_id').eq('id', project_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")
    class_id = proj.data[0]['class_id']
    if _is_instructor(requester_id, class_id):
        return
    mem = (
        client.table('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', str(requester_id))
        .execute()
    )
    if not mem.data:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    role = mem.data[0].get('role')
    if role in ('product owner', 'admin', 'owner'):
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions to manage project roles")


def _member_row(client, project_id: str, user_id: str):
    return (
        client.table('project_members')
        .select('user_id, role')
        .eq('project_id', project_id)
        .eq('user_id', str(user_id))
        .execute()
    )


def assign_product_owner(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    try:
        client = _pm_client()
        pid = str(project_id)
        tid = str(target_user_id)
        proj = client.table('projects').select('id').eq('id', pid).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        _require_project_role_manager(client, requester_id, pid)
        targ = _member_row(client, pid, tid)
        if not targ.data:
            raise HTTPException(status_code=404, detail="User is not a member of this project")
        rows = (
            client.table('project_members')
            .select('user_id')
            .eq('project_id', pid)
            .eq('role', 'product owner')
            .execute()
        ).data or []
        for row in rows:
            uid = row['user_id']
            if uid != tid:
                client.table('project_members').update({'role': 'member'}).eq('project_id', pid).eq('user_id', uid).execute()
        client.table('project_members').update({'role': 'product owner'}).eq('project_id', pid).eq('user_id', tid).execute()
        return {'role': 'product owner', 'user_id': tid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning product owner: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to assign product owner: {str(e)}")


def assign_scrum_master(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    try:
        client = _pm_client()
        pid = str(project_id)
        tid = str(target_user_id)
        proj = client.table('projects').select('id').eq('id', pid).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        _require_project_role_manager(client, requester_id, pid)
        targ = _member_row(client, pid, tid)
        if not targ.data:
            raise HTTPException(status_code=404, detail="User is not a member of this project")
        rows = (
            client.table('project_members')
            .select('user_id')
            .eq('project_id', pid)
            .eq('role', 'scrum master')
            .execute()
        ).data or []
        for row in rows:
            uid = row['user_id']
            if uid != tid:
                client.table('project_members').update({'role': 'member'}).eq('project_id', pid).eq('user_id', uid).execute()
        client.table('project_members').update({'role': 'scrum master'}).eq('project_id', pid).eq('user_id', tid).execute()
        return {'role': 'scrum master', 'user_id': tid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning scrum master: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to assign scrum master: {str(e)}")


def assign_admin(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    try:
        client = _pm_client()
        pid = str(project_id)
        tid = str(target_user_id)
        proj = client.table('projects').select('id').eq('id', pid).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        _require_project_role_manager(client, requester_id, pid)
        targ = _member_row(client, pid, tid)
        if not targ.data:
            raise HTTPException(status_code=404, detail="User is not a member of this project")
        client.table('project_members').update({'role': 'admin'}).eq('project_id', pid).eq('user_id', tid).execute()
        return {'role': 'admin', 'user_id': tid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning admin: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to assign admin: {str(e)}")


def remove_product_owner(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    try:
        client = _pm_client()
        pid = str(project_id)
        tid = str(target_user_id)
        proj = client.table('projects').select('id').eq('id', pid).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        _require_project_role_manager(client, requester_id, pid)
        targ = _member_row(client, pid, tid)
        if not targ.data:
            raise HTTPException(status_code=404, detail="User is not a member of this project")
        if targ.data[0].get('role') != 'product owner':
            raise HTTPException(
                status_code=400,
                detail="Target user is not the product owner; cannot remove product owner role this way",
            )
        client.table('project_members').update({'role': 'member'}).eq('project_id', pid).eq('user_id', tid).execute()
        return {'role': 'member', 'user_id': tid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing product owner: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove product owner: {str(e)}")


def remove_scrum_master(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    try:
        client = _pm_client()
        pid = str(project_id)
        tid = str(target_user_id)
        proj = client.table('projects').select('id').eq('id', pid).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        _require_project_role_manager(client, requester_id, pid)
        targ = _member_row(client, pid, tid)
        if not targ.data:
            raise HTTPException(status_code=404, detail="User is not a member of this project")
        if targ.data[0].get('role') != 'scrum master':
            raise HTTPException(
                status_code=400,
                detail="Target user is not the scrum master; cannot remove scrum master role this way",
            )
        client.table('project_members').update({'role': 'member'}).eq('project_id', pid).eq('user_id', tid).execute()
        return {'role': 'member', 'user_id': tid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing scrum master: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove scrum master: {str(e)}")


def remove_admin(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    try:
        client = _pm_client()
        pid = str(project_id)
        tid = str(target_user_id)
        proj = client.table('projects').select('id').eq('id', pid).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        _require_project_role_manager(client, requester_id, pid)
        targ = _member_row(client, pid, tid)
        if not targ.data:
            raise HTTPException(status_code=404, detail="User is not a member of this project")
        if targ.data[0].get('role') != 'admin':
            raise HTTPException(
                status_code=400,
                detail="Target user is not an admin; cannot remove admin role this way",
            )
        client.table('project_members').update({'role': 'member'}).eq('project_id', pid).eq('user_id', tid).execute()
        return {'role': 'member', 'user_id': tid}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing admin: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove admin: {str(e)}")


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
        users = client.table('profiles').select(
            'id, email, role, first_name, last_name, linkedin, github, image_url'
        ).in_('id', user_ids).execute()
        
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
                "joined_at": member['created_at'],
                "first_name": user_info.get('first_name'),
                "last_name": user_info.get('last_name'),
                "linkedin": user_info.get('linkedin'),
                "github": user_info.get('github'),
                "image_url": user_info.get('image_url'),
            })
        
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching project members | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch project members")


def get_pending_team_invites_for_user(user_id: str, class_id: UUID) -> list:
    """
    Pending team invitations addressed to ``user_id`` within a class.

    Each item matches the join-requests list shape (plus ``project_id`` / ``project_name``)
    so the client can reuse the same UI. ``email`` / ``user_role`` refer to the **inviter**.
    """
    try:
        client = service_client if service_client else supabase

        class_result = client.table('classes').select('id, created_by').eq('id', str(class_id)).execute()
        if not class_result.data:
            raise HTTPException(status_code=404, detail="Class not found")

        class_row = class_result.data[0]
        has_access = class_row.get('created_by') == user_id
        if not has_access:
            enrollment = (
                client.table('class_enrollments').select('id')
                .eq('class_id', str(class_id)).eq('user_id', user_id).execute()
            )
            has_access = bool(enrollment.data)

        if not has_access:
            raise HTTPException(status_code=403, detail="You do not have access to this class")

        projects_res = (
            client.table('projects').select('id, name').eq('class_id', str(class_id)).execute()
        )
        projects = projects_res.data or []
        project_ids = [p['id'] for p in projects]
        if not project_ids:
            return []

        project_name = {p['id']: p.get('name') for p in projects}

        rows = (
            client.table('project_join_requests').select(
                'id, user_id, project_id, created_at, request_status, invited_by'
            )
            .eq('user_id', user_id)
            .eq('request_status', 'pending')
            .in_('project_id', project_ids)
            .execute()
        )
        invites = [r for r in (rows.data or []) if r.get('invited_by')]
        if not invites:
            return []

        inviter_ids = list({str(r['invited_by']) for r in invites})
        users = client.table('profiles').select('id, email, role').in_('id', inviter_ids).execute()
        user_map = {u['id']: u for u in (users.data or [])}

        result = []
        for row in invites:
            inviter = user_map.get(row['invited_by'], {})
            result.append({
                "request_id": row['id'],
                "user_id": row['user_id'],
                "email": inviter.get('email'),
                "user_role": inviter.get('role'),
                "requested_at": row.get('created_at'),
                "status": row['request_status'],
                "project_id": str(row['project_id']),
                "project_name": project_name.get(row['project_id']),
            })
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching team invites | user_id=%s class_id=%s", user_id, class_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch pending invitations")


def get_pending_join_requests(project_id: UUID, reviewer_id: str) -> list:
    """
    Pending **student-initiated** join requests for a project (``invited_by`` is null).

    Caller must be the **class instructor** or a project **owner** / **product owner** / **admin**.
    """
    try:
        client = service_client if service_client else supabase

        _assert_can_review_student_join_request(client, reviewer_id, str(project_id))

        # Pending student-initiated requests only (team invites omit invited_by)
        requests = client.table('project_join_requests').select(
            'id, user_id, created_at, request_status, invited_by'
        ).eq('project_id', str(project_id)).eq('request_status', 'pending').execute()

        student_requests = [r for r in (requests.data or []) if not r.get('invited_by')]

        if not student_requests:
            return []

        # Fetch user details (requesters)
        user_ids = [r['user_id'] for r in student_requests]
        users = client.table('profiles').select('id, email, role').in_('id', user_ids).execute()
        
        # Combine request and user data
        user_map = {u['id']: u for u in users.data} if users.data else {}
        
        result = []
        for request in student_requests:
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
    Add or promote a project member.

    - **Class instructor**: always adds ``role`` immediately (used for staffing / roster).
    - **Owner / product owner / admin** (not the class instructor): adding ``member``
      creates a **pending team invitation**; the user must accept via the same
      accept-request endpoint used for join requests.

    Args:
        project_id: Project unique identifier
        requester_id: ID of user performing the add (instructor or elevated project role)
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
            raise HTTPException(status_code=404, detail="Project not found")

        class_id = class_result.data[0]['class_id']
        # Allow class instructor OR project product owner / admin / owner
        is_instructor = _is_instructor(requester_id, class_id)
        if not is_instructor:
            membership = (
                client.table('project_members').select('role')
                .eq('project_id', str(project_id)).eq('user_id', str(requester_id))
                .execute()
            )
            if not membership.data or membership.data[0].get('role') not in ('product owner', 'admin', 'owner'):
                logger.warning(
                    "instructor_add_member: forbidden (not class instructor or elevated role) | "
                    "requester=%s class_id=%s project_id=%s",
                    requester_id, class_id, project_id,
                )
                raise HTTPException(
                    status_code=403,
                    detail="Only instructors, product owners, and admins can add members",
                )

        res = (client.table('project_members').select('user_id')
            .eq('project_id', str(project_id))
            .eq('user_id', target_user_id)
            .execute()
        )
        logger.debug(
            "instructor_add_member: pre-check membership rows=%d",
            len(res.data) if res.data else 0,
        )

        if len(res.data) > 0: # update role if already in project
            response = (client.table("project_members")
                .update({"role": role})
                .eq("user_id", target_user_id).eq("project_id", str(project_id))
                .execute()
            )

            #only one scrum master or owner, set old one as member
            if role in ["scrum master", "owner"]:
                (client.table("project_members")
                    .update({"role": "member"})
                    .neq("user_id", target_user_id).eq("project_id", str(project_id)).eq("role", role)
                    .execute()
                )
            logger.info(
                "Changed roles | project_id=%s affected_rows=%d role=%r",
                project_id, len(response.data) if response.data else 0, role,
            )
            return {
                "message": "Changed roles successfully",
                "member": target_user_id,
                "role": role
            }
        else: # not yet a member
            if role == "member" and not is_instructor:
                pending = (
                    client.table('project_join_requests').select('id, invited_by')
                    .eq('project_id', str(project_id))
                    .eq('user_id', str(target_user_id))
                    .eq('request_status', 'pending')
                    .execute()
                )
                for pr in pending.data or []:
                    if pr.get('invited_by'):
                        raise HTTPException(
                            status_code=400,
                            detail="This user already has a pending invitation to this project",
                        )
                    raise HTTPException(
                        status_code=400,
                        detail="This user already has a pending join request for this project",
                    )

                invite_row = {
                    "project_id": str(project_id),
                    "user_id": str(target_user_id),
                    "request_status": "pending",
                    "reviewer_id": None,
                    "reviewed_at": None,
                    "invited_by": str(requester_id),
                }
                ins = client.table('project_join_requests').insert(invite_row).execute()

                logger.info(
                    "Team invite created | project_id=%s invitee=%s invited_by=%s",
                    project_id, target_user_id, requester_id,
                )
                return {
                    "message": "Invitation sent; user must accept before joining",
                    "request": ins.data[0] if ins.data else None,
                    "user_id": str(target_user_id),
                    "role": role,
                }

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
        # Allow class instructor, or product owner/admin
        is_instructor = _is_instructor(requester_id, class_id)
        if not is_instructor:
            membership = (
                client.table('project_members').select('role')
                .eq('project_id', str(project_id)).eq('user_id', str(requester_id))
                .execute()
            )
            if not membership.data or membership.data[0].get('role') not in ('product owner', 'admin', 'owner'):
                raise HTTPException(status_code=403, detail="Not the instructor of this project")
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

