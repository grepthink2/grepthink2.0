"""What a document takes from the board: the context read once, and for each kind its seed, its derived
sections and the checks that hold back a finalize.

Everything but the reads is pure: it works on a ``Ctx``. A draft's derived sections are the board as it is
now; finalize stores them on the revision it hands in (the snapshot), and readers of that revision get the
snapshot instead. The board's rules come from the scrum board itself: which stories a sprint or the backlog
lists and in what order (``in_backlog``, ``story_order``), a sprint's days, and what a burnup counts.

A story is completed when it has at least one task and every task is done. A sprint report describes its
sprint as it ended: the stories, and the completed ones, that the last saved burnup day on or before the
sprint's end recorded (``sprint_burnup_days.story_ids``, ``done_story_ids``), shown as they are now. A
sprint no saved day describes that way (days saved before the board recorded stories, or rebuilt by an
import) falls back to the board as it is now, and says so (``as_of``: ``"now"``).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from functools import cached_property
from zoneinfo import ZoneInfo

from app.core.db import fan_out
from app.documents.models import KEY_STORIES_MAX, SCENARIO_TITLE_MAX, SCENARIOS_MAX, STEPS_MAX
from app.institutions.controller import DEFAULT_TIMEZONE
from app.scrum.burnup import build_sprint_series, default_unit, replay_completed
from app.scrum.controller import burnup_totals, done_tasks, in_backlog, sprint_days, story_order

#: What holds back a finalize (409, the first one that fails), by kind.
SPRINT_NOT_ENDED = "The sprint has not ended yet"
NEED_START = "Add at least one action to start doing"
NEED_KEEP = "Add at least one action to keep doing"
NEED_STOP = "Add an action to stop doing, or say why there is none"
NEED_KEY_STORY = "Pick at least one key story"
NEED_CRITERIA = "Every key story needs acceptance criteria"
NEED_SCENARIO = "Add at least one test scenario"
NEED_RESULTS = "Mark every scenario as passed or failed"

#: The story columns the documents read. rank and acceptance_criteria come from
#: 2026-11-16_story_rank_and_criteria.sql, which the documents migration requires.
_STORY_COLUMNS = "id, key, title, points, sprint_id, archived_at, rank, acceptance_criteria"
_TASK_COLUMNS = "id, story_id, status, estimate_hours, points"
#: A sprint report's tasks carry their moves, for the burnup's days that no snapshot saved.
_TASK_MOVES = "task_moves!task_moves_task_id_fkey(to_status, moved_at)"
#: Each sprint's saved days, with the stories they recorded (a sprint report: its sprint, and the
#: earlier ones for the rates to date).
_SPRINT_DAYS = (
    "sprint_burnup_days(sprint_id, day, scope_points, completed_points, scope_hours, "
    "completed_hours, story_ids, done_story_ids)"
)
#: The task column that holds a task's value in each burnup unit (the board's).
_UNIT_COLUMN = {"points": "points", "hours": "estimate_hours"}


@dataclass(frozen=True)
class Ctx:
    """The board as one document sees it, read once (:func:`load_context`)."""

    project_id: str
    #: The document's sprint (a sprint's kinds), else None.
    sprint: dict | None
    #: The project's sprints, by ``starts_at``.
    sprints: list[dict]
    #: Every story of the project (:data:`_STORY_COLUMNS`).
    stories: list[dict]
    #: Every task of the project: ``id, story_id, status, estimate_hours, points``, and for a sprint
    #: report its ``task_moves``.
    tasks: list[dict]
    #: Today at the project's school.
    today: date
    #: The saved ``sprint_burnup_days`` rows of every sprint of the project (read for a sprint report
    #: only).
    burnup_days: list[dict] = field(default_factory=list)
    #: The team's repository URLs (read for a test report only; never a token).
    repos: list[str] = field(default_factory=list)
    #: The school's time zone, which files a task move under a day.
    zone: ZoneInfo = field(default_factory=lambda: ZoneInfo(DEFAULT_TIMEZONE))

    @cached_property
    def tasks_by_story(self) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for t in self.tasks:
            out.setdefault(str(t["story_id"]), []).append(t)
        return out

    @cached_property
    def stories_by_id(self) -> dict[str, dict]:
        return {str(s["id"]).lower(): s for s in self.stories}

    def tasks_of(self, story: dict) -> list[dict]:
        return self.tasks_by_story.get(str(story["id"]), [])

    @cached_property
    def days_by_sprint(self) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for row in sorted(self.burnup_days, key=lambda r: str(r["day"])):
            out.setdefault(str(row["sprint_id"]), []).append(row)
        return out

    def days_of(self, sprint: dict) -> list[dict]:
        """A sprint's saved days, by day."""
        return self.days_by_sprint.get(str(sprint["id"]), [])


# ----------------------------------------------------------------------- the reads ----


def context_jobs(
    client, project_id, sprint_id, *, burnup: bool = False, repos: bool = False
) -> dict[str, Callable[[], list[dict]]]:
    """The reads behind a :class:`Ctx`, for ``fan_out`` (a caller adds its own beside them). With
    ``burnup``, every sprint's saved days ride on the sprints and every task's moves on the tasks; the
    team's repository URLs are read only with ``repos``.
    """
    pid = str(project_id)

    def rows(query) -> list[dict]:
        return query.execute().data or []

    sprint_columns = "id, name, starts_at, ends_at" + (f", {_SPRINT_DAYS}" if burnup else "")
    task_columns = _TASK_COLUMNS + (f", {_TASK_MOVES}" if burnup else "")
    jobs: dict[str, Callable[[], list[dict]]] = {
        "sprints": lambda: rows(
            client.table("sprints").select(sprint_columns).eq("project_id", pid).order("starts_at")
        ),
        "stories": lambda: rows(
            client.table("user_stories").select(_STORY_COLUMNS).eq("project_id", pid)
        ),
        "tasks": lambda: rows(client.table("tasks").select(task_columns).eq("project_id", pid)),
    }
    if repos:
        jobs["repos"] = lambda: rows(
            client.table("scrum_repos").select("repo_url").eq("project_id", pid).order("created_at")
        )
    return jobs


def build_context(
    reads: dict, *, project_id, sprint_id, today: date, zone: ZoneInfo | None = None
) -> Ctx:
    """A :class:`Ctx` from the results of :func:`context_jobs`."""
    sprints, days = [], []
    for row in reads.get("sprints") or []:
        sprint = dict(row)
        days += sprint.pop("sprint_burnup_days", None) or []
        sprints.append(sprint)
    wanted = str(sprint_id).lower() if sprint_id else None
    return Ctx(
        project_id=str(project_id),
        sprint=next((s for s in sprints if str(s["id"]).lower() == wanted), None),
        sprints=sprints,
        stories=reads.get("stories") or [],
        tasks=reads.get("tasks") or [],
        today=today,
        burnup_days=days,
        repos=[r["repo_url"] for r in reads.get("repos") or []],
        zone=zone or ZoneInfo(DEFAULT_TIMEZONE),
    )


def load_context(
    client,
    project_id,
    sprint_id,
    *,
    today: date,
    zone: ZoneInfo | None = None,
    burnup: bool = False,
    repos: bool = False,
) -> Ctx:
    """The board for one document, in one round of concurrent reads: three, and one more for the
    repositories when asked."""
    reads = fan_out(context_jobs(client, project_id, sprint_id, burnup=burnup, repos=repos))
    return build_context(reads, project_id=project_id, sprint_id=sprint_id, today=today, zone=zone)


# ----------------------------------------------------------------- the board's lists ----


def story_completed(story: dict, tasks: list[dict]) -> bool:
    """At least one task, and every task done."""
    return bool(tasks) and all(t.get("status") == "done" for t in tasks)


def _sprint_stories(ctx: Ctx, sprint: dict) -> list[dict]:
    """A sprint's live stories in board order."""
    return sorted(
        (s for s in ctx.stories if s.get("sprint_id") == sprint["id"] and not s.get("archived_at")),
        key=story_order,
    )


def _lists(ctx: Ctx) -> list[tuple[dict | None, list[dict]]]:
    """Each sprint with its stories, sprints by start, then the backlog (None): the board's lists,
    each in board order."""
    backlog = sorted((s for s in ctx.stories if in_backlog(s)), key=story_order)
    return [(s, _sprint_stories(ctx, s)) for s in ctx.sprints] + [(None, backlog)]


def _board_stories(ctx: Ctx) -> list[dict]:
    return [story for _, stories in _lists(ctx) for story in stories]


def _completed_stories(ctx: Ctx) -> list[dict]:
    return [s for s in _board_stories(ctx) if story_completed(s, ctx.tasks_of(s))]


def _hours(tasks: list[dict]) -> int | None:
    """The sum of the tasks' hour estimates, None when none has one (the board's story hours)."""
    return sum(t.get("estimate_hours") or 0 for t in tasks) or None


def _story_line(ctx: Ctx, story: dict) -> dict:
    return {
        "id": story["id"],
        "key": story["key"],
        "title": story["title"],
        "points": story.get("points"),
        "hours": _hours(ctx.tasks_of(story)),
    }


def _story_ref(ctx: Ctx, story_id: str) -> dict:
    """A story a body names, with its criteria; ``missing`` when it is no longer on the board."""
    story = ctx.stories_by_id.get(str(story_id).lower())
    if story is None:
        return {"id": story_id, "missing": True}
    return {
        "id": story["id"],
        "key": story["key"],
        "title": story["title"],
        "acceptance_criteria": list(story.get("acceptance_criteria") or []),
    }


# ------------------------------------------------------------------- sprint report ----


def _rate(amount: int, days: int) -> float:
    return round(amount / days, 2) if days > 0 else 0.0


@dataclass(frozen=True)
class _Members:
    """A sprint's stories for its report: ``(id, the story now or None once deleted, completed)``, in
    board order (deleted ones last), and ``as_of``, the saved day they come from or ``"now"``."""

    entries: list[tuple[str, dict | None, bool]]
    as_of: str


def _day_of(row: dict) -> date:
    return date.fromisoformat(str(row["day"])[:10])


def _members(ctx: Ctx, sprint: dict) -> _Members:
    """The sprint's stories as it ended: from the last saved day on or before its end that recorded
    them, else the board as it is now (see the module docstring)."""
    last_day = sprint_days(sprint)[1]
    recorded = [
        r for r in ctx.days_of(sprint) if r.get("story_ids") is not None and _day_of(r) <= last_day
    ]
    if not recorded:
        stories = _sprint_stories(ctx, sprint)
        return _Members([(s["id"], s, story_completed(s, ctx.tasks_of(s))) for s in stories], "now")
    row = max(recorded, key=_day_of)
    done = {str(i).lower() for i in row.get("done_story_ids") or []}
    found = [(str(i), ctx.stories_by_id.get(str(i).lower())) for i in row["story_ids"]]
    here = sorted(((i, s) for i, s in found if s is not None), key=lambda e: story_order(e[1]))
    gone = [(i, s) for i, s in found if s is None]
    entries = [(i, s, i.lower() in done) for i, s in here + gone]
    return _Members(entries, _day_of(row).isoformat())


def _member_line(ctx: Ctx, story_id: str, story: dict | None) -> dict:
    return _story_line(ctx, story) if story is not None else {"id": story_id, "missing": True}


def _sprint_numbers(ctx: Ctx, sprint: dict) -> tuple[int, int, int]:
    """A sprint's completed stories as it ended, the hours of those stories' done tasks, and its length
    in days, both end days counted."""
    members = _members(ctx, sprint)
    completed = sum(1 for _, _, done in members.entries if done)
    hours = sum(
        t.get("estimate_hours") or 0
        for _, story, _ in members.entries
        if story is not None
        for t in ctx.tasks_of(story)
        if t.get("status") == "done"
    )
    first, last = sprint_days(sprint)
    return completed, hours, (last - first).days + 1


def _instant(value) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _replayed(ctx: Ctx, sprint: dict, stories: list[dict], unit: str) -> dict[str, int] | None:
    """Completed per day, replayed from the stories' task moves, when the saved days don't cover every
    day of the sprint so far: the board's own replay (``scrum.burnup.replay_completed``). None when they
    do, before the sprint starts, or with no move to replay."""
    first, last = sprint_days(sprint)
    if ctx.today < first:
        return None
    end = min(ctx.today, last)
    covered = {_day_of(r) for r in ctx.days_of(sprint) if first <= _day_of(r) <= end}
    if (end - first).days + 1 <= len(covered):
        return None
    tasks = [t for s in stories for t in ctx.tasks_of(s)]
    moves = sorted(
        (
            (t["id"], m["to_status"], _instant(m["moved_at"]))
            for t in tasks
            for m in t.get("task_moves") or []
        ),
        key=lambda move: move[2],
    )
    if not moves:
        return None
    column = _UNIT_COLUMN[unit]
    values = {t["id"]: t.get(column) or 0 for t in tasks}
    return replay_completed(
        [(task_id, status, at.astimezone(ctx.zone).date()) for task_id, status, at in moves],
        values,
        first,
        end,
    )


def _burnup(ctx: Ctx, sprint: dict, stories: list[dict]) -> dict:
    """The sprint's burnup in the unit the board would open it in, from its saved days, the task moves
    for the days nobody saved, and today's live values while it runs."""
    staged = [{**s, "tasks": ctx.tasks_of(s)} for s in stories]
    totals = burnup_totals(staged, done_tasks(staged))
    unit = default_unit(totals)
    first, last = sprint_days(sprint)
    live = totals.values()
    series = build_sprint_series(
        snapshots=ctx.days_of(sprint),
        starts_at=first,
        ends_at=last,
        today=ctx.today,
        live_scope=live[f"scope_{unit}"],
        live_completed=live[f"completed_{unit}"],
        completed_by_day=_replayed(ctx, sprint, stories, unit),
        unit=unit,
    )
    return {
        "unit": unit,
        "labels": series["labels"],
        "scope": series["scope"],
        "completed": series["completed"],
    }


def derive_sprint_report(ctx: Ctx, body: dict) -> dict:
    """The sprint as it ended (see the module docstring): its stories, completed and not, each as it is
    now (``missing`` once deleted); its numbers and rates; the same rates to date (this sprint and every
    one that started before it, each by the same rule, pooled: stories over days, hours over days); its
    burnup; and ``as_of``, the saved day the stories come from or ``"now"``."""
    sprint = ctx.sprint
    members = _members(ctx, sprint)
    completed = [_member_line(ctx, i, s) for i, s, done in members.entries if done]
    not_completed = [_member_line(ctx, i, s) for i, s, done in members.entries if not done]
    done, hours, days = _sprint_numbers(ctx, sprint)
    first_day = sprint_days(sprint)[0]
    counted = [s for s in ctx.sprints if s["id"] == sprint["id"] or sprint_days(s)[0] < first_day]
    numbers = [_sprint_numbers(ctx, s) for s in counted]
    all_days = sum(n[2] for n in numbers)
    return {
        "completed": completed,
        "not_completed": not_completed,
        "stories_completed": done,
        "hours_completed": hours,
        "days": days,
        "stories_per_day": _rate(done, days),
        "hours_per_day": _rate(hours, days),
        "to_date": {
            "sprints_counted": len(counted),
            "stories_per_day": _rate(sum(n[0] for n in numbers), all_days),
            "hours_per_day": _rate(sum(n[1] for n in numbers), all_days),
        },
        "burnup": _burnup(ctx, sprint, [s for _, s, _ in members.entries if s is not None]),
        "as_of": members.as_of,
    }


def seed_sprint_report(ctx: Ctx) -> dict:
    return {"stop": [], "start": [], "keep": [], "satisfied_note": ""}


def checks_sprint_report(ctx: Ctx, body: dict, derived: dict) -> list[str]:
    failures = []
    if ctx.today <= sprint_days(ctx.sprint)[1]:
        failures.append(SPRINT_NOT_ENDED)
    if not body.get("start"):
        failures.append(NEED_START)
    if not body.get("keep"):
        failures.append(NEED_KEEP)
    if not body.get("stop") and not (body.get("satisfied_note") or "").strip():
        failures.append(NEED_STOP)
    return failures


# ----------------------------------------------------------------- release summary ----


def derive_release_summary(ctx: Ctx, body: dict) -> dict:
    """Each key story in the body's order, with its criteria and whether it is completed (or
    ``missing``); and the product backlog: the stories in sprints that are not completed, sprint by
    sprint, then the backlog's stories, each list in board order."""
    key_stories = []
    for story_id in body.get("key_story_ids") or []:
        ref = _story_ref(ctx, story_id)
        if not ref.get("missing"):
            story = ctx.stories_by_id[str(story_id).lower()]
            ref["completed"] = story_completed(story, ctx.tasks_of(story))
        key_stories.append(ref)
    backlog = [
        {
            "id": s["id"],
            "key": s["key"],
            "title": s["title"],
            "points": s.get("points"),
            "in_sprint": sprint["name"] if sprint else None,
        }
        for sprint, stories in _lists(ctx)
        for s in stories
        if sprint is None or not story_completed(s, ctx.tasks_of(s))
    ]
    return {"key_stories": key_stories, "backlog": backlog}


def seed_release_summary(ctx: Ctx) -> dict:
    """The completed stories, in board order, as the key stories."""
    return {
        "key_story_ids": [s["id"] for s in _completed_stories(ctx)][:KEY_STORIES_MAX],
        "known_problems": [],
        "follow_ups": [],
    }


def checks_release_summary(ctx: Ctx, body: dict, derived: dict) -> list[str]:
    failures = []
    if not body.get("key_story_ids"):
        failures.append(NEED_KEY_STORY)
    if any(s.get("missing") or not s.get("acceptance_criteria") for s in derived["key_stories"]):
        failures.append(NEED_CRITERIA)
    return failures


# ---------------------------------------------------------------- test plan, report ----


def derive_test_report(ctx: Ctx, body: dict) -> dict:
    """Each story the scenarios name, once, by id, with its criteria (or ``missing``); each scenario's
    story ids; the team's repositories; and the stories with criteria that no scenario covers, in board
    order. A story named by several scenarios is stored once, which keeps a snapshot small."""
    scenarios = body.get("scenarios") or []
    stories: dict[str, dict] = {}
    for scenario in scenarios:
        for story_id in scenario.get("story_ids") or []:
            if str(story_id) not in stories:
                ref = _story_ref(ctx, story_id)
                ref.pop("id")
                stories[str(story_id)] = ref
    covered = {key.lower() for key in stories}
    return {
        "stories": stories,
        "scenarios": [
            {"id": sc["id"], "story_ids": [str(i) for i in sc.get("story_ids") or []]}
            for sc in scenarios
        ],
        "repositories": list(ctx.repos),
        "uncovered": [
            {"id": s["id"], "key": s["key"], "title": s["title"]}
            for s in _board_stories(ctx)
            if s.get("acceptance_criteria") and str(s["id"]).lower() not in covered
        ],
    }


def _numbered(criteria: list[str]) -> str:
    """The criteria as a numbered list: as many whole items as fit in a scenario's steps."""
    lines: list[str] = []
    size = 0
    for n, criterion in enumerate(criteria, start=1):
        item = f"{n}. {' '.join(str(criterion).split())}"
        grown = size + len(item) + (1 if lines else 0)
        if grown > STEPS_MAX:
            break
        lines.append(item)
        size = grown
    return "\n".join(lines)


def seed_test_report(ctx: Ctx) -> dict:
    """A scenario for each completed story that has criteria: titled after it (by its key when its
    title is blank), its steps the criteria, not yet run."""
    scenarios = [
        {
            "id": str(uuid.uuid4()),
            "title": s["title"][:SCENARIO_TITLE_MAX].strip() or s["key"],
            "story_ids": [s["id"]],
            "steps_md": _numbered(s["acceptance_criteria"]),
            "result": None,
            "note": "",
        }
        for s in _completed_stories(ctx)
        if s.get("acceptance_criteria")
    ]
    return {"scenarios": scenarios[:SCENARIOS_MAX], "unit_tests": [], "unit_tests_note": ""}


def checks_test_report(ctx: Ctx, body: dict, derived: dict) -> list[str]:
    scenarios = body.get("scenarios") or []
    failures = []
    if not scenarios:
        failures.append(NEED_SCENARIO)
    if any(sc.get("result") not in ("pass", "fail") for sc in scenarios):
        failures.append(NEED_RESULTS)
    return failures
