"""Pure sprint-schedule arithmetic and the sprint status rule (no I/O — callers pass dates).

A class's schedule (spec D20) is the first sprint's first day, a sprint count and a frequency.
Sprint k starts k-1 weeks after that day (weekly), 2(k-1) weeks after it (biweekly), or on the
same day of the month k-1 calendar months later, clamped to that month's last day (monthly).
Every sprint ends the day before the next one starts, the last one the day before sprint
count+1 would start, so the windows cover the schedule with no gap and no overlap. A sprint's
status follows from its dates and today (spec D22), never from a stored column.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from itertools import pairwise
from typing import NamedTuple

FREQUENCIES: tuple[str, ...] = ("weekly", "biweekly", "monthly")

SPRINT_NAME = "Sprint {k}"


class Schedule(NamedTuple):
    """A class's sprint schedule: the first sprint's first day, how many sprints, how often."""

    start_on: date
    count: int
    frequency: str

    @classmethod
    def from_class(cls, row: dict) -> Schedule | None:
        """The schedule on a `classes` row; None when any of its three columns is absent or null.

        PostgREST sends `sprints_start_on` as ISO text; a `date` is accepted too.
        """
        start_on = row.get("sprints_start_on")
        count = row.get("sprint_count")
        frequency = row.get("sprint_frequency")
        if start_on is None or count is None or frequency is None:
            return None
        return cls(date.fromisoformat(str(start_on)), count, frequency)


def _add_months(d: date, months: int) -> date:
    """`d` moved by whole calendar months, its day clamped to the target month's last day."""
    index = d.month - 1 + months
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def _sprint_start(start_on: date, k: int, frequency: str) -> date:
    """The first day of sprint k (from 1); k = count+1 gives the day after the schedule."""
    if frequency == "weekly":
        return start_on + timedelta(weeks=k - 1)
    if frequency == "biweekly":
        return start_on + timedelta(weeks=2 * (k - 1))
    if frequency == "monthly":
        return _add_months(start_on, k - 1)
    raise ValueError(f"Unknown sprint frequency: {frequency!r}")


def sprint_windows(start_on: date, count: int, frequency: str) -> list[tuple[date, date]]:
    """`(starts_at, ends_at)` of sprints 1..count; each ends the day before the next starts."""
    starts = [_sprint_start(start_on, k, frequency) for k in range(1, count + 2)]
    return [(start, following - timedelta(days=1)) for start, following in pairwise(starts)]


def schedule_end(start_on: date, count: int, frequency: str) -> date:
    """The last sprint's last day: the day before sprint count+1 would start."""
    return _sprint_start(start_on, count + 1, frequency) - timedelta(days=1)


def sprint_status(starts_at: date, ends_at: date, today: date) -> str:
    """`completed` after `ends_at`, `active` from `starts_at` through `ends_at`, else `planned`."""
    if today > ends_at:
        return "completed"
    if today >= starts_at:
        return "active"
    return "planned"


def schedule_problem(
    *,
    start_on: date,
    count: int,
    frequency: str,
    class_start: date | None,
    class_end: date | None,
) -> str | None:
    """Why the schedule does not fit the class's dates, or None when it fits.

    `SPRINTS_BEFORE_START`: the first sprint starts before `class_start`. `SPRINTS_PAST_END`:
    the last sprint ends after `class_end`. A class date that is not set allows any day on its
    side; when both fail, the start is reported.
    """
    if class_start is not None and start_on < class_start:
        return "SPRINTS_BEFORE_START"
    if class_end is not None and schedule_end(start_on, count, frequency) > class_end:
        return "SPRINTS_PAST_END"
    return None
