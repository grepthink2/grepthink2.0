from datetime import date, timedelta

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
