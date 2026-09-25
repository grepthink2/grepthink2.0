"""Authorization helpers shared by every feature controller.

Controllers query Postgres with the service-role key, so RLS does not apply:
these helpers *are* the access-control layer. A missing check in a controller
is an IDOR, so every read/write path should go through one of these.

Roles (see AGENTS.md):

- class instructor  = ``classes.created_by``
- class TA          = ``class_enrollments.enrollment_role == 'ta'``
- enrolled student  = ``class_enrollments.enrollment_role == 'student'``
- project roles     = ``project_members.role``
- account role (``profiles.role``) = may create classes; never used for a class decision

Not found versus not allowed
----------------------------

Every endpoint answers these two conditions the same way:

- **404** means the resource the request addresses does not exist: the class,
  project, assignment, TSR, join request, invite, roster entry, and so on.
- **403** means the resource exists and the caller is signed in, but lacks the
  relationship or role the action needs: not the class instructor, not
  enrolled, not a project member, not the assigned TA, the wrong project role,
  the wrong profile role.
- Existence is not hidden from non-members, so check that the resource exists
  before checking access. Ids are UUIDs, and the web client never branches on
  403 versus 404 (it only special-cases 401).
- When the thing acted on is a membership that does not exist, that membership
  is the missing resource, so the answer is 404: leaving a class you are not
  in, removing a member who is not on the team, viewing the profile of a user
  who is not in the class, unassigning a user with no team. Resources private
  to one user and looked up through that user, such as notifications, are 404
  as well.
- One condition gets one status and one ``detail``: the constants below. Write
  a different message only when it adds real information, such as "Only the
  instructor can appoint another TA".

:func:`require_class_instructor` and :func:`require_class_access` enforce this:
404 for a missing class, 403 for denied access, and no status arguments. A
controller that reads the rows itself (to fan them out alongside its own data)
raises the same statuses with the same constants.

Every helper takes the client explicitly so it can be exercised against
``tests/fake_supabase.FakeSupabase`` without patching module globals.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import TypedDict

from fastapi import HTTPException

ROLE_STUDENT = "student"
ROLE_TA = "ta"
#: ``my_role`` for a class the caller created (``classes.created_by``).
ROLE_INSTRUCTOR = "instructor"

#: Project roles allowed to manage membership / review join requests.
ELEVATED_PROJECT_ROLES: tuple[str, ...] = ("owner", "product owner", "admin")

CLASS_COLUMNS = "id, created_by"
PROJECT_COLUMNS = "id, class_id, name, assigned_ta_id"

#: 404: the class does not exist.
CLASS_NOT_FOUND = "Class not found"
#: 403: only the class instructor (``classes.created_by``) may do this.
NOT_CLASS_INSTRUCTOR = "Only the class instructor can do this"
#: 403: the caller is neither the class instructor nor enrolled (student or TA).
NOT_CLASS_MEMBER = "You do not have access to this class"
#: 403: the action needs the caller to be enrolled in the class.
NOT_ENROLLED = "You are not enrolled in this class"
#: 403: the caller's ``profiles.role`` is not ``instructor``.
INSTRUCTOR_ROLE_REQUIRED = "Instructor role required"
#: 404: the project does not exist.
PROJECT_NOT_FOUND = "Project not found"
#: 403: the caller has no ``project_members`` row on the project.
NOT_PROJECT_MEMBER = "Not a member of this project"
#: 403: the caller is a member, but not in a role the action allows.
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


def require_class_instructor(client, user_id, class_id, *, columns: str = CLASS_COLUMNS) -> dict:
    """Return the class row (so callers do not fetch it again) when ``user_id``
    created the class.

    404 :data:`CLASS_NOT_FOUND` when the class does not exist; 403
    :data:`NOT_CLASS_INSTRUCTOR` when someone else created it.
    """
    row = load_class(client, class_id, columns)
    if row is None:
        raise HTTPException(status_code=404, detail=CLASS_NOT_FOUND)
    if str(row.get("created_by")) != str(user_id):
        raise HTTPException(status_code=403, detail=NOT_CLASS_INSTRUCTOR)
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


def require_class_access(client, user_id, class_id, *, columns: str = CLASS_COLUMNS) -> ClassAccess:
    """Instructor **or** enrolled (student/TA) — the read-access rule for class data.

    404 :data:`CLASS_NOT_FOUND` when the class does not exist; 403
    :data:`NOT_CLASS_MEMBER` when the caller is neither its instructor nor enrolled.
    """
    access = get_class_access(client, user_id, class_id, columns=columns)
    if access is None:
        raise HTTPException(status_code=404, detail=CLASS_NOT_FOUND)
    if not access["is_instructor"] and access["enrollment_role"] is None:
        raise HTTPException(status_code=403, detail=NOT_CLASS_MEMBER)
    return access


# --------------------------------------------------------------- projects ----


def load_project(
    client,
    project_id,
    *,
    columns: str = PROJECT_COLUMNS,
    class_columns: str | None = None,
) -> dict:
    """The ``projects`` row (404 :data:`PROJECT_NOT_FOUND` when missing).

    With ``class_columns`` the owning class is embedded under ``classes`` in the
    same round trip (``projects.class_id -> classes.id``), which removes the
    separate ``classes`` read most callers used to make right after.
    """
    select = columns if class_columns is None else f"{columns}, classes({class_columns})"
    res = client.table("projects").select(select).eq("id", str(project_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=PROJECT_NOT_FOUND)
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
    denied_detail: str = INSUFFICIENT_PROJECT_ROLE,
) -> str:
    """Raise unless the user holds one of ``allowed`` roles on the project.

    403 :data:`NOT_PROJECT_MEMBER` for a non-member; 403 ``denied_detail`` for a
    member in another role. A missing project has no members either, so load it
    first (:func:`load_project` answers the 404).
    """
    role = get_project_role(client, project_id, user_id)
    if role is None:
        raise HTTPException(status_code=403, detail=NOT_PROJECT_MEMBER)
    if role not in set(allowed):
        raise HTTPException(status_code=403, detail=denied_detail)
    return role
