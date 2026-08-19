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


def _next_key(client, project_id: str, kind: str) -> str:
    res = client.rpc("scrum_next_key", {"p_project_id": str(project_id), "p_kind": kind}).execute()
    n = res.data if isinstance(res.data, int) else (res.data or [{}])[0]
    if not isinstance(n, int):
        raise HTTPException(status_code=500, detail="Failed to allocate key")
    return f"{'US' if kind == 'story' else 'GT'}-{n}"


def _validate_tags(tags: list[str]) -> None:
    bad = [t for t in tags if t not in TASK_TAGS]
    if bad:
        raise HTTPException(status_code=422, detail="Unknown tag")


def _get_story_or_404(client, story_id: str) -> dict:
    res = (client.table("user_stories").select("*")
           .eq("id", str(story_id)).maybe_single().execute())
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail="Story not found")
    return row


def _get_task_or_404(client, task_id: str) -> dict:
    res = (client.table("tasks").select("*")
           .eq("id", str(task_id)).maybe_single().execute())
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


def create_story(*, project_id: str, user_id: str, fields: dict) -> dict:
    _require_writer(project_id=project_id, user_id=user_id)
    client = _client()
    key = _next_key(client, project_id, "story")
    row = {"project_id": str(project_id), "key": key, "reporter_id": str(user_id)}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "sprint_id"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("user_stories").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create story")
    story = res.data[0]
    if story.get("sprint_id"):
        _snapshot_burnup_safe(story["sprint_id"])
    return story


def update_story(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    story = _get_story_or_404(client, story_id)
    _require_writer(project_id=story["project_id"], user_id=user_id)
    payload: dict = {}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id"):
        if k in fields:
            payload[k] = fields[k]
    if "sprint_id" in fields:
        payload["sprint_id"] = fields["sprint_id"]      # None ⇒ backlog
    if "archived" in fields and fields["archived"] is not None:
        payload["archived_at"] = datetime.now(timezone.utc).isoformat() if fields["archived"] else None
    if not payload:
        return story
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = client.table("user_stories").update(payload).eq("id", str(story_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update story")
    for sid in {story.get("sprint_id"), res.data[0].get("sprint_id")}:
        if sid:
            _snapshot_burnup_safe(sid)
    return res.data[0]


def create_task(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    story = _get_story_or_404(client, story_id)
    _require_writer(project_id=story["project_id"], user_id=user_id)
    _validate_tags(fields.get("tags") or [])
    key = _next_key(client, story["project_id"], "task")
    row = {"story_id": str(story_id), "project_id": str(story["project_id"]),
           "key": key, "reporter_id": str(user_id)}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "tags"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("tasks").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create task")
    if story.get("sprint_id"):
        _snapshot_burnup_safe(story["sprint_id"])
    return res.data[0]


def update_task(*, task_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    task = _get_task_or_404(client, task_id)
    _require_writer(project_id=task["project_id"], user_id=user_id)
    if fields.get("tags") is not None:
        _validate_tags(fields["tags"])
    payload: dict = {}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "tags"):
        if k in fields:
            payload[k] = fields[k]
    if "pr_url" in fields:
        payload.update(_pr_fields(fields["pr_url"]))    # Task B9; stub below until then
    if not payload:
        return task
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = client.table("tasks").update(payload).eq("id", str(task_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update task")
    return res.data[0]


def _pr_fields(pr_url):
    """Replaced in Task B9 with real parsing + a state fetch."""
    if pr_url is None:
        return {"pr_url": None, "pr_provider": None, "pr_state": None, "pr_checked_at": None}
    raise HTTPException(status_code=422, detail="PR linking lands in Task B9")


def delete_task(*, task_id: str, user_id: str) -> None:
    client = _client()
    task = _get_task_or_404(client, task_id)
    _require_writer(project_id=task["project_id"], user_id=user_id)
    client.table("tasks").delete().eq("id", str(task_id)).execute()


def _live_burnup_totals(client, sprint_id: str) -> tuple[int, int]:
    stories = (client.table("user_stories").select("id, points")
               .eq("sprint_id", str(sprint_id)).is_("archived_at", "null").execute())
    story_rows = stories.data or []
    scope = sum(s["points"] or 0 for s in story_rows)
    completed = 0
    ids = [s["id"] for s in story_rows]
    if ids:
        tasks = (client.table("tasks").select("points, status")
                 .in_("story_id", ids).eq("status", "done").execute())
        completed = sum(t["points"] or 0 for t in (tasks.data or []))
    return scope, completed


def _snapshot_burnup_safe(sprint_id: str) -> None:
    """Best-effort daily snapshot; never fails the triggering write."""
    try:
        client = _client()
        scope, completed = _live_burnup_totals(client, sprint_id)
        client.table("sprint_burnup_days").upsert(
            {"sprint_id": str(sprint_id), "day": _today_la().isoformat(),
             "scope_points": scope, "completed_points": completed},
            on_conflict="sprint_id,day").execute()
    except Exception:
        logger.exception("scrum: burnup snapshot failed | sprint=%s", sprint_id)


def move_task(*, task_id: str, user_id: str, to_status: str) -> dict:
    if to_status not in ("todo", "in_progress", "done"):
        raise HTTPException(status_code=422, detail="Unknown status")
    client = _client()
    task = _get_task_or_404(client, task_id)
    _require_writer(project_id=task["project_id"], user_id=user_id)
    if task["status"] == to_status:
        return {"task": task, "move": None}
    res = client.table("task_moves").insert(
        {"task_id": str(task_id), "to_status": to_status, "moved_by": str(user_id)}
    ).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to move task")
    move = res.data[0]
    task = {**task, "status": to_status, "moved_by": str(user_id), "moved_at": move["moved_at"]}
    story = _get_story_or_404(client, task["story_id"])
    if story.get("sprint_id"):
        _snapshot_burnup_safe(story["sprint_id"])
    return {"task": task, "move": move}


def _display_name(profile: dict | None) -> str:
    if not profile:
        return "Unknown"
    name = f"{profile.get('first_name') or ''} {profile.get('last_name') or ''}".strip()
    return name or (profile.get("email") or "Unknown")


def get_board(*, project_id: str, user_id: str, sprint_id: str | None) -> dict:
    access = _board_access(project_id=project_id, user_id=user_id)
    client = _client()
    proj = (client.table("projects").select("id, name, estimate_scale")
            .eq("id", str(project_id)).maybe_single().execute())
    project = proj.data if proj else None
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sprints = (client.table("sprints").select("id, name, starts_at, ends_at, status")
               .eq("project_id", str(project_id)).order("starts_at").execute()).data or []

    selected = None
    if sprint_id:
        selected = next((s for s in sprints if s["id"] == str(sprint_id)), None)
        if not selected:
            raise HTTPException(status_code=404, detail="Sprint not found")
    else:
        active = [s for s in sprints if s["status"] == "active"]
        selected = (sorted(active, key=lambda s: s["starts_at"])[-1] if active
                    else (sprints[-1] if sprints else None))

    all_stories = (client.table("user_stories").select("*")
                   .eq("project_id", str(project_id)).order("created_at").execute()).data or []
    story_ids = [s["id"] for s in all_stories]
    tasks = []
    if story_ids:
        tasks = (client.table("tasks").select("*")
                 .in_("story_id", story_ids).order("created_at").execute()).data or []

    comments = []
    if story_ids:
        comments = (client.table("scrum_comments").select("story_id, task_id")
                    .in_("story_id", story_ids).execute()).data or []
        task_ids = [t["id"] for t in tasks]
        if task_ids:
            comments += (client.table("scrum_comments").select("story_id, task_id")
                         .in_("task_id", task_ids).execute()).data or []
    story_counts: dict[str, int] = {}
    task_counts: dict[str, int] = {}
    for c in comments:
        if c.get("story_id"):
            story_counts[c["story_id"]] = story_counts.get(c["story_id"], 0) + 1
        if c.get("task_id"):
            task_counts[c["task_id"]] = task_counts.get(c["task_id"], 0) + 1

    member_rows = (client.table("project_members").select("user_id, role")
                   .eq("project_id", str(project_id)).execute()).data or []
    profile_ids = ({m["user_id"] for m in member_rows}
                   | {t["moved_by"] for t in tasks if t.get("moved_by")})
    profiles: dict[str, dict] = {}
    if profile_ids:
        rows = (client.table("profiles").select("id, first_name, last_name, email, image_url")
                .in_("id", list(profile_ids)).execute()).data or []
        profiles = {r["id"]: r for r in rows}
    members = [{"user_id": m["user_id"], "name": _display_name(profiles.get(m["user_id"])),
                "image_url": (profiles.get(m["user_id"]) or {}).get("image_url"),
                "project_role": m.get("role")} for m in member_rows]

    tasks_by_story: dict[str, list] = {}
    for t in tasks:
        t["comment_count"] = task_counts.get(t["id"], 0)
        t["moved_by_name"] = _display_name(profiles.get(t["moved_by"])) if t.get("moved_by") else None
        tasks_by_story.setdefault(t["story_id"], []).append(t)
    for s in all_stories:
        s["comment_count"] = story_counts.get(s["id"], 0)
        s["tasks"] = tasks_by_story.get(s["id"], [])

    sel_id = selected["id"] if selected else None
    stories = [s for s in all_stories
               if s.get("sprint_id") == sel_id and not s.get("archived_at")] if sel_id else []
    backlog = [s for s in all_stories if s.get("sprint_id") is None or s.get("archived_at")]

    from datetime import date as _date
    sprint_series = None
    if selected:
        _snapshot_burnup_safe(selected["id"])
        snaps = (client.table("sprint_burnup_days").select("day, scope_points, completed_points")
                 .eq("sprint_id", selected["id"]).order("day").execute()).data or []
        live_scope, live_completed = _live_burnup_totals(client, selected["id"])
        from app.scrum.burnup import build_sprint_series
        sprint_series = build_sprint_series(
            snapshots=snaps, starts_at=_date.fromisoformat(str(selected["starts_at"])),
            ends_at=_date.fromisoformat(str(selected["ends_at"])), today=_today_la(),
            live_scope=live_scope, live_completed=live_completed)
        sprint_series["subtitle"] = f"{selected['starts_at']} – {selected['ends_at']}"

    from app.scrum.burnup import build_cumulative_series
    cumulative_input = []
    for s in sprints:
        snaps = (client.table("sprint_burnup_days").select("day, scope_points, completed_points")
                 .eq("sprint_id", s["id"]).order("day", desc=True).limit(1).execute()).data or []
        final = snaps[0] if snaps else None
        if s["id"] == sel_id or final is None:
            sc, co = _live_burnup_totals(client, s["id"])
            final = {"scope_points": sc, "completed_points": co}
        cumulative_input.append({"id": s["id"], "name": s["name"], "final": final})
    cumulative = build_cumulative_series(cumulative_input)

    from app.config import settings
    return {"project": project, "ai_enabled": bool(settings.AI_API_KEY),
            "sprints": sprints, "sprint_id": sel_id,
            "stories": stories, "backlog": backlog,
            "burnup": {"sprint": sprint_series, "cumulative": cumulative},
            "members": members, "access": access}
