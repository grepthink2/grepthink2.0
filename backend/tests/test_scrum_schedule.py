from datetime import date, timedelta

import pytest

from app.scrum import schedule as S


def test_weekly_windows():
    assert S.sprint_windows(date(2026, 9, 28), 3, "weekly") == [
        (date(2026, 9, 28), date(2026, 10, 4)),
        (date(2026, 10, 5), date(2026, 10, 11)),
        (date(2026, 10, 12), date(2026, 10, 18)),
    ]


def test_biweekly_windows():
    assert S.sprint_windows(date(2026, 9, 28), 2, "biweekly") == [
        (date(2026, 9, 28), date(2026, 10, 11)),
        (date(2026, 10, 12), date(2026, 10, 25)),
    ]


def test_monthly_windows_clamp_to_short_months():
    assert S.sprint_windows(date(2026, 1, 31), 3, "monthly") == [
        (date(2026, 1, 31), date(2026, 2, 27)),
        (date(2026, 2, 28), date(2026, 3, 30)),
        (date(2026, 3, 31), date(2026, 4, 29)),
    ]
    assert S.schedule_end(date(2026, 1, 31), 3, "monthly") == date(2026, 4, 29)


def test_windows_never_overlap_or_gap():
    for freq in S.FREQUENCIES:
        w = S.sprint_windows(date(2026, 8, 31), 12, freq)
        assert all(w[i][1] + timedelta(days=1) == w[i + 1][0] for i in range(11))


def test_sprint_status_boundaries():
    s, e = date(2026, 10, 15), date(2026, 10, 28)
    assert S.sprint_status(s, e, date(2026, 10, 14)) == "planned"
    assert S.sprint_status(s, e, s) == "active"
    assert S.sprint_status(s, e, e) == "active"
    assert S.sprint_status(s, e, date(2026, 10, 29)) == "completed"


def test_schedule_problem():
    kw = {"start_on": date(2026, 9, 28), "count": 5, "frequency": "biweekly"}
    assert S.schedule_problem(**kw, class_start=None, class_end=None) is None
    assert S.schedule_end(date(2026, 9, 28), 5, "biweekly") == date(2026, 12, 6)
    assert (
        S.schedule_problem(**kw, class_start=date(2026, 9, 21), class_end=date(2026, 12, 6)) is None
    )
    assert (
        S.schedule_problem(**kw, class_start=date(2026, 9, 21), class_end=date(2026, 12, 5))
        == "SPRINTS_PAST_END"
    )
    assert (
        S.schedule_problem(**kw, class_start=date(2026, 9, 29), class_end=None)
        == "SPRINTS_BEFORE_START"
    )


@pytest.mark.parametrize("frequency", S.FREQUENCIES)
@pytest.mark.parametrize("count", [1, 20])
def test_latest_start_on_is_the_last_first_day_whose_schedule_the_calendar_holds(count, frequency):
    latest = S.latest_start_on(count, frequency)
    assert S.sprint_windows(latest, count, frequency)[-1][1] == S.schedule_end(
        latest, count, frequency
    )
    with pytest.raises((OverflowError, ValueError)):
        S.schedule_end(latest + timedelta(days=1), count, frequency)


def test_schedule_problem_refuses_a_first_day_too_late_without_overflowing():
    kw = {"count": 20, "frequency": "monthly"}
    # The latest last day of classes for a term from Mon Sep 21, 2026: the end of week 53.
    term = {"class_start": date(2026, 9, 21), "class_end": None}
    assert S.schedule_problem(start_on=date(2027, 9, 26), **term, **kw) is None
    assert S.schedule_problem(start_on=date(2027, 9, 27), **term, **kw) == "SPRINTS_START_TOO_LATE"
    # Twenty monthly sprints from Dec 25, 9999 would end in 10001: refused, whatever the dates.
    for class_start, class_end in [
        (None, None),
        (None, date(9999, 12, 31)),
        (date(9999, 1, 4), None),
        (date(9999, 1, 4), date(9999, 12, 31)),
    ]:
        assert (
            S.schedule_problem(
                start_on=date(9999, 12, 25), class_start=class_start, class_end=class_end, **kw
            )
            == "SPRINTS_START_TOO_LATE"
        )


def test_from_class():
    assert S.Schedule.from_class(
        {"sprints_start_on": "2026-09-28", "sprint_count": 5, "sprint_frequency": "weekly"}
    ) == S.Schedule(date(2026, 9, 28), 5, "weekly")
    assert (
        S.Schedule.from_class(
            {"sprints_start_on": None, "sprint_count": None, "sprint_frequency": None}
        )
        is None
    )
