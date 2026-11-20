"""Deadline arithmetic (spec §5): the deadline is the first instant after close_date in the
school's zone; a late window extends when submissions are accepted, never the deadline itself."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.assignments import deadlines

#: Fixed offsets, which no daylight-time rule can move: UTC-8 all year (Pacific standard time)
#: and UTC+3 (Istanbul). An ``Etc/GMT`` name inverts the sign.
PACIFIC = ZoneInfo("Etc/GMT+8")
ISTANBUL = ZoneInfo("Etc/GMT-3")
#: A real zone, only for the daylight-time change itself.
LOS_ANGELES = ZoneInfo("America/Los_Angeles")


def test_due_at_is_midnight_after_the_due_day_in_the_schools_zone():
    assert deadlines.due_at_for(date(2026, 10, 7), PACIFIC) == datetime(
        2026, 10, 8, 8, 0, tzinfo=UTC
    )
    assert deadlines.due_at_for(date(2026, 10, 7), ISTANBUL) == datetime(
        2026, 10, 7, 21, 0, tzinfo=UTC
    )
    assert deadlines.due_at_for(None, PACIFIC) is None


def test_due_at_across_the_dst_change_day():
    # Los Angeles leaves DST on 2026-11-01: midnight after that day is 08:00 UTC, not 07:00.
    assert deadlines.due_at_for(date(2026, 10, 31), LOS_ANGELES) == datetime(
        2026, 11, 1, 7, 0, tzinfo=UTC
    )
    assert deadlines.due_at_for(date(2026, 11, 1), LOS_ANGELES) == datetime(
        2026, 11, 2, 8, 0, tzinfo=UTC
    )
    # The same day in a zone without DST keeps its offset: 21:00 UTC at UTC+3.
    assert deadlines.due_at_for(date(2026, 11, 1), ISTANBUL) == datetime(
        2026, 11, 1, 21, 0, tzinfo=UTC
    )


def test_opens_at_is_midnight_starting_the_open_day():
    assert deadlines.opens_at(date(2026, 10, 5), PACIFIC) == datetime(2026, 10, 5, 8, 0, tzinfo=UTC)
    assert deadlines.opens_at(None, PACIFIC) is None


def test_closes_at_prefers_the_late_window():
    due = datetime(2026, 10, 8, 7, 0, tzinfo=UTC)
    late = datetime(2026, 10, 10, 7, 0, tzinfo=UTC)
    assert deadlines.closes_at(due, None) == due
    assert deadlines.closes_at(due, late) == late
    assert deadlines.closes_at(None, None) is None


@pytest.mark.parametrize(
    ("now", "accept_until", "expected"),
    [
        (datetime(2026, 10, 5, 6, 59, tzinfo=UTC), None, False),  # not open yet
        (datetime(2026, 10, 5, 7, 0, tzinfo=UTC), None, True),  # opens
        (datetime(2026, 10, 8, 6, 59, tzinfo=UTC), None, True),  # last minute
        (datetime(2026, 10, 8, 7, 0, tzinfo=UTC), None, False),  # closes exactly at due_at
        (datetime(2026, 10, 8, 7, 0, tzinfo=UTC), datetime(2026, 10, 10, 7, 0, tzinfo=UTC), True),
        (datetime(2026, 10, 10, 7, 0, tzinfo=UTC), datetime(2026, 10, 10, 7, 0, tzinfo=UTC), False),
    ],
)
def test_is_open_window(now, accept_until, expected):
    opens = datetime(2026, 10, 5, 7, 0, tzinfo=UTC)
    due = datetime(2026, 10, 8, 7, 0, tzinfo=UTC)
    assert deadlines.is_open(now, opens=opens, due_at=due, accept_until=accept_until) is expected


def test_is_open_without_dates_never_closes():
    now = datetime(2030, 1, 1, tzinfo=UTC)
    assert deadlines.is_open(now, opens=None, due_at=None, accept_until=None) is True
    assert (
        deadlines.is_open(
            now, opens=datetime(2026, 1, 1, tzinfo=UTC), due_at=None, accept_until=None
        )
        is True
    )


def test_parse_ts_reads_postgrest_timestamps():
    assert deadlines.parse_ts("2026-10-08T07:00:00+00:00") == datetime(
        2026, 10, 8, 7, 0, tzinfo=UTC
    )
    assert deadlines.parse_ts("2026-10-08T00:00:00-07:00") == datetime(
        2026, 10, 8, 7, 0, tzinfo=UTC
    )
    assert deadlines.parse_ts(None) is None
    assert deadlines.parse_ts("") is None


def test_now_utc_is_timezone_aware():
    assert deadlines.now_utc().tzinfo is UTC
