"""Teaching Assistant (TA) business logic.

A TA is an enrolled student promoted to a class-level ``ta`` role
(``class_enrollments.enrollment_role``). TAs are deliberately kept out of
``project_members`` so they never affect team size, seat availability, the
scrum-master auto-assignment, or any membership count. Instead they are linked
to projects through ``project_ta_assignments`` and can review the TSRs of the
projects they are assigned to.

Who can call what:
    * Promote / demote / assign / unassign / list-class-TAs  → class instructor.
    * my-role / review targets                               → the TA themselves.
    * list-project-TAs                                       → instructor or any
                                                               class member.
"""
import logging
from uuid import UUID

from fastapi import HTTPException

from app.database.client import service_client, supabase
from app.utils.profiles import PROFILE_SELECT, profile_display_name

logger = logging.getLogger(__name__)

ENROLLMENT_ROLE_STUDENT = "student"
ENROLLMENT_ROLE_TA = "ta"


def _client():
    return service_client if service_client else supabase


def _require_class_instructor(client, user_id: str, class_id) -> dict:
    """Ensure ``user_id`` owns ``class_id``; return the class row."""
    res = (
        client.table("classes")
        .select("id, created_by")
        .eq("id", str(class_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Class not found")
    if res.data[0].get("created_by") != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the class instructor can manage TAs",
        )
    return res.data[0]


def _get_enrollment(client, class_id, user_id: str) -> dict | None:
    res = (
        client.table("class_enrollments")
        .select("id, enrollment_role")
        .eq("class_id", str(class_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    return res.data[0] if res.data else None


def get_enrollment_role(client, class_id, user_id: str) -> str | None:
    """Return 'student'/'ta' for an enrolled user, or None if not enrolled."""
    enrollment = _get_enrollment(client, class_id, user_id)
    if not enrollment:
        return None
    return enrollment.get("enrollment_role") or ENROLLMENT_ROLE_STUDENT


def get_my_enrollment_role(user_id: str, class_id: UUID) -> dict:
    """Class-level role for the requesting user (instructor / ta / student / none)."""
    try:
        client = _client()
        class_res = (
            client.table("classes")
            .select("id, created_by")
            .eq("id", str(class_id))
            .execute()
        )
        if not class_res.data:
            raise HTTPException(status_code=404, detail="Class not found")
        if class_res.data[0].get("created_by") == user_id:
            return {"enrollment_role": "instructor"}

        role = get_enrollment_role(client, class_id, user_id)
        return {"enrollment_role": role}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching enrollment role | class_id=%s user_id=%s",
            class_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch role")


def promote_to_ta(instructor_id: str, class_id: UUID, target_user_id: UUID) -> dict:
    """Promote an enrolled student to TA for this class (instructor only)."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)

        enrollment = _get_enrollment(client, class_id, str(target_user_id))
        if not enrollment:
            raise HTTPException(
                status_code=400,
                detail="User is not enrolled in this class",
            )

        client.table("class_enrollments").update(
            {"enrollment_role": ENROLLMENT_ROLE_TA}
        ).eq("id", enrollment["id"]).execute()

        logger.info(
            "Student promoted to TA | class_id=%s user_id=%s by=%s",
            class_id, target_user_id, instructor_id,
        )
        return {"message": "Student promoted to TA", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error promoting TA | class_id=%s user_id=%s", class_id, target_user_id
        )
        raise HTTPException(status_code=500, detail="Failed to promote TA")


def demote_ta(instructor_id: str, class_id: UUID, target_user_id: UUID) -> dict:
    """Demote a TA back to a regular student and clear their project assignments."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)

        enrollment = _get_enrollment(client, class_id, str(target_user_id))
        if not enrollment:
            raise HTTPException(
                status_code=400,
                detail="User is not enrolled in this class",
            )

        client.table("class_enrollments").update(
            {"enrollment_role": ENROLLMENT_ROLE_STUDENT}
        ).eq("id", enrollment["id"]).execute()

        # A demoted TA no longer oversees any project in this class.
        client.table("project_ta_assignments").delete().eq(
            "class_id", str(class_id)
        ).eq("user_id", str(target_user_id)).execute()

        logger.info(
            "TA demoted to student | class_id=%s user_id=%s by=%s",
            class_id, target_user_id, instructor_id,
        )
        return {"message": "TA demoted to student", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error demoting TA | class_id=%s user_id=%s", class_id, target_user_id
        )
        raise HTTPException(status_code=500, detail="Failed to demote TA")


def _ta_assignments_by_user(client, class_id, user_ids: list[str]) -> dict[str, list[dict]]:
    """Map user_id → [{id, name}] of projects they are assigned to as a TA."""
    if not user_ids:
        return {}
    rows = (
        client.table("project_ta_assignments")
        .select("project_id, user_id")
        .eq("class_id", str(class_id))
        .in_("user_id", user_ids)
        .execute()
    )
    data = rows.data or []
    project_ids = list({r["project_id"] for r in data if r.get("project_id")})
    name_map: dict[str, str] = {}
    if project_ids:
        projects = (
            client.table("projects")
            .select("id, name")
            .in_("id", project_ids)
            .execute()
        )
        name_map = {p["id"]: p.get("name") for p in (projects.data or [])}

    out: dict[str, list[dict]] = {}
    for r in data:
        uid = r.get("user_id")
        pid = r.get("project_id")
        if not uid or not pid:
            continue
        out.setdefault(uid, []).append({"id": pid, "name": name_map.get(pid)})
    for assignments in out.values():
        assignments.sort(key=lambda p: (p["name"] or "").lower())
    return out


def list_class_tas(instructor_id: str, class_id: UUID) -> list[dict]:
    """List every TA in a class with the projects they oversee (instructor only)."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)

        enrollments = (
            client.table("class_enrollments")
            .select("user_id, enrollment_role")
            .eq("class_id", str(class_id))
            .eq("enrollment_role", ENROLLMENT_ROLE_TA)
            .execute()
        )
        ta_ids = [str(e["user_id"]) for e in (enrollments.data or []) if e.get("user_id")]
        if not ta_ids:
            return []

        profiles = (
            client.table("profiles")
            .select(PROFILE_SELECT)
            .in_("id", ta_ids)
            .execute()
        )
        profile_map = {p["id"]: p for p in (profiles.data or [])}
        assignments_map = _ta_assignments_by_user(client, class_id, ta_ids)

        result = [
            {
                "id": uid,
                "name": profile_display_name(profile_map.get(uid, {})),
                "email": (profile_map.get(uid, {}) or {}).get("email"),
                "projects": assignments_map.get(uid, []),
            }
            for uid in ta_ids
        ]
        result.sort(key=lambda t: (t["name"] or "").lower())
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing class TAs | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to list TAs")


def _project_class_id(client, project_id: UUID) -> str:
    res = (
        client.table("projects")
        .select("id, class_id")
        .eq("id", str(project_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return res.data[0]["class_id"]


def assign_ta_to_project(instructor_id: str, project_id: UUID, target_user_id: UUID) -> dict:
    """Assign a class TA to oversee a project (instructor only).

    The target must already be a TA in the project's class. TAs are NOT added to
    project_members, so this never changes team size or membership counts.
    """
    try:
        client = _client()
        class_id = _project_class_id(client, project_id)
        _require_class_instructor(client, instructor_id, class_id)

        if get_enrollment_role(client, class_id, str(target_user_id)) != ENROLLMENT_ROLE_TA:
            raise HTTPException(
                status_code=400,
                detail="User must be a TA in this class before being assigned to a project",
            )

        existing = (
            client.table("project_ta_assignments")
            .select("id")
            .eq("project_id", str(project_id))
            .eq("user_id", str(target_user_id))
            .execute()
        )
        if existing.data:
            return {"message": "TA already assigned to this project", "user_id": str(target_user_id)}

        client.table("project_ta_assignments").insert({
            "class_id": str(class_id),
            "project_id": str(project_id),
            "user_id": str(target_user_id),
            "assigned_by": instructor_id,
        }).execute()

        logger.info(
            "TA assigned to project | project_id=%s user_id=%s by=%s",
            project_id, target_user_id, instructor_id,
        )
        return {"message": "TA assigned to project", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error assigning TA | project_id=%s user_id=%s", project_id, target_user_id
        )
        raise HTTPException(status_code=500, detail="Failed to assign TA")


def remove_ta_from_project(instructor_id: str, project_id: UUID, target_user_id: UUID) -> dict:
    """Remove a TA's assignment from a project (instructor only)."""
    try:
        client = _client()
        class_id = _project_class_id(client, project_id)
        _require_class_instructor(client, instructor_id, class_id)

        client.table("project_ta_assignments").delete().eq(
            "project_id", str(project_id)
        ).eq("user_id", str(target_user_id)).execute()

        logger.info(
            "TA removed from project | project_id=%s user_id=%s by=%s",
            project_id, target_user_id, instructor_id,
        )
        return {"message": "TA removed from project", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error removing TA | project_id=%s user_id=%s", project_id, target_user_id
        )
        raise HTTPException(status_code=500, detail="Failed to remove TA")


def list_project_tas(user_id: str, project_id: UUID) -> list[dict]:
    """List the TAs assigned to a project (instructor or any class member)."""
    try:
        client = _client()
        class_id = _project_class_id(client, project_id)

        # Access: class instructor or an enrolled member of the class.
        class_res = (
            client.table("classes").select("created_by").eq("id", str(class_id)).execute()
        )
        is_instructor = bool(class_res.data) and class_res.data[0].get("created_by") == user_id
        if not is_instructor and get_enrollment_role(client, class_id, user_id) is None:
            raise HTTPException(status_code=403, detail="You do not have access to this class")

        rows = (
            client.table("project_ta_assignments")
            .select("user_id, assigned_at")
            .eq("project_id", str(project_id))
            .execute()
        )
        ta_rows = rows.data or []
        ta_ids = [str(r["user_id"]) for r in ta_rows if r.get("user_id")]
        if not ta_ids:
            return []

        profiles = (
            client.table("profiles").select(PROFILE_SELECT).in_("id", ta_ids).execute()
        )
        profile_map = {p["id"]: p for p in (profiles.data or [])}

        result = [
            {
                "user_id": r["user_id"],
                "name": profile_display_name(profile_map.get(r["user_id"], {})),
                "email": (profile_map.get(r["user_id"], {}) or {}).get("email"),
                "assigned_at": r.get("assigned_at"),
            }
            for r in ta_rows
            if r.get("user_id")
        ]
        result.sort(key=lambda t: (t["name"] or "").lower())
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing project TAs | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to list project TAs")


def get_ta_review_targets(user_id: str, class_id: UUID) -> dict:
    """For a TA: the projects they oversee plus the class's TSR assignments.

    Powers the TA review page. The TA picks a TSR assignment and a project,
    then the regular TSR-overview endpoint returns the (TA-scoped) responses.
    """
    try:
        client = _client()
        if get_enrollment_role(client, class_id, user_id) != ENROLLMENT_ROLE_TA:
            raise HTTPException(status_code=403, detail="You are not a TA in this class")

        assignment_rows = _ta_assignments_by_user(client, class_id, [user_id])
        projects = assignment_rows.get(user_id, [])

        assignments_res = (
            client.table("assignments")
            .select("id, Title, open_date, close_date, status, assignment_type")
            .eq("class_id", str(class_id))
            .eq("assignment_type", "tsr")
            .order("open_date")
            .execute()
        )
        assignments = assignments_res.data or []

        return {"projects": projects, "assignments": assignments}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching TA review targets | class_id=%s user_id=%s",
            class_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch TA review targets")
