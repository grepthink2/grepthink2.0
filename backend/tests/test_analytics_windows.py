"""Date windows (spec D8, §9 'windows.py bounds and previous ranges')."""

import datetime as dt

import pytest

from app.analytics import windows
from app.analytics.windows import RangeBounds, WindowError, range_bounds

TODAY = dt.date(2026, 10, 7)


def test_7d_ends_today_and_the_previous_week_ends_the_day_before():
    b = range_bounds("7d", TODAY)
    assert b == RangeBounds(
        "7d", dt.date(2026, 10, 1), TODAY, dt.date(2026, 9, 24), dt.date(2026, 9, 30)
    )
    assert b.days == 7


def test_30d_and_90d_cross_month_boundaries():
    assert range_bounds("30d", TODAY) == RangeBounds(
        "30d", dt.date(2026, 9, 8), TODAY, dt.date(2026, 8, 9), dt.date(2026, 9, 7)
    )
    assert range_bounds("90d", TODAY) == RangeBounds(
        "90d", dt.date(2026, 7, 10), TODAY, dt.date(2026, 4, 11), dt.date(2026, 7, 9)
    )


def test_class_window_runs_from_the_class_start():
    b = range_bounds("class", TODAY, class_start=dt.date(2026, 9, 21))
    assert (b.start, b.end, b.days) == (dt.date(2026, 9, 21), TODAY, 17)
    assert (b.prev_start, b.prev_end) == (dt.date(2026, 9, 4), dt.date(2026, 9, 20))


def test_class_window_needs_a_class_and_never_starts_in_the_future():
    with pytest.raises(WindowError, match=windows.CLASS_NEEDS_CLASS_ID):
        range_bounds("class", TODAY)
    b = range_bounds("class", TODAY, class_start=dt.date(2026, 12, 1))
    assert (b.start, b.end) == (TODAY, TODAY)


def test_all_has_no_previous_range():
    b = range_bounds("all", TODAY, all_from=dt.date(2026, 1, 15))
    assert (b.start, b.end, b.prev_start, b.prev_end) == (dt.date(2026, 1, 15), TODAY, None, None)
    assert range_bounds("all", TODAY).start == TODAY  # a school with no classes yet


def test_custom_range_rules():
    b = range_bounds(
        "custom", TODAY, custom_from=dt.date(2025, 12, 25), custom_to=dt.date(2026, 1, 5)
    )
    assert (b.prev_start, b.prev_end) == (
        dt.date(2025, 12, 13),
        dt.date(2025, 12, 24),
    )  # 12 days, across the year
    with pytest.raises(WindowError, match=windows.CUSTOM_NEEDS_DATES):
        range_bounds("custom", TODAY, custom_from=dt.date(2026, 1, 1))
    with pytest.raises(WindowError, match=windows.TO_BEFORE_FROM):
        range_bounds(
            "custom", TODAY, custom_from=dt.date(2026, 1, 2), custom_to=dt.date(2026, 1, 1)
        )


def test_custom_cap_is_two_calendar_years_not_a_day_count():
    # an exact two-year pick across Feb 29 2028 is 731 days apart and still allowed
    ok = range_bounds(
        "custom", TODAY, custom_from=dt.date(2027, 3, 1), custom_to=dt.date(2029, 3, 1)
    )
    assert ok.days == 732
    with pytest.raises(WindowError, match=windows.RANGE_TOO_LONG):
        range_bounds(
            "custom", TODAY, custom_from=dt.date(2027, 3, 1), custom_to=dt.date(2029, 3, 2)
        )
    # a range starting on Feb 29 may end on Feb 28 two years on, and no later
    assert (
        range_bounds(
            "custom", TODAY, custom_from=dt.date(2024, 2, 29), custom_to=dt.date(2026, 2, 28)
        ).days
        == 731
    )
    with pytest.raises(WindowError, match=windows.RANGE_TOO_LONG):
        range_bounds(
            "custom", TODAY, custom_from=dt.date(2024, 2, 29), custom_to=dt.date(2026, 3, 1)
        )


def test_years_after_keeps_the_calendar_date_and_clamps_feb_29():
    assert windows.years_after(dt.date(2026, 10, 7), 2) == dt.date(2028, 10, 7)
    assert windows.years_after(dt.date(2024, 2, 29), 2) == dt.date(2026, 2, 28)
    assert windows.years_after(dt.date(2024, 2, 29), 4) == dt.date(2028, 2, 29)


def test_custom_is_calendar_dates_never_shifted_for_dst():
    # Review Focus 2: the bounds are dates; the SQL turns them into school-zone midnights.
    b = range_bounds(
        "custom", TODAY, custom_from=dt.date(2026, 10, 25), custom_to=dt.date(2026, 11, 1)
    )
    assert (b.start, b.end) == (dt.date(2026, 10, 25), dt.date(2026, 11, 1))


def test_parse_date_reads_a_date_column_and_refuses_timestamps():
    assert windows.parse_date("2026-09-21") == dt.date(2026, 9, 21)
    assert windows.parse_date(None) is None
    assert windows.parse_date("") is None
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        windows.parse_date("2026-09-21T07:00:00+00:00")  # its date part would be the UTC date


def test_local_date_takes_the_calendar_date_in_the_school_zone():
    # 2026-09-22 03:30Z is still the evening of the 21st in Santa Cruz, already the 22nd in Istanbul
    assert windows.local_date("2026-09-22T03:30:00+00:00", "America/Los_Angeles") == dt.date(
        2026, 9, 21
    )
    assert windows.local_date("2026-09-22T03:30:00+00:00", "Europe/Istanbul") == dt.date(
        2026, 9, 22
    )
    assert windows.local_date("2026-09-22", "America/Los_Angeles") == dt.date(
        2026, 9, 22
    )  # a bare date is kept
    assert windows.local_date(None, "America/Los_Angeles") is None


def test_local_date_follows_daylight_saving_and_reads_a_naive_timestamp_as_utc():
    # Los Angeles leaves daylight time on 2026-11-01 at 09:00Z: 07:30Z on the 2nd is 23:30 on the 1st (PST),
    # while 06:30Z on the 1st is still 23:30 on Oct 31 (PDT)
    assert windows.local_date("2026-11-02T07:30:00Z", "America/Los_Angeles") == dt.date(2026, 11, 1)
    assert windows.local_date("2026-11-01T06:30:00+00:00", "America/Los_Angeles") == dt.date(
        2026, 10, 31
    )
    assert windows.local_date("2026-09-22T03:30:00", "America/Los_Angeles") == dt.date(
        2026, 9, 21
    )  # no offset → UTC
