"""The schedule's calendar arithmetic: ranges, deadlines, weekly occurrences, sprint edges.

Pure functions, so no database. Every zone is a fixed offset (``Etc/GMT+8`` is UTC-8 all year).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.schedule import controller as schedule

ZONE = ZoneInfo("Etc/GMT+8")
LO = datetime(2026, 11, 9, 8, tzinfo=UTC)  # Monday, Nov 9, midnight at UTC-8
HI = LO + timedelta(days=7)
CLASS = {"term": "fall", "start_date": "2026-09-28", "end_date": "2026-12-04"}


def at(hours: float) -> datetime:
    return LO + timedelta(hours=hours)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (at(1), at(2), True),
        (at(-1), at(0), False),  # ends as the range starts
        (at(-1), at(0.5), True),  # runs into the range
        (HI, HI + timedelta(hours=1), False),  # starts as the range ends
        (HI - timedelta(minutes=1), HI + timedelta(hours=1), True),
        (at(0), None, True),  # a point at the range's first instant
        (HI, None, False),  # a point at its end
        (at(0), at(0), True),  # an end at its start is a point
    ],
)
def test_an_item_overlaps_the_half_open_range(start, end, expected):
    assert schedule.overlaps(start, end, LO, HI) is expected


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 11, 8), False),  # its last instant is just before LO
        (date(2026, 11, 9), True),
        (date(2026, 11, 15), True),
        (date(2026, 11, 16), False),  # starts at HI
    ],
)
def test_a_day_touches_the_range_in_the_schools_zone(day, expected):
    assert schedule.day_touches(day, ZONE, LO, HI) is expected


def test_a_deadline_lists_in_the_last_minute_of_its_closing_day():
    due_at = datetime(2026, 11, 14, 8, tzinfo=UTC)  # the first moment of Saturday at UTC-8
    assert schedule.deadline_instant(due_at) == datetime(2026, 11, 14, 7, 59, tzinfo=UTC)
    assert schedule.deadline_instant(due_at).astimezone(ZONE).date() == date(2026, 11, 13)


@pytest.mark.parametrize(
    ("class_row", "created_at", "expected"),
    [
        # Created before term: from the first day through the last day of classes.
        (CLASS, "2026-09-20T18:00:00+00:00", (date(2026, 9, 28), date(2026, 12, 4))),
        # Created in week 4, late on Monday at the school (Tuesday in UTC).
        (CLASS, "2026-10-20T06:00:00+00:00", (date(2026, 10, 19), date(2026, 12, 4))),
        # No end date: the term's fixed ten weeks.
        ({**CLASS, "end_date": None}, None, (date(2026, 9, 28), date(2026, 12, 6))),
        # No start date: no term weeks, no meetings.
        ({**CLASS, "start_date": None}, None, None),
        # Created after the last day of classes.
        (CLASS, "2026-12-10T18:00:00+00:00", None),
    ],
)
def test_a_weekly_slot_meets_from_the_later_of_term_start_and_its_creation(
    class_row, created_at, expected
):
    assert schedule.occurrence_bounds(class_row, created_at, ZONE) == expected


def _occurrences(**overrides):
    args = {
        "day_of_week": "tuesday",
        "start_time": "15:00:00",
        "length_minutes": 45,
        "first_day": date(2026, 9, 28),
        "last_day": date(2026, 12, 4),
        "zone": ZONE,
        "lo": LO,
        "hi": HI,
    }
    return schedule.weekly_occurrences(**{**args, **overrides})


def test_a_weekly_slot_meets_on_its_day_at_its_wall_clock_time():
    assert _occurrences() == [
        (
            date(2026, 11, 10),
            datetime(2026, 11, 10, 23, tzinfo=UTC),
            datetime(2026, 11, 10, 23, 45, tzinfo=UTC),
        )
    ]


def test_a_weekly_slot_over_two_weeks_meets_twice():
    days = [day for day, *_ in _occurrences(hi=LO + timedelta(days=14))]
    assert days == [date(2026, 11, 10), date(2026, 11, 17)]


@pytest.mark.parametrize(
    "overrides",
    [
        {"day_of_week": None},
        {"start_time": None},
        {"day_of_week": "someday"},
        {"last_day": date(2026, 11, 9)},  # term over before Tuesday
        {"first_day": date(2026, 11, 11)},  # slot created after Tuesday
    ],
)
def test_a_slot_with_no_time_or_outside_its_bounds_has_no_meetings(overrides):
    assert _occurrences(**overrides) == []


def test_a_meeting_that_started_the_day_before_the_range_still_counts():
    # Sunday 11:30 PM for 45 minutes runs into Monday's first instant.
    got = _occurrences(day_of_week="Sunday", start_time="23:30:00")
    assert [day for day, *_ in got] == [date(2026, 11, 8), date(2026, 11, 15)]


def test_staff_see_the_class_sprint_schedule_as_named_edges():
    row = {"sprints_start_on": "2026-09-28", "sprint_count": 2, "sprint_frequency": "biweekly"}
    assert schedule.class_sprint_edges(row) == [
        ("Sprint 1", "start", date(2026, 9, 28)),
        ("Sprint 1", "end", date(2026, 10, 11)),
        ("Sprint 2", "start", date(2026, 10, 12)),
        ("Sprint 2", "end", date(2026, 10, 25)),
    ]


@pytest.mark.parametrize(
    "row",
    [
        {},
        {"sprints_start_on": "2026-09-28", "sprint_count": 2, "sprint_frequency": "hourly"},
    ],
)
def test_a_class_with_no_readable_sprint_schedule_has_no_edges(row):
    assert schedule.class_sprint_edges(row) == []
