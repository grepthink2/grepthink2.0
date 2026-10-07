"""Date windows, folding (spec D8, 4.1 #16, §9 'windows.py bounds and previous ranges')."""

import datetime as dt

import pytest

from app.analytics import windows
from app.analytics.windows import RangeBounds, WindowError, fold_small_groups, range_bounds

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
    with pytest.raises(WindowError, match=windows.RANGE_TOO_LONG):
        range_bounds(
            "custom", TODAY, custom_from=dt.date(2024, 10, 6), custom_to=dt.date(2026, 10, 7)
        )  # 731 days
    ok = range_bounds(
        "custom", TODAY, custom_from=dt.date(2024, 10, 7), custom_to=dt.date(2026, 10, 7)
    )  # 730 days
    assert ok.days == 731


def test_custom_is_calendar_dates_never_shifted_for_dst():
    # Review Focus 2: the bounds are dates; the SQL turns them into school-zone midnights.
    b = range_bounds(
        "custom", TODAY, custom_from=dt.date(2026, 10, 25), custom_to=dt.date(2026, 11, 1)
    )
    assert (b.start, b.end) == (dt.date(2026, 10, 25), dt.date(2026, 11, 1))


def test_parse_date_accepts_dates_and_timestamps():
    assert windows.parse_date("2026-09-21") == dt.date(2026, 9, 21)
    assert windows.parse_date("2026-09-21T07:00:00+00:00") == dt.date(2026, 9, 21)
    assert windows.parse_date(None) is None
    assert windows.parse_date("") is None


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


ROWS = [
    {"id": "a", "name": "CSE 115A", "students": 41, "teams": 8, "team_messages": 228, "href": "/x"},
    {"id": "b", "name": "CSE 115B", "students": 3, "teams": 1, "team_messages": 10, "href": "/y"},
    {"id": "c", "name": "Pilot", "students": 2, "teams": 1, "team_messages": 5, "href": "/z"},
    {"id": "d", "name": "Seminar", "students": 1, "teams": 1, "team_messages": 7, "href": "/w"},
]


def test_fold_keeps_groups_of_exactly_k_and_sums_the_rest():
    out = fold_small_groups(ROWS, size_key="students", sum_keys=("teams", "team_messages"))
    assert [r["id"] for r in out] == ["a", "b", "folded"]
    assert all(r["kind"] == "row" for r in out[:2])
    folded = out[2]
    assert folded == {
        "id": "folded",
        "name": "Smaller groups (2)",
        "kind": "folded",
        "teams": 2,
        "team_messages": 12,
        "students": 3,
    }
    assert "href" not in folded


def test_fold_is_a_no_op_without_small_groups_and_folds_everything_when_all_are_small():
    big = [dict(r, students=10) for r in ROWS]
    assert [
        r["kind"] for r in fold_small_groups(big, size_key="students", sum_keys=("teams",))
    ] == ["row"] * 4
    tiny = [dict(r, students=1) for r in ROWS]
    out = fold_small_groups(tiny, size_key="students", sum_keys=("teams",))
    assert len(out) == 1 and out[0]["name"] == "Smaller groups (4)"
    assert (
        out[0]["teams"] == 11 and out[0]["students"] == 4
    )  # sums: 8+1+1+1 teams, four students of one


def test_fold_treats_a_missing_size_as_zero():
    out = fold_small_groups([{"id": "n", "name": "No size"}], size_key="members", sum_keys=())
    assert out[0]["kind"] == "folded" and out[0]["members"] == 0
