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
