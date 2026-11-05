"""The scrum board connector: what a connected app (Claude, ChatGPT) may read about a team's board,
and the batch of sprints, stories and tasks it may add.

The app acts for the signed-in user, so access is the board's own: :func:`board_context` follows
board reads (team members and the class's staff), :func:`fill_board` board writes (team members
only). The connector only adds: nothing here edits, moves or deletes an existing story or task.

:func:`fill_board` checks the whole batch in memory and reports every problem at once, with its
path, so the app can fix them in one go; only a clean batch reaches ``scrum_fill_board``, which
writes it in one transaction. It is stricter than the board's own routes: points must be on the
project's scale, and assignees on the team.

A team's move-in: while a board holds :data:`MOVE_IN_STORIES` stories or fewer that weren't imported,
a batch may also bring finished work across, as done on the day it was done, and into finished
sprints. Every story written then gets ``imported_at``, so stories imported earlier don't close the
window, and each started sprint it adds to has its saved burnup rows replaced in the same
transaction, as if the work had been there from the sprint's first day.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.assignments import deadlines
from app.core import authz, events
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseConflictError
from app.institutions.controller import institution_timezone
from app.mcp.models import FillBoardRequest, NewSprint, NewStory, NewTask
from app.scrum.burnup import replay_completed
from app.scrum.controller import (
    _UNIT_COLUMN,
    MOVE_IN_STORIES,
    _as_date,
    _board_access,
    _check_class_dates,
    _in_backlog,
    _key_order,
    _require_writer,
    _school_day,
    _snapshot_burnup_safe,
    _sprint_days,
    _today,
    _with_status,
    import_window_open,
)
from app.scrum.models import ESTIMATE_SCALES, TASK_TAGS
from app.scrum.schedule import latest_sprint_end, sprint_status
from app.utils.profiles import profile_display_name

logger = logging.getLogger(__name__)

MAX_SPRINTS = 10
MAX_STORIES = 60
MAX_TASKS = 300
TITLE_MAX = 200
DESCRIPTION_MAX = 20000
SPRINT_NAME_MAX = 80
HOURS_MIN, HOURS_MAX = 1, 15
#: What ends a refusal that only applies once a team's move-in is over.
MOVE_IN_OVER = (
    f"only while a board holds {MOVE_IN_STORIES} or fewer stories that weren't imported, "
    "and this one holds more"
)

NOT_CONFIRMED = (
    "confirmed must be true: show the student the full plan and wait for an explicit yes"
)
NOTHING_TO_ADD = "nothing to add: send at least one sprint or story"
#: A refusal when another batch or an add reached the board first; nothing was written.
BOARD_CHANGED = (
    "the board changed while this batch was being prepared: read it again with get_board_context, "
    "then send what is still missing"
)
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


#: The class's columns that bound a team's sprints (app/scrum/controller.py ``create_sprint``).
CLASS_SPRINT_COLUMNS = "sprint_count, start_date, end_date"


def _sprints(client, project_id: str, today) -> list[dict]:
    """The project's sprints, each with the status its dates give today (the stored one is never
    read: nothing flips it for the sprints a class schedule creates)."""
    rows = (
        client.table("sprints")
        .select("id, name, starts_at, ends_at")
        .eq("project_id", project_id)
        .order("starts_at")
        .execute()
    ).data or []
    return [_with_status(r, today) for r in rows]


def _sprint_rules(klass: dict, sprint_count: int) -> dict:
    """What the class allows a team's sprints: how many in all (None: no cap), how many more, and
    the days they must fit in (None: open on that side)."""
    cap = klass.get("sprint_count")
    end = klass.get("end_date")
    return {
        "max_sprints": cap,
        "new_sprints_allowed": max(cap - sprint_count, 0) if cap else None,
        "first_day": str(klass["start_date"]) if klass.get("start_date") else None,
        "last_day": latest_sprint_end(_as_date(end)).isoformat() if end else None,
    }


def board_context(*, project_id: str, user_id: str) -> dict:
    """Everything an app needs to draft a batch: the board's rules, the team, the sprints, and
    the items already on the board (keys and titles only, to avoid duplicates). Readable by
    whoever can read the board; ``can_write`` says whether the caller can add to it."""
    pid = _project_id(project_id)
    client = get_client()
    access, institution_id = _board_access(client, project_id=pid, user_id=user_id)
    today = _today(institution_timezone(institution_id))
    reads = fan_out(
        {
            "project": lambda: authz.load_project(
                client, pid, columns="id, estimate_scale", class_columns=CLASS_SPRINT_COLUMNS
            ),
            "members": lambda: _members(client, pid),
            "sprints": lambda: _sprints(client, pid, today),
            "stories": lambda: (
                (
                    client.table("user_stories")
                    .select(
                        "key, title, sprint_id, archived_at, imported_at, tasks(key, title, status)"
                    )
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
        "sprint_rules": _sprint_rules(reads["project"].get("classes") or {}, len(reads["sprints"])),
        "import_window_open": import_window_open(reads["stories"]),
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
        "today": today.isoformat(),
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

    def __init__(
        self,
        *,
        scale: str,
        member_ids: set[str],
        sprints: list[dict],
        new_sprints: list[NewSprint],
        today: date,
        now: datetime,
        zone: ZoneInfo,
        move_in: bool,
        klass: dict | None = None,
    ):
        self.klass = klass or {}
        self.scale = scale
        self.allowed = ESTIMATE_SCALES[scale]
        self.member_ids = member_ids
        self.sprints = {s["id"]: s for s in sprints}
        self.new_sprints = {s.ref: s for s in new_sprints}
        self.today = today
        self.now = now
        self.zone = zone
        self.move_in = move_in
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

    def sprint_days(self, value: str | None) -> tuple[date, date] | None:
        """The first and last days of the sprint a story names; None for the backlog, or for a
        sprint that doesn't exist (:meth:`sprint` reports that)."""
        if value in self.new_sprints:
            return self.new_sprints[value].starts_at, self.new_sprints[value].ends_at
        sprint = self.sprints.get(value)
        return _sprint_days(sprint) if sprint else None

    def sprint(self, path: str, value: str | None) -> dict:
        """The story's placement for ``scrum_fill_board``: a ref, an existing id, or neither."""
        if value is None:
            return {"sprint_ref": None, "sprint_id": None}
        days = self.sprint_days(value)
        if days is None:
            self._err(
                f"{path}.sprint: no sprint of this project or of this batch has that id or ref"
            )
        elif not self.move_in and sprint_status(*days, self.today) == "completed":
            self._err(
                f"{path}.sprint: {value} is completed; add stories to a planned or active sprint. "
                f"A finished sprint takes stories {MOVE_IN_OVER}"
            )
        if value in self.new_sprints:
            return {"sprint_ref": value, "sprint_id": None}
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

    def task_move(self, path: str, task: NewTask, sprint: str | None) -> str | None:
        """When ``task`` moved to its status, for its ``task_moves`` row; None for a To do task.
        ``sprint`` is what its story names."""
        if task.done_on is not None and task.status != "done":
            self._err(f"{path}.done_on: only a done task has a done day")
        if task.done_on is not None and task.done_on > self.today:
            self._err(f"{path}.done_on: {task.done_on} is after today, {self.today}")
        if task.status != "todo" and not self.move_in:
            self._err(f"{path}.status: {task.status} work can be imported {MOVE_IN_OVER}")
            return None
        days = self.sprint_days(sprint)
        if sprint is not None and days is None:  # reported by :meth:`sprint`
            return None
        if task.status == "done":
            return self._done_move(path, task, days)
        if days and sprint_status(*days, self.today) == "completed":
            self.warnings.append(
                f"{path} {task.title!r}: not done in a finished sprint, so it stays open in that "
                "sprint's burnup"
            )
        return self.now.isoformat() if task.status == "in_progress" else None

    def _done_move(self, path: str, task: NewTask, days: tuple[date, date] | None) -> str | None:
        """Noon at the school on the day a done task was finished, inside its sprint and never
        in the future, so the move lands on that school day."""
        if days is None:
            self._err(
                f"{path}.status: a done task can't sit in the backlog; put its story in the sprint "
                "that holds its done day"
            )
            return None
        first, last = days[0], min(days[1], self.today)
        if first > self.today:
            self._err(
                f"{path}.status: a done task can't sit in a sprint that hasn't started; put its "
                "story in the sprint that holds its done day"
            )
            return None
        day = task.done_on
        if day is None:
            day = last
            self.warnings.append(f"{path} {task.title!r}: no done day given, so it's dated {day}")
        elif not first <= day <= last:
            moved = max(first, min(day, last))
            self.warnings.append(
                f"{path} {task.title!r}: done on {day} is outside its sprint, so it's dated {moved}"
            )
            day = moved
        noon = datetime.combine(day, time(12), tzinfo=self.zone)
        return min(noon, self.now).isoformat()

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
    cap = checker.klass.get("sprint_count")
    have = len(checker.sprints)
    if cap and request.sprints and have + len(request.sprints) > cap:
        allowed = max(cap - have, 0)
        checker.errors.append(
            f"at most {allowed} new sprint{'' if allowed == 1 else 's'}: this class runs {cap} "
            f"sprints and the team has {have}"
        )

    seen_refs: set[str] = set()
    for i, sp in enumerate(request.sprints):
        path = f"sprints[{i}]"
        if sp.ends_at < sp.starts_at:
            checker.errors.append(f"{path}: ends_at must be on or after starts_at")
        try:
            _check_class_dates(checker.klass, sp.starts_at, sp.ends_at)
        except HTTPException as exc:
            checker.errors.append(f"{path}: {exc.detail}")
        checker._err(_length_error(f"{path}.name", sp.name, low=1, high=SPRINT_NAME_MAX))
        if not sp.ref:
            checker.errors.append(f"{path}.ref: must not be empty")
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
        if not story.tasks:
            checker.warnings.append(
                f"{path} {story.title!r}: no tasks, and the burnup counts only task estimates"
            )
        task_points = [t.points for t in story.tasks if t.points is not None]
        if story.points is not None and task_points and sum(task_points) != story.points:
            checker.warnings.append(
                f"{path} {story.title!r}: its tasks' points add up to {sum(task_points)}, "
                f"not its {story.points} points"
            )
        tasks = []
        for j, task in enumerate(story.tasks):
            checker.task(f"{path}.tasks[{j}]", task)
            checker.warn_missing(f"{path}.tasks[{j}]", task)
            moved_at = checker.task_move(f"{path}.tasks[{j}]", task, story.sprint)
            tasks.append({**task.model_dump(exclude={"done_on"}), "moved_at": moved_at})
        stories.append(
            {
                "title": story.title,
                "description_md": story.description_md,
                "points": story.points,
                "assignee_id": story.assignee_id,
                "imported_at": checker.now.isoformat() if checker.move_in else None,
                **placement,
                "tasks": tasks,
            }
        )
    return stories


def _burnup_rows(
    client, project_id: str, stories: list[dict], checker: _Checker
) -> tuple[list[dict], dict]:
    """The rows that replace the saved burnup of each started sprint this batch adds to, as if its
    work had been there from the first day: scope flat, completed replayed from the moves, in both
    units, and the counters to expect when they are written.

    Reads only when there is a sprint to rebuild: the counters first, then the existing work with
    its moves embedded. ``scrum_fill_board`` refuses the rows if the counters have moved, because
    anything added since would be missing from them."""
    targets: dict[str, list[dict]] = {}
    for story in stories if checker.move_in else []:
        sprint = story["sprint_ref"] or story["sprint_id"]
        days = checker.sprint_days(sprint)
        if days and days[0] <= checker.today:
            targets.setdefault(sprint, []).append(story)
    if not targets:
        return [], {"p_expected_story_seq": None, "p_expected_task_seq": None}
    counters = (
        client.table("scrum_counters")
        .select("story_seq, task_seq")
        .eq("project_id", project_id)
        .execute()
    ).data or [{}]
    existing = [s for s in targets if s not in checker.new_sprints]
    live: list[dict] = []
    if existing:
        live = (
            client.table("user_stories")
            .select("sprint_id, tasks(id, points, estimate_hours, task_moves(to_status, moved_at))")
            .eq("project_id", project_id)
            .in_("sprint_id", existing)
            .is_("archived_at", "null")
            .execute()
        ).data or []

    rows = []
    for sprint, batch in targets.items():
        tasks, moves = [], []
        for story in live:
            if story["sprint_id"] == sprint:
                for t in story.get("tasks") or []:
                    tasks.append(t)
                    moves += [
                        (m["moved_at"], t["id"], m["to_status"]) for m in t.get("task_moves") or []
                    ]
        for i, story in enumerate(batch):
            for j, t in enumerate(story["tasks"]):
                new_id = f"new-{i}-{j}"  # not written yet; only the replay below reads it
                tasks.append({**t, "id": new_id})
                if t["moved_at"]:
                    moves.append((t["moved_at"], new_id, t["status"]))
        moves.sort(key=lambda m: datetime.fromisoformat(m[0].replace("Z", "+00:00")))
        replay = [(task, to, _school_day(at, checker.zone)) for at, task, to in moves]

        first, last = checker.sprint_days(sprint)
        scope, completed = {}, {}
        for unit, column in _UNIT_COLUMN.items():
            values = {t["id"]: t.get(column) or 0 for t in tasks}
            scope[unit] = sum(values.values())
            completed[unit] = replay_completed(replay, values, first, checker.today)
        # Each day of the sprint so far, and today's row for one that has ended: its own chart stops
        # at its last day, and the cumulative chart reads its latest row, which must count work
        # finished on the board since.
        days = [
            day
            for day in completed["points"]
            if day <= last.isoformat() or day == checker.today.isoformat()
        ]
        key = {"sprint_ref": sprint} if sprint in checker.new_sprints else {"sprint_id": sprint}
        rows += [
            {
                **key,
                "day": day,
                "scope_points": scope["points"],
                "completed_points": completed["points"][day],
                "scope_hours": scope["hours"],
                "completed_hours": completed["hours"][day],
            }
            for day in days
        ]
    return rows, {
        "p_expected_story_seq": counters[0].get("story_seq", 0),
        "p_expected_task_seq": counters[0].get("task_seq", 0),
    }


def fill_board(*, project_id: str, user_id: str, client_id: str, request: FillBoardRequest) -> dict:
    """Add a batch of sprints, stories and tasks to a project's board, all or nothing.

    Who can call: team members (403 :data:`app.scrum.controller.MEMBERS_ONLY` otherwise, 404
    for a missing project). Raises :class:`FillRejected` with every problem when the batch is
    not confirmed or does not fit the board. Returns the created sprints and stories (with
    their keys and tasks) and ``warnings`` for the optional fields left empty and the dates it
    chose.
    """
    if not request.confirmed:
        raise FillRejected([NOT_CONFIRMED])
    pid = _project_id(project_id)
    client = get_client()
    institution_id = _require_writer(client, project_id=pid, user_id=user_id)
    zone = institution_timezone(institution_id)
    today = _today(zone)
    reads = fan_out(
        {
            "not_imported": lambda: (
                (
                    client.table("user_stories")
                    .select("id")
                    .eq("project_id", pid)
                    .is_("imported_at", "null")
                    .is_("archived_at", "null")
                    .limit(MOVE_IN_STORIES + 1)
                    .execute()
                ).data
                or []
            ),
            "project": lambda: authz.load_project(
                client,
                pid,
                columns="id, class_id, estimate_scale",
                class_columns=CLASS_SPRINT_COLUMNS,
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
            "sprints": lambda: _sprints(client, pid, today),
        }
    )
    checker = _Checker(
        klass=reads["project"].get("classes") or {},
        scale=reads["project"].get("estimate_scale") or "linear",
        member_ids={str(m["user_id"]) for m in reads["members"]},
        sprints=reads["sprints"],
        new_sprints=request.sprints,
        today=today,
        now=deadlines.now_utc(),
        zone=zone,
        move_in=import_window_open(reads["not_imported"]),
    )
    stories = _check(request, checker)
    if checker.errors:
        raise FillRejected(checker.errors)
    burnup, expected = _burnup_rows(client, pid, stories, checker)

    try:
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
                    "p_burnup": burnup,
                    **expected,
                },
            ).execute()
        ).data or {}
    except DatabaseConflictError as exc:
        raise FillRejected([BOARD_CHANGED]) from exc

    new_ids = {s["ref"]: s["id"] for s in created.get("sprints", [])}
    rebuilt = {r.get("sprint_id") or new_ids.get(r["sprint_ref"]) for r in burnup}
    for sprint_id in sorted(
        {s["sprint_id"] for s in created.get("stories", []) if s.get("sprint_id")} - rebuilt
    ):
        _snapshot_burnup_safe(client, sprint_id, institution_id)
    statuses = [t.status for s in request.stories for t in s.tasks]
    events.record(
        "board_agent_fill",
        actor_id=str(user_id),
        class_id=reads["project"].get("class_id"),
        project_id=pid,
        meta={
            "sprints": len(request.sprints),
            "stories": len(request.stories),
            "tasks": len(statuses),
            "done": statuses.count("done"),
            "in_progress": statuses.count("in_progress"),
            "imported": len(request.stories) if checker.move_in else 0,
            "warnings": len(checker.warnings),
            "client_id": str(client_id),
        },
    )
    return {
        "sprints": created.get("sprints", []),
        "stories": created.get("stories", []),
        "warnings": checker.warnings,
    }
