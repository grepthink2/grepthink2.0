"""Term rules shared by the classes and attendance modules.

A class has a ``term`` (Fall, Winter, Spring, Summer, ...), a ``start_date`` (its first day) and an
``end_date`` (its last day of classes, before finals). The dates decide how many weeks TA meetings
run, up to ``MAX_TERM_WEEKS``. A class with no ``end_date``, or with no ``start_date`` to count
from, keeps the fixed length its term had before classes had end dates. Pure functions: nothing
here reads the database or the clock.
"""

from __future__ import annotations

from datetime import date, timedelta

#: The terms that run a full quarter. Any other term (Summer, or one nobody has named) is short.
FULL_TERM_NAMES = frozenset({"fall", "winter", "spring"})

_FULL_TSR_COUNT = 5
_SUMMER_TSR_COUNT = 3

# TA meetings run across the working term, which is wider than the TSR window: ~10 weeks for a full
# quarter, ~6 for a summer session (e.g. CSE115A, late June to the end of July).
_FULL_TERM_WEEKS = 10
_SUMMER_TERM_WEEKS = 6

#: The most weeks a term can run: a last day of classes falls within the 53rd week from the first
#: day, so a typo in the year can't stretch TA Meetings across years. The API refuses a later
#: day, and the ``classes_end_date_after_start`` CHECK allows the same (``start_date + 370``).
MAX_TERM_WEEKS = 53
_LATEST_LAST_DAY_OFFSET = timedelta(weeks=MAX_TERM_WEEKS) - timedelta(days=1)


def _is_full_term(term: str | None) -> bool:
    return (term or "").strip().lower() in FULL_TERM_NAMES


def _fixed_week_count(term: str | None) -> int:
    """The length of a term for a class with no end date."""
    return _FULL_TERM_WEEKS if _is_full_term(term) else _SUMMER_TERM_WEEKS


def default_tsr_count(term: str | None) -> int:
    """TSR assignments a new class gets by default: 5 for a full quarter, 3 otherwise."""
    return _FULL_TSR_COUNT if _is_full_term(term) else _SUMMER_TSR_COUNT


def term_week_count(term: str | None, start_date: date | None, end_date: date | None) -> int:
    """Weeks TA meetings run: week 1 starts on ``start_date``, the last week holds ``end_date``.

    Without both dates, the fixed length of the term (10 weeks for a full quarter, 6 otherwise).
    Never more than ``MAX_TERM_WEEKS``: the API refuses a later day, so only a row written
    around it is capped.
    """
    if start_date is None or end_date is None:
        return _fixed_week_count(term)
    return min((end_date - start_date).days // 7 + 1, MAX_TERM_WEEKS)


def latest_last_day(start_date: date) -> date:
    """The latest last day of classes for a class that starts on ``start_date``.

    The end of week ``MAX_TERM_WEEKS``: 370 days after the first day, so within a year of the first
    week of term. ``date.max`` when that day would pass the end of the calendar.
    """
    if start_date > date.max - _LATEST_LAST_DAY_OFFSET:
        return date.max
    return start_date + _LATEST_LAST_DAY_OFFSET


def term_last_day(term: str | None, start_date: date | None, end_date: date | None) -> date | None:
    """The last day of classes: ``end_date``, else the last day of the term's fixed length.

    ``None`` when there is neither an end date nor a start date to count from.
    """
    if end_date is not None:
        return end_date
    if start_date is None:
        return None
    return start_date + timedelta(weeks=_fixed_week_count(term)) - timedelta(days=1)
