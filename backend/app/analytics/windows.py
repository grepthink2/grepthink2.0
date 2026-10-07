"""Pure date-window and folding helpers for analytics (spec D8 and decision 16).

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
WINDOWS: tuple[str, ...] = ("7d", "30d", "90d", "class", "all", "custom")
PRESET_DAYS: dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}
MAX_CUSTOM_SPAN_DAYS = 730  # "a range may span at most 2 years" (spec Q-B5)
K_ANONYMITY = 3  # decision 16
FOLDED_LABEL = "Smaller groups"

CUSTOM_NEEDS_DATES = "from and to are required for a custom range"
TO_BEFORE_FROM = "to must be on or after from"
RANGE_TOO_LONG = "a range may span at most 2 years"
CLASS_NEEDS_CLASS_ID = "window=class needs class_id"


class WindowError(ValueError):
    """The requested range contradicts the rules; the view answers 422 with ``str(exc)``."""


@dataclass(frozen=True)
class RangeBounds:
    window: str
    start: dt.date
    end: dt.date
    prev_start: dt.date | None
    prev_end: dt.date | None

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


def range_bounds(
    window: str,
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
        if (custom_to - custom_from).days > MAX_CUSTOM_SPAN_DAYS:
            raise WindowError(RANGE_TOO_LONG)
        start, end = custom_from, custom_to
    else:
        raise WindowError(f"unknown window {window!r}")
    length = (end - start).days + 1
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=length - 1)
    return RangeBounds(window, start, end, prev_start, prev_end)


def parse_date(value: str | None) -> dt.date | None:
    """``YYYY-MM-DD`` or an ISO timestamp (its date part, as written) → date; blank → None."""
    if not value:
        return None
    return dt.date.fromisoformat(value[:10])


def local_date(value: str | None, tz: str) -> dt.date | None:
    """The calendar date of an ISO timestamp in the school's zone; a bare date is returned as is.

    ``classes.created_at`` is a UTC instant: a class created on a Pacific evening is already "tomorrow" in
    UTC, so the class and all-time windows take their start from the school's calendar, not UTC's.
    """
    if not value:
        return None
    if len(value) <= 10:
        return dt.date.fromisoformat(value)
    return dt.datetime.fromisoformat(value).astimezone(ZoneInfo(tz)).date()


def fold_small_groups(
    rows: list[dict],
    *,
    size_key: str,
    sum_keys: tuple[str, ...],
    k: int = K_ANONYMITY,
    label: str = FOLDED_LABEL,
) -> list[dict]:
    """Decision 16: rows whose ``size_key`` is below ``k`` become one trailing ``kind: 'folded'`` row.

    Kept rows get ``kind: 'row'``. The folded row carries ``id``, ``name`` ("Smaller groups (n)"),
    the summed ``sum_keys`` and the summed ``size_key``; nothing else (so never an ``href``).
    """
    kept: list[dict] = []
    small: list[dict] = []
    for row in rows:
        target = small if (row.get(size_key) or 0) < k else kept
        target.append({**row, "kind": "row"})
    if not small:
        return kept
    folded: dict = {"id": "folded", "name": f"{label} ({len(small)})", "kind": "folded"}
    for key in sum_keys:
        folded[key] = sum((r.get(key) or 0) for r in small)
    folded[size_key] = sum((r.get(size_key) or 0) for r in small)
    return kept + [folded]
