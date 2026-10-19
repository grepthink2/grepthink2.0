"""Business logic for a team's one-off meetings.

A team meeting is a ``meetings`` row with ``kind = 'team_meeting'`` and ``cadence = 'once'``
(2026-10-18_team_meetings.sql), next to the weekly TA slots that ``app/attendance`` owns. Every
query here names ``kind = 'team_meeting'``, as every ``meetings`` query there names
``cadence = 'weekly'``, so neither module reaches the other's rows.

Permission model (the service-role client bypasses RLS, so every check is here):

* Read  -> a member of the team (a ``project_members`` row, whatever its ``role``: it is
  nullable), the class instructor, or the project's assigned meeting TA.
* Write -> only a member whose ``project_members.role`` is ``product owner``. The instructor and
  the assigned TA read the list but do not change it, and a team the instructor created has no
  Product Owner until one is assigned.
* A project that does not exist is 404 (``authz.PROJECT_NOT_FOUND``). A caller with no access to it
  is 403 (``authz.NOT_PROJECT_MEMBER``); a caller who may read but not write is 403
  (``ONLY_PRODUCT_OWNER``).

Round trips: the project is loaded with its class embedded (one read); the caller's membership is
one more, fanned out with the meetings for the list; a write is one request. Three at most.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException

from app.assignments import deadlines
from app.core import authz
from app.core.db import fan_out, get_client
from app.projects.controller import ROLE_PRODUCT_OWNER
from app.team_meetings.models import TeamMeetingCreate, TeamMeetingUpdate

logger = logging.getLogger(__name__)

KIND = "team_meeting"
CADENCE = "once"

#: 403: the caller may read the team's meetings but only its Product Owner changes them.
ONLY_PRODUCT_OWNER = "Only the team's Product Owner can change meetings."
#: 404: no team meeting with that id on that project (a TA slot or another team's meeting is none).
MEETING_NOT_FOUND = "Meeting not found"
#: 400: a new meeting can't start in the past. An edit may keep, or move to, a time that has passed.
START_IN_PAST = "That time has already passed."

_MEETING_COLUMNS = (
    "id, project_id, title, scheduled_at, duration_minutes, location, zoom_url, note, "
    "created_by, updated_at"
)


# ------------------------------------------------------------------- access ----


def _load_project(client, project_id) -> dict:
    """The project with its class embedded under ``classes`` (one round trip; 404 if missing)."""
    return authz.load_project(client, project_id, class_columns=authz.CLASS_COLUMNS)


def _membership(client, project_id, user_id) -> dict | None:
    """The caller's ``project_members`` row, or ``None`` when they are not on the team.

    A row, not ``authz.get_project_role``: ``role`` is nullable, and that function answers
    ``None`` for a member whose role is NULL just as it does for someone who is not on the team.
    """
    rows = (
        client.table("project_members")
        .select("role")
        .eq("project_id", str(project_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def _is_product_owner(membership: dict | None) -> bool:
    return membership is not None and membership.get("role") == ROLE_PRODUCT_OWNER


def _may_read(project: dict, user_id: str, membership: dict | None) -> bool:
    """A team member, the class instructor, or the project's assigned meeting TA."""
    if membership is not None:
        return True
    others = ((project.get("classes") or {}).get("created_by"), project.get("assigned_ta_id"))
    return any(other is not None and str(other) == str(user_id) for other in others)


def _require_reader(project: dict, user_id: str, membership: dict | None) -> None:
    if not _may_read(project, user_id, membership):
        raise HTTPException(status_code=403, detail=authz.NOT_PROJECT_MEMBER)


def _require_product_owner(project: dict, user_id: str, membership: dict | None) -> None:
    """403 unless the caller is the team's Product Owner. Someone with no access to the team at all
    gets the same answer as on a read; a reader who may not write is told who may."""
    if _is_product_owner(membership):
        return
    _require_reader(project, user_id, membership)
    raise HTTPException(status_code=403, detail=ONLY_PRODUCT_OWNER)


# --------------------------------------------------------------------- rows ----


def _instant(value: datetime) -> str:
    """An aware datetime as the UTC ISO string PostgREST stores and returns."""
    return value.astimezone(UTC).isoformat()


def _team_meetings(client, project_id) -> list[dict]:
    """The team's meetings, soonest first."""
    return (
        client.table("meetings")
        .select(_MEETING_COLUMNS)
        .eq("project_id", str(project_id))
        .eq("kind", KIND)
        .eq("cadence", CADENCE)  # lets Postgres use meetings_project_once_idx
        .order("scheduled_at")
        .execute()
    ).data or []


def _out(row: dict) -> dict:
    """A ``meetings`` row as the API shows it: ``scheduled_at`` is ``starts_at``."""
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "title": row["title"],
        "starts_at": row["scheduled_at"],
        "duration_minutes": row["duration_minutes"],
        "location": row.get("location"),
        "zoom_url": row.get("zoom_url"),
        "note": row.get("note"),
        "created_by": row.get("created_by"),
        "updated_at": row.get("updated_at"),
    }


def _changes(data: TeamMeetingUpdate) -> dict:
    """The columns an edit names. A field left out of the request is not touched."""
    changes = data.model_dump(exclude_unset=True)
    if "starts_at" in changes:
        changes["scheduled_at"] = _instant(changes.pop("starts_at"))
    return changes


# --------------------------------------------------------------- the endpoints ----


def list_team_meetings(project_id: UUID, user_id: str) -> dict:
    """The team's meetings, soonest first, and whether the caller may change them.

    Who can call: a team member, the class instructor, the project's assigned TA.
    Returns: ``{"meetings": [<meeting>, ...], "can_manage": bool}``; ``can_manage`` is true for
    the team's Product Owner only.
    Raises: 404 when the project does not exist; 403 when the caller is none of the above.
    """
    client = get_client()
    project = _load_project(client, project_id)
    reads = fan_out(
        {
            "membership": lambda: _membership(client, project_id, user_id),
            "meetings": lambda: _team_meetings(client, project_id),
        }
    )
    membership = reads["membership"]
    _require_reader(project, user_id, membership)
    return {
        "meetings": [_out(row) for row in reads["meetings"]],
        "can_manage": _is_product_owner(membership),
    }


def create_team_meeting(project_id: UUID, user_id: str, data: TeamMeetingCreate) -> dict:
    """Add a meeting to the team's calendar.

    Who can call: the team's Product Owner.
    Returns: the new meeting.
    Raises: 404 no such project; 403 not the Product Owner; 400 when the start has passed.
    """
    client = get_client()
    project = _load_project(client, project_id)
    _require_product_owner(project, user_id, _membership(client, project_id, user_id))
    now = deadlines.now_utc()
    if data.starts_at < now:
        raise HTTPException(status_code=400, detail=START_IN_PAST)
    res = (
        client.table("meetings")
        .insert(
            {
                "class_id": str(project["class_id"]),
                "project_id": str(project_id),
                "kind": KIND,
                "cadence": CADENCE,
                "title": data.title,
                "scheduled_at": _instant(data.starts_at),
                "duration_minutes": data.duration_minutes,
                "location": data.location,
                "zoom_url": data.zoom_url,
                "note": data.note,
                "created_by": str(user_id),
                "updated_at": now.isoformat(),
            }
        )
        .execute()
    )
    row = res.data[0]
    logger.info(
        "Team meeting created | project_id=%s meeting_id=%s created_by=%s",
        project_id,
        row["id"],
        user_id,
    )
    return _out(row)


def update_team_meeting(
    project_id: UUID, meeting_id: UUID, user_id: str, data: TeamMeetingUpdate
) -> dict:
    """Change the fields ``data`` names on one of the team's meetings.

    Who can call: the team's Product Owner.
    Returns: the meeting as it is now.
    Raises: 404 no such project, or no such team meeting on it (a TA slot or another team's
    meeting is none); 403 not the Product Owner.
    """
    client = get_client()
    project = _load_project(client, project_id)
    _require_product_owner(project, user_id, _membership(client, project_id, user_id))
    res = (
        client.table("meetings")
        .update({**_changes(data), "updated_at": deadlines.now_utc().isoformat()})
        .eq("id", str(meeting_id))
        .eq("project_id", str(project_id))
        .eq("kind", KIND)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=MEETING_NOT_FOUND)
    logger.info(
        "Team meeting updated | project_id=%s meeting_id=%s updated_by=%s",
        project_id,
        meeting_id,
        user_id,
    )
    return _out(res.data[0])


def delete_team_meeting(project_id: UUID, meeting_id: UUID, user_id: str) -> None:
    """Remove one of the team's meetings, and with it any attendance taken for it.

    Who can call: the team's Product Owner.
    Raises: 404 no such project, or no such team meeting on it; 403 not the Product Owner.
    """
    client = get_client()
    project = _load_project(client, project_id)
    _require_product_owner(project, user_id, _membership(client, project_id, user_id))
    res = (
        client.table("meetings")
        .delete()
        .eq("id", str(meeting_id))
        .eq("project_id", str(project_id))
        .eq("kind", KIND)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=MEETING_NOT_FOUND)
    logger.info(
        "Team meeting deleted | project_id=%s meeting_id=%s deleted_by=%s",
        project_id,
        meeting_id,
        user_id,
    )
