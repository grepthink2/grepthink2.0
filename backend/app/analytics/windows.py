"""Pure date-window helpers for analytics (spec D8).

No database and no clock: callers pass ``today`` in the school's zone. A range is a pair of inclusive
calendar dates; the SQL turns them into school-zone midnights. ``WindowError`` carries the fixed
422 message the view answers with.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Literal
from zoneinfo import ZoneInfo

Window = Literal["7d", "30d", "90d", "class", "all", "custom"]
PRESET_DAYS: dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}
MAX_CUSTOM_SPAN_YEARS = 2  # "a range may span at most 2 years" (spec D8, Q-B5): calendar years

CUSTOM_NEEDS_DATES = "from and to are required for a custom range"
TO_BEFORE_FROM = "to must be on or after from"
RANGE_TOO_LONG = "a range may span at most 2 years"
CLASS_NEEDS_CLASS_ID = "window=class needs class_id"


class WindowError(ValueError):
    """The requested range contradicts the rules; the view answers 422 with ``str(exc)``."""


@dataclass(frozen=True)
class RangeBounds:
    window: Window
    start: dt.date
    end: dt.date
    prev_start: dt.date | None
    prev_end: dt.date | None

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


def years_after(day: dt.date, years: int) -> dt.date:
    """The same calendar date ``years`` later; Feb 29 lands on Feb 28 when that year has none."""
    try:
        return day.replace(year=day.year + years)
    except ValueError:
        return day.replace(year=day.year + years, day=28)


def range_bounds(
    window: Window,
    today: dt.date,
    *,
    class_start: dt.date | None = None,
    custom_from: dt.date | None = None,
    custom_to: dt.date | None = None,
    all_from: dt.date | None = None,
) -> RangeBounds:
    """Inclusive bounds for a window plus the previous range of equal length (None for ``all``)."""
    if window in PRESET_DAYS:
        start, end = today - dt.timedelta(days=PRESET_DAYS[window] - 1), today
    elif window == "class":
        if class_start is None:
            raise WindowError(CLASS_NEEDS_CLASS_ID)
        start, end = min(class_start, today), today
    elif window == "all":
        start = min(all_from, today) if all_from is not None else today
        return RangeBounds(window, start, today, None, None)
    elif window == "custom":
        if custom_from is None or custom_to is None:
            raise WindowError(CUSTOM_NEEDS_DATES)
        if custom_to < custom_from:
            raise WindowError(TO_BEFORE_FROM)
        if custom_to > years_after(custom_from, MAX_CUSTOM_SPAN_YEARS):
            raise WindowError(RANGE_TOO_LONG)
        start, end = custom_from, custom_to
    else:
        raise WindowError(f"unknown window {window!r}")
    length = (end - start).days + 1
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=length - 1)
    return RangeBounds(window, start, end, prev_start, prev_end)


def parse_date(value: str | None) -> dt.date | None:
    """A date column's value (``YYYY-MM-DD``) → date; blank → None.

    A timestamp is refused rather than cut down: its date part would be the UTC date, which is the
    mistake ``local_date`` exists to avoid.
    """
    if not value:
        return None
    if len(value) != 10:
        raise ValueError(f"expected a YYYY-MM-DD date, got {value!r}")
    return dt.date.fromisoformat(value)


def local_date(value: str | None, tz: str) -> dt.date | None:
    """The calendar date of an ISO timestamp in the school's zone; a bare date is returned as is.

    ``classes.created_at`` is a UTC instant: a class created on a Pacific evening is already "tomorrow" in
    UTC, so the class and all-time windows take their start from the school's calendar, not UTC's. A
    timestamp without an offset is read as UTC, never as the server's local time.
    """
    if not value:
        return None
    if len(value) <= 10:
        return dt.date.fromisoformat(value)
    instant = dt.datetime.fromisoformat(value)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=dt.UTC)
    return instant.astimezone(ZoneInfo(tz)).date()
