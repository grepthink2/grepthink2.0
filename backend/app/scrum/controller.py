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

from app.assignments import deadlines
from app.config import settings
from app.core import authz, events
from app.core.db import fan_out, get_client
from app.core.errors import AppError
from app.institutions.controller import institution_timezone
from app.notifications.controller import notify_mention
from app.scrum.burnup import (
    Totals,
    build_cumulative_series,
    build_sprint_series,
    default_unit,
    holds_unit,
    units_available,
)
from app.scrum.models import ESTIMATE_SCALES, TASK_TAGS
from app.scrum.pr_links import fetch_pr_state, parse_pr_url, parse_repo_url, pr_repo_prefix
from app.scrum.schedule import SPRINT_NAME, Schedule, sprint_status, sprint_windows
from app.utils.mentions import extract_mention_ids
from app.utils.profiles import profile_display_name

logger = logging.getLogger(__name__)

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
#: 422: the board's ``?unit=`` is not a unit the selected sprint's burnup can draw (spec D21):
#: points while one of its tasks has none, or a value that is neither points nor hours.
UNIT_UNAVAILABLE = "Burnup unit not available for this sprint"
#: 409: a story leaves through the backlog, so a sprint's scope never drops by deletion.
STORY_IN_SPRINT = "Move the story to the backlog before deleting it"
#: 409: a class's new sprint schedule would delete a team's Sprint ``k`` while a story is in it
#: (spec D20). ``team`` is the project's name.
SPRINTS_IN_USE = (
    "{team} already uses Sprint {k}; lower the count after they move their stories or delete "
    "that plan"
)
#: 409, code ``task_blocked``: a task in To do waits until every task it depends on is done.
TASK_BLOCKED = "Finish the tasks this one depends on first"
#: Task dependencies (spec 2026-10-16): the edges refused (409, 422) and a missing one (404).
DEPENDENCY_CYCLE = "That would make the tasks depend on each other"
SELF_DEPENDENCY = "A task can't depend on itself"
ALREADY_DEPENDS = "Already a dependency"
DEPENDENCY_NOT_FOUND = "Dependency not found"


# ------------------------------------------------------------------- access ----


def _board_access(client, *, project_id: str, user_id: str) -> tuple[str, str | None]:
    """``('member' | 'staff', institution_id)``: the caller's access, and the school of the
    project's class (``None`` when it has none). The board files its days in that school's
    zone (:func:`_today`), so the id comes with the check every endpoint makes already.

    404 :data:`authz.PROJECT_NOT_FOUND` when the project does not exist; 403
    :data:`authz.NOT_PROJECT_MEMBER` when it exists but the caller is neither on the
    team nor staff for its class. One round trip for a member, the common case.
    """
    # Row existence rather than ``authz.get_project_role``: ``project_members.role``
    # is nullable, and a member whose role is NULL is still on the team.
    member = (
        client.table("project_members")
        .select("id, projects(classes(institution_id))")
        .eq("project_id", str(project_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    if member.data:  # a membership row means the project exists
        return "member", _institution_of(member.data[0].get("projects"))
    project = authz.load_project(client, project_id, class_columns="created_by, institution_id")
    if _staff_among(client, project, {str(user_id)}):
        return "staff", _institution_of(project)
    raise HTTPException(status_code=403, detail=authz.NOT_PROJECT_MEMBER)


def _institution_of(project: dict | None) -> str | None:
    """The school of a project row loaded with its class embedded (``classes(institution_id)``)."""
    return ((project or {}).get("classes") or {}).get("institution_id")


def _staff_among(client, project: dict, user_ids: set[str]) -> set[str]:
    """The ids in ``user_ids`` that are staff for ``project`` (loaded with
    ``class_columns`` that include ``created_by``): its meeting TA, its class's instructor, or a TA
    of its class. Ids compare lowercased. The TA lookup is one round trip, skipped
    when every id is already settled by the project row.
    """
    wanted = {str(u).lower() for u in user_ids}
    direct = {
        str(project.get("assigned_ta_id") or "").lower(),
        str((project.get("classes") or {}).get("created_by") or "").lower(),
    }
    staff = wanted & direct
    rest = wanted - staff
    if rest:
        tas = (
            client.table("class_enrollments")
            .select("user_id")
            .eq("class_id", str(project["class_id"]))
            .eq("enrollment_role", authz.ROLE_TA)
            .in_("user_id", sorted(rest))
            .execute()
        ).data or []
        staff |= {str(r["user_id"]).lower() for r in tas} & rest
    return staff


def _require_writer(client, *, project_id: str, user_id: str) -> str | None:
    """403 :data:`MEMBERS_ONLY` unless the caller is on the team; else the project's
    ``institution_id`` (see :func:`_board_access`), for the writes that file a burnup snapshot."""
    access, institution_id = _board_access(client, project_id=project_id, user_id=user_id)
    if access != "member":
        raise HTTPException(status_code=403, detail=MEMBERS_ONLY)
    return institution_id


# --------------------------------------------------------------------- time ----


def _today(zone: ZoneInfo) -> date:
    """Today's date at the school (``zone``, from ``institution_timezone``), whatever the
    server's zone: a school's day ends at its own midnight."""
    return deadlines.now_utc().astimezone(zone).date()


def _school_day(ts: str, zone: ZoneInfo) -> date:
    """The calendar day at the school (``zone``) of a Supabase timestamptz string."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(zone).date()


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


def _sprint_days(row: dict) -> tuple[date, date]:
    """A sprint row's first and last days (PostgREST sends dates as ISO text)."""
    return date.fromisoformat(str(row["starts_at"])), date.fromisoformat(str(row["ends_at"]))


def _with_status(row: dict, today: date) -> dict:
    """A copy of sprint ``row`` whose ``status`` follows its dates and ``today`` (spec D22).

    The stored ``sprints.status`` is never read (the queries here leave it out): nothing flips
    it for the sprints a class schedule creates.
    """
    return {**row, "status": sprint_status(*_sprint_days(row), today)}


def create_sprint(*, project_id: str, user_id: str, name: str, starts_at, ends_at) -> dict:
    client = get_client()
    institution_id = _require_writer(client, project_id=project_id, user_id=user_id)
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
    return _with_status(res.data[0], _today(institution_timezone(institution_id)))


def _get_sprint_or_404(client, sprint_id: str) -> dict:
    res = (
        client.table("sprints")
        .select("id, project_id, name, starts_at, ends_at")
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
    """Rename a sprint or move its dates. Its status follows the dates, so a ``status`` in
    ``fields`` is dropped like any other key; the sprint comes back with the derived one."""
    client = get_client()
    sprint = _get_sprint_or_404(client, sprint_id)
    institution_id = _require_writer(client, project_id=sprint["project_id"], user_id=user_id)
    today = _today(institution_timezone(institution_id))
    allowed = {
        k: (str(v) if k in ("starts_at", "ends_at") else v)
        for k, v in fields.items()
        if k in ("name", "starts_at", "ends_at") and v is not None
    }
    if not allowed:
        return _with_status(sprint, today)
    eff_start = date.fromisoformat(allowed.get("starts_at", str(sprint["starts_at"])))
    eff_end = date.fromisoformat(allowed.get("ends_at", str(sprint["ends_at"])))
    if eff_end < eff_start:
        raise HTTPException(status_code=422, detail=BAD_DATE_RANGE)
    res = client.table("sprints").update(allowed).eq("id", str(sprint_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update sprint")
    return _with_status(res.data[0], today)


# ----------------------------------------------------------- class schedule ----


def ensure_project_sprints(
    client, *, project_id: str, project_name: str, schedule: Schedule
) -> dict[str, int]:
    """Make a team's sprints follow its class's sprint schedule (spec D20).

    Sprint k of ``schedule`` is the team's sprint whose ``sequence`` is k, named "Sprint k"
    (:data:`~app.scrum.schedule.SPRINT_NAME`) and dated by the k-th window of
    :func:`~app.scrum.schedule.sprint_windows`. One read takes the team's sequenced sprints with
    the ids of their stories, archived ones included. Then, each only when there is something to
    write, it deletes the sprints beyond ``schedule.count`` in one delete, inserts the missing ones
    in one insert, and rewrites the ones whose name or dates differ in one upsert on ``id``, in
    place, so their stories stay in them. Neither write sends ``status``: a new sprint takes the
    column default, a rewritten one keeps its stored value, and the API derives it from the dates.
    A sprint without a ``sequence`` (made through :func:`create_sprint`) is never read or written.
    No burnup snapshot: a deleted sprint holds no story, and a moved one keeps its tasks.

    Who can call: the callers authorize (a team's creation, its class instructor's schedule
    change); nothing here checks a user. Returns ``{"created", "updated", "deleted"}`` counts.
    Raises 409 :data:`SPRINTS_IN_USE`, naming ``project_name`` and the lowest such k, when a story
    is in a sprint beyond the count; nothing is written then. Round trips: the read and at most
    one of each write. The schedule's own writes leave a team's sequences running from 1 with no
    gap, so its count either grows (the insert) or shrinks (the delete): three at most.
    """
    rows = (
        client.table("sprints")
        .select("id, name, starts_at, ends_at, sequence, user_stories(id)")
        .eq("project_id", str(project_id))
        .not_.is_("sequence", "null")
        .execute()
    ).data or []
    by_sequence = {row["sequence"]: row for row in rows}
    extras = {k: row for k, row in by_sequence.items() if k > schedule.count}
    in_use = [k for k, row in extras.items() if row.get("user_stories")]
    if in_use:
        detail = SPRINTS_IN_USE.format(team=project_name, k=min(in_use))
        raise HTTPException(status_code=409, detail=detail)

    missing: list[dict] = []
    changed: list[dict] = []
    windows = sprint_windows(schedule.start_on, schedule.count, schedule.frequency)
    for k, (starts_at, ends_at) in enumerate(windows, start=1):
        sprint = {
            "project_id": str(project_id),
            "sequence": k,
            "name": SPRINT_NAME.format(k=k),
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
        }
        row = by_sequence.get(k)
        if row is None:
            missing.append(sprint)
        elif row["name"] != sprint["name"] or _sprint_days(row) != (starts_at, ends_at):
            changed.append({"id": row["id"], **sprint})

    # The delete runs first, nearest the read that found these sprints empty: a story moved into
    # one of them in between would go to the backlog (``user_stories.sprint_id`` is ON DELETE SET
    # NULL).
    if extras:
        client.table("sprints").delete().in_("id", [row["id"] for row in extras.values()]).execute()
    if missing:
        client.table("sprints").insert(missing).execute()
    if changed:
        # Postgres checks NOT NULL on the proposed row before it finds the conflict on ``id``, so
        # each row carries every NOT NULL column that has no default; the update then sets only
        # the columns sent.
        client.table("sprints").upsert(changed, on_conflict="id").execute()
    return {"created": len(missing), "updated": len(changed), "deleted": len(extras)}


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


def _in_backlog(story: dict) -> bool:
    """Whether the board lists ``story`` in its backlog: it has no sprint, or it is a legacy
    archived row (``archived_at`` set), whatever sprint it still names. Nothing sets
    ``archived_at`` any more, and :func:`update_story` clears it on any sprint write."""
    return story.get("sprint_id") is None or bool(story.get("archived_at"))


def _get_task_or_404(client, task_id: str, columns: str = "*") -> dict:
    res = client.table("tasks").select(columns).eq("id", str(task_id)).maybe_single().execute()
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail=TASK_NOT_FOUND)
    return row


def _get_task_and_story_or_404(client, task_id: str) -> tuple[dict, dict]:
    """The task row, and its story's ``sprint_id`` and ``archived_at`` embedded in the same
    read: enough to tell whether a write to the task moves a sprint's burnup."""
    task = _get_task_or_404(client, task_id, columns="*, user_stories(sprint_id, archived_at)")
    return task, task.pop("user_stories", None) or {}


def create_story(*, project_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    institution_id = _require_writer(client, project_id=project_id, user_id=user_id)
    if fields.get("sprint_id"):
        _require_sprint_in_project(client, fields["sprint_id"], project_id)
    key = _next_key(client, project_id, "story")
    row = {"project_id": str(project_id), "key": key, "reporter_id": str(user_id)}
    for k in ("title", "description_md", "points", "assignee_id", "sprint_id"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("user_stories").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create story")
    story = res.data[0]
    if story.get("sprint_id"):
        _snapshot_burnup_safe(client, story["sprint_id"], institution_id)
    return story


def update_story(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    story = _get_story_or_404(client, story_id)
    institution_id = _require_writer(client, project_id=story["project_id"], user_id=user_id)
    if "title" in fields and fields["title"] is None:
        raise HTTPException(status_code=422, detail=TITLE_REQUIRED)
    payload: dict = {}
    for k in ("title", "description_md", "points", "assignee_id"):
        if k in fields:
            payload[k] = fields[k]
    if "sprint_id" in fields:
        if fields["sprint_id"] is not None:
            _require_sprint_in_project(client, fields["sprint_id"], story["project_id"])
        payload["sprint_id"] = fields["sprint_id"]  # None ⇒ backlog
        # a sprint write also clears the legacy archive flag
        payload["archived_at"] = None
    if not payload:
        return story
    payload["updated_at"] = datetime.now(UTC).isoformat()
    res = client.table("user_stories").update(payload).eq("id", str(story_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update story")
    # Only a sprint change moves the burnup line: the burnup counts the sprint's tasks, and
    # story points count nowhere (spec D21). A snapshot costs two more sequential round-trips
    # (one to recompute totals, one to upsert), so a title, points or description edit would
    # pay two of its five for nothing.
    if "sprint_id" in payload:
        for sid in {story.get("sprint_id"), res.data[0].get("sprint_id")}:
            if sid:
                _snapshot_burnup_safe(client, sid, institution_id)
    return res.data[0]


def delete_story(*, story_id: str, user_id: str) -> None:
    """Delete a backlog story; Postgres cascades its tasks, their comments and move history.

    Who can call: team members. Raises 404 :data:`STORY_NOT_FOUND`, 403 :data:`MEMBERS_ONLY`,
    and 409 :data:`STORY_IN_SPRINT` for a story in a sprint. No burnup snapshot: a backlog
    story is outside every sprint's scope.
    """
    client = get_client()
    story = _get_story_or_404(client, story_id)
    _require_writer(client, project_id=story["project_id"], user_id=user_id)
    if not _in_backlog(story):
        raise HTTPException(status_code=409, detail=STORY_IN_SPRINT)
    client.table("user_stories").delete().eq("id", str(story_id)).execute()


def create_task(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    story = _get_story_or_404(client, story_id)
    institution_id = _require_writer(client, project_id=story["project_id"], user_id=user_id)
    _validate_tags(fields.get("tags") or [])
    key = _next_key(client, story["project_id"], "task")
    row = {
        "story_id": str(story_id),
        "project_id": str(story["project_id"]),
        "key": key,
        "reporter_id": str(user_id),
    }
    for k in ("title", "description_md", "points", "estimate_hours", "assignee_id", "tags"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("tasks").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create task")
    if story.get("sprint_id"):
        _snapshot_burnup_safe(client, story["sprint_id"], institution_id)
    return res.data[0]


def update_task(*, task_id: str, user_id: str, fields: dict) -> dict:
    client = get_client()
    task, story = _get_task_and_story_or_404(client, task_id)
    institution_id = _require_writer(client, project_id=task["project_id"], user_id=user_id)
    if "title" in fields and fields["title"] is None:
        raise HTTPException(status_code=422, detail=TITLE_REQUIRED)
    if "tags" in fields and fields["tags"] is None:
        raise HTTPException(status_code=422, detail="tags cannot be null")
    if fields.get("tags") is not None:
        _validate_tags(fields["tags"])
    payload: dict = {}
    for k in ("title", "description_md", "points", "estimate_hours", "assignee_id", "tags"):
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
    # A task's points and hours are its sprint's scope (spec D21), and the web client applies an
    # edit without reloading the board, so a changed estimate snapshots the sprint here. The
    # client sends every field on each save: an edit that keeps both estimates pays nothing.
    # Status never changes here (a move takes its own snapshot): one write, one snapshot at most.
    changed = any(k in payload and payload[k] != task.get(k) for k in _UNIT_COLUMN.values())
    if changed and not _in_backlog(story):
        _snapshot_burnup_safe(client, story["sprint_id"], institution_id)
    return res.data[0]


def delete_task(*, task_id: str, user_id: str) -> None:
    client = get_client()
    task, story = _get_task_and_story_or_404(client, task_id)
    institution_id = _require_writer(client, project_id=task["project_id"], user_id=user_id)
    client.table("tasks").delete().eq("id", str(task_id)).execute()
    # Its points and hours leave the sprint's scope (spec D21); a task with neither moves nothing.
    estimated = any(task.get(k) is not None for k in _UNIT_COLUMN.values())
    if estimated and not _in_backlog(story):
        _snapshot_burnup_safe(client, story["sprint_id"], institution_id)


# ------------------------------------------------------------- dependencies ----


def _task_ref(task: dict, story: dict) -> dict:
    """A task as another task names it (``depends_on`` / ``blocks``) and as the board's
    ``task_index`` lists it: enough to label it, and its story's sprint to open it."""
    return {
        "id": task["id"],
        "key": task["key"],
        "title": task["title"],
        "status": task["status"],
        "story_id": task["story_id"],
        "story_key": story["key"],
        "sprint_id": story.get("sprint_id"),
    }


def _key_order(key: str) -> tuple:
    """Sort key for task keys: by the number after the last ``-`` ("GT-2" before "GT-10"),
    and as text when that part is not a number (``tasks.key`` has no format check)."""
    tail = key.rpartition("-")[2]
    try:
        return (0, int(tail), key)
    except ValueError:
        return (1, 0, key)


def _has_unfinished_dependency(client, task_id: str) -> bool:
    """Whether a task it depends on is not done: one read of its edges, and one more of
    those tasks' statuses when it has any."""
    edges = (
        client.table("task_dependencies")
        .select("depends_on_task_id")
        .eq("task_id", str(task_id))
        .execute()
    ).data or []
    if not edges:
        return False
    targets = (
        client.table("tasks")
        .select("id, status")
        .in_("id", [e["depends_on_task_id"] for e in edges])
        .execute()
    ).data or []
    return any(t["status"] != "done" for t in targets)


def _depends_on(edges: list[dict], start: str, target: str) -> bool:
    """Whether ``start`` depends on ``target``, directly or through other tasks: a walk along
    ``task_id → depends_on_task_id`` over the project's edges."""
    after: dict[str, list[str]] = {}
    for e in edges:
        after.setdefault(e["task_id"], []).append(e["depends_on_task_id"])
    seen, stack = {start}, [start]
    while stack:
        for nxt in after.get(stack.pop(), []):
            if nxt == target:
                return True
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return False


def add_dependency(*, task_id: str, user_id: str, depends_on_task_id: str) -> list[dict]:
    """Make ``task_id`` depend on ``depends_on_task_id``, a task of the same project in any
    sprint or the backlog.

    Who can call: team members. Returns the task's ``depends_on`` refs after the insert, in
    the order the edges were added. Raises 422 :data:`SELF_DEPENDENCY`; 404
    :data:`TASK_NOT_FOUND` when either task is missing or they are in different projects (a
    task of another project answers as a missing one); 403 as :func:`_require_writer`; 409
    :data:`ALREADY_DEPENDS`, and 409 :data:`DEPENDENCY_CYCLE` when the target already depends
    on the task, directly or through other tasks. Five round trips.
    """
    if str(depends_on_task_id).lower() == str(task_id).lower():
        raise HTTPException(status_code=422, detail=SELF_DEPENDENCY)
    client = get_client()
    pair = (
        client.table("tasks")
        .select("*")
        .in_("id", [str(task_id), str(depends_on_task_id)])
        .execute()
    ).data or []
    by_id = {str(t["id"]).lower(): t for t in pair}
    task = by_id.get(str(task_id).lower())
    target = by_id.get(str(depends_on_task_id).lower())
    if not task or not target or str(task["project_id"]) != str(target["project_id"]):
        raise HTTPException(status_code=404, detail=TASK_NOT_FOUND)
    pid = str(task["project_id"])
    _require_writer(client, project_id=pid, user_id=user_id)

    # The database's ids from here on, so a differently-cased id in the request still matches.
    tid, did = task["id"], target["id"]
    edges = (
        client.table("task_dependencies")
        .select("task_id, depends_on_task_id")
        .eq("project_id", pid)
        .order("created_at")
        .execute()
    ).data or []
    if any(e["task_id"] == tid and e["depends_on_task_id"] == did for e in edges):
        raise HTTPException(status_code=409, detail=ALREADY_DEPENDS)
    if _depends_on(edges, did, tid):
        raise HTTPException(status_code=409, detail=DEPENDENCY_CYCLE)
    # A concurrent duplicate loses on the primary key: DatabaseConflictError, a 409.
    res = (
        client.table("task_dependencies")
        .insert(
            {
                "task_id": tid,
                "depends_on_task_id": did,
                "project_id": pid,
                "created_by": str(user_id),
            }
        )
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to add the dependency")

    ids = [e["depends_on_task_id"] for e in edges if e["task_id"] == tid] + [did]
    targets = (
        client.table("tasks")
        .select("id, key, title, status, story_id, user_stories(key, sprint_id)")
        .in_("id", ids)
        .execute()
    ).data or []
    by_target = {t["id"]: t for t in targets}
    return [
        _task_ref(t, t["user_stories"])
        for i in ids
        if (t := by_target.get(i)) and t.get("user_stories")
    ]


def remove_dependency(*, task_id: str, user_id: str, depends_on_task_id: str) -> None:
    """Remove ``task_id``'s dependency on ``depends_on_task_id``.

    Who can call: team members. Raises 404 :data:`TASK_NOT_FOUND`, 403 as
    :func:`_require_writer`, and 404 :data:`DEPENDENCY_NOT_FOUND` when there is no such edge.
    Three round trips.
    """
    client = get_client()
    task = _get_task_or_404(client, task_id)
    _require_writer(client, project_id=task["project_id"], user_id=user_id)
    res = (
        client.table("task_dependencies")
        .delete()
        .eq("task_id", str(task["id"]))
        .eq("depends_on_task_id", str(depends_on_task_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=DEPENDENCY_NOT_FOUND)


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


#: The task column that holds a task's value in each burnup unit.
_UNIT_COLUMN = {"points": "points", "hours": "estimate_hours"}


def _totals(stories: list[dict], done_tasks: list[dict]) -> Totals:
    """The burnup's values for ``stories`` (live, ``tasks`` embedded) in both units (spec D21):
    scope sums every task's estimate, completed the same over ``done_tasks``; a task without one
    counts zero, and story points count nowhere."""
    tasks = [t for s in stories for t in s.get("tasks") or []]
    return Totals(
        scope_points=sum(t.get("points") or 0 for t in tasks),
        completed_points=sum(t.get("points") or 0 for t in done_tasks),
        scope_hours=sum(t.get("estimate_hours") or 0 for t in tasks),
        completed_hours=sum(t.get("estimate_hours") or 0 for t in done_tasks),
        tasks_total=len(tasks),
        tasks_with_points=sum(1 for t in tasks if t.get("points") is not None),
    )


def _done_tasks(stories: list[dict]) -> list[dict]:
    """The done tasks of ``stories`` (``tasks`` embedded)."""
    return [t for s in stories for t in s.get("tasks") or [] if t.get("status") == "done"]


def _sprint_progress(stories: list[dict]) -> dict:
    """Live progress of one sprint from its live stories (``tasks`` embedded): tasks done over
    tasks, and the burnup's values in both units (``_totals``). The client shows the unit the
    board's burnup draws."""
    done = _done_tasks(stories)
    totals = _totals(stories, done)
    return {
        "tasks_done": len(done),
        "tasks_total": totals.tasks_total,
        "points_done": totals.completed_points,
        "points_total": totals.scope_points,
        "hours_done": totals.completed_hours,
        "hours_total": totals.scope_hours,
    }


def _live_burnup_totals(client, sprint_id: str) -> Totals:
    """Totals straight from the database, for writes that have no board loaded: the sprint's
    live stories with their tasks embedded, in one read."""
    stories = (
        client.table("user_stories")
        .select("id, tasks(points, estimate_hours, status)")
        .eq("sprint_id", str(sprint_id))
        .is_("archived_at", "null")
        .execute()
    ).data or []
    return _totals(stories, _done_tasks(stories))


def _snapshot_burnup_safe(
    client, sprint_id: str, institution_id: str | None, totals: Totals | None = None
) -> None:
    """Best-effort daily snapshot in both units, filed under the day at the project's school
    (``institution_id``); never fails the triggering write, an unreadable school included.
    Pass the sprint's precomputed `totals` to skip the recompute."""
    try:
        day = _today(institution_timezone(institution_id))
        if totals is None:
            totals = _live_burnup_totals(client, sprint_id)
        client.table("sprint_burnup_days").upsert(
            {"sprint_id": str(sprint_id), "day": day.isoformat(), **totals.values()},
            on_conflict="sprint_id,day",
        ).execute()
    except Exception:
        logger.exception("scrum: burnup snapshot failed | sprint=%s", sprint_id)


def _completed_by_day_from_moves(
    client, task_values: dict[str, int], starts_at: date, ends_at: date, zone: ZoneInfo
) -> dict[str, int]:
    """Exact completed values per day at the school (``zone``) for the sprint's tasks,
    reconstructed from the task_moves audit (spec D7: fills past days that predate the lazy
    snapshots).

    ``task_values`` maps each task in the sprint's live stories to its value in the burnup's
    unit; the board has those rows loaded already, so only the audit is read here.
    """
    if not task_values:
        return {}
    moves = (
        client.table("task_moves")
        .select("task_id, to_status, moved_at")
        .in_("task_id", list(task_values))
        .order("moved_at")
        .execute()
    ).data or []
    if not moves:
        return {}
    status: dict[str, str] = {}
    out: dict[str, int] = {}
    i = 0
    d = starts_at
    end = min(ends_at, _today(zone))
    while d <= end:
        while i < len(moves) and _school_day(moves[i]["moved_at"], zone) <= d:
            status[moves[i]["task_id"]] = moves[i]["to_status"]
            i += 1
        out[d.isoformat()] = sum(task_values[tid] for tid, st in status.items() if st == "done")
        d += timedelta(days=1)
    return out


# ------------------------------------------------------------------- moves ----


def move_task(*, task_id: str, user_id: str, to_status: str) -> dict:
    if to_status not in ("todo", "in_progress", "done"):
        raise HTTPException(status_code=422, detail="Unknown status")
    client = get_client()
    task = _get_task_or_404(client, task_id)
    institution_id = _require_writer(client, project_id=task["project_id"], user_id=user_id)
    # Only leaving To do waits for the task's dependencies (spec D1): a task already under way
    # is never pulled back when a dependency reopens, and a move back to To do is always fine.
    if (
        task["status"] == "todo"
        and to_status != "todo"
        and _has_unfinished_dependency(client, task["id"])
    ):
        raise AppError(409, "task_blocked", TASK_BLOCKED)
    if task["status"] == to_status:
        return {
            "task": {**task, "moved_by_name": _name_for(client, task.get("moved_by"))},
            "move": None,
        }
    # The insert answers with the mover's profile and the task's story. Its embeds see the
    # database as it was before the insert (one statement, one snapshot), so the embedded task
    # still has its old status: only its story's sprint is read, which a move never changes.
    res = (
        client.table("task_moves")
        .insert({"task_id": str(task_id), "to_status": to_status, "moved_by": str(user_id)})
        .select(
            "*, mover:profiles!task_moves_moved_by_fkey(first_name, last_name, email), "
            "task:tasks!task_moves_task_id_fkey("
            "story:user_stories!tasks_story_id_fkey(sprint_id))"
        )
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to move task")
    move = res.data[0]
    mover = move.pop("mover", None)
    sprint_id = ((move.pop("task", None) or {}).get("story") or {}).get("sprint_id")
    # The board list resolves moved_by_name from its bulk profile fetch; this
    # single-row response has to resolve its own, or the client reconciles the
    # optimistic audit line down to "Unknown".
    task = {
        **task,
        "status": to_status,
        "moved_by": str(user_id),
        "moved_at": move["moved_at"],
        "moved_by_name": _display_name(mover),
    }
    if sprint_id:
        _snapshot_burnup_safe(client, sprint_id, institution_id)
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


def _select_sprint(sprints: list[dict], sprint_id: str | None, today: date) -> dict | None:
    """The sprint the board shows, from ``sprints`` ordered by ``starts_at``.

    The sprint named by ``sprint_id`` (404 :data:`SPRINT_NOT_FOUND` when the project has
    none by that id). Without one, today's sprint by its dates (spec D22): the one whose
    dates hold ``today`` (the later-starting one where sprints made through the API
    overlap), else the latest one that has started, else the first; None with no sprints.
    """
    if sprint_id:
        selected = next((s for s in sprints if s["id"] == str(sprint_id)), None)
        if not selected:
            raise HTTPException(status_code=404, detail=SPRINT_NOT_FOUND)
        return selected
    statuses = [sprint_status(*_sprint_days(s), today) for s in sprints]
    active = [s for s, status in zip(sprints, statuses, strict=True) if status == "active"]
    started = [s for s, status in zip(sprints, statuses, strict=True) if status != "planned"]
    if active or started:
        return (active or started)[-1]
    return sprints[0] if sprints else None


def get_board(
    *, project_id: str, user_id: str, sprint_id: str | None, unit: str | None = None
) -> dict:
    """The whole board in three rounds of concurrent reads, whatever the sprint count.

    Round 1 needs only the project id; round 2 needs the story and sprint ids from
    round 1; round 3 needs the task ids and movers from round 2. Burnup totals come
    from those rows, not from another query per sprint.

    The burnup draws ``unit`` (``points`` or ``hours``), by default points when every task in
    the selected sprint has them, else hours (spec D21). Raises 422 :data:`UNIT_UNAVAILABLE`
    for a ``unit`` the sprint cannot draw, before anything is written or recorded.
    """
    client = get_client()
    access, institution_id = _board_access(client, project_id=project_id, user_id=user_id)
    pid = str(project_id)

    def rows(query) -> list[dict]:
        return query.execute().data or []

    first = fan_out(
        {
            "project": lambda: authz.load_project(
                client, pid, columns="id, name, estimate_scale, class_id"
            ),
            "sprints": lambda: rows(
                client.table("sprints")
                .select("id, name, starts_at, ends_at")
                .eq("project_id", pid)
                .order("starts_at")
            ),
            "stories": lambda: rows(
                client.table("user_stories").select("*").eq("project_id", pid).order("created_at")
            ),
            "members": lambda: rows(
                client.table("project_members").select("user_id, role").eq("project_id", pid)
            ),
            "deps": lambda: rows(
                client.table("task_dependencies")
                .select("task_id, depends_on_task_id")
                .eq("project_id", pid)
                .order("created_at")
            ),
        }
    )
    project, all_stories, member_rows = first["project"], first["stories"], first["members"]
    zone = institution_timezone(institution_id)  # the school's day, not the server's
    today = _today(zone)
    sprints = [_with_status(s, today) for s in first["sprints"]]

    selected = _select_sprint(sprints, sprint_id, today)

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
                    .select(
                        "sprint_id, day, scope_points, completed_points, scope_hours, "
                        "completed_hours"
                    )
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
        # Derived, never stored: the sum of the story's task hours, None when none has any.
        s["estimate_hours"] = sum(t.get("estimate_hours") or 0 for t in s["tasks"]) or None

    # Both sides of every dependency, in the edges' order, from the rows already in hand: a
    # dependency in another sprint or the backlog is among `tasks` (every task of the project).
    story_by_id = {s["id"]: s for s in all_stories}
    task_by_id = {t["id"]: t for t in tasks}

    def ref(t: dict) -> dict:
        return _task_ref(t, story_by_id[t["story_id"]])

    for t in tasks:
        t["depends_on"], t["blocks"] = [], []
    for e in first["deps"]:
        source, target = task_by_id.get(e["task_id"]), task_by_id.get(e["depends_on_task_id"])
        if source is None or target is None:  # the cascades make this impossible; cheap to guard
            continue
        source["depends_on"].append(ref(target))
        target["blocks"].append(ref(source))
    task_index = sorted((ref(t) for t in tasks), key=lambda r: _key_order(r["key"]))

    sel_id = selected["id"] if selected else None
    stories = (
        [s for s in all_stories if s.get("sprint_id") == sel_id and not s.get("archived_at")]
        if sel_id
        else []
    )
    backlog = [s for s in all_stories if _in_backlog(s)]

    def live_stories(sid: str) -> list[dict]:
        return [s for s in all_stories if s.get("sprint_id") == sid and not s.get("archived_at")]

    progress = {s["id"]: _sprint_progress(live_stories(s["id"])) for s in sprints}

    def live_values(sid: str) -> dict:
        """A sprint's burnup values from its live rows, named as a snapshot names them."""
        p = progress[sid]
        return {
            "scope_points": p["points_total"],
            "completed_points": p["points_done"],
            "scope_hours": p["hours_total"],
            "completed_hours": p["hours_done"],
        }

    # The selected sprint's tasks decide the unit (spec D21): points when every one has them,
    # else hours, unless ?unit= picks another the sprint can draw. Checked before the snapshot
    # and the board_viewed event: a refused load writes and records nothing.
    totals = _totals(stories, _done_tasks(stories))
    available = units_available(totals)
    if unit is None:
        unit = default_unit(totals)
    elif unit not in available:
        raise HTTPException(status_code=422, detail=UNIT_UNAVAILABLE)

    snaps_by_sprint: dict[str, list[dict]] = {}
    for row in all_snaps:
        snaps_by_sprint.setdefault(row["sprint_id"], []).append(row)

    sprint_series = None
    if selected:
        _snapshot_burnup_safe(client, selected["id"], institution_id, totals=totals)
        starts = date.fromisoformat(str(selected["starts_at"]))
        ends = date.fromisoformat(str(selected["ends_at"]))
        snaps = snaps_by_sprint.get(selected["id"], [])
        if today >= starts:
            day_key = today.isoformat()
            if not any(s["day"] == day_key for s in snaps):
                snaps = [*snaps, {"day": day_key, **totals.values()}]
        elapsed = (min(today, ends) - starts).days + 1 if today >= starts else 0
        completed_by_day = None
        if elapsed > len(snaps):  # snapshots started late — reconstruct from the audit
            column = _UNIT_COLUMN[unit]
            task_values = {t["id"]: t.get(column) or 0 for s in stories for t in s["tasks"]}
            completed_by_day = _completed_by_day_from_moves(client, task_values, starts, ends, zone)
        live = totals.values()
        sprint_series = build_sprint_series(
            snapshots=snaps,
            starts_at=starts,
            ends_at=ends,
            today=today,
            live_scope=live[f"scope_{unit}"],
            live_completed=live[f"completed_{unit}"],
            completed_by_day=completed_by_day,
            unit=unit,
        )
        sprint_series["subtitle"] = f"{selected['starts_at']} – {selected['ends_at']}"

    # One point per sprint: the selected sprint's live values; another sprint's last snapshot,
    # or its live rows when it has none or that one holds nothing in the unit (written before the
    # hours columns existed).
    cumulative_input = []
    for s in sprints:
        last = (snaps_by_sprint.get(s["id"]) or [None])[-1]  # ordered by day ascending
        if s["id"] != sel_id and last is not None and holds_unit(last, unit):
            final = last
        else:
            final = live_values(s["id"])
        cumulative_input.append({"id": s["id"], "name": s["name"], "final": final})
    cumulative = build_cumulative_series(cumulative_input, unit=unit)

    # after every raise and outside fan_out: a refused or failed load is not a view
    events.record(
        "board_viewed",
        actor_id=str(user_id),
        class_id=str(project["class_id"]) if project.get("class_id") else None,
        project_id=pid,
    )
    return {
        "project": project,
        "ai_enabled": bool(settings.AI_API_KEY and settings.AI_BASE_URL),
        "sprints": [{**s, "progress": progress[s["id"]]} for s in sprints],
        "sprint_id": sel_id,
        "stories": stories,
        "backlog": backlog,
        "burnup": {
            "unit": unit,
            "units_available": available,
            "tasks_without_points": totals.tasks_total - totals.tasks_with_points,
            "sprint": sprint_series,
            "cumulative": cumulative,
        },
        "members": members,
        "access": access,
        "task_index": task_index,
    }


def get_summary(*, project_id: str, user_id: str) -> dict:
    """The current sprint's task counts for the project page: a read with no side effects
    (get_board records a board_viewed event and snapshots the burnup; this must not)."""
    client = get_client()
    _, institution_id = _board_access(client, project_id=project_id, user_id=user_id)
    pid = str(project_id)

    def rows(query) -> list[dict]:
        return query.execute().data or []

    reads = fan_out(
        {
            "sprints": lambda: rows(
                client.table("sprints")
                .select("id, name, starts_at, ends_at")
                .eq("project_id", pid)
                .order("starts_at")
            ),
            "stories": lambda: rows(
                client.table("user_stories")
                .select("id, sprint_id, archived_at")
                .eq("project_id", pid)
            ),
        }
    )
    # The sprint the board opens on, with the status the board shows for it.
    today = _today(institution_timezone(institution_id))
    sprint = _select_sprint(reads["sprints"], None, today)
    sprint = _with_status(sprint, today) if sprint else None
    stories = reads["stories"]

    # The board's own split: a sprint shows its live stories, and its Backlog view lists the
    # stories with no sprint and the legacy archived ones (_in_backlog).
    live_ids = (
        [
            s["id"]
            for s in stories
            if s.get("sprint_id") == sprint["id"] and not s.get("archived_at")
        ]
        if sprint
        else []
    )
    backlog_stories = sum(1 for s in stories if _in_backlog(s))
    tasks = (
        rows(client.table("tasks").select("story_id, status").in_("story_id", live_ids))
        if live_ids
        else []
    )
    counts = {"todo": 0, "in_progress": 0, "done": 0}
    for t in tasks:
        if t.get("status") in counts:
            counts[t["status"]] += 1
    return {"sprint": sprint, "counts": counts, "backlog_stories": backlog_stories}


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
    author_name: str,
    body_md: str,
) -> None:
    """Notify the people a comment @-mentions (issue #191): the mentioned ids on the
    team or among the project's staff (as in :func:`_board_access`), minus the author.
    ``author_name`` came with the comment's insert.

    Best-effort: the comment is already stored, so a failure here is logged and never
    raised. A body without mention tokens returns before any query.
    """
    mentioned = extract_mention_ids(body_md) - {str(author_id).lower()}
    if not mentioned:
        return
    pid = str(project_id)
    try:
        reads = fan_out(
            {
                "project": lambda: authz.load_project(client, pid, class_columns="created_by"),
                "members": lambda: (
                    (
                        client.table("project_members")
                        .select("user_id")
                        .eq("project_id", pid)
                        .in_("user_id", sorted(mentioned))
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        team = {str(r["user_id"]).lower() for r in reads["members"]} & mentioned
        recipients = team | _staff_among(client, reads["project"], mentioned - team)
        if not recipients:
            return
        notify_mention(
            recipient_ids=sorted(recipients),
            author_name=author_name,
            label=parent_key,
            project_name=reads["project"].get("name") or "",
            body_md=body_md,
            entity_type=f"scrum_{parent_kind}",
            entity_id=f"{pid}:{parent_id}",
        )
    except Exception:
        logger.exception(
            "Mention fan-out failed | project_id=%s %s_id=%s", pid, parent_kind, parent_id
        )


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
    # The insert answers with its author's profile, for the answer and the mentions.
    res = (
        client.table("scrum_comments")
        .insert(row)
        .select("*, author:profiles!scrum_comments_author_id_fkey(first_name, last_name, email)")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create comment")
    comment = res.data[0]
    author_name = _display_name(comment.pop("author", None))
    _fanout_mentions(
        client,
        project_id=parent["project_id"],
        parent_kind=parent_kind,
        parent_id=parent_id,
        parent_key=parent.get("key", ""),
        author_id=user_id,
        author_name=author_name,
        body_md=body_md,
    )
    return {**comment, "author_name": author_name}


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
    institution_id = _require_writer(client, project_id=project_id, user_id=user_id)
    if not settings.AI_API_KEY or not settings.AI_BASE_URL:
        raise HTTPException(status_code=503, detail="AI drafting is not configured")

    # The quota's day turns over at the school's midnight, like the board's other days.
    today = _today(institution_timezone(institution_id)).isoformat()
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
