"""The scrum board connector: what a connected app (Claude, ChatGPT) may read about a team's board,
and the batch of sprints, stories and tasks it may add.

The app acts for the signed-in user, so access is the board's own: :func:`board_context` follows
board reads (team members and the class's staff), :func:`fill_board` board writes (team members
only). The connector only adds: nothing here edits, moves or deletes an existing row.

:func:`fill_board` checks the whole batch in memory and reports every problem at once, with its
path, so the app can fix them in one go; only a clean batch reaches ``scrum_fill_board``, which
writes it in one transaction. It is stricter than the board's own routes: points must be on the
project's scale, and assignees on the team.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException

from app.core import authz, events
from app.core.db import fan_out, get_client
from app.institutions.controller import institution_timezone
from app.mcp.models import FillBoardRequest, NewStory, NewTask
from app.scrum.controller import (
    _board_access,
    _in_backlog,
    _key_order,
    _require_writer,
    _snapshot_burnup_safe,
    _today,
)
from app.scrum.models import ESTIMATE_SCALES, TASK_TAGS
from app.utils.profiles import profile_display_name

logger = logging.getLogger(__name__)

MAX_SPRINTS = 10
MAX_STORIES = 60
MAX_TASKS = 300
TITLE_MAX = 200
DESCRIPTION_MAX = 20000
SPRINT_NAME_MAX = 80
HOURS_MIN, HOURS_MAX = 1, 15
#: Sprints a new story may join: a completed sprint's scope is closed.
OPEN_SPRINT_STATUSES = ("planned", "active")

NOT_CONFIRMED = (
    "confirmed must be true: show the student the full plan and wait for an explicit yes"
)
NOTHING_TO_ADD = "nothing to add: send at least one sprint or story"
#: 422: an assistant passed a project's name, or anything else that is not an id.
BAD_PROJECT_ID = "project_id must be a project's id from list_my_projects"


class FillRejected(Exception):
    """The batch was refused before anything was written; ``errors`` lists every problem."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _project_id(value: str) -> str:
    """``value`` as a project id, or 422 :data:`BAD_PROJECT_ID` before any query: PostgREST
    answers a malformed uuid with an error the app could not act on."""
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        raise HTTPException(status_code=422, detail=BAD_PROJECT_ID) from None


# ------------------------------------------------------------------------- reads ----


def list_my_projects(*, user_id: str) -> list[dict]:
    """The projects the caller is on the team of, with their class: one round trip."""
    rows = (
        get_client()
        .table("project_members")
        .select("projects(id, name, classes(name, course_code, term, year))")
        .eq("user_id", str(user_id))
        .execute()
    ).data or []
    out = []
    for r in rows:
        project = r.get("projects") or {}
        if not project.get("id"):
            continue
        cls = project.get("classes") or {}
        out.append(
            {
                "project_id": project["id"],
                "name": project.get("name"),
                "class_name": cls.get("name"),
                "course_code": cls.get("course_code"),
                "term": cls.get("term"),
                "year": cls.get("year"),
            }
        )
    return out


def _members(client, project_id: str) -> list[dict]:
    rows = (
        client.table("project_members")
        .select(
            "user_id, role, profiles!project_members_user_id_fkey(first_name, last_name, email)"
        )
        .eq("project_id", project_id)
        .execute()
    ).data or []
    return [
        {
            "user_id": r["user_id"],
            "name": profile_display_name(r.get("profiles")),
            "project_role": r.get("role"),
        }
        for r in rows
    ]


def _sprints(client, project_id: str) -> list[dict]:
    return (
        client.table("sprints")
        .select("id, name, starts_at, ends_at, status")
        .eq("project_id", project_id)
        .order("starts_at")
        .execute()
    ).data or []


def board_context(*, project_id: str, user_id: str) -> dict:
    """Everything an app needs to draft a batch: the board's rules, the team, the sprints, and
    the items already on the board (keys and titles only, to avoid duplicates). Readable by
    whoever can read the board; ``can_write`` says whether the caller can add to it."""
    pid = _project_id(project_id)
    client = get_client()
    access, institution_id = _board_access(client, project_id=pid, user_id=user_id)
    reads = fan_out(
        {
            "project": lambda: authz.load_project(client, pid, columns="id, estimate_scale"),
            "members": lambda: _members(client, pid),
            "sprints": lambda: _sprints(client, pid),
            "stories": lambda: (
                (
                    client.table("user_stories")
                    .select("key, title, sprint_id, archived_at, tasks(key, title, status)")
                    .eq("project_id", pid)
                    .order("created_at")
                    .execute()
                ).data
                or []
            ),
        }
    )
    scale = reads["project"].get("estimate_scale") or "linear"
    return {
        "can_write": access == "member",
        "estimate_scale": scale,
        "allowed_points": ESTIMATE_SCALES[scale],
        "hours_range": [HOURS_MIN, HOURS_MAX],
        "tags": list(TASK_TAGS),
        "limits": {
            "title": TITLE_MAX,
            "description_md": DESCRIPTION_MAX,
            "sprint_name": SPRINT_NAME_MAX,
            "sprints_per_batch": MAX_SPRINTS,
            "stories_per_batch": MAX_STORIES,
            "tasks_per_batch": MAX_TASKS,
        },
        "members": reads["members"],
        "sprints": reads["sprints"],
        "existing": [
            {
                "key": s["key"],
                "title": s["title"],
                "sprint_id": None if _in_backlog(s) else s.get("sprint_id"),
                "tasks": [
                    {"key": t["key"], "title": t["title"], "status": t["status"]}
                    for t in sorted(s.get("tasks") or [], key=lambda t: _key_order(t["key"]))
                ],
            }
            for s in reads["stories"]
        ],
        "today": _today(institution_timezone(institution_id)).isoformat(),
    }


# ------------------------------------------------------------------------ writes ----


def _length_error(path: str, value: str | None, *, low: int, high: int) -> str | None:
    if value is None:
        return None if low == 0 else f"{path}: must be {low} to {high} characters"
    n = len(value)
    if low <= n <= high:
        return None
    return (
        f"{path}: must be at most {high} characters"
        if low == 0
        else f"{path}: must be {low} to {high} characters"
    )


class _Checker:
    """Collects the errors and warnings of one batch against one project's rules."""

    def __init__(self, *, scale: str, member_ids: set[str], sprints: list[dict], refs: set[str]):
        self.scale = scale
        self.allowed = ESTIMATE_SCALES[scale]
        self.member_ids = member_ids
        self.sprints = {s["id"]: s for s in sprints}
        self.refs = refs
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def _err(self, msg: str | None) -> None:
        if msg:
            self.errors.append(msg)

    def common(self, path: str, item: NewStory | NewTask) -> None:
        self._err(_length_error(f"{path}.title", item.title, low=1, high=TITLE_MAX))
        self._err(
            _length_error(
                f"{path}.description_md", item.description_md, low=0, high=DESCRIPTION_MAX
            )
        )
        if item.points is not None and item.points not in self.allowed:
            scale = ", ".join(str(p) for p in self.allowed)
            self._err(f"{path}.points: {item.points} is not on the {self.scale} scale ({scale})")

    def assignee(self, path: str, assignee_id: str | None) -> None:
        if assignee_id is not None and assignee_id not in self.member_ids:
            self._err(f"{path}.assignee_id: {assignee_id} is not on the team")

    def sprint(self, path: str, value: str | None) -> dict:
        """The story's placement for ``scrum_fill_board``: a ref, an existing id, or neither."""
        if value is None:
            return {"sprint_ref": None, "sprint_id": None}
        if value in self.refs:
            return {"sprint_ref": value, "sprint_id": None}
        sprint = self.sprints.get(value)
        if sprint is None:
            self._err(
                f"{path}.sprint: no sprint of this project or of this batch has that id or ref"
            )
        elif sprint.get("status") not in OPEN_SPRINT_STATUSES:
            self._err(
                f"{path}.sprint: {sprint['id']} is {sprint.get('status')}; add stories to a "
                "planned or active sprint"
            )
        return {"sprint_ref": None, "sprint_id": value}

    def task(self, path: str, task: NewTask) -> None:
        self.common(path, task)
        hours = task.estimate_hours
        if hours is not None and not HOURS_MIN <= hours <= HOURS_MAX:
            self._err(
                f"{path}.estimate_hours: {hours} is not a whole number of hours from "
                f"{HOURS_MIN} to {HOURS_MAX}"
            )
        self.assignee(path, task.assignee_id)
        for tag in task.tags:
            if tag not in TASK_TAGS:
                self._err(f"{path}.tags: unknown tag {tag!r}")

    def warn_missing(self, label: str, item: NewStory | NewTask) -> None:
        missing = []
        if item.points is None:
            missing.append("no points")
        if isinstance(item, NewTask) and item.estimate_hours is None:
            missing.append("no hours estimate")
        if item.assignee_id is None:
            missing.append("no assignee")
        if not (item.description_md or "").strip():
            missing.append("no description")
        if missing:
            self.warnings.append(f"{label} {item.title!r}: {', '.join(missing)}")


def _check(request: FillBoardRequest, checker: _Checker) -> list[dict]:
    """Validate the batch into ``checker``; return the stories as ``scrum_fill_board`` takes them."""
    n_tasks = sum(len(s.tasks) for s in request.stories)
    for kind, n, cap in (
        ("sprints", len(request.sprints), MAX_SPRINTS),
        ("stories", len(request.stories), MAX_STORIES),
        ("tasks", n_tasks, MAX_TASKS),
    ):
        if n > cap:
            checker.errors.append(f"at most {cap} {kind} per batch (got {n})")
    if not request.sprints and not request.stories:
        checker.errors.append(NOTHING_TO_ADD)

    seen_refs: set[str] = set()
    for i, sp in enumerate(request.sprints):
        path = f"sprints[{i}]"
        if sp.ends_at < sp.starts_at:
            checker.errors.append(f"{path}: ends_at must be on or after starts_at")
        checker._err(_length_error(f"{path}.name", sp.name, low=1, high=SPRINT_NAME_MAX))
        if sp.ref in seen_refs:
            checker.errors.append(f"{path}.ref: {sp.ref!r} is used by another sprint in this batch")
        seen_refs.add(sp.ref)

    stories = []
    for i, story in enumerate(request.stories):
        path = f"stories[{i}]"
        checker.common(path, story)
        checker.assignee(path, story.assignee_id)
        placement = checker.sprint(path, story.sprint)
        checker.warn_missing(path, story)
        task_points = [t.points for t in story.tasks if t.points is not None]
        if story.points is not None and task_points and sum(task_points) != story.points:
            checker.warnings.append(
                f"{path} {story.title!r}: its tasks' points add up to {sum(task_points)}, "
                f"not its {story.points} points"
            )
        for j, task in enumerate(story.tasks):
            checker.task(f"{path}.tasks[{j}]", task)
            checker.warn_missing(f"{path}.tasks[{j}]", task)
        stories.append(
            {
                "title": story.title,
                "description_md": story.description_md,
                "points": story.points,
                "assignee_id": story.assignee_id,
                **placement,
                "tasks": [t.model_dump() for t in story.tasks],
            }
        )
    return stories


def fill_board(*, project_id: str, user_id: str, client_id: str, request: FillBoardRequest) -> dict:
    """Add a batch of sprints, stories and tasks to a project's board, all or nothing.

    Who can call: team members (403 :data:`app.scrum.controller.MEMBERS_ONLY` otherwise, 404
    for a missing project). Raises :class:`FillRejected` with every problem when the batch is
    not confirmed or does not fit the board. Returns the created sprints and stories (with
    their keys and tasks) and ``warnings`` for the optional fields left empty.
    """
    if not request.confirmed:
        raise FillRejected([NOT_CONFIRMED])
    pid = _project_id(project_id)
    client = get_client()
    institution_id = _require_writer(client, project_id=pid, user_id=user_id)
    reads = fan_out(
        {
            "project": lambda: authz.load_project(
                client, pid, columns="id, class_id, estimate_scale"
            ),
            "members": lambda: (
                (
                    client.table("project_members")
                    .select("user_id")
                    .eq("project_id", pid)
                    .execute()
                ).data
                or []
            ),
            "sprints": lambda: _sprints(client, pid),
        }
    )
    checker = _Checker(
        scale=reads["project"].get("estimate_scale") or "linear",
        member_ids={str(m["user_id"]) for m in reads["members"]},
        sprints=reads["sprints"],
        refs={s.ref for s in request.sprints},
    )
    stories = _check(request, checker)
    if checker.errors:
        raise FillRejected(checker.errors)

    created = (
        client.rpc(
            "scrum_fill_board",
            {
                "p_project_id": pid,
                "p_reporter_id": str(user_id),
                "p_sprints": [
                    {
                        "ref": s.ref,
                        "name": s.name,
                        "starts_at": s.starts_at.isoformat(),
                        "ends_at": s.ends_at.isoformat(),
                    }
                    for s in request.sprints
                ],
                "p_stories": stories,
            },
        ).execute()
    ).data or {}

    for sprint_id in sorted(
        {s["sprint_id"] for s in created.get("stories", []) if s.get("sprint_id")}
    ):
        _snapshot_burnup_safe(client, sprint_id, institution_id)
    events.record(
        "board_agent_fill",
        actor_id=str(user_id),
        class_id=reads["project"].get("class_id"),
        project_id=pid,
        meta={
            "sprints": len(request.sprints),
            "stories": len(request.stories),
            "tasks": sum(len(s.tasks) for s in request.stories),
            "warnings": len(checker.warnings),
            "client_id": str(client_id),
        },
    )
    return {
        "sprints": created.get("sprints", []),
        "stories": created.get("stories", []),
        "warnings": checker.warnings,
    }
