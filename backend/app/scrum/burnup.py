"""Pure burnup-series math (no I/O — the controller feeds it rows).

Semantics (spec D7): scope = sum of story points in the sprint; completed = sum of
points of the sprint's DONE tasks. Past days come from sprint_burnup_days snapshots;
days without a snapshot take exact completed values reconstructed from the
task_moves audit (`completed_by_day`) when provided, else carry forward; scope
always carries forward between snapshots. Today is always the live recomputation.
Labels cover the whole sprint; value arrays stop at today (the chart draws the
remainder as empty).
"""
from __future__ import annotations

from datetime import date, timedelta


def _label(d: date) -> str:
    return f"{d.month}/{d.day}"


def build_sprint_series(*, snapshots: list[dict], starts_at: date, ends_at: date,
                        today: date, live_scope: int, live_completed: int,
                        completed_by_day: dict[str, int] | None = None) -> dict:
    labels = []
    d = starts_at
    while d <= ends_at:
        labels.append(_label(d))
        d += timedelta(days=1)

    by_day = {str(s["day"]): s for s in snapshots}
    scope: list[int] = []
    completed: list[int] = []
    last_scope, last_completed = 0, 0
    d = starts_at
    while d <= min(today, ends_at):
        snap = by_day.get(d.isoformat())
        if snap:
            last_scope, last_completed = snap["scope_points"], snap["completed_points"]
        elif completed_by_day and d.isoformat() in completed_by_day:
            last_completed = completed_by_day[d.isoformat()]
        if d == today:
            last_scope, last_completed = live_scope, live_completed
        scope.append(last_scope)
        completed.append(last_completed)
        d += timedelta(days=1)
    return {"labels": labels, "scope": scope, "completed": completed}


def build_cumulative_series(sprints: list[dict]) -> dict:
    labels, scope, completed = [], [], []
    total_scope = total_done = 0
    for i, s in enumerate(sprints, start=1):
        final = s.get("final") or {"scope_points": 0, "completed_points": 0}
        total_scope += final["scope_points"]
        total_done += final["completed_points"]
        labels.append(f"S{i}")
        scope.append(total_scope)
        completed.append(total_done)
    return {"labels": labels, "scope": scope, "completed": completed}
