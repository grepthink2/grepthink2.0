"""Business logic for the scrum board.

Permission model (RLS is on with no policies; everything is enforced here):
  * Team members (project_members row)                -> full read/write ("member").
  * Class instructor (classes.created_by), class TAs
    (enrollment_role='ta'), assigned meeting TA
    (projects.assigned_ta_id)                          -> board read + comments ("staff").
  * Everyone else                                      -> 404 (don't leak existence).
Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md (D2, D4).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone, date

from fastapi import HTTPException

from app.database.client import service_client
# Sanctioned cross-module reuse (attendance/tas do the same):
from app.projects.controller import _is_instructor
from app.tas.controller import get_enrollment_role
from app.scrum.models import ESTIMATE_SCALES, TASK_TAGS

logger = logging.getLogger(__name__)

LA_UTC_OFFSET_HOURS = 8  # see _today_la()


def _client():
    if service_client is None:
        raise HTTPException(status_code=503, detail="Service unavailable")
    return service_client


def _board_access(*, project_id: str, user_id: str) -> str:
    """Return 'member' or 'staff'; raise 404 for everyone else."""
    client = _client()
    member = (client.table("project_members").select("id")
              .eq("project_id", str(project_id)).eq("user_id", str(user_id))
              .limit(1).execute())
    if member.data:
        return "member"
    proj_res = (client.table("projects").select("id, class_id, assigned_ta_id")
                .eq("id", str(project_id)).maybe_single().execute())
    proj = proj_res.data if proj_res else None
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(proj.get("assigned_ta_id") or "") == str(user_id):
        return "staff"
    if _is_instructor(user_id, proj["class_id"]):
        return "staff"
    if get_enrollment_role(client, proj["class_id"], user_id) == "ta":
        return "staff"
    raise HTTPException(status_code=404, detail="Project not found")


def _require_writer(*, project_id: str, user_id: str) -> None:
    if _board_access(project_id=project_id, user_id=user_id) != "member":
        raise HTTPException(status_code=403, detail="Only team members can modify the board")


def _today_la() -> date:
    """Calendar day in America/Los_Angeles (fixed -8h: a DST-hour drift in a burnup
    day bucket is acceptable; avoids a zoneinfo dependency on the serverless image)."""
    return (datetime.now(timezone.utc) - timedelta(hours=LA_UTC_OFFSET_HOURS)).date()


def update_settings(*, project_id: str, user_id: str, estimate_scale: str) -> None:
    _require_writer(project_id=project_id, user_id=user_id)
    if estimate_scale not in ESTIMATE_SCALES:
        raise HTTPException(status_code=422, detail="Unknown estimate scale")
    client = _client()
    res = client.table("projects").update({"estimate_scale": estimate_scale}).eq("id", str(project_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")


def create_sprint(*, project_id: str, user_id: str, name: str, starts_at, ends_at) -> dict:
    _require_writer(project_id=project_id, user_id=user_id)
    client = _client()
    res = client.table("sprints").insert({
        "project_id": str(project_id), "name": name,
        "starts_at": str(starts_at), "ends_at": str(ends_at),
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create sprint")
    return res.data[0]


def _get_sprint_or_404(client, sprint_id: str) -> dict:
    res = (client.table("sprints").select("id, project_id, name, starts_at, ends_at, status")
           .eq("id", str(sprint_id)).maybe_single().execute())
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return row


def update_sprint(*, sprint_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    sprint = _get_sprint_or_404(client, sprint_id)
    _require_writer(project_id=sprint["project_id"], user_id=user_id)
    allowed = {k: (str(v) if k in ("starts_at", "ends_at") else v)
               for k, v in fields.items()
               if k in ("name", "starts_at", "ends_at", "status") and v is not None}
    if not allowed:
        return sprint
    res = client.table("sprints").update(allowed).eq("id", str(sprint_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update sprint")
    return res.data[0]
