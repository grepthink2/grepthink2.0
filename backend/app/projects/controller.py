"""
Project management business logic
"""

import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.auth.controller import get_user_role
from app.core import authz
from app.core.db import fan_out, get_client
from app.database.client import (
    query_pool,
    retry_on_disconnect,
)
from app.utils.profiles import profile_display_name

# Project member roles. Keep in sync with the DB CHECK constraint on project_members.role.
ROLE_OWNER = "owner"
ROLE_PRODUCT_OWNER = "product owner"
ROLE_ADMIN = "admin"
ROLE_SCRUM_MASTER = "scrum master"
ROLE_MEMBER = "member"

# The "elevated" set used by most write actions on a project.
ELEVATED_ROLES = (ROLE_OWNER, ROLE_PRODUCT_OWNER, ROLE_ADMIN)

REVIEW_DENIED_DETAIL = "Only the class instructor or project owners/admins can review join requests"


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
        client.table("project_members")
        .select("role")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    role = membership.data[0]["role"]
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


def set_num_members(client, project_id: str, count: int) -> None:
    """Write ``projects.num_members`` for one project (one round trip)."""
    client.table("projects").update({"num_members": max(0, int(count))}).eq(
        "id", str(project_id)
    ).execute()


def recount_num_members(client, project_ids: Iterable[str]) -> dict[str, int]:
    """Derive ``num_members`` from the real ``project_members`` rows and write it.

    One read for all projects plus one update per project. Used after bulk
    membership changes; single-row paths that already hold the member list
    call :func:`_set_num_members` directly.
    """
    pids = [str(p) for p in dict.fromkeys(project_ids)]
    if not pids:
        return {}
    rows = (
        client.table("project_members").select("project_id").in_("project_id", pids).execute()
    ).data or []
    counts = dict.fromkeys(pids, 0)
    for r in rows:
        counts[str(r["project_id"])] = counts.get(str(r["project_id"]), 0) + 1
    for pid, n in counts.items():
        set_num_members(client, pid, n)
    return counts


def _increment_project_num_members(client, project_id: str, delta: int) -> None:
    """Resync ``projects.num_members`` after a membership change.

    Kept for callers outside this module. ``delta`` is informational: the
    value written is always the real row count, so a stray call (e.g. after a
    delete that removed nothing) can no longer drift the counter.
    """
    logger.debug("num_members resync | project_id=%s delta=%+d", project_id, delta)
    recount_num_members(client, [str(project_id)])


def _project_member_rows(client, project_id: str) -> list[dict]:
    """``user_id, role`` for every member of the project (one round trip)."""
    return (
        client.table("project_members")
        .select("user_id, role")
        .eq("project_id", str(project_id))
        .execute()
    ).data or []


def _class_owner(project: dict) -> str | None:
    """``classes.created_by`` from a project row loaded with the class embedded."""
    return ((project.get("classes") or {}).get("created_by")) if project else None


def _is_instructor(user_id, class_id) -> bool:
    """True iff ``user_id`` created ``class_id``. Errors propagate (no silent False)."""
    return authz.is_class_instructor(get_client(), user_id, class_id)


def create_project(
    class_id: UUID,
    name: str,
    description: str,
    user_id: str,
    team_size: int,
    looking_for_roles: list[str] | None = None,
    skills: list[str] | None = None,
    sponsor_name: str | None = None,
    sponsor_company: str | None = None,
    sponsor_email: str | None = None,
    sponsor_website: str | None = None,
    sponsor_description: str | None = None,
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
        client = get_client()
        cid = str(class_id)

        # Fan out the two independent verifications. The enrollment lookup
        # is only needed for non-instructors but it's a cheap select on an
        # indexed pair (``class_id``, ``user_id``); pre-fetching it in
        # parallel removes a sequential round-trip from the student create
        # path without measurably hurting the instructor path.
        class_future = query_pool.submit(
            lambda: client.table("classes").select("id, created_by").eq("id", cid).execute()
        )
        enrollment_future = query_pool.submit(
            lambda: (
                client.table("class_enrollments")
                .select("id")
                .eq("class_id", cid)
                .eq("user_id", user_id)
                .execute()
            )
        )
        # ``get_user_role`` is itself in-process cached, so this is usually
        # a memory hit. Calling it directly (rather than via the executor)
        # keeps the cache check off the worker thread.
        user_role = get_user_role(user_id)

        class_result = class_future.result()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")

        class_row = class_result.data[0]

        is_instructor = user_role == "instructor" and class_row.get("created_by") == user_id

        if not is_instructor:
            if user_role != "student":
                raise HTTPException(
                    status_code=403,
                    detail="Only the class instructor or enrolled students can create projects",
                )
            enrollment = enrollment_future.result()
            if not enrollment.data:
                raise HTTPException(
                    status_code=403, detail="You must be enrolled in the class to create a project"
                )

            existing_project = _get_student_project_in_class(client, user_id, cid)
            if existing_project:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f'You are already a member of "{existing_project["name"]}". '
                        "Leave your current project before creating a new one."
                    ),
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

        result = client.table("projects").insert(project_data).execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create project")

        project = result.data[0]

        # Students who create a project are automatically added as product owner
        if not is_instructor:
            client.table("project_members").insert(
                {
                    "project_id": project["id"],
                    "user_id": user_id,
                    "role": "product owner",
                }
            ).execute()
            _increment_project_num_members(client, project["id"], 1)

            instructor_id = class_row.get("created_by")
            if instructor_id and instructor_id != user_id:
                from app.notifications.controller import notify_project_created_by_student

                notify_project_created_by_student(
                    instructor_id=instructor_id,
                    student_id=user_id,
                    project_id=project["id"],
                    project_name=name,
                )

        logger.info(
            "Project created | project_id=%s name=%r class_id=%s created_by=%s is_instructor=%s",
            project.get("id"),
            name,
            class_id,
            user_id,
            is_instructor,
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
    image_url: str | None = None,
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
    all_none = all(
        v is None
        for v in [
            team_size,
            name,
            description,
            image_url,
            sponsor_name,
            sponsor_company,
            sponsor_email,
            sponsor_website,
            sponsor_description,
        ]
    )
    if all_none:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")

    try:
        client = get_client()

        project_result = (
            client.table("projects").select("id, class_id").eq("id", str(project_id)).execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        class_id = project_result.data[0].get("class_id")

        # Check if the user is an instructor who owns the class
        is_class_instructor = False
        if class_id:
            profile = client.table("profiles").select("role").eq("id", user_id).execute()
            user_role = profile.data[0].get("role") if profile.data else None
            if user_role == "instructor":
                class_check = (
                    client.table("classes")
                    .select("id")
                    .eq("id", str(class_id))
                    .eq("created_by", user_id)
                    .execute()
                )
                is_class_instructor = bool(class_check.data)

        if not is_class_instructor:
            _require_member_role(
                client,
                str(project_id),
                user_id,
                ELEVATED_ROLES,
                forbidden_detail="Only product owners, admins, or class instructors can update the project",
            )

        updates: dict = {}
        if team_size is not None:
            updates["team_size"] = team_size
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if image_url is not None:
            updates["image_url"] = image_url or None
        if sponsor_name is not None:
            updates["sponsor_name"] = sponsor_name
        if sponsor_company is not None:
            updates["sponsor_company"] = sponsor_company
        if sponsor_email is not None:
            updates["sponsor_email"] = sponsor_email
        if sponsor_website is not None:
            updates["sponsor_website"] = sponsor_website
        if sponsor_description is not None:
            updates["sponsor_description"] = sponsor_description

        result = client.table("projects").update(updates).eq("id", str(project_id)).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update project")
        logger.info(
            "Project updated | project_id=%s updated_by=%s fields=%s",
            project_id,
            user_id,
            list(updates.keys()),
        )
        return result.data[0]
    except HTTPException:
        raise
    except _TRANSIENT_HTTPX_ERRORS:
        # Bubble to @retry_on_disconnect; if the retry also fails the
        # decorator re-raises and the framework returns 500.
        raise
    except Exception:
        logger.exception("Error updating project | project_id=%s user_id=%s", project_id, user_id)
        raise HTTPException(status_code=500, detail="Failed to update project")


def _delete_project_dependencies(client, project_id: str) -> None:
    """Remove rows that reference a project before deleting the project itself."""
    pid = str(project_id)
    client.table("interest_form").delete().eq("project_id", pid).execute()
    client.table("TSRs").delete().eq("project_id", pid).execute()
    client.table("project_join_requests").delete().eq("project_id", pid).execute()
    client.table("project_members").delete().eq("project_id", pid).execute()


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
        client = get_client()

        project_result = (
            client.table("projects").select("id, class_id").eq("id", str(project_id)).execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        class_id = project_result.data[0]["class_id"]

        if not _is_instructor(user_id, class_id):
            # Note: 'owner' is intentionally excluded from delete authority.
            _require_member_role(
                client,
                str(project_id),
                user_id,
                (ROLE_PRODUCT_OWNER, ROLE_ADMIN),
                forbidden_detail="Only product owners, admins, or the class instructor can delete this project",
            )

        _delete_project_dependencies(client, str(project_id))
        client.table("projects").delete().eq("id", str(project_id)).execute()

        logger.info(
            "Project deleted | project_id=%s deleted_by=%s is_instructor=%s",
            project_id,
            user_id,
            _is_instructor(user_id, class_id),
        )
        return {"message": "Project deleted successfully", "project_id": str(project_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error deleting project | project_id=%s user_id=%s", project_id, user_id)
        raise HTTPException(status_code=500, detail="Failed to delete project")


@retry_on_disconnect()
def get_projects_for_user(user_id: str, class_id: UUID = None) -> list:
    """
    Get all projects for a user, optionally filtered by class.

    Returns id, name, team_size, image_url, member_count and the caller's
    role for each project.

    - With class_id: every project in the class (instructor or enrolled
      student) — the access check plus ONE read with members embedded.
    - Without class_id: only projects the user is a member of (two reads).
    """
    try:
        client = get_client()

        if class_id:
            authz.require_class_access(
                client,
                user_id,
                class_id,
                denied_detail="You do not have access to this class projects list",
            )
            res = (
                client.table("projects")
                .select("id, name, team_size, image_url, project_members(user_id, role)")
                .eq("class_id", str(class_id))
                .order("created_at", desc=True)
                .execute()
            )
            out = []
            for p in res.data or []:
                members = p.get("project_members") or []
                mine = next((m for m in members if str(m.get("user_id")) == str(user_id)), None)
                out.append(
                    {
                        "id": p["id"],
                        "name": p.get("name"),
                        "team_size": p.get("team_size"),
                        "image_url": p.get("image_url"),
                        "member_count": len(members),
                        "user_role": mine.get("role") if mine else None,
                    }
                )
            return out

        memberships = (
            client.table("project_members")
            .select("project_id, role, projects ( id, name )")
            .eq("user_id", user_id)
            .execute()
        )
        rows = [r for r in (memberships.data or []) if r.get("projects")]
        if not rows:
            return []
        project_ids = [r["projects"]["id"] for r in rows]
        counts: dict[str, int] = {}
        for m in (
            client.table("project_members")
            .select("project_id")
            .in_("project_id", project_ids)
            .execute()
        ).data or []:
            counts[m["project_id"]] = counts.get(m["project_id"], 0) + 1
        return [
            {
                "id": r["projects"]["id"],
                "name": r["projects"].get("name"),
                "team_size": None,
                "image_url": None,
                "member_count": counts.get(r["projects"]["id"], 0),
                "user_role": r.get("role"),
            }
            for r in rows
        ]
    except HTTPException:
        raise
    except _TRANSIENT_HTTPX_ERRORS:
        # Bubble to @retry_on_disconnect; if the retry also fails the
        # decorator re-raises and the framework returns 500.
        raise
    except Exception:
        logger.exception("Error fetching projects | user_id=%s class_id=%s", user_id, class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


def get_project_by_id(project_id: UUID, user_id: str = None) -> dict:
    """
    Get a specific project by ID.

    Args:
        project_id: Project unique identifier
        user_id: Optional user ID; adds the caller's project role as ``user_role``
            (``None`` for non-members)

    The project row and the caller's role are read concurrently (one wave).

    Raises:
        HTTPException: 404 if the project does not exist; 500 on database error
    """
    try:
        client = get_client()
        pid = str(project_id)
        jobs = {"project": lambda: authz.load_project(client, pid, columns="*")}
        if user_id:
            jobs["role"] = lambda: authz.get_project_role(client, pid, user_id)
        reads = fan_out(jobs)

        project = reads["project"]
        if user_id:
            project["user_role"] = reads["role"]
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
    project = authz.load_project(
        client, project_id, columns="id, class_id", class_columns="created_by"
    )
    _assert_can_review_loaded(client, reviewer_id, project)


def _assert_can_review_loaded(client, reviewer_id: str, project: dict) -> None:
    """Same rule as :func:`_assert_can_review_student_join_request` for a loaded project."""
    if str(_class_owner(project)) == str(reviewer_id):
        return
    role = authz.get_project_role(client, project["id"], reviewer_id)
    if role not in ELEVATED_ROLES:
        raise HTTPException(status_code=403, detail=REVIEW_DENIED_DETAIL)


#: Project columns that decide who may review its join requests and invites without a
#: separate role read: the class owner and every member come embedded.
REVIEW_PROJECT_COLUMNS = "id, class_id, name, classes(created_by), project_members(user_id, role)"


def _member_role(members: list[dict] | None, user_id: str) -> str | None:
    """The role on ``user_id``'s membership row, or ``None`` when they are not a member."""
    mine = next((m for m in members or [] if str(m.get("user_id")) == str(user_id)), None)
    return mine.get("role") if mine else None


def _load_review_project(client, project_id: str) -> dict | None:
    """The project loaded with :data:`REVIEW_PROJECT_COLUMNS`, or ``None``. One round trip."""
    res = (
        client.table("projects")
        .select(REVIEW_PROJECT_COLUMNS)
        .eq("id", str(project_id))
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _require_can_review(project: dict | None, reviewer_id: str) -> dict:
    """The review rule for a project loaded with :data:`REVIEW_PROJECT_COLUMNS`.

    404 when the project is missing; 403 unless ``reviewer_id`` is the class
    instructor or holds ``owner`` / ``product owner`` / ``admin`` on the project.
    Makes no round trips.
    """
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(_class_owner(project)) == str(reviewer_id):
        return project
    if _member_role(project.get("project_members"), reviewer_id) not in ELEVATED_ROLES:
        raise HTTPException(status_code=403, detail=REVIEW_DENIED_DETAIL)
    return project


def _get_student_project_in_class(
    client,
    user_id: str,
    class_id: str,
    *,
    exclude_project_id: str | None = None,
) -> dict | None:
    """
    Return ``{id, name}`` if *user_id* is already a member of any project in
    *class_id*, optionally ignoring *exclude_project_id*.  Students should only
    ever belong to one project per class.
    """
    query = client.table("projects").select("id, name").eq("class_id", str(class_id))
    if exclude_project_id:
        query = query.neq("id", str(exclude_project_id))
    projects_res = query.execute()
    class_projects = projects_res.data or []
    if not class_projects:
        return None

    project_ids = [p["id"] for p in class_projects]
    name_by_id = {p["id"]: p.get("name", "your current project") for p in class_projects}

    membership_res = (
        client.table("project_members")
        .select("project_id")
        .eq("user_id", user_id)
        .in_("project_id", project_ids)
        .limit(1)
        .execute()
    )
    memberships = membership_res.data or []
    if not memberships:
        return None

    pid = memberships[0]["project_id"]
    return {"id": pid, "name": name_by_id.get(pid, "your current project")}


def _leave_current_project_in_class(
    client,
    user_id: str,
    target_project_id: str,
    class_id: str,
    new_project_name: str,
    *,
    class_projects: list[dict] | None = None,
    class_members: list[dict] | None = None,
) -> None:
    """
    If the user is already a member of another project in *class_id*, remove
    them from it and notify that project's product owner(s). A student should
    only ever be in one project per class, but every membership found is
    handled.

    Batched: one bulk delete, one ``num_members`` write per old project, one
    profile read and one bulk notification insert per old project. Callers
    that already hold the class's projects/members pass them in to skip the
    two reads.
    """
    if class_projects is None:
        class_projects = (
            client.table("projects").select("id, name").eq("class_id", str(class_id)).execute()
        ).data or []
    siblings = {str(p["id"]): p for p in class_projects if str(p["id"]) != str(target_project_id)}
    if not siblings:
        return

    if class_members is None:
        class_members = (
            client.table("project_members")
            .select("project_id, user_id, role")
            .in_("project_id", list(siblings))
            .execute()
        ).data or []
    old_pids = sorted(
        {
            str(m["project_id"])
            for m in class_members
            if str(m.get("user_id")) == str(user_id) and str(m["project_id"]) in siblings
        }
    )
    if not old_pids:
        return

    client.table("project_members").delete().eq("user_id", str(user_id)).in_(
        "project_id", old_pids
    ).execute()

    remaining = [
        m
        for m in class_members
        if str(m["project_id"]) in old_pids and str(m.get("user_id")) != str(user_id)
    ]
    for pid in old_pids:
        set_num_members(client, pid, sum(1 for m in remaining if str(m["project_id"]) == pid))
        logger.info(
            "Auto-removed user from previous project | user=%s old_project=%s new_project=%s",
            user_id,
            pid,
            target_project_id,
        )

    po_by_project = {
        pid: [
            str(m["user_id"])
            for m in remaining
            if str(m["project_id"]) == pid and m.get("role") == ROLE_PRODUCT_OWNER
        ]
        for pid in old_pids
    }
    if not any(po_by_project.values()):
        logger.info(
            "departure_notify: no product owner to notify | old_projects=%s leaver=%s",
            old_pids,
            user_id,
        )
        return

    profile_res = (
        client.table("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )
    leaver_name = profile_display_name(profile_res.data[0] if profile_res.data else None) or (
        "A student"
    )

    from app.notifications.controller import notify_member_departure  # avoids import cycle

    for pid, po_ids in po_by_project.items():
        if po_ids:
            notify_member_departure(
                recipient_ids=po_ids,
                leaver_name=leaver_name,
                old_project_id=pid,
                old_project_name=siblings[pid].get("name") or "Unknown project",
                new_project_name=new_project_name,
            )


def request_to_join_project(project_id: UUID, user_id: str, message: str | None = None) -> dict:
    """
    Create a request to join a project.

    Before creating the request the function checks whether the user is already
    a member of any other project in the **same class**.  If so, they are
    automatically removed from that project and the project's product owner(s)
    receive a notification message.

    Args:
        project_id: Project unique identifier
        user_id: User's unique identifier
        message: Optional note from the requester, shown to the reviewers

    Returns:
        Dictionary with message and request data

    Raises:
        HTTPException: If project not found, already a member, or pending request exists
    """
    try:
        client = get_client()

        # Verify the project exists; fetch class_id for the cross-project check below
        project_result = (
            client.table("projects")
            .select("id, name, class_id")
            .eq("id", str(project_id))
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        project = project_result.data[0]
        class_id = project.get("class_id")
        new_project_name = project.get("name", "the new project")

        # Check if user is already a member of THIS project
        existing_member = (
            client.table("project_members")
            .select("id")
            .eq("project_id", str(project_id))
            .eq("user_id", user_id)
            .execute()
        )

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
        existing_request = (
            client.table("project_join_requests")
            .select("id, request_status, invited_by")
            .eq("project_id", str(project_id))
            .eq("user_id", user_id)
            .eq("request_status", "pending")
            .execute()
        )

        for row in existing_request.data or []:
            if row.get("invited_by"):
                raise HTTPException(
                    status_code=400,
                    detail="You have a pending invitation to this project. Accept or decline it first.",
                )
            raise HTTPException(status_code=400, detail="Join request already pending")

        # Normalize the optional requester message (trim, drop if empty)
        clean_message = message.strip() if isinstance(message, str) else None
        if not clean_message:
            clean_message = None

        # Create the join request (student-initiated; invited_by stays null)
        request_data = {
            "project_id": str(project_id),
            "user_id": user_id,
            "request_status": "pending",
            "reviewer_id": None,
            "reviewed_at": None,
            "invited_by": None,
            "message": clean_message,
        }

        result = client.table("project_join_requests").insert(request_data).execute()

        request_row = result.data[0] if result.data else {}
        request_id = request_row.get("id")

        if request_id:
            from app.notifications.controller import notify_join_request

            notify_join_request(
                project_id=str(project_id),
                project_name=new_project_name,
                request_id=str(request_id),
                requester_id=user_id,
                message=clean_message,
            )

        logger.info(
            "Join request created | project_id=%s user_id=%s request_id=%s",
            project_id,
            user_id,
            request_id,
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

    The request row is read with its project and class embedded, the class's
    projects/members are read once and reused for the leave-previous-team
    step, the scrum-master check and the ``num_members`` write — about 11
    round trips when the student changes teams, 8 when they do not (was 13-17).
    The writes are still not transactional (see CODE_REVIEW.md #10).
    """
    try:
        client = get_client()

        request_result = (
            client.table("project_join_requests")
            .select(
                "id, project_id, user_id, request_status, invited_by, "
                "projects(id, class_id, name, classes(created_by))"
            )
            .eq("id", str(request_id))
            .limit(1)
            .execute()
        )
        if not request_result.data:
            raise HTTPException(status_code=404, detail="Join request not found")
        join_request = request_result.data[0]

        if join_request["request_status"] != "pending":
            raise HTTPException(
                status_code=400, detail=f"Request already {join_request['request_status']}"
            )

        project = join_request.get("projects") or None
        pid = str(join_request["project_id"])
        new_user = str(join_request["user_id"])
        invited_by = join_request.get("invited_by")

        if invited_by:
            if str(reviewer_id) != new_user:
                raise HTTPException(
                    status_code=403,
                    detail="Only the invited user can accept this invitation",
                )
        else:
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            _assert_can_review_loaded(client, reviewer_id, project)

        class_id = (project or {}).get("class_id")
        class_projects: list[dict] = []
        class_members: list[dict] = []
        if class_id:
            class_projects = (
                client.table("projects").select("id, name").eq("class_id", str(class_id)).execute()
            ).data or []
            class_members = (
                client.table("project_members")
                .select("project_id, user_id, role")
                .in_("project_id", [str(p["id"]) for p in class_projects] or [pid])
                .execute()
            ).data or []
            # Safety net: if the joining user is still in another project in the
            # same class (e.g. they were added directly after submitting this
            # request), auto-remove them and notify that project's product owner.
            _leave_current_project_in_class(
                client,
                user_id=new_user,
                target_project_id=pid,
                class_id=str(class_id),
                new_project_name=(project or {}).get("name") or "the new project",
                class_projects=class_projects,
                class_members=class_members,
            )
        else:
            class_members = [{"project_id": pid, **m} for m in _project_member_rows(client, pid)]

        client.table("project_join_requests").update(
            {
                "request_status": "approved",
                "reviewed_at": datetime.now(UTC).isoformat(),
                "reviewer_id": reviewer_id,
            }
        ).eq("id", str(request_id)).execute()

        team = [m for m in class_members if str(m["project_id"]) == pid]
        client.table("project_members").insert(
            {"project_id": pid, "user_id": new_user, "role": ROLE_MEMBER}
        ).execute()
        if not any(m.get("role") == ROLE_SCRUM_MASTER for m in team):
            client.table("project_members").update({"role": ROLE_SCRUM_MASTER}).eq(
                "project_id", pid
            ).eq("user_id", new_user).execute()
            logger.info("Auto-assigned scrum master | project_id=%s user_id=%s", pid, new_user)
        set_num_members(client, pid, len(team) + 1)

        logger.info(
            "Join request accepted | request_id=%s project_id=%s new_member=%s reviewer=%s",
            request_id,
            pid,
            new_user,
            reviewer_id,
        )
        return {"message": "Join request accepted successfully", "user_id": join_request["user_id"]}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error accepting join request | request_id=%s reviewer_id=%s",
            request_id,
            reviewer_id,
        )
        raise HTTPException(status_code=500, detail="Failed to accept join request")


def reject_join_request(request_id: UUID, reviewer_id: str) -> dict:
    """
    Reject a pending project_join_requests row.

    - **Student-initiated**: **class instructor** or project **owner** / **product owner** / **admin**.
    - **Team invite**: only the invitee may decline.
    """
    try:
        client = get_client()

        # Get the join request
        request_result = (
            client.table("project_join_requests")
            .select("id, project_id, user_id, request_status, invited_by")
            .eq("id", str(request_id))
            .execute()
        )

        if not request_result.data or len(request_result.data) == 0:
            raise HTTPException(status_code=404, detail="Join request not found")

        join_request = request_result.data[0]

        # Check if request is still pending
        if join_request["request_status"] != "pending":
            raise HTTPException(
                status_code=400, detail=f"Request already {join_request['request_status']}"
            )

        invited_by = join_request.get("invited_by")

        if invited_by:
            if str(reviewer_id) != str(join_request["user_id"]):
                raise HTTPException(
                    status_code=403,
                    detail="Only the invited user can decline this invitation",
                )
        else:
            _assert_can_review_student_join_request(client, reviewer_id, join_request["project_id"])

        # Update the request status
        update_data = {
            "request_status": "rejected",
            "reviewed_at": datetime.now(UTC).isoformat(),
            "reviewer_id": reviewer_id,
        }

        client.table("project_join_requests").update(update_data).eq(
            "id", str(request_id)
        ).execute()

        # Notify the requester that a student-initiated request was denied.
        # (Team invites being declined notify nobody — the invitee declined their own invite.)
        if not invited_by:
            project_row = (
                client.table("projects")
                .select("name")
                .eq("id", join_request["project_id"])
                .execute()
            )
            project_name = (
                project_row.data[0].get("name") if project_row.data else None
            ) or "the project"
            from app.notifications.controller import notify_join_request_rejected

            notify_join_request_rejected(
                requester_id=join_request["user_id"],
                project_id=str(join_request["project_id"]),
                project_name=project_name,
            )

        logger.info(
            "Join request rejected | request_id=%s project_id=%s user_id=%s reviewer=%s",
            request_id,
            join_request["project_id"],
            join_request["user_id"],
            reviewer_id,
        )
        return {"message": "Join request rejected successfully", "user_id": join_request["user_id"]}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error rejecting join request | request_id=%s reviewer_id=%s",
            request_id,
            reviewer_id,
        )
        raise HTTPException(status_code=500, detail="Failed to reject join request")


def dismiss_my_join_request(request_id: UUID, user_id: str) -> dict:
    """
    Dismiss a **denied** join request that the caller submitted.

    Only the requester may dismiss, and only a ``rejected`` row. Dismissing
    removes the row so it no longer surfaces in the requester's outgoing list.
    """
    try:
        client = get_client()

        request_result = (
            client.table("project_join_requests")
            .select("id, user_id, request_status")
            .eq("id", str(request_id))
            .execute()
        )

        if not request_result.data:
            raise HTTPException(status_code=404, detail="Join request not found")

        join_request = request_result.data[0]

        if str(join_request["user_id"]) != str(user_id):
            raise HTTPException(status_code=403, detail="You can only dismiss your own requests")

        if join_request["request_status"] != "rejected":
            raise HTTPException(status_code=400, detail="Only denied requests can be dismissed")

        client.table("project_join_requests").delete().eq("id", str(request_id)).execute()

        logger.info(
            "Join request dismissed | request_id=%s user_id=%s",
            request_id,
            user_id,
        )
        return {"message": "Join request dismissed", "request_id": str(request_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error dismissing join request | request_id=%s user_id=%s",
            request_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to dismiss join request")


def cancel_my_join_request(request_id: UUID, user_id: str) -> dict:
    """
    Cancel a **pending** join request that the caller submitted (student-initiated only).

    The caller must be the requester and the row must still be pending.
    Deletes the row so it no longer surfaces anywhere.
    """
    try:
        client = get_client()

        result = (
            client.table("project_join_requests")
            .select("id, user_id, request_status, invited_by")
            .eq("id", str(request_id))
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Join request not found")

        row = result.data[0]

        if str(row["user_id"]) != str(user_id):
            raise HTTPException(status_code=403, detail="You can only cancel your own requests")

        if row.get("invited_by"):
            raise HTTPException(
                status_code=400, detail="Use cancel-invite to cancel a team invitation"
            )

        if row["request_status"] != "pending":
            raise HTTPException(status_code=400, detail="Only pending requests can be cancelled")

        client.table("project_join_requests").delete().eq("id", str(request_id)).execute()

        logger.info("Join request cancelled | request_id=%s user_id=%s", request_id, user_id)
        return {"message": "Join request cancelled", "request_id": str(request_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error cancelling join request | request_id=%s user_id=%s", request_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to cancel join request")


def cancel_team_invite(request_id: UUID, requester_id: str) -> dict:
    """
    Cancel a pending team invite that the caller sent (``invited_by == requester_id``).

    Project instructor can also cancel any invite for the project.
    Deletes the invite row.
    """
    try:
        client = get_client()

        result = (
            client.table("project_join_requests")
            .select("id, project_id, user_id, request_status, invited_by")
            .eq("id", str(request_id))
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Invite not found")

        row = result.data[0]

        if not row.get("invited_by"):
            raise HTTPException(status_code=400, detail="This is not a team invite")

        if row["request_status"] != "pending":
            raise HTTPException(status_code=400, detail="Only pending invites can be cancelled")

        is_inviter = str(row["invited_by"]) == str(requester_id)
        if not is_inviter:
            class_res = (
                client.table("projects")
                .select("class_id")
                .eq("id", str(row["project_id"]))
                .execute()
            )
            class_id = class_res.data[0]["class_id"] if class_res.data else None
            if not class_id or not _is_instructor(requester_id, class_id):
                raise HTTPException(
                    status_code=403,
                    detail="Only the sender or class instructor can cancel this invite",
                )

        client.table("project_join_requests").delete().eq("id", str(request_id)).execute()

        logger.info("Team invite cancelled | request_id=%s requester=%s", request_id, requester_id)
        return {"message": "Invite cancelled", "request_id": str(request_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error cancelling invite | request_id=%s requester=%s", request_id, requester_id
        )
        raise HTTPException(status_code=500, detail="Failed to cancel invite")


def get_project_pending_invites(project_id: UUID, requester_id: str) -> list:
    """
    Return all pending team invites for a project (``invited_by`` set).

    Caller must be class instructor or project owner/product-owner/admin.
    Returns each invite with the invitee's user_id, email, and request_id.

    The project (class owner and members embedded) and the invites (invitee
    email embedded) are read concurrently: 2 round trips in one wave.
    """
    try:
        client = get_client()
        pid = str(project_id)
        reads = fan_out(
            {
                "project": lambda: _load_review_project(client, pid),
                "invites": lambda: (
                    (
                        client.table("project_join_requests")
                        .select(
                            "id, user_id, created_at, "
                            "invitee:profiles!project_join_requests_user_id_fkey(email)"
                        )
                        .eq("project_id", pid)
                        .eq("request_status", "pending")
                        .not_.is_("invited_by", "null")
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        _require_can_review(reads["project"], requester_id)

        return [
            {
                "request_id": row["id"],
                "user_id": row["user_id"],
                "email": (row.get("invitee") or {}).get("email"),
                "invited_at": row.get("created_at"),
            }
            for row in reads["invites"]
        ]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching project invites | project_id=%s requester=%s", project_id, requester_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch project invites")


# ---------------------------------------------------------------------------
# Product owner / scrum master / admin role management
# ---------------------------------------------------------------------------


def _load_role_context(
    client, project_id: str, requester_id: str, target_user_id: str, *, staff_only: bool
) -> dict[str, str]:
    """Load the project (with its class owner) and the member list, then authorise.

    ``staff_only=False``: class instructor or a project owner / product owner /
    admin may act. ``staff_only=True``: class instructor or a class TA only.
    Returns ``{user_id: role}`` for the project. Two round trips (three for a
    TA check).
    """
    project = authz.load_project(
        client, project_id, columns="id, class_id", class_columns="created_by"
    )
    roles = {str(m["user_id"]): m.get("role") for m in _project_member_rows(client, project_id)}
    rid = str(requester_id)
    if str(_class_owner(project)) != rid:
        if staff_only:
            if authz.get_enrollment_role(client, project["class_id"], rid) != authz.ROLE_TA:
                raise HTTPException(
                    status_code=403,
                    detail="Only the class instructor or a TA can manage project admins",
                )
        else:
            if rid not in roles:
                raise HTTPException(status_code=403, detail="Not a member of this project")
            if roles[rid] not in ELEVATED_ROLES:
                raise HTTPException(
                    status_code=403, detail="Insufficient permissions to manage project roles"
                )
    if str(target_user_id) not in roles:
        raise HTTPException(status_code=404, detail="User is not a member of this project")
    return roles


def _set_role(client, project_id: str, user_id: str, role: str) -> None:
    client.table("project_members").update({"role": role}).eq("project_id", str(project_id)).eq(
        "user_id", str(user_id)
    ).execute()


def _give_exclusive_role(
    client, project_id: str, roles: dict[str, str], target_user_id: str, role: str
) -> None:
    """Make ``target_user_id`` the only holder of ``role``: one demotion statement
    for every other current holder, then one promotion."""
    pid, tid = str(project_id), str(target_user_id)
    if any(uid != tid and r == role for uid, r in roles.items()):
        client.table("project_members").update({"role": ROLE_MEMBER}).eq("project_id", pid).eq(
            "role", role
        ).neq("user_id", tid).execute()
    _set_role(client, pid, tid, role)


def _drop_role(
    client, project_id: str, roles: dict[str, str], target_user_id: str, role: str, *, label: str
) -> None:
    if roles.get(str(target_user_id)) != role:
        raise HTTPException(
            status_code=400,
            detail=f"Target user is not {label}; cannot remove {role} role this way",
        )
    _set_role(client, project_id, target_user_id, ROLE_MEMBER)


def _role_endpoint(action: str, fn):
    """Run ``fn`` and map unexpected failures to a fixed 500 (never the exception text)."""
    try:
        return fn()
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while trying to %s", action)
        raise HTTPException(status_code=500, detail=f"Failed to {action}")


def assign_product_owner(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    def go():
        client = get_client()
        roles = _load_role_context(
            client, project_id, requester_id, target_user_id, staff_only=False
        )
        _give_exclusive_role(client, project_id, roles, target_user_id, ROLE_PRODUCT_OWNER)
        return {"role": ROLE_PRODUCT_OWNER, "user_id": str(target_user_id)}

    return _role_endpoint("assign product owner", go)


def assign_scrum_master(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    def go():
        client = get_client()
        roles = _load_role_context(
            client, project_id, requester_id, target_user_id, staff_only=False
        )
        _give_exclusive_role(client, project_id, roles, target_user_id, ROLE_SCRUM_MASTER)
        return {"role": ROLE_SCRUM_MASTER, "user_id": str(target_user_id)}

    return _role_endpoint("assign scrum master", go)


def assign_admin(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    def go():
        client = get_client()
        _load_role_context(client, project_id, requester_id, target_user_id, staff_only=True)
        _set_role(client, project_id, target_user_id, ROLE_ADMIN)
        return {"role": ROLE_ADMIN, "user_id": str(target_user_id)}

    return _role_endpoint("assign admin", go)


def remove_product_owner(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    def go():
        client = get_client()
        roles = _load_role_context(
            client, project_id, requester_id, target_user_id, staff_only=False
        )
        _drop_role(
            client, project_id, roles, target_user_id, ROLE_PRODUCT_OWNER, label="the product owner"
        )
        return {"role": ROLE_MEMBER, "user_id": str(target_user_id)}

    return _role_endpoint("remove product owner", go)


def remove_scrum_master(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    def go():
        client = get_client()
        roles = _load_role_context(
            client, project_id, requester_id, target_user_id, staff_only=False
        )
        _drop_role(
            client, project_id, roles, target_user_id, ROLE_SCRUM_MASTER, label="the scrum master"
        )
        return {"role": ROLE_MEMBER, "user_id": str(target_user_id)}

    return _role_endpoint("remove scrum master", go)


def remove_admin(project_id: UUID, requester_id: str, target_user_id: str) -> dict:
    def go():
        client = get_client()
        roles = _load_role_context(
            client, project_id, requester_id, target_user_id, staff_only=True
        )
        _drop_role(client, project_id, roles, target_user_id, ROLE_ADMIN, label="an admin")
        return {"role": ROLE_MEMBER, "user_id": str(target_user_id)}

    return _role_endpoint("remove admin", go)


def get_project_members(project_id: UUID) -> list:
    """
    Get all members of a project with their profile fields — one embedded read.

    Raises:
        HTTPException: 404 if the project does not exist; 500 on database error.
    """
    try:
        client = get_client()
        res = (
            client.table("projects")
            .select(
                "id, project_members(user_id, role, created_at, "
                "profiles(id, email, role, first_name, last_name, linkedin, github, "
                "image_url, edu_email))"
            )
            .eq("id", str(project_id))
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        result = []
        for member in res.data[0].get("project_members") or []:
            user_info = member.get("profiles") or {}
            result.append(
                {
                    "user_id": member["user_id"],
                    "email": user_info.get("email"),
                    "user_role": user_info.get("role"),
                    "project_role": member.get("role"),
                    "joined_at": member.get("created_at"),
                    "first_name": user_info.get("first_name"),
                    "last_name": user_info.get("last_name"),
                    "linkedin": user_info.get("linkedin"),
                    "github": user_info.get("github"),
                    "image_url": user_info.get("image_url"),
                    "edu_email": user_info.get("edu_email"),
                }
            )
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching project members | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch project members")


def _require_class_access(class_row: dict | None, enrollment_role: str | None, user_id) -> None:
    """404 for a missing class; 403 unless ``user_id`` created it or is enrolled.

    Takes what :func:`authz.load_class` / :func:`authz.get_enrollment_role` returned,
    so callers can read those rows concurrently with their own data.
    """
    if class_row is None:
        raise HTTPException(status_code=404, detail="Class not found")
    if str(class_row.get("created_by")) != str(user_id) and enrollment_role is None:
        raise HTTPException(status_code=403, detail="You do not have access to this class")


def get_pending_team_invites_for_user(user_id: str, class_id: UUID) -> list:
    """
    Pending team invitations addressed to ``user_id`` within a class.

    Each item matches the join-requests list shape (plus ``project_id`` / ``project_name``)
    so the client can reuse the same UI. ``email`` / ``user_role`` refer to the **inviter**.

    One wave of three reads: the class, the caller's enrollment, and the caller's
    pending invites with their project and inviter embedded. The invites are
    narrowed to the class in memory (a user has only a handful pending).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid),
                "enrollment": lambda: authz.get_enrollment_role(client, cid, user_id),
                "invites": lambda: (
                    (
                        client.table("project_join_requests")
                        .select(
                            "id, user_id, project_id, created_at, request_status, "
                            "projects(name, class_id), "
                            "inviter:profiles!project_join_requests_invited_by_fkey(email, role)"
                        )
                        .eq("user_id", user_id)
                        .eq("request_status", "pending")
                        .not_.is_("invited_by", "null")
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        _require_class_access(reads["class"], reads["enrollment"], user_id)

        result = []
        for row in reads["invites"]:
            project = row.get("projects") or {}
            if str(project.get("class_id")) != cid:
                continue
            inviter = row.get("inviter") or {}
            result.append(
                {
                    "request_id": row["id"],
                    "user_id": row["user_id"],
                    "email": inviter.get("email"),
                    "user_role": inviter.get("role"),
                    "requested_at": row.get("created_at"),
                    "status": row["request_status"],
                    "project_id": str(row["project_id"]),
                    "project_name": project.get("name"),
                }
            )
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching team invites | user_id=%s class_id=%s", user_id, class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch pending invitations")


def get_my_pending_join_requests_for_user(user_id: str, class_id: UUID) -> list:
    """
    Pending **student-initiated** join requests submitted by ``user_id`` within a class.

    Each item includes project metadata so the client can show outgoing request cards.

    One wave of three reads: the class, the caller's enrollment, and the caller's
    requests with their project embedded, narrowed to the class in memory.
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid, "id, created_by, name, term, year"),
                "enrollment": lambda: authz.get_enrollment_role(client, cid, user_id),
                # Pending requests are still awaiting review; rejected ones surface as a
                # dismissible "denied" notice until the requester dismisses them (which
                # deletes the row). Accepted requests are dropped (the student is now a
                # member), and team invites (invited_by set) are listed elsewhere.
                "requests": lambda: (
                    (
                        client.table("project_join_requests")
                        .select(
                            "id, user_id, project_id, created_at, request_status, "
                            "projects(name, class_id, num_members, sponsor_company, image_url)"
                        )
                        .eq("user_id", user_id)
                        .in_("request_status", ["pending", "rejected"])
                        .is_("invited_by", "null")
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        class_row = reads["class"]
        _require_class_access(class_row, reads["enrollment"], user_id)

        course_label_parts = [
            str(class_row["year"]) if class_row.get("year") else "",
            class_row.get("term"),
            class_row.get("name"),
        ]
        course_label = " ".join(p for p in course_label_parts if p).strip()

        result = []
        for row in reads["requests"]:
            project = row.get("projects") or {}
            if str(project.get("class_id")) != cid:
                continue
            result.append(
                {
                    "request_id": row["id"],
                    "user_id": row["user_id"],
                    "requested_at": row.get("created_at"),
                    "status": row["request_status"],
                    "project_id": str(row["project_id"]),
                    "project_name": project.get("name"),
                    "member_count": project.get("num_members") or 0,
                    "sponsor_company": project.get("sponsor_company"),
                    "course_label": course_label or None,
                    "image_url": project.get("image_url"),
                }
            )
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching outgoing join requests | user_id=%s class_id=%s", user_id, class_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch outgoing join requests")


#: A pending request with its requester's profile embedded. ``project_join_requests``
#: has three foreign keys to ``profiles`` (user_id, invited_by, reviewer_id), so the
#: embed names the one it follows.
_PENDING_REQUEST_COLUMNS = (
    "id, user_id, project_id, created_at, request_status, message, "
    "requester:profiles!project_join_requests_user_id_fkey(email, role)"
)


def _pending_student_requests(client, project_ids: list[str]) -> list[dict]:
    """Pending student-initiated requests (``invited_by`` null) on the projects. One round trip."""
    return (
        client.table("project_join_requests")
        .select(_PENDING_REQUEST_COLUMNS)
        .in_("project_id", project_ids)
        .eq("request_status", "pending")
        .is_("invited_by", "null")
        .execute()
    ).data or []


def _join_request_row(row: dict) -> dict:
    """The seven keys :func:`get_pending_join_requests` emits for one request."""
    requester = row.get("requester") or {}
    return {
        "request_id": row["id"],
        "user_id": row["user_id"],
        "email": requester.get("email"),
        "user_role": requester.get("role"),
        "requested_at": row.get("created_at"),
        "status": row["request_status"],
        "message": row.get("message"),
    }


def get_pending_join_requests(project_id: UUID, reviewer_id: str) -> list:
    """
    Pending **student-initiated** join requests for a project (``invited_by`` is null).

    Caller must be the **class instructor** or a project **owner** / **product owner** / **admin**.

    The project (class owner and members embedded) and the requests (requester
    profile embedded) are read concurrently: 2 round trips in one wave.
    """
    try:
        client = get_client()
        pid = str(project_id)
        reads = fan_out(
            {
                "project": lambda: _load_review_project(client, pid),
                "requests": lambda: _pending_student_requests(client, [pid]),
            }
        )
        _require_can_review(reads["project"], reviewer_id)
        return [_join_request_row(r) for r in reads["requests"]]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching join requests | project_id=%s reviewer_id=%s",
            project_id,
            reviewer_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch join requests")


def instructor_add_member(project_id: UUID, requester_id: str, target_user_id: str, role="member"):
    """
    Add or promote a project member.

    - **Class instructor**: always adds ``role`` immediately (used for staffing / roster).
    - **Owner / product owner / admin** (not the class instructor): adding ``member``
      creates a **pending team invitation**; the user must accept via the same
      accept-request endpoint used for join requests.

    Two reads (project with its class owner embedded, the project's members)
    decide authorisation, whether the target is already a member, whether a
    scrum master exists and the new ``num_members`` value; then 1-3 writes.

    Returns one of three shapes: ``Changed roles`` (existing member),
    ``Invitation sent`` (elevated member adding a member), ``Added member``.

    Raises:
        HTTPException: 404 missing project, 403 no permission, 400 duplicate invite.
    """
    logger.debug(
        "instructor_add_member called | project_id=%s requester=%s target=%s role=%r",
        project_id,
        requester_id,
        target_user_id,
        role,
    )
    try:
        client = get_client()
        pid, tid, rid = str(project_id), str(target_user_id), str(requester_id)
        project = authz.load_project(
            client, pid, columns="id, class_id", class_columns="created_by"
        )
        is_instructor = str(_class_owner(project)) == rid

        members = _project_member_rows(client, pid)
        roles = {str(m["user_id"]): m.get("role") for m in members}
        if not is_instructor and roles.get(rid) not in ELEVATED_ROLES:
            logger.warning(
                "instructor_add_member: forbidden (not class instructor or elevated role) | "
                "requester=%s class_id=%s project_id=%s",
                requester_id,
                project.get("class_id"),
                project_id,
            )
            raise HTTPException(
                status_code=403,
                detail="Only instructors, product owners, and admins can add members",
            )

        if tid in roles:  # already a member: change their role
            response = (
                client.table("project_members")
                .update({"role": role})
                .eq("user_id", tid)
                .eq("project_id", pid)
                .execute()
            )
            # only one scrum master or owner: demote the previous holder(s) in one statement
            if role in (ROLE_SCRUM_MASTER, ROLE_OWNER) and any(
                uid != tid and r == role for uid, r in roles.items()
            ):
                client.table("project_members").update({"role": ROLE_MEMBER}).neq(
                    "user_id", tid
                ).eq("project_id", pid).eq("role", role).execute()
            logger.info(
                "Changed roles | project_id=%s affected_rows=%d role=%r",
                project_id,
                len(response.data) if response.data else 0,
                role,
            )
            return {"message": "Changed roles successfully", "member": target_user_id, "role": role}

        if role == ROLE_MEMBER and not is_instructor:
            pending = (
                client.table("project_join_requests")
                .select("id, invited_by")
                .eq("project_id", pid)
                .eq("user_id", tid)
                .eq("request_status", "pending")
                .execute()
            )
            for pr in pending.data or []:
                if pr.get("invited_by"):
                    raise HTTPException(
                        status_code=400,
                        detail="This user already has a pending invitation to this project",
                    )
                raise HTTPException(
                    status_code=400,
                    detail="This user already has a pending join request for this project",
                )
            ins = (
                client.table("project_join_requests")
                .insert(
                    {
                        "project_id": pid,
                        "user_id": tid,
                        "request_status": "pending",
                        "reviewer_id": None,
                        "reviewed_at": None,
                        "invited_by": rid,
                    }
                )
                .execute()
            )
            logger.info(
                "Team invite created | project_id=%s invitee=%s invited_by=%s",
                project_id,
                target_user_id,
                requester_id,
            )
            return {
                "message": "Invitation sent; user must accept before joining",
                "request": ins.data[0] if ins.data else None,
                "user_id": tid,
                "role": role,
            }

        client.table("project_members").insert(
            {"project_id": pid, "user_id": tid, "role": role}
        ).execute()
        if role == ROLE_MEMBER and not any(r == ROLE_SCRUM_MASTER for r in roles.values()):
            _set_role(client, pid, tid, ROLE_SCRUM_MASTER)
            logger.info("Auto-assigned scrum master | project_id=%s user_id=%s", pid, tid)
        set_num_members(client, pid, len(members) + 1)

        logger.info(
            "Member added | project_id=%s user_id=%s role=%r added_by=%s",
            project_id,
            target_user_id,
            role,
            requester_id,
        )
        return {"message": "Added member successfully", "user_id": target_user_id, "role": role}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error in instructor_add_member | project_id=%s requester=%s target=%s role=%r",
            project_id,
            requester_id,
            target_user_id,
            role,
        )
        raise HTTPException(status_code=500, detail="Failed to update member")


def instructor_remove_member(project_id: UUID, requester_id: str, target_user_id: str):
    """
    Remove a member from a project.

    Allowed: the class instructor, a project owner / product owner / admin, or
    the member removing themselves. ``num_members`` is rewritten from the real
    row count, so removing someone who is not a member changes nothing.

    Raises:
        HTTPException: 404 if the project does not exist (this used to return
        ``False`` with a 200), 403 without permission.
    """
    logger.debug(
        "instructor_remove_member called | project_id=%s requester=%s target=%s",
        project_id,
        requester_id,
        target_user_id,
    )
    try:
        client = get_client()
        pid, tid, rid = str(project_id), str(target_user_id), str(requester_id)
        project = authz.load_project(
            client, pid, columns="id, class_id", class_columns="created_by"
        )
        members = _project_member_rows(client, pid)
        roles = {str(m["user_id"]): m.get("role") for m in members}

        is_instructor = str(_class_owner(project)) == rid
        if not is_instructor and rid != tid and roles.get(rid) not in ELEVATED_ROLES:
            raise HTTPException(status_code=403, detail="Not the instructor of this project")

        delete_result = (
            client.table("project_members")
            .delete()
            .eq("project_id", pid)
            .eq("user_id", tid)
            .execute()
        )
        deleted = len(delete_result.data) if delete_result.data else 0
        if deleted:
            set_num_members(client, pid, max(0, len(members) - deleted))
        logger.info(
            "Member removed | project_id=%s user_id=%s removed_by=%s deleted_rows=%d",
            project_id,
            target_user_id,
            requester_id,
            deleted,
        )
        return {"message": "Removed member successfully", "user_id": target_user_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error removing member | project_id=%s requester=%s target=%s",
            project_id,
            requester_id,
            target_user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to remove member")
