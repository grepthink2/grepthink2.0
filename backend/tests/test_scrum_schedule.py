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
    # The last sprint ends on Sun Dec 6: any last day of classes from Mon Nov 30 to that Sunday.
    assert S.schedule_end(date(2026, 9, 28), 5, "biweekly") == date(2026, 12, 6)
    for last_day in (date(2026, 12, 6), date(2026, 12, 4), date(2026, 11, 30)):
        assert S.schedule_problem(**kw, class_start=date(2026, 9, 21), class_end=last_day) is None
    assert (
        S.schedule_problem(**kw, class_start=date(2026, 9, 21), class_end=date(2026, 11, 29))
        == "SPRINTS_PAST_END"
    )
    assert (
        S.schedule_problem(**kw, class_start=date(2026, 9, 29), class_end=None)
        == "SPRINTS_BEFORE_START"
    )


def test_latest_sprint_end_is_the_sunday_of_the_week_that_holds_the_last_day():
    # Mon Mar 8 to Sun Mar 14, 2027 is one week (ISO, Monday to Sunday).
    for day in range(8, 15):
        assert S.latest_sprint_end(date(2027, 3, day)) == date(2027, 3, 14)
    assert S.latest_sprint_end(date(2027, 3, 15)) == date(2027, 3, 21)  # a Monday starts the next
    # Across a month and a year: Thu Dec 30, 2027 is in the week that ends Sun Jan 2, 2028.
    assert S.latest_sprint_end(date(2027, 12, 30)) == date(2028, 1, 2)
    # The calendar ends on Fri Dec 31, 9999, before the Sunday of its last week.
    assert S.latest_sprint_end(date(9999, 12, 26)) == date(9999, 12, 26)  # a Sunday
    assert S.latest_sprint_end(date(9999, 12, 27)) == date.max
    assert S.latest_sprint_end(date.max) == date.max


#: A term from Mon Jan 4 to Fri Mar 12, 2027: ten weeks, Monday to Friday.
TEN_WEEKS = {"class_start": date(2027, 1, 4), "class_end": date(2027, 3, 12)}


@pytest.mark.parametrize(
    ("count", "frequency"), [(5, "biweekly"), (10, "weekly")], ids=["5-biweekly", "10-weekly"]
)
def test_a_term_from_monday_to_friday_takes_sprints_that_end_on_its_last_sunday(count, frequency):
    # Both run from Mon Jan 4 to Sun Mar 14, two days after the last day of classes.
    assert S.schedule_end(date(2027, 1, 4), count, frequency) == date(2027, 3, 14)
    kw = {"count": count, "frequency": frequency}
    assert S.schedule_problem(start_on=date(2027, 1, 4), **kw, **TEN_WEEKS) is None
    # From Tue Jan 5 they end on Mon Mar 15, a day past that Sunday.
    assert S.schedule_problem(start_on=date(2027, 1, 5), **kw, **TEN_WEEKS) == "SPRINTS_PAST_END"
    # A last day of classes that is itself a Sunday ends its own week.
    on_sunday = {**TEN_WEEKS, "class_end": date(2027, 3, 14)}
    assert S.schedule_problem(start_on=date(2027, 1, 4), **kw, **on_sunday) is None
    assert S.schedule_problem(start_on=date(2027, 1, 5), **kw, **on_sunday) == "SPRINTS_PAST_END"
    # A week shorter, the term ends the Sunday before the sprints do.
    a_week_earlier = {**TEN_WEEKS, "class_end": date(2027, 3, 7)}
    assert (
        S.schedule_problem(start_on=date(2027, 1, 4), **kw, **a_week_earlier) == "SPRINTS_PAST_END"
    )


def test_a_last_day_at_the_end_of_the_calendar_takes_a_schedule_without_overflowing():
    # One weekly sprint from Fri Dec 24, 9999 ends on Thu Dec 30. The Sunday of the week that holds
    # Wed Dec 29 or Fri Dec 31 would be in the year 10000.
    kw = {"start_on": date(9999, 12, 24), "count": 1, "frequency": "weekly"}
    assert S.schedule_problem(**kw, class_start=None, class_end=date.max) is None
    assert S.schedule_problem(**kw, class_start=None, class_end=date(9999, 12, 29)) is None
    assert (
        S.schedule_problem(**kw, class_start=None, class_end=date(9999, 12, 26))
        == "SPRINTS_PAST_END"
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
