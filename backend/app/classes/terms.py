"""Term rules shared by the classes and attendance modules.

A class has a ``term`` (Fall, Winter, Spring, Summer, ...), a ``start_date`` (its first day) and an
``end_date`` (its last day of classes, before finals). The dates decide how many weeks TA meetings
run. A class with no ``end_date``, or with no ``start_date`` to count from, keeps the fixed length
its term had before classes had end dates. Pure functions: nothing here reads the database or the
clock.
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
    """
    if start_date is None or end_date is None:
        return _fixed_week_count(term)
    return (end_date - start_date).days // 7 + 1


def term_last_day(term: str | None, start_date: date | None, end_date: date | None) -> date | None:
    """The last day of classes: ``end_date``, else the last day of the term's fixed length.

    ``None`` when there is neither an end date nor a start date to count from.
    """
    if end_date is not None:
        return end_date
    if start_date is None:
        return None
    return start_date + timedelta(weeks=_fixed_week_count(term)) - timedelta(days=1)
