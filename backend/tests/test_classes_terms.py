"""Term rules: default TSR counts, TA-meeting weeks and the last day of classes."""

from datetime import date

import pytest

from app.classes import terms


@pytest.mark.parametrize(
    "term, start, end, weeks",
    [
        ("Fall", date(2026, 9, 24), date(2026, 12, 4), 11),  # UCSC Fall 2026, Thursday start
        ("Fall", date(2026, 9, 21), date(2026, 12, 18), 13),  # İstinye Fall 2026-27
        ("Fall", date(2026, 9, 24), date(2026, 9, 24), 1),  # a one-day term is one week
        ("Fall", date(2026, 9, 24), date(2026, 9, 30), 1),  # six days later: still the first week
        ("Fall", date(2026, 9, 24), date(2026, 10, 1), 2),  # seven days later: the second week
        ("Fall", date(2026, 9, 24), None, 10),  # no end date: legacy rule
        ("fall", None, None, 10),
        ("Spring", None, None, 10),
        ("Summer", date(2026, 6, 22), None, 6),
        ("summer", None, None, 6),
        (None, None, None, 6),
        (None, None, date(2026, 12, 4), 6),  # no start: legacy rule
    ],
)
def test_week_count(term, start, end, weeks):
    assert terms.term_week_count(term, start, end) == weeks


def test_last_day_is_the_end_date_or_the_legacy_span():
    assert terms.term_last_day("Fall", date(2026, 9, 24), date(2026, 12, 4)) == date(2026, 12, 4)
    assert terms.term_last_day("Fall", date(2026, 9, 24), None) == date(2026, 12, 2)
    assert terms.term_last_day("Fall", None, None) is None


def test_tsr_count_by_term():
    counts = [terms.default_tsr_count(t) for t in ("Fall", " winter ", "SPRING", "Summer", None)]
    assert counts == [5, 5, 5, 3, 3]
