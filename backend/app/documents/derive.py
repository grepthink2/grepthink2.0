"""What a document takes from the board: the context read once, and for each kind its seed, its derived
sections and the checks that hold back a finalize.

Everything but the reads is pure: it works on a ``Ctx``. A draft's derived sections are the board as it is
now; finalize stores them on the revision it hands in (the snapshot), and readers of that revision get the
snapshot instead. The board's rules come from the scrum board itself: which stories a sprint or the backlog
lists and in what order (``in_backlog``, ``story_order``), a sprint's days, and what a burnup counts.

A story is completed when it has at least one task and every task is done.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from functools import cached_property

from app.core.db import fan_out
from app.documents.models import KEY_STORIES_MAX, SCENARIO_TITLE_MAX, SCENARIOS_MAX, STEPS_MAX
from app.scrum.burnup import build_sprint_series, default_unit
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

_TASK_COLUMNS = "id, story_id, status, estimate_hours, points"
_BURNUP_COLUMNS = "sprint_id, day, scope_points, completed_points, scope_hours, completed_hours"


@dataclass(frozen=True)
class Ctx:
    """The board as one document sees it, read once (:func:`load_context`)."""

    project_id: str
    #: The document's sprint (a sprint's kinds), else None.
    sprint: dict | None
    #: The project's sprints, by ``starts_at``.
    sprints: list[dict]
    #: Every story of the project, every column.
    stories: list[dict]
    #: Every task of the project: ``id, story_id, status, estimate_hours, points``.
    tasks: list[dict]
    #: Today at the project's school.
    today: date
    #: The sprint's saved ``sprint_burnup_days`` rows, by day (read for a sprint report only).
    burnup_days: list[dict] = field(default_factory=list)
    #: The team's repository URLs (read for a test report only; never a token).
    repos: list[str] = field(default_factory=list)

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


# ----------------------------------------------------------------------- the reads ----


def context_jobs(
    client, project_id, sprint_id, *, burnup: bool = False, repos: bool = False
) -> dict[str, Callable[[], list[dict]]]:
    """The reads behind a :class:`Ctx`, for ``fan_out`` (a caller adds its own beside them). The
    sprint's saved burnup days only with ``burnup``, the team's repository URLs only with ``repos``.
    """
    pid = str(project_id)

    def rows(query) -> list[dict]:
        return query.execute().data or []

    jobs: dict[str, Callable[[], list[dict]]] = {
        "sprints": lambda: rows(
            client.table("sprints")
            .select("id, name, starts_at, ends_at")
            .eq("project_id", pid)
            .order("starts_at")
        ),
        "stories": lambda: rows(client.table("user_stories").select("*").eq("project_id", pid)),
        "tasks": lambda: rows(client.table("tasks").select(_TASK_COLUMNS).eq("project_id", pid)),
    }
    if burnup and sprint_id:
        jobs["burnup_days"] = lambda: rows(
            client.table("sprint_burnup_days")
            .select(_BURNUP_COLUMNS)
            .eq("sprint_id", str(sprint_id))
            .order("day")
        )
    if repos:
        jobs["repos"] = lambda: rows(
            client.table("scrum_repos").select("repo_url").eq("project_id", pid).order("created_at")
        )
    return jobs


def build_context(reads: dict, *, project_id, sprint_id, today: date) -> Ctx:
    """A :class:`Ctx` from the results of :func:`context_jobs`."""
    sprints = reads.get("sprints") or []
    wanted = str(sprint_id).lower() if sprint_id else None
    return Ctx(
        project_id=str(project_id),
        sprint=next((s for s in sprints if str(s["id"]).lower() == wanted), None),
        sprints=sprints,
        stories=reads.get("stories") or [],
        tasks=reads.get("tasks") or [],
        today=today,
        burnup_days=reads.get("burnup_days") or [],
        repos=[r["repo_url"] for r in reads.get("repos") or []],
    )


def load_context(
    client, project_id, sprint_id, *, today: date, burnup: bool = False, repos: bool = False
) -> Ctx:
    """The board for one document, in one round of concurrent reads: three, and one more for the
    burnup days or the repositories when asked."""
    reads = fan_out(context_jobs(client, project_id, sprint_id, burnup=burnup, repos=repos))
    return build_context(reads, project_id=project_id, sprint_id=sprint_id, today=today)


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


def _sprint_numbers(ctx: Ctx, sprint: dict) -> tuple[int, int, int]:
    """A sprint's completed stories, the hours of its done tasks (whatever their story's state) and
    its length in days, both end days counted."""
    stories = _sprint_stories(ctx, sprint)
    completed = sum(1 for s in stories if story_completed(s, ctx.tasks_of(s)))
    hours = sum(
        t.get("estimate_hours") or 0
        for s in stories
        for t in ctx.tasks_of(s)
        if t.get("status") == "done"
    )
    first, last = sprint_days(sprint)
    return completed, hours, (last - first).days + 1


def _burnup(ctx: Ctx, sprint: dict, stories: list[dict]) -> dict:
    """The sprint's burnup in the unit the board would open it in, from its saved days (and today's
    live values while it runs)."""
    staged = [{**s, "tasks": ctx.tasks_of(s)} for s in stories]
    totals = burnup_totals(staged, done_tasks(staged))
    unit = default_unit(totals)
    first, last = sprint_days(sprint)
    live = totals.values()
    series = build_sprint_series(
        snapshots=ctx.burnup_days,
        starts_at=first,
        ends_at=last,
        today=ctx.today,
        live_scope=live[f"scope_{unit}"],
        live_completed=live[f"completed_{unit}"],
        unit=unit,
    )
    return {
        "unit": unit,
        "labels": series["labels"],
        "scope": series["scope"],
        "completed": series["completed"],
    }


def derive_sprint_report(ctx: Ctx, body: dict) -> dict:
    """The sprint's stories, completed and not, its numbers and rates, the same rates to date (this
    sprint and every one that started before it, pooled: stories over days, hours over days), and its
    burnup."""
    sprint = ctx.sprint
    stories = _sprint_stories(ctx, sprint)
    completed = [_story_line(ctx, s) for s in stories if story_completed(s, ctx.tasks_of(s))]
    not_completed = [
        _story_line(ctx, s) for s in stories if not story_completed(s, ctx.tasks_of(s))
    ]
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
        "burnup": _burnup(ctx, sprint, stories),
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
