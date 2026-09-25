"""Business logic for the scrum board.

Permission model (the backend uses the service-role key, so every check is here):

* Team members (a ``project_members`` row)            -> full read/write ("member").
* Class instructor (``classes.created_by``), class TAs
  (``enrollment_role = 'ta'``), the meeting TA
  (``projects.assigned_ta_id``)                          -> board read + comments ("staff").
* Anyone else                                            -> 403, the project's existence is
  not hidden; a project that does not exist is 404.

The 404/403 split follows ``app/core/authz.py``. Until 2026-09 non-members got 404 here
to hide the project's existence; the app-wide policy is not to, and the maintainer
aligned the board with it (spec D2).
Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md (D2, D4).
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.config import settings
from app.core import authz
from app.core.db import fan_out, get_client
from app.scrum.burnup import build_cumulative_series, build_sprint_series
from app.scrum.models import ESTIMATE_SCALES, TASK_TAGS
from app.scrum.pr_links import fetch_pr_state, parse_pr_url, parse_repo_url, pr_repo_prefix
from app.utils.profiles import profile_display_name

logger = logging.getLogger(__name__)

_LA_TZ = ZoneInfo("America/Los_Angeles")  # same rule as attendance
PR_REFRESH_MAX = 20
PR_STALE_AFTER = timedelta(minutes=10)
AI_DAILY_LIMIT = 10

#: 403: staff read the board and comment on it, but only team members change it (D2).
MEMBERS_ONLY = "Only team members can modify the board"
#: 404s for the board's own resources (projects use ``authz.PROJECT_NOT_FOUND``).
SPRINT_NOT_FOUND = "Sprint not found"
STORY_NOT_FOUND = "Story not found"
TASK_NOT_FOUND = "Task not found"
REPO_NOT_FOUND = "Repo not found"
#: 422s raised from more than one place.
BAD_DATE_RANGE = "ends_at must be on or after starts_at"
TITLE_REQUIRED = "title cannot be null"


# ------------------------------------------------------------------- access ----


def _board_access(client, *, project_id: str, user_id: str) -> str:
    """``'member'`` or ``'staff'``.

    404 :data:`authz.PROJECT_NOT_FOUND` when the project does not exist; 403
    :data:`authz.NOT_PROJECT_MEMBER` when it exists but the caller is neither on the
    team nor staff for its class. One round trip for a member, the common case.
    """
    # Row existence rather than ``authz.get_project_role``: ``project_members.role``
    # is nullable, and a member whose role is NULL is still on the team.
    member = (
        client.table("project_members")
        .select("id")
        .eq("project_id", str(project_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    if member.data:
        return "member"  # a membership row means the project exists
    project = authz.load_project(client, project_id, class_columns="created_by")
    if str(project.get("assigned_ta_id") or "") == str(user_id):
        return "staff"
    if str((project.get("classes") or {}).get("created_by") or "") == str(user_id):
        return "staff"
    if authz.get_enrollment_role(client, project["class_id"], user_id) == authz.ROLE_TA:
        return "staff"
    raise HTTPException(status_code=403, detail=authz.NOT_PROJECT_MEMBER)


def _require_writer(client, *, project_id: str, user_id: str) -> None:
    if _board_access(client, project_id=project_id, user_id=user_id) != "member":
        raise HTTPException(status_code=403, detail=MEMBERS_ONLY)


# --------------------------------------------------------------------- time ----


def _today_la() -> date:
    """Calendar day in America/Los_Angeles (attendance uses the same rule)."""
    return datetime.now(_LA_TZ).date()


def _la_day(ts: str) -> date:
    """LA calendar day of a Supabase timestamptz string."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(_LA_TZ).date()


# ---------------------------------------------------------- settings, sprints ----


def update_settings(*, project_id: str, user_id: str, estimate_scale: str) -> None:
    client = get_client()
    _require_writer(client, project_id=project_id, user_id=user_id)
    if estimate_scale not in ESTIMATE_SCALES:
        raise HTTPException(status_code=422, detail="Unknown estimate scale")
    res = (
        client.table("projects")
        .update({"estimate_scale": estimate_scale})
        .eq("id", str(project_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=authz.PROJECT_NOT_FOUND)


def create_sprint(*, project_id: str, user_id: str, name: str, starts_at, ends_at) -> dict:
    client = get_client()
    _require_writer(client, project_id=project_id, user_id=user_id)
    if ends_at < starts_at:
        raise HTTPException(status_code=422, detail=BAD_DATE_RANGE)
    res = (
        client.table("sprints")
        .insert(
            {
                "project_id": str(project_id),
                "name": name,
                "starts_at": str(starts_at),
                "ends_at": str(ends_at),
            }
        )
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create sprint")
    return res.data[0]


def _get_sprint_or_404(client, sprint_id: str) -> dict:
    res = (
        client.table("sprints")
        .select("id, project_id, name, starts_at, ends_at, status")
        .eq("id", str(sprint_id))
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND)
    return row


def _require_sprint_in_project(client, sprint_id: str, project_id: str) -> None:
    sprint = _get_sprint_or_404(client, sprint_id)
    if str(sprint["project_id"]) != str(project_id):
        raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND)


def update_sprint(*, sprint_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    sprint = _get_sprint_or_404(client, sprint_id)
    _require_writer(client, project_id=sprint["project_id"], user_id=user_id)
    allowed = {
        k: (str(v) if k in ("starts_at", "ends_at") else v)
        for k, v in fields.items()
        if k in ("name", "starts_at", "ends_at", "status") and v is not None
    }
    if not allowed:
        return sprint
    eff_start = date.fromisoformat(allowed.get("starts_at", str(sprint["starts_at"])))
    eff_end = date.fromisoformat(allowed.get("ends_at", str(sprint["ends_at"])))
    if eff_end < eff_start:
        raise HTTPException(status_code=422, detail=BAD_DATE_RANGE)
    res = client.table("sprints").update(allowed).eq("id", str(sprint_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update sprint")
    return res.data[0]


# ------------------------------------------------------------ stories, tasks ----


def _next_key(client, project_id: str, kind: str) -> str:
    res = client.rpc(
        "scrum_next_key", {"p_project_id": str(project_id), "p_kind": kind}, operation="write"
    ).execute()
    n = res.data if isinstance(res.data, int) else (res.data or [{}])[0]
    if not isinstance(n, int):
        raise HTTPException(status_code=500, detail="Failed to allocate key")
    return f"{'US' if kind == 'story' else 'GT'}-{n}"


def _validate_tags(tags: list[str]) -> None:
    bad = [t for t in tags if t not in TASK_TAGS]
    if bad:
        raise HTTPException(status_code=422, detail="Unknown tag")


def _get_story_or_404(client, story_id: str) -> dict:
    res = client.table("user_stories").select("*").eq("id", str(story_id)).maybe_single().execute()
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail=STORY_NOT_FOUND)
    return row


def _get_task_or_404(client, task_id: str) -> dict:
    res = client.table("tasks").select("*").eq("id", str(task_id)).maybe_single().execute()
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail=TASK_NOT_FOUND)
    return row


def create_story(*, project_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    _require_writer(client, project_id=project_id, user_id=user_id)
    if fields.get("sprint_id"):
        _require_sprint_in_project(client, fields["sprint_id"], project_id)
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
        _snapshot_burnup_safe(client, story["sprint_id"])
    return story


def update_story(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    story = _get_story_or_404(client, story_id)
    _require_writer(client, project_id=story["project_id"], user_id=user_id)
    if "title" in fields and fields["title"] is None:
        raise HTTPException(status_code=422, detail=TITLE_REQUIRED)
    payload: dict = {}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id"):
        if k in fields:
            payload[k] = fields[k]
    if "sprint_id" in fields:
        if fields["sprint_id"] is not None:
            _require_sprint_in_project(client, fields["sprint_id"], story["project_id"])
        payload["sprint_id"] = fields["sprint_id"]  # None ⇒ backlog
    if "archived" in fields and fields["archived"] is not None:
        payload["archived_at"] = datetime.now(UTC).isoformat() if fields["archived"] else None
    if not payload:
        return story
    payload["updated_at"] = datetime.now(UTC).isoformat()
    res = client.table("user_stories").update(payload).eq("id", str(story_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update story")
    # Only scope-bearing edits move the burnup line. A snapshot costs three
    # more sequential round-trips (two to recompute totals, one to upsert), so
    # a title or description edit would pay ~half the request for nothing —
    # `completed` comes from task status, which a story write never touches.
    if {"points", "sprint_id", "archived_at"} & payload.keys():
        for sid in {story.get("sprint_id"), res.data[0].get("sprint_id")}:
            if sid:
                _snapshot_burnup_safe(client, sid)
    return res.data[0]


def create_task(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    story = _get_story_or_404(client, story_id)
    _require_writer(client, project_id=story["project_id"], user_id=user_id)
    _validate_tags(fields.get("tags") or [])
    key = _next_key(client, story["project_id"], "task")
    row = {
        "story_id": str(story_id),
        "project_id": str(story["project_id"]),
        "key": key,
        "reporter_id": str(user_id),
    }
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "tags"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("tasks").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create task")
    if story.get("sprint_id"):
        _snapshot_burnup_safe(client, story["sprint_id"])
    return res.data[0]


def update_task(*, task_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    task = _get_task_or_404(client, task_id)
    _require_writer(client, project_id=task["project_id"], user_id=user_id)
    if "title" in fields and fields["title"] is None:
        raise HTTPException(status_code=422, detail=TITLE_REQUIRED)
    if "tags" in fields and fields["tags"] is None:
        raise HTTPException(status_code=422, detail="tags cannot be null")
    if fields.get("tags") is not None:
        _validate_tags(fields["tags"])
    payload: dict = {}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "tags"):
        if k in fields:
            payload[k] = fields[k]
    if "pr_url" in fields and fields["pr_url"] != task.get("pr_url"):
        payload.update(_pr_fields(client, fields["pr_url"], project_id=task["project_id"]))
    if not payload:
        return task
    payload["updated_at"] = datetime.now(UTC).isoformat()
    res = client.table("tasks").update(payload).eq("id", str(task_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update task")
    return res.data[0]


def delete_task(*, task_id: str, user_id: str) -> None:
    client = get_client()
    task = _get_task_or_404(client, task_id)
    _require_writer(client, project_id=task["project_id"], user_id=user_id)
    client.table("tasks").delete().eq("id", str(task_id)).execute()


# ----------------------------------------------------------------- PR links ----


def _match_repo_token(repo_rows: list[dict], parsed: dict) -> str | None:
    """Team token for a parsed PR ref (D8): exact repo-prefix match first, then any
    same-provider repo with a token, else None (caller falls back to env/anonymous)."""
    prefix = pr_repo_prefix(parsed)
    for r in repo_rows:
        if (
            r.get("access_token")
            and r.get("provider") == parsed["provider"]
            and r.get("repo_url") == prefix
        ):
            return r["access_token"]
    for r in repo_rows:
        if r.get("access_token") and r.get("provider") == parsed["provider"]:
            return r["access_token"]
    return None


def _project_repo_rows(client, project_id: str) -> list[dict]:
    res = (
        client.table("scrum_repos")
        .select("repo_url, provider, access_token")
        .eq("project_id", str(project_id))
        .execute()
    )
    return res.data or []


def _pr_fields(client, pr_url, *, project_id: str) -> dict:
    if pr_url is None:
        return {"pr_url": None, "pr_provider": None, "pr_state": None, "pr_checked_at": None}
    parsed = parse_pr_url(pr_url)
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail="PR URL must be a github.com pull or git.ucsc.edu merge request",
        )
    token = _match_repo_token(_project_repo_rows(client, project_id), parsed)
    # Store the truth: on fetch failure pr_state stays NULL (never a fabricated
    # 'draft') and pr_checked_at stays NULL so refresh retries immediately.
    state = fetch_pr_state(parsed, token=token)
    return {
        "pr_url": pr_url,
        "pr_provider": parsed["provider"],
        "pr_state": state,
        "pr_checked_at": datetime.now(UTC).isoformat() if state else None,
    }


def refresh_pr_states(*, project_id: str, user_id: str) -> dict:
    client = get_client()
    _board_access(client, project_id=project_id, user_id=user_id)
    rows = (
        client.table("tasks")
        .select("id, pr_url, pr_state, pr_checked_at")
        .eq("project_id", str(project_id))
        .not_.is_("pr_url", "null")
        .execute()
    ).data or []
    cutoff = datetime.now(UTC) - PR_STALE_AFTER
    stale = []
    for t in rows:
        if not t.get("pr_url"):
            continue
        checked = t.get("pr_checked_at")
        if not checked or datetime.fromisoformat(checked.replace("Z", "+00:00")) < cutoff:
            stale.append(t)
    stale = stale[:PR_REFRESH_MAX]

    repo_rows = _project_repo_rows(client, project_id)

    def state_of(t: dict) -> str | None:
        parsed = parse_pr_url(t["pr_url"])
        if not parsed:
            return None
        return fetch_pr_state(parsed, token=_match_repo_token(repo_rows, parsed))

    # Each fetch is a GitHub/GitLab round trip, so they run side by side.
    states = fan_out({t["id"]: (lambda t=t: state_of(t)) for t in stale})
    old_state = {t["id"]: t.get("pr_state") for t in stale}
    updated: dict[str, str] = {}
    now = datetime.now(UTC).isoformat()
    for task_id, state in states.items():
        if state and state != old_state.get(task_id):
            updated[task_id] = state
        payload = {"pr_checked_at": now}
        if state:
            payload["pr_state"] = state
        try:
            client.table("tasks").update(payload).eq("id", str(task_id)).execute()
        except Exception:
            logger.exception("scrum: pr refresh write failed | task=%s", task_id)
    return {"updated": updated}


# ------------------------------------------------------------------- burnup ----


def _totals(stories: list[dict], done_tasks: list[dict]) -> tuple[int, int]:
    """(scope, completed): story points in the sprint, and points of its done tasks."""
    scope = sum(s.get("points") or 0 for s in stories)
    completed = sum(t.get("points") or 0 for t in done_tasks)
    return scope, completed


def _live_burnup_totals(client, sprint_id: str) -> tuple[int, int]:
    """Totals straight from the database, for writes that have no board loaded."""
    stories = (
        client.table("user_stories")
        .select("id, points")
        .eq("sprint_id", str(sprint_id))
        .is_("archived_at", "null")
        .execute()
    ).data or []
    ids = [s["id"] for s in stories]
    done = []
    if ids:
        done = (
            client.table("tasks")
            .select("points")
            .in_("story_id", ids)
            .eq("status", "done")
            .execute()
        ).data or []
    return _totals(stories, done)


def _snapshot_burnup_safe(client, sprint_id: str, totals: tuple[int, int] | None = None) -> None:
    """Best-effort daily snapshot; never fails the triggering write.
    Pass precomputed (scope, completed) via `totals` to skip the recompute."""
    try:
        scope, completed = totals if totals is not None else _live_burnup_totals(client, sprint_id)
        client.table("sprint_burnup_days").upsert(
            {
                "sprint_id": str(sprint_id),
                "day": _today_la().isoformat(),
                "scope_points": scope,
                "completed_points": completed,
            },
            on_conflict="sprint_id,day",
        ).execute()
    except Exception:
        logger.exception("scrum: burnup snapshot failed | sprint=%s", sprint_id)


def _completed_by_day_from_moves(
    client, task_points: dict[str, int], starts_at: date, ends_at: date
) -> dict[str, int]:
    """Exact completed points per LA day for the sprint's tasks, reconstructed from the
    task_moves audit (spec D7: fills past days that predate the lazy snapshots).

    ``task_points`` maps each task in the sprint's live stories to its points; the board
    has those rows loaded already, so only the audit is read here.
    """
    if not task_points:
        return {}
    moves = (
        client.table("task_moves")
        .select("task_id, to_status, moved_at")
        .in_("task_id", list(task_points))
        .order("moved_at")
        .execute()
    ).data or []
    if not moves:
        return {}
    status: dict[str, str] = {}
    out: dict[str, int] = {}
    i = 0
    d = starts_at
    end = min(ends_at, _today_la())
    while d <= end:
        while i < len(moves) and _la_day(moves[i]["moved_at"]) <= d:
            status[moves[i]["task_id"]] = moves[i]["to_status"]
            i += 1
        out[d.isoformat()] = sum(task_points[tid] for tid, st in status.items() if st == "done")
        d += timedelta(days=1)
    return out


# ------------------------------------------------------------------- moves ----


def move_task(*, task_id: str, user_id: str, to_status: str) -> dict:
    if to_status not in ("todo", "in_progress", "done"):
        raise HTTPException(status_code=422, detail="Unknown status")
    client = get_client()
    task = _get_task_or_404(client, task_id)
    _require_writer(client, project_id=task["project_id"], user_id=user_id)
    if task["status"] == to_status:
        return {
            "task": {**task, "moved_by_name": _name_for(client, task.get("moved_by"))},
            "move": None,
        }
    res = (
        client.table("task_moves")
        .insert({"task_id": str(task_id), "to_status": to_status, "moved_by": str(user_id)})
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to move task")
    move = res.data[0]
    # The board list resolves moved_by_name from its bulk profile fetch; this
    # single-row response has to resolve its own, or the client reconciles the
    # optimistic audit line down to "Unknown".
    task = {
        **task,
        "status": to_status,
        "moved_by": str(user_id),
        "moved_at": move["moved_at"],
        "moved_by_name": _name_for(client, user_id),
    }
    story = _get_story_or_404(client, task["story_id"])
    if story.get("sprint_id"):
        _snapshot_burnup_safe(client, story["sprint_id"])
    return {"task": task, "move": move}


def _display_name(profile: dict | None) -> str:
    return profile_display_name(profile) or "Unknown"


def _name_for(client, user_id: str | None) -> str | None:
    """Display name for one user id — the single-row counterpart to the bulk
    profile fetch in get_board. None for an unset id, so callers can tell
    "nobody has moved this" apart from "moved by someone we can't name"."""
    if not user_id:
        return None
    res = (
        client.table("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", str(user_id))
        .maybe_single()
        .execute()
    )
    return _display_name(res.data if res else None)


# -------------------------------------------------------------------- board ----


def get_board(*, project_id: str, user_id: str, sprint_id: str | None) -> dict:
    """The whole board in three rounds of concurrent reads, whatever the sprint count.

    Round 1 needs only the project id; round 2 needs the story and sprint ids from
    round 1; round 3 needs the task ids and movers from round 2. Burnup totals come
    from those rows, not from another query per sprint.
    """
    client = get_client()
    access = _board_access(client, project_id=project_id, user_id=user_id)
    pid = str(project_id)

    def rows(query) -> list[dict]:
        return query.execute().data or []

    first = fan_out(
        {
            "project": lambda: authz.load_project(client, pid, columns="id, name, estimate_scale"),
            "sprints": lambda: rows(
                client.table("sprints")
                .select("id, name, starts_at, ends_at, status")
                .eq("project_id", pid)
                .order("starts_at")
            ),
            "stories": lambda: rows(
                client.table("user_stories").select("*").eq("project_id", pid).order("created_at")
            ),
            "members": lambda: rows(
                client.table("project_members").select("user_id, role").eq("project_id", pid)
            ),
        }
    )
    project, sprints = first["project"], first["sprints"]
    all_stories, member_rows = first["stories"], first["members"]

    selected = None
    if sprint_id:
        selected = next((s for s in sprints if s["id"] == str(sprint_id)), None)
        if not selected:
            raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND)
    else:
        active = [s for s in sprints if s["status"] == "active"]
        selected = (
            sorted(active, key=lambda s: s["starts_at"])[-1]
            if active
            else (sprints[-1] if sprints else None)
        )

    story_ids = [s["id"] for s in all_stories]
    sprint_ids = [s["id"] for s in sprints]
    second = fan_out(
        {
            "tasks": lambda: (
                rows(
                    client.table("tasks").select("*").in_("story_id", story_ids).order("created_at")
                )
                if story_ids
                else []
            ),
            "snaps": lambda: (
                rows(
                    client.table("sprint_burnup_days")
                    .select("sprint_id, day, scope_points, completed_points")
                    .in_("sprint_id", sprint_ids)
                    .order("day")
                )
                if sprint_ids
                else []
            ),
        }
    )
    tasks, all_snaps = second["tasks"], second["snaps"]

    task_ids = [t["id"] for t in tasks]
    profile_ids = {m["user_id"] for m in member_rows} | {
        t["moved_by"] for t in tasks if t.get("moved_by")
    }
    # One comment query for both parent kinds; ids are DB-sourced UUIDs (PostgREST-safe).
    or_filter = f"story_id.in.({','.join(story_ids)})"
    if task_ids:
        or_filter += f",task_id.in.({','.join(task_ids)})"
    third = fan_out(
        {
            "comments": lambda: (
                rows(client.table("scrum_comments").select("story_id, task_id").or_(or_filter))
                if story_ids
                else []
            ),
            "profiles": lambda: (
                rows(
                    client.table("profiles")
                    .select("id, first_name, last_name, email, image_url")
                    .in_("id", list(profile_ids))
                )
                if profile_ids
                else []
            ),
        }
    )
    profiles = {r["id"]: r for r in third["profiles"]}

    story_counts: dict[str, int] = {}
    task_counts: dict[str, int] = {}
    for c in third["comments"]:
        if c.get("story_id"):
            story_counts[c["story_id"]] = story_counts.get(c["story_id"], 0) + 1
        if c.get("task_id"):
            task_counts[c["task_id"]] = task_counts.get(c["task_id"], 0) + 1

    members = [
        {
            "user_id": m["user_id"],
            "name": _display_name(profiles.get(m["user_id"])),
            "image_url": (profiles.get(m["user_id"]) or {}).get("image_url"),
            "project_role": m.get("role"),
        }
        for m in member_rows
    ]

    tasks_by_story: dict[str, list] = {}
    for t in tasks:
        t["comment_count"] = task_counts.get(t["id"], 0)
        t["moved_by_name"] = (
            _display_name(profiles.get(t["moved_by"])) if t.get("moved_by") else None
        )
        tasks_by_story.setdefault(t["story_id"], []).append(t)
    for s in all_stories:
        s["comment_count"] = story_counts.get(s["id"], 0)
        s["tasks"] = tasks_by_story.get(s["id"], [])

    sel_id = selected["id"] if selected else None
    stories = (
        [s for s in all_stories if s.get("sprint_id") == sel_id and not s.get("archived_at")]
        if sel_id
        else []
    )
    backlog = [s for s in all_stories if s.get("sprint_id") is None or s.get("archived_at")]

    def live_stories(sid: str) -> list[dict]:
        return [s for s in all_stories if s.get("sprint_id") == sid and not s.get("archived_at")]

    def sprint_totals(sid: str) -> tuple[int, int]:
        in_sprint = live_stories(sid)
        done = [t for s in in_sprint for t in s["tasks"] if t.get("status") == "done"]
        return _totals(in_sprint, done)

    snaps_by_sprint: dict[str, list[dict]] = {}
    for row in all_snaps:
        snaps_by_sprint.setdefault(row["sprint_id"], []).append(row)

    sprint_series = None
    live_totals: tuple[int, int] | None = None
    today = _today_la()
    if selected:
        live_totals = sprint_totals(selected["id"])
        _snapshot_burnup_safe(client, selected["id"], totals=live_totals)
        starts = date.fromisoformat(str(selected["starts_at"]))
        ends = date.fromisoformat(str(selected["ends_at"]))
        snaps = snaps_by_sprint.get(selected["id"], [])
        if today >= starts:
            day_key = today.isoformat()
            if not any(s["day"] == day_key for s in snaps):
                snaps = [
                    *snaps,
                    {
                        "day": day_key,
                        "scope_points": live_totals[0],
                        "completed_points": live_totals[1],
                    },
                ]
        elapsed = (min(today, ends) - starts).days + 1 if today >= starts else 0
        completed_by_day = None
        if elapsed > len(snaps):  # snapshots started late — reconstruct from the audit
            task_points = {
                t["id"]: t.get("points") or 0
                for s in live_stories(selected["id"])
                for t in s["tasks"]
            }
            completed_by_day = _completed_by_day_from_moves(client, task_points, starts, ends)
        sprint_series = build_sprint_series(
            snapshots=snaps,
            starts_at=starts,
            ends_at=ends,
            today=today,
            live_scope=live_totals[0],
            live_completed=live_totals[1],
            completed_by_day=completed_by_day,
        )
        sprint_series["subtitle"] = f"{selected['starts_at']} – {selected['ends_at']}"

    cumulative_input = []
    for s in sprints:
        if s["id"] == sel_id and live_totals is not None:
            final = {"scope_points": live_totals[0], "completed_points": live_totals[1]}
        elif snaps_by_sprint.get(s["id"]):
            final = snaps_by_sprint[s["id"]][-1]  # ordered by day ascending
        else:
            scope, completed = sprint_totals(s["id"])
            final = {"scope_points": scope, "completed_points": completed}
        cumulative_input.append({"id": s["id"], "name": s["name"], "final": final})
    cumulative = build_cumulative_series(cumulative_input)

    return {
        "project": project,
        "ai_enabled": bool(settings.AI_API_KEY and settings.AI_BASE_URL),
        "sprints": sprints,
        "sprint_id": sel_id,
        "stories": stories,
        "backlog": backlog,
        "burnup": {"sprint": sprint_series, "cumulative": cumulative},
        "members": members,
        "access": access,
    }


# ------------------------------------------------------------ repo registry ----


def list_repos(*, project_id: str, user_id: str) -> list[dict]:
    """Repo registry rows for the settings UI. Tokens are write-only: the API
    exposes only has_token, never the credential (D8)."""
    client = get_client()
    _board_access(client, project_id=project_id, user_id=user_id)
    rows = (
        client.table("scrum_repos")
        .select("id, repo_url, provider, access_token, created_at")
        .eq("project_id", str(project_id))
        .order("created_at")
        .execute()
    ).data or []
    return [_repo_out(r) for r in rows]


def _repo_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "repo_url": row["repo_url"],
        "provider": row["provider"],
        "has_token": bool(row.get("access_token")),
    }


def add_repo(*, project_id: str, user_id: str, repo_url: str, access_token: str | None) -> dict:
    client = get_client()
    _require_writer(client, project_id=project_id, user_id=user_id)
    parsed = parse_repo_url(repo_url)
    if not parsed:
        raise HTTPException(
            status_code=422, detail="Repo URL must be a github.com or git.ucsc.edu repository"
        )
    row = {
        "project_id": str(project_id),
        "repo_url": parsed["repo_url"],
        "provider": parsed["provider"],
    }
    if access_token:
        row["access_token"] = access_token
    # Re-adding the same repo rotates (or clears) its token.
    res = client.table("scrum_repos").upsert(row, on_conflict="project_id,repo_url").execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save repo")
    return _repo_out(res.data[0])


def delete_repo(*, repo_id: str, user_id: str) -> None:
    client = get_client()
    res = (
        client.table("scrum_repos")
        .select("id, project_id")
        .eq("id", str(repo_id))
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail=REPO_NOT_FOUND)
    _require_writer(client, project_id=row["project_id"], user_id=user_id)
    client.table("scrum_repos").delete().eq("id", str(repo_id)).execute()


# ----------------------------------------------------------------- comments ----


def _fanout_mentions(
    client,
    *,
    project_id: str,
    parent_kind: str,
    parent_id: str,
    parent_key: str,
    author_id: str,
    body_md: str,
) -> None:
    """No-op seam. Activated by the mentions plan
    (docs/superpowers/plans/2026-08-13-mentions-system.md, Task M3): extract mention
    UUIDs, intersect with team ∪ staff, notify via the generic `mention` type."""
    return None


def _get_comment_parent(client, parent_kind: str, parent_id: str) -> dict:
    if parent_kind == "story":
        return _get_story_or_404(client, parent_id)
    return _get_task_or_404(client, parent_id)


def create_comment(*, parent_kind: str, parent_id: str, user_id: str, body_md: str) -> dict:
    client = get_client()
    parent = _get_comment_parent(client, parent_kind, parent_id)
    _board_access(client, project_id=parent["project_id"], user_id=user_id)  # staff comment (D2)
    row = {
        "author_id": str(user_id),
        "body_md": body_md,
        ("story_id" if parent_kind == "story" else "task_id"): str(parent_id),
    }
    res = client.table("scrum_comments").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create comment")
    _fanout_mentions(
        client,
        project_id=parent["project_id"],
        parent_kind=parent_kind,
        parent_id=parent_id,
        parent_key=parent.get("key", ""),
        author_id=user_id,
        body_md=body_md,
    )
    return {**res.data[0], "author_name": _name_for(client, user_id)}


def list_comments(*, parent_kind: str, parent_id: str, user_id: str) -> list[dict]:
    client = get_client()
    parent = _get_comment_parent(client, parent_kind, parent_id)
    _board_access(client, project_id=parent["project_id"], user_id=user_id)
    col = "story_id" if parent_kind == "story" else "task_id"
    rows = (
        client.table("scrum_comments")
        .select("id, author_id, body_md, created_at")
        .eq(col, str(parent_id))
        .order("created_at")
        .execute()
    ).data or []
    author_ids = list({r["author_id"] for r in rows})
    names: dict[str, str] = {}
    if author_ids:
        profs = (
            client.table("profiles")
            .select("id, first_name, last_name, email")
            .in_("id", author_ids)
            .execute()
        ).data or []
        names = {p["id"]: _display_name(p) for p in profs}
    return [{**r, "author_name": names.get(r["author_id"], "Unknown")} for r in rows]


# ----------------------------------------------------------------- AI draft ----


def ai_draft(
    *, project_id: str, user_id: str, kind: str, prompt: str, story_id: str | None
) -> dict:
    client = get_client()
    _require_writer(client, project_id=project_id, user_id=user_id)
    if not settings.AI_API_KEY or not settings.AI_BASE_URL:
        raise HTTPException(status_code=503, detail="AI drafting is not configured")

    today = _today_la().isoformat()
    usage_res = (
        client.table("ai_draft_usage")
        .select("count")
        .eq("user_id", str(user_id))
        .eq("used_on", today)
        .maybe_single()
        .execute()
    )
    used = (usage_res.data or {}).get("count", 0) if usage_res else 0
    if used >= AI_DAILY_LIMIT:
        raise HTTPException(status_code=429, detail="Daily AI draft limit reached (10/day)")

    project = authz.load_project(client, project_id, columns="estimate_scale")
    scale = ESTIMATE_SCALES[project.get("estimate_scale") or "fibonacci"]

    story_context = None
    if story_id:
        story = _get_story_or_404(client, story_id)
        if story["project_id"] != str(project_id):
            raise HTTPException(status_code=404, detail=STORY_NOT_FOUND)
        story_context = (
            f"{story['key']} {story['title']}: {(story.get('description_md') or '')[:500]}"
        )

    from app.scrum.ai_draft import request_draft, snap_points

    try:
        raw = request_draft(
            kind=kind,
            prompt=prompt,
            scale_values=scale,
            tags=TASK_TAGS,
            story_context=story_context,
        )
    except Exception:
        logger.exception("scrum: ai draft failed | project=%s", project_id)
        raise HTTPException(status_code=502, detail="Draft failed — try again")

    draft = {
        "title": raw.get("title"),
        "description_md": raw.get("description_md"),
        "points": snap_points(raw.get("points"), scale),
        "time_estimate": raw.get("time_estimate"),
        "tasks": [
            {
                "title": str(t.get("title") or "")[:200],
                "tags": [tag for tag in (t.get("tags") or []) if tag in TASK_TAGS],
                "points": snap_points(t.get("points"), scale),
                "time_estimate": t.get("time_estimate"),
            }
            for t in (raw.get("tasks") or [])
            if t.get("title")
        ],
    }

    # Courtesy quota: read-modify-write race can miscount by one; acceptable (spec D14).
    client.table("ai_draft_usage").upsert(
        {"user_id": str(user_id), "used_on": today, "count": used + 1},
        on_conflict="user_id,used_on",
    ).execute()
    return {"draft": draft}
