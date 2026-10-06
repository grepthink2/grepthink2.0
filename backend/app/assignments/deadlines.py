"""Deadline arithmetic for assignments (spec §5.2, decisions 8 and 10/11).

``assignments.open_date`` and ``close_date`` are bare dates in the school's own zone. The deadline
instant, ``due_at``, is the first moment after the due day in that zone; ``accept_until`` is an
optional late-submission window. An assignment is open from the start of its open day until
``accept_until`` when set, else ``due_at``. Pure functions: controllers pass ``now_utc()`` so tests
can pin the clock by monkeypatching this module's ``now_utc``.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo


def now_utc() -> datetime:
    """The current instant, timezone-aware. Patched in tests."""
    return datetime.now(UTC)


def _midnight(day: date, tz: ZoneInfo) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=tz).astimezone(UTC)


def due_at_for(close_date: date | None, tz: ZoneInfo) -> datetime | None:
    """The deadline: midnight in ``tz`` right after ``close_date`` (``None`` without a due day)."""
    if close_date is None:
        return None
    return _midnight(close_date + timedelta(days=1), tz)


def opens_at(open_date: date | None, tz: ZoneInfo) -> datetime | None:
    """When the assignment opens: midnight in ``tz`` starting ``open_date``."""
    if open_date is None:
        return None
    return _midnight(open_date, tz)


def closes_at(due_at: datetime | None, accept_until: datetime | None) -> datetime | None:
    """When submissions stop being accepted: the late window when set, else the deadline."""
    return accept_until or due_at


def is_open(
    now: datetime, *, opens: datetime | None, due_at: datetime | None, accept_until: datetime | None
) -> bool:
    """True when ``now`` is inside the submission window. Missing bounds do not close it."""
    if opens is not None and now < opens:
        return False
    end = closes_at(due_at, accept_until)
    return end is None or now < end


def parse_ts(value: str | None) -> datetime | None:
    """A PostgREST ``timestamptz`` string as an aware UTC datetime; ``None`` for nothing."""
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
