### Task 2: Schedule arithmetic and the status rule

**Files:**
- Create: `backend/app/scrum/schedule.py`
- Test: `backend/tests/test_scrum_schedule.py`

**Interfaces:**
- Produces (all pure, no I/O):
  - `FREQUENCIES: tuple[str, ...] = ("weekly", "biweekly", "monthly")`
  - `class Schedule(NamedTuple): start_on: date; count: int; frequency: str` with `@classmethod from_class(row: dict) -> Schedule | None` (None when any of `sprints_start_on`, `sprint_count`, `sprint_frequency` is missing; dates arrive as ISO strings from PostgREST).
  - `sprint_windows(start_on: date, count: int, frequency: str) -> list[tuple[date, date]]`
  - `schedule_end(start_on: date, count: int, frequency: str) -> date` (the last window's end)
  - `sprint_status(starts_at: date, ends_at: date, today: date) -> str` returning `"planned" | "active" | "completed"`
  - `schedule_problem(*, start_on: date, count: int, frequency: str, class_start: date | None, class_end: date | None) -> str | None` returning `"SPRINTS_BEFORE_START"`, `"SPRINTS_PAST_END"` or `None`.
  - `SPRINT_NAME = "Sprint {k}"`.

- [ ] **Step 1: Write the failing tests**

```python
from datetime import date
from app.scrum import schedule as S

def test_weekly_windows():
    assert S.sprint_windows(date(2026, 9, 28), 3, "weekly") == [
        (date(2026, 9, 28), date(2026, 10, 4)), (date(2026, 10, 5), date(2026, 10, 11)), (date(2026, 10, 12), date(2026, 10, 18))]

def test_biweekly_windows():
    assert S.sprint_windows(date(2026, 9, 28), 2, "biweekly") == [
        (date(2026, 9, 28), date(2026, 10, 11)), (date(2026, 10, 12), date(2026, 10, 25))]

def test_monthly_windows_clamp_to_short_months():
    assert S.sprint_windows(date(2026, 1, 31), 3, "monthly") == [
        (date(2026, 1, 31), date(2026, 2, 27)), (date(2026, 2, 28), date(2026, 3, 30)), (date(2026, 3, 31), date(2026, 4, 29))]
    assert S.schedule_end(date(2026, 1, 31), 3, "monthly") == date(2026, 4, 29)

def test_windows_never_overlap_or_gap():
    for freq in S.FREQUENCIES:
        w = S.sprint_windows(date(2026, 8, 31), 12, freq)
        assert all(w[i][1] + __import__("datetime").timedelta(days=1) == w[i + 1][0] for i in range(11))

def test_sprint_status_boundaries():
    s, e = date(2026, 10, 15), date(2026, 10, 28)
    assert S.sprint_status(s, e, date(2026, 10, 14)) == "planned"
    assert S.sprint_status(s, e, s) == "active"
    assert S.sprint_status(s, e, e) == "active"
    assert S.sprint_status(s, e, date(2026, 10, 29)) == "completed"

def test_schedule_problem():
    kw = dict(start_on=date(2026, 9, 28), count=5, frequency="biweekly")
    assert S.schedule_problem(**kw, class_start=None, class_end=None) is None
    assert S.schedule_end(date(2026, 9, 28), 5, "biweekly") == date(2026, 12, 6)
    assert S.schedule_problem(**kw, class_start=date(2026, 9, 21), class_end=date(2026, 12, 6)) is None
    assert S.schedule_problem(**kw, class_start=date(2026, 9, 21), class_end=date(2026, 12, 5)) == "SPRINTS_PAST_END"
    assert S.schedule_problem(**kw, class_start=date(2026, 9, 29), class_end=None) == "SPRINTS_BEFORE_START"

def test_from_class():
    assert S.Schedule.from_class({"sprints_start_on": "2026-09-28", "sprint_count": 5, "sprint_frequency": "weekly"}) == S.Schedule(date(2026, 9, 28), 5, "weekly")
    assert S.Schedule.from_class({"sprints_start_on": None, "sprint_count": None, "sprint_frequency": None}) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_schedule.py -v`
Expected: FAIL with `ModuleNotFoundError: app.scrum.schedule`

- [ ] **Step 3: Implement `backend/app/scrum/schedule.py`** with the signatures above. Monthly: the start of sprint *k* is `start_on` moved by *k−1* calendar months keeping `start_on.day`, clamped to that month's last day (`calendar.monthrange`); every window ends the day before the next window's start, and the last window's end is computed from the *count+1*-th start.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_schedule.py -v`
Expected: PASS (7 tests; the biweekly starts are 09-28, 10-12, 10-26, 11-09, 11-23, so Sprint 5 ends 2026-12-06)

- [ ] **Step 5: Commit**

```bash
git add backend/app/scrum/schedule.py backend/tests/test_scrum_schedule.py
git commit -m "feat(scrum): sprint schedule arithmetic and the date-derived status rule"
```

