"""Pure burnup math (no I/O — the controller feeds it rows).

Semantics (spec D21): the burnup counts tasks, in points or in hours. Scope = the sum of the
sprint's task estimates in the unit; completed = the same sum over its DONE tasks; story points
count nowhere. Points are available only when the sprint has a task and every task has points;
hours always are, a task without hours counting zero.

Past days come from sprint_burnup_days snapshots, which keep both units; days without a snapshot
take exact completed values reconstructed from the task_moves audit (`completed_by_day`) when
provided, else carry forward; scope always carries forward between snapshots. A snapshot written
before the hours columns existed reads 0 hours, so one with both values 0 in the unit while the
other unit's are not counts as no snapshot in that unit (`holds_unit`). Today is always the live
recomputation. Labels cover the whole sprint; value arrays stop at today (the chart draws the
remainder as empty).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class Totals:
    """A sprint's live burnup values in both units, and how many of its tasks have points."""

    scope_points: int
    completed_points: int
    scope_hours: int
    completed_hours: int
    tasks_total: int
    tasks_with_points: int

    def values(self) -> dict[str, int]:
        """The four values, named as a sprint_burnup_days row names them."""
        return {
            "scope_points": self.scope_points,
            "completed_points": self.completed_points,
            "scope_hours": self.scope_hours,
            "completed_hours": self.completed_hours,
        }


def units_available(t: Totals) -> list[str]:
    """Points when the sprint has a task and every task has points; hours always."""
    if t.tasks_total >= 1 and t.tasks_with_points == t.tasks_total:
        return ["points", "hours"]
    return ["hours"]


def default_unit(t: Totals) -> str:
    """Points when available, else hours."""
    return "points" if "points" in units_available(t) else "hours"


def holds_unit(snapshot: dict, unit: str) -> bool:
    """Whether ``snapshot`` was taken in ``unit``.

    One written before the hours columns existed reads 0 hours: both of its values 0 in ``unit``
    while the other unit's are not means it holds nothing in ``unit``. All four 0 is a real zero.
    """

    def has(u: str) -> bool:
        return bool(snapshot.get(f"scope_{u}") or snapshot.get(f"completed_{u}"))

    return has(unit) or not has("hours" if unit == "points" else "points")


def _label(d: date) -> str:
    return f"{d.month}/{d.day}"


def build_sprint_series(
    *,
    snapshots: list[dict],
    starts_at: date,
    ends_at: date,
    today: date,
    live_scope: int,
    live_completed: int,
    completed_by_day: dict[str, int] | None = None,
    unit: str = "points",
) -> dict:
    labels = []
    d = starts_at
    while d <= ends_at:
        labels.append(_label(d))
        d += timedelta(days=1)

    by_day = {str(s["day"]): s for s in snapshots if holds_unit(s, unit)}
    scope: list[int] = []
    completed: list[int] = []
    last_scope, last_completed = 0, 0
    d = starts_at
    while d <= min(today, ends_at):
        snap = by_day.get(d.isoformat())
        if snap:
            last_scope = snap.get(f"scope_{unit}") or 0
            last_completed = snap.get(f"completed_{unit}") or 0
        elif completed_by_day and d.isoformat() in completed_by_day:
            last_completed = completed_by_day[d.isoformat()]
        if d == today:
            last_scope, last_completed = live_scope, live_completed
        scope.append(last_scope)
        completed.append(last_completed)
        d += timedelta(days=1)
    return {"labels": labels, "scope": scope, "completed": completed}


def build_cumulative_series(sprints: list[dict], unit: str = "points") -> dict:
    labels, scope, completed = [], [], []
    total_scope = total_done = 0
    for i, s in enumerate(sprints, start=1):
        final = s.get("final") or {}
        total_scope += final.get(f"scope_{unit}") or 0
        total_done += final.get(f"completed_{unit}") or 0
        labels.append(f"S{i}")
        scope.append(total_scope)
        completed.append(total_done)
    return {"labels": labels, "scope": scope, "completed": completed}
