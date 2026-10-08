"""Shape the weekly rows of ``analytics_trends`` into the Trends panels, the tile sparklines and deltas.

The SQL sums the rollup per Monday week (team messages, tasks created, direct messages; the week's last
points_done snapshot and its average team count, both over the classes in session) and counts the week's
rolled-up days. Only complete weeks are drawn: the week in progress, or the last week of a range that ends
mid-week, holds fewer days, and its partial sum would read as a drop. Per-team figures are divided here, in
Python, so a week with no teams becomes ``null`` instead of a division error (spec Q-B3).
"""

from __future__ import annotations

import datetime as dt

from app.analytics.windows import RangeBounds

# (key, title, unit, source metric)
PANELS: tuple[tuple[str, str, str, str], ...] = (
    ("team_messages_per_team", "Messages per team", "per team per week", "team_messages"),
    ("tasks_per_team", "Tasks created per team", "per team per week", "tasks_created"),
    ("points_done_per_team", "Points done per team", "per team", "points_done"),
)
SPARKLINE_WEEKS = 12
DAYS_PER_WEEK = 7


def week_of(day: dt.date) -> dt.date:
    """The Monday that starts ``day``'s week."""
    return day - dt.timedelta(days=day.weekday())


def _monday(row: dict) -> dt.date:
    return dt.date.fromisoformat(row["week_start"])


def _complete(row: dict) -> bool:
    """Whether the rollup covers all seven days of the row's week (a row without a count does not); no
    extrapolation from fewer."""
    return (row.get("days") or 0) >= DAYS_PER_WEEK


def _per_team(row: dict, metric: str) -> float | None:
    value, teams = row.get(metric), row.get("teams")
    if value is None or not teams:
        return None
    return round(float(value) / float(teams), 2)


def _weeks_between(weekly: list[dict], start: dt.date, end: dt.date) -> list[dict]:
    """The complete weeks whose Monday falls in ``start..end``: a week belongs to the range that contains its
    Monday, so the current and previous ranges never share one."""
    return [r for r in weekly if _complete(r) and start <= _monday(r) <= end]


def _series(weekly: list[dict], metric: str, start: dt.date, end: dt.date) -> list[dict]:
    """The per-team points of one metric over the complete weeks whose Monday falls in ``start..end``."""
    return [
        {"week_start": r["week_start"], "value": _per_team(r, metric)}
        for r in _weeks_between(weekly, start, end)
    ]


def build_panels(weekly: list[dict], bounds: RangeBounds) -> list[dict]:
    """One panel per PANELS entry: ``current`` over the range, ``previous`` over the previous range or None."""
    panels = []
    for key, title, unit, metric in PANELS:
        previous = None
        if bounds.prev_start is not None and bounds.prev_end is not None:
            previous = _series(weekly, metric, bounds.prev_start, bounds.prev_end)
        panels.append(
            {
                "key": key,
                "title": title,
                "unit": unit,
                "current": _series(weekly, metric, bounds.start, bounds.end),
                "previous": previous,
            }
        )
    return panels


def build_sparklines(weekly: list[dict], as_of: dt.date | None) -> dict[str, list[float]]:
    """Up to 12 weekly totals, oldest first, ending at the last complete week on or before ``as_of``'s week;
    {} before the first rollup. The week in progress is left out, so the window ends a week earlier."""
    if as_of is None:
        return {}
    complete = [r for r in weekly if _complete(r) and _monday(r) <= week_of(as_of)]
    if not complete:
        return {}
    last = max(_monday(r) for r in complete)
    first = last - dt.timedelta(weeks=SPARKLINE_WEEKS - 1)
    rows = [r for r in complete if _monday(r) >= first]
    return {
        "messages": [float(r["team_messages"]) + float(r["dm_messages"]) for r in rows],
        # team channels only: the Messages tile of the class view, which leaves the school's DMs out
        "team_messages": [float(r["team_messages"]) for r in rows],
        "tasks_created": [float(r["tasks_created"]) for r in rows],
    }


def delta(current: float | None, previous: float | None) -> float | None:
    """Relative change as a fraction; None without a usable baseline."""
    if current is None or previous is None or previous == 0:
        return None
    return round((float(current) - float(previous)) / float(previous), 4)


def dense_weeks(
    rows: list[dict], start: dt.date, end: dt.date, keys: tuple[str, ...]
) -> list[dict]:
    """One row per Monday from the week of ``start`` to the week of ``end``; missing weeks get zeros.

    The SQL returns only weeks with activity, so a quiet week would otherwise vanish from a chart's axis.
    Rows outside those weeks are dropped.
    """
    by_week = {r["week_start"]: r for r in rows}
    out = []
    monday = week_of(start)
    last = week_of(end)
    while monday <= last:
        key = monday.isoformat()
        row = by_week.get(key)
        out.append({"week_start": key, **{k: (row.get(k, 0) if row else 0) for k in keys}})
        monday += dt.timedelta(weeks=1)
    return out
