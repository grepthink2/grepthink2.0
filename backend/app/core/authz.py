"""Authorization helpers shared by every feature controller.

Controllers query Postgres with the service-role key, so RLS does not apply:
these helpers *are* the access-control layer. A missing check in a controller
is an IDOR, so every read/write path should go through one of these.

Roles (see AGENTS.md):

- class instructor  = ``classes.created_by``
- class TA          = ``class_enrollments.enrollment_role == 'ta'``
- enrolled student  = ``class_enrollments.enrollment_role == 'student'``
- project roles     = ``project_members.role``

The HTTP status used for a denial is a parameter because the existing
endpoints (and their tests) deliberately differ: most instructor-only routes
answer 404 so a stranger cannot probe which class ids exist, while
project-role checks answer 403. Callers pass the code their contract needs.

Every helper takes the client explicitly so it can be exercised against
``tests/fake_supabase.FakeSupabase`` without patching module globals.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import TypedDict

from fastapi import HTTPException

ROLE_STUDENT = "student"
ROLE_TA = "ta"

#: Project roles allowed to manage membership / review join requests.
ELEVATED_PROJECT_ROLES: tuple[str, ...] = ("owner", "product owner", "admin")

CLASS_COLUMNS = "id, created_by"
PROJECT_COLUMNS = "id, class_id, name, assigned_ta_id"

CLASS_NOT_FOUND = "Class not found"
NOT_CLASS_INSTRUCTOR = "Only the class instructor can do this"
NOT_CLASS_MEMBER = "You do not have access to this class"
PROJECT_NOT_FOUND = "Project not found"
NOT_PROJECT_MEMBER = "Not a member of this project"
INSUFFICIENT_PROJECT_ROLE = "Insufficient project role"


#: What :func:`get_class_access` / :func:`require_class_access` return.
#: (Functional form because ``class`` is a keyword in the class-based syntax.)
ClassAccess = TypedDict(
    "ClassAccess",
    {"class": dict, "is_instructor": bool, "enrollment_role": str | None},
)


# ---------------------------------------------------------------- classes ----


def load_class(client, class_id, columns: str = CLASS_COLUMNS) -> dict | None:
    """The ``classes`` row, or ``None`` when it does not exist. One round trip."""
    res = client.table("classes").select(columns).eq("id", str(class_id)).limit(1).execute()
    return res.data[0] if res.data else None


def is_class_instructor(client, user_id, class_id) -> bool:
    """True iff ``user_id`` created the class. Never returns ``None``."""
    row = load_class(client, class_id, "created_by")
    return bool(row) and str(row.get("created_by")) == str(user_id)


def require_class_instructor(
    client,
    user_id,
    class_id,
    *,
    columns: str = CLASS_COLUMNS,
    missing: int = 404,
    denied: int = 403,
    missing_detail: str = CLASS_NOT_FOUND,
    denied_detail: str = NOT_CLASS_INSTRUCTOR,
) -> dict:
    """Raise unless ``user_id`` owns the class; return the class row (so callers
    do not fetch it again)."""
    row = load_class(client, class_id, columns)
    if row is None:
        raise HTTPException(status_code=missing, detail=missing_detail)
    if str(row.get("created_by")) != str(user_id):
        raise HTTPException(status_code=denied, detail=denied_detail)
    return row


# ------------------------------------------------------------ enrollments ----


def get_enrollment_role(client, class_id, user_id) -> str | None:
    """``'student'`` / ``'ta'`` for an enrolled user, ``None`` otherwise.

    The class instructor is not an enrollment row, so this returns ``None`` for
    them — use :func:`get_class_access` when both answers are needed.
    """
    res = (
        client.table("class_enrollments")
        .select("enrollment_role")
        .eq("class_id", str(class_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    return res.data[0].get("enrollment_role") or ROLE_STUDENT


def get_class_access(
    client, user_id, class_id, *, columns: str = CLASS_COLUMNS
) -> ClassAccess | None:
    """How ``user_id`` relates to the class, or ``None`` when the class is missing.

    At most two round trips (one for instructors).
    """
    row = load_class(client, class_id, columns)
    if row is None:
        return None
    if str(row.get("created_by")) == str(user_id):
        return {"class": row, "is_instructor": True, "enrollment_role": None}
    return {
        "class": row,
        "is_instructor": False,
        "enrollment_role": get_enrollment_role(client, class_id, user_id),
    }


def require_class_access(
    client,
    user_id,
    class_id,
    *,
    columns: str = CLASS_COLUMNS,
    missing: int = 404,
    denied: int = 403,
    missing_detail: str = CLASS_NOT_FOUND,
    denied_detail: str = NOT_CLASS_MEMBER,
) -> ClassAccess:
    """Instructor **or** enrolled (student/TA) — the read-access rule for class data."""
    access = get_class_access(client, user_id, class_id, columns=columns)
    if access is None:
        raise HTTPException(status_code=missing, detail=missing_detail)
    if not access["is_instructor"] and access["enrollment_role"] is None:
        raise HTTPException(status_code=denied, detail=denied_detail)
    return access


# --------------------------------------------------------------- projects ----


def load_project(
    client,
    project_id,
    *,
    columns: str = PROJECT_COLUMNS,
    class_columns: str | None = None,
    missing_detail: str = PROJECT_NOT_FOUND,
) -> dict:
    """The ``projects`` row (404 when missing).

    With ``class_columns`` the owning class is embedded under ``classes`` in the
    same round trip (``projects.class_id -> classes.id``), which removes the
    separate ``classes`` read most callers used to make right after.
    """
    select = columns if class_columns is None else f"{columns}, classes({class_columns})"
    res = client.table("projects").select(select).eq("id", str(project_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=missing_detail)
    return res.data[0]


def get_project_role(client, project_id, user_id) -> str | None:
    """The user's ``project_members.role``, or ``None`` when not a member."""
    res = (
        client.table("project_members")
        .select("role")
        .eq("project_id", str(project_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    return res.data[0].get("role") if res.data else None


def require_project_role(
    client,
    project_id,
    user_id,
    allowed: Iterable[str],
    *,
    denied: int = 403,
    not_member_detail: str = NOT_PROJECT_MEMBER,
    denied_detail: str = INSUFFICIENT_PROJECT_ROLE,
) -> str:
    """Raise unless the user holds one of ``allowed`` roles on the project."""
    role = get_project_role(client, project_id, user_id)
    if role is None:
        raise HTTPException(status_code=denied, detail=not_member_detail)
    if role not in set(allowed):
        raise HTTPException(status_code=denied, detail=denied_detail)
    return role
