# Class Sprint Schedule and Burnup Units (PR 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every team's sprints come from a schedule on its class, sprint status follows the calendar, and the scrum board's burnup draws in hours or points with a nudge to add points.

**Architecture:** Three new columns on `classes` and a `sequence` on `sprints`; a pure `app/scrum/schedule.py` does the date arithmetic and the status rule; `ensure_project_sprints` in the scrum controller creates or regenerates a team's sprints and is called from project creation and from a new class PATCH; the burnup totals count tasks in both units and the board payload says which unit it drew and which are available. The web client gains the schedule fields in the two class modals, a unit label and toggle on the chart, and a dashed points chip.

**Tech Stack:** Python 3.12 + FastAPI + supabase-py (tests on `FakeSupabase` / `ScrumFake`), React 19 + TypeScript 7 + Vitest, SCSS tokens, hand-maintained `lib/api/*.ts` + the actions catalog.

**Spec:** `docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md` — Part 0, decisions D5, D9, D20, D21, D22, the error table, Part 5 and Part 6 (PR 0). Branch `feat/class-sprint-schedule` off `origin/beta` 50f65d16.

## Global Constraints

- Authorization is Python-only (`service_client` bypasses RLS); every new route gates in the controller.
- Every `.execute()` is a round trip: batch with `.in_()`, bulk inserts and `fan_out`; pin budgets with `FakeSupabase.executes` as the existing scrum tests do.
- Migrations are applied by hand: DEV via the Supabase connector (dev project) with the maintainer's go-ahead before the branch is tested against DEV; PROD immediately before the release merge. Code must work on the live schema at every moment: PR 0's code reads the new columns only after they exist (nullable, no defaults needed).
- Browser roles get nothing: new columns live on tables that already `REVOKE`/hold no grants; no `GRANT`, no policy.
- Fixed `detail` strings, verbatim from the spec's error table: `SPRINTS_PAST_END` 422 `The sprints run past the last day of classes (<date>)`; `SPRINTS_IN_USE` 409 `<Team> already uses Sprint <k>; lower the count after they move their stories or delete that plan`; `END_DATE_BEFORE_SPRINTS` 409 `Sprint <k> ends <date>; change the sprint schedule first`; plus this plan's `SPRINTS_BEFORE_START` 422 `The first sprint starts before the class does` and `UNIT_UNAVAILABLE` 422 `Burnup unit not available for this sprint` (⚑ plan's additions, both named in the PR body).
- Dates are calendar days; "today" is `app.scrum.controller._today_la()` (America/Los_Angeles), patched in tests as `tests/test_scrum_burnup.py` does.
- Sprint names are `Sprint k`; frequency values are exactly `weekly`, `biweekly`, `monthly`; count 1–20.
- Every new route gets a method in `frontend/src/lib/api/<domain>.ts`, a `METHODS` entry in `frontend/src/lib/__tests__/apiFacade.test.ts`, and an action in `frontend/public/.well-known/grepthink-actions.json`.
- Copy verbatim from the spec's copy table (Create Class, Class Settings, empty board, burnup card).
- Gates before the PR: backend `ruff format . && ruff check . && python -m pytest`; frontend `npm run lint && npm run lint:design && npm run build && npx vitest run`.
- Commits: one per task, Conventional-style subject, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A monthly schedule starting on the 31st: later sprints start on the last day of shorter months and end the day before the next start, with no overlap and no gap (Task 2 pins it).
2. A class with no `end_date`: the schedule is accepted, and setting an end date before the last sprint later is refused with `END_DATE_BEFORE_SPRINTS` (Tasks 6 and 8).
3. A team created before its class had a schedule, then the instructor sets one: the team gets all N sprints, and a second PATCH with the same values writes nothing (Tasks 5 and 8).
4. Status at the boundaries in LA time: on `ends_at` the sprint is still active; the next LA day it is completed even when UTC has moved on first (Task 3).
5. A sprint whose tasks all have hours but only some have points: the burnup defaults to hours and reports how many tasks lack points; the picker's progress reports the same unit (Task 4).

---

### Task 1: Migrations

**Files:**
- Create: `backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql`
- Create: `backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql`

**Interfaces:**
- Produces: columns `classes.sprint_count smallint`, `classes.sprint_frequency text`, `classes.sprints_start_on date` with CHECK `classes_sprint_schedule_valid`; `sprints.sequence smallint` with partial unique index `sprints_project_sequence_uq (project_id, sequence) WHERE sequence IS NOT NULL`; `sprint_burnup_days.scope_hours integer NOT NULL DEFAULT 0`, `sprint_burnup_days.completed_hours integer NOT NULL DEFAULT 0`.

- [ ] **Step 1: Write the schedule migration** with the DDL in the spec's Part 0 verbatim, wrapped in `BEGIN; SET LOCAL lock_timeout = '5s'; … COMMIT;` and the repo's banner header (purpose, "EXPAND, idempotent", `Applied: DEV — pending   PROD — pending`, a PREFLIGHT comment: `SELECT count(*) FROM public.sprints WHERE sequence IS NOT NULL;` expected 0).

- [ ] **Step 2: Write the burnup migration**: the two `ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS …` lines from the spec, same header style.

- [ ] **Step 3: Verify the files parse**: `grep -c "ADD COLUMN IF NOT EXISTS" backend/database/migrations/2026-10/2026-10-22_*.sql` prints `6` across the two files (4 + 2). Ask the maintainer to apply both on DEV through the Supabase connector (dev) and record the date in each header; do not wait for it: every test in this plan runs on the fake.

- [ ] **Step 4: Commit**

```bash
git add backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql
git commit -m "feat(db): class sprint schedule, sprint sequence and burnup hours columns"
```

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

### Task 3: Sprint status derived from dates

**Files:**
- Modify: `backend/app/scrum/controller.py` (`_select_sprint`, the `BoardSprintOut` rows near line 984, `create_sprint`, `update_sprint`, `get_summary`)
- Modify: `backend/app/scrum/models.py:47-51` (`UpdateSprintRequest`)
- Modify: `backend/tests/test_scrum_sprints.py`, `backend/tests/test_scrum_board.py`, `backend/tests/test_scrum_summary.py` (fixtures that relied on the stored status)
- Test: `backend/tests/test_scrum_sprint_status.py`

**Interfaces:**
- Consumes: `schedule.sprint_status`.
- Produces: `_with_status(row: dict, today: date) -> dict` (a copy of the sprint row with `status` replaced by the derived value); `_select_sprint(sprints: list[dict], sprint_id: str | None, today: date) -> dict | None`. Every `SprintOut` the API returns carries the derived status; `UpdateSprintRequest` has no `status` field; FastAPI drops unknown JSON fields (Pydantic's default `extra="ignore"`), so an old client's `status` is ignored silently.

- [ ] **Step 1: Write the failing tests** in `tests/test_scrum_sprint_status.py` using `scrum_db` from `tests/scrum_support.py` and `monkeypatch.setattr("app.scrum.controller._today_la", lambda: date(2026, 10, 22))`: seed three sprints A `2026-10-01..2026-10-14` (stored status `planned`), B `2026-10-15..2026-10-28` (`planned`), C `2026-10-29..2026-11-11` (`planned`). Assert `GET /api/projects/{PID}/scrum/board` returns statuses `completed`, `active`, `planned` and `sprint_id == B`; with today `2026-11-20` the board opens on C and C is `completed`; with today `2026-09-01` it opens on A, all `planned`; `PATCH /api/scrum/sprints/{A}` with `{"status": "active"}` answers 200 and the board still reports `completed`; `GET …/scrum/summary` reports the same status as the board.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_sprint_status.py -v`
Expected: FAIL (statuses come back `planned`; the board opens on the last sprint)

- [ ] **Step 3: Implement**: add `_with_status` and apply it where sprint rows become output (board sprints and `sprint`, summary, create/update responses); change `_select_sprint` to: the sprint whose dates contain `today`, else the latest sprint whose `starts_at <= today`, else `sprints[0]`; delete `status` from `UpdateSprintRequest` and from the `allowed` keys in `update_sprint`. Fix the existing tests that seeded `status: "active"` to seed dates around the patched today instead.

- [ ] **Step 4: Run the scrum suite**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_sprint_status.py tests/test_scrum_sprints.py tests/test_scrum_board.py tests/test_scrum_summary.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/scrum backend/tests
git commit -m "feat(scrum): sprint status follows the calendar; the board opens on today's sprint"
```

### Task 4: Burnup in hours or points

**Files:**
- Modify: `backend/app/scrum/burnup.py` (`build_sprint_series`, `build_cumulative_series`)
- Modify: `backend/app/scrum/controller.py` (`_totals` ~644, `_sprint_progress` ~651, `_live_burnup_totals` ~665, `_snapshot_burnup_safe` ~679, `_completed_by_day_from_moves` ~697, `get_board` ~984–1060, `get_summary`)
- Modify: `backend/app/scrum/models.py` (`SprintProgress`, `BurnupOut`, `BoardResponse`)
- Modify: `backend/app/scrum/views.py:59-63` (`get_board` gains `unit: str | None = None`)
- Modify: `backend/tests/scrum_support.py` (seed tasks with `estimate_hours` and `points` as needed), `backend/tests/test_scrum_burnup.py`, `backend/tests/test_scrum_board.py` (payload shape)
- Test: `backend/tests/test_scrum_burnup_units.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class Totals: scope_points: int; completed_points: int; scope_hours: int; completed_hours: int; tasks_total: int; tasks_with_points: int` and `_totals(stories: list[dict], done_tasks: list[dict]) -> Totals` counting tasks only (`t["points"] or 0`, `t["estimate_hours"] or 0`).
  - `units_available(t: Totals) -> list[str]`: `["points", "hours"]` when `tasks_total >= 1 and tasks_with_points == tasks_total`, else `["hours"]`; `default_unit(t) -> str` = `"points"` when available else `"hours"`.
  - `build_sprint_series(*, snapshots, starts_at, ends_at, today, live_scope, live_completed, completed_by_day=None, unit="points")` reading `scope_<unit>` / `completed_<unit>` from each snapshot and skipping a snapshot whose two values for `unit` are both 0 while the other unit's are not (pre-migration rows); `build_cumulative_series(sprints, unit="points")` reading `final["scope_<unit>"]` / `final["completed_<unit>"]`.
  - `_completed_by_day_from_moves(client, task_values: dict[str, int], starts_at, ends_at)` (renamed parameter, same body).
  - `SprintProgress` gains `hours_done: int`, `hours_total: int`; `BurnupOut` gains `unit: Literal["points", "hours"]`, `units_available: list[str]`, `tasks_without_points: int`; `get_board(*, project_id, user_id, sprint_id, unit: str | None)` raises 422 `UNIT_UNAVAILABLE` for a unit not in `units_available` (and 422 for any value outside `{"points", "hours"}`).
  - `_snapshot_burnup_safe` upserts all four value columns.

- [ ] **Step 1: Write the failing tests** in `tests/test_scrum_burnup_units.py` (today patched to `2026-10-22`, one active sprint): seed story S1 with tasks T1 `{estimate_hours: 4, points: 3, status: "done"}`, T2 `{estimate_hours: 6, points: None, status: "todo"}`. Assert the board's `burnup.unit == "hours"`, `units_available == ["hours"]`, `tasks_without_points == 1`, `burnup.sprint.scope[-1] == 10`, `completed[-1] == 4`, and the sprint's `progress.hours_done == 4`, `hours_total == 10`. Set T2 `points: 5`: `unit == "points"`, `units_available == ["points", "hours"]`, `scope[-1] == 8`, `completed[-1] == 3`, `tasks_without_points == 0`; `?unit=hours` switches the series to `10` / `4`; `?unit=speed` and, with T2 `points: None`, `?unit=points` answer 422 with `Burnup unit not available for this sprint`. Add a unit test for `build_sprint_series` with a pre-migration snapshot `{"day": "2026-10-20", "scope_points": 8, "completed_points": 3, "scope_hours": 0, "completed_hours": 0}` and `unit="hours"`: the hours series carries forward 0 until today's live values. Add `_totals` ignores story points: a story with `points: 13` and pointless tasks gives `scope_points == 0`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_burnup_units.py -v`
Expected: FAIL (`unit` missing from the payload; `_totals` returns a tuple)

- [ ] **Step 3: Implement** per the Interfaces block. In `get_board`, compute `Totals` from the live rows already loaded, choose the unit, and pass it to the series builders and `_sprint_progress`; keep the existing points semantics for `points_done`/`points_total` (now task-based). Update `test_scrum_burnup.py` and `test_scrum_board.py` for the new field names and for scope counting tasks (seed task points where a story's points were relied on).

- [ ] **Step 4: Run the scrum suite**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_burnup_units.py tests/test_scrum_burnup.py tests/test_scrum_board.py tests/test_scrum_summary.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/scrum backend/tests
git commit -m "feat(scrum): the burnup counts tasks in hours or points and says which"
```

### Task 5: `ensure_project_sprints`

**Files:**
- Modify: `backend/app/scrum/controller.py` (new section after `update_sprint`)
- Modify: `backend/tests/scrum_support.py` (seed the class row's schedule columns as `None`; tests override)
- Test: `backend/tests/test_scrum_ensure_sprints.py`

**Interfaces:**
- Consumes: `schedule.Schedule`, `schedule.sprint_windows`, `schedule.SPRINT_NAME`.
- Produces: `ensure_project_sprints(client, *, project_id: str, project_name: str, schedule: Schedule) -> dict` returning `{"created": int, "updated": int, "deleted": int}`; raises `HTTPException(409, SPRINTS_IN_USE.format(team=project_name, k=k))` (module constant `SPRINTS_IN_USE = "{team} already uses Sprint {k}; lower the count after they move their stories or delete that plan"`). Reads: the project's sprints (1); when sequences beyond `count` exist, the story count per such sprint via one `.in_()` read on `user_stories` (1). Writes: one bulk insert of missing sequences (`name`, `starts_at`, `ends_at`, `sequence`, `project_id`; `status` left to its default), one update per sequenced sprint whose name or dates differ, one `.in_()` delete of empty extras. Sprints with `sequence NULL` are never touched. Nothing is written when a 409 is raised.

- [ ] **Step 1: Write the failing tests** with `scrum_db` and a `Schedule(date(2026, 9, 28), 3, "biweekly")`: a project with no sprints → `{"created": 3, "updated": 0, "deleted": 0}` and three rows named `Sprint 1..3` with the Task 2 windows; the same call again → all zeros and `executes == 1`; `count=2` → `deleted == 1` when Sprint 3 has no stories; with a story in Sprint 3 → 409 with the exact detail and no `sprints` row removed; `frequency="weekly"` → `updated == 3` with new dates; a pre-existing sprint with `sequence None` survives every call.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_ensure_sprints.py -v`
Expected: FAIL with `AttributeError: ensure_project_sprints`

- [ ] **Step 3: Implement `ensure_project_sprints`** as specified.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scrum_ensure_sprints.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/scrum/controller.py backend/tests
git commit -m "feat(scrum): create or regenerate a team's sprints from its class schedule"
```

### Task 6: Creating a class with a schedule

**Files:**
- Modify: `backend/app/classes/models.py:70-100` (`CreateClassRequest`)
- Modify: `backend/app/classes/controller.py:552-600` (`create_class`), `backend/app/classes/views.py:27-40`
- Modify: `backend/tests/test_classes_create_and_list.py` and every test that posts to `/api/classes` (grep `"/api/classes"` under `backend/tests`): add `"sprint_count": 5, "sprint_frequency": "biweekly"`
- Test: `backend/tests/test_class_sprint_schedule.py` (create cases)

**Interfaces:**
- Produces: `CreateClassRequest.sprint_count: int = Field(..., ge=1, le=20)`, `sprint_frequency: Literal["weekly", "biweekly", "monthly"]`, `sprints_start_on: datetime.date | None = None`; a model validator that, with `start_date`/`end_date`, maps `schedule_problem` to a `ValueError` whose text is the spec detail (`SPRINTS_PAST_END` with the last day in ISO form, `SPRINTS_BEFORE_START`), so the API answers 422. `create_class(..., sprint_count: int, sprint_frequency: str, sprints_start_on: datetime.date | None)` writes the three columns, `sprints_start_on` defaulting to `start_date`. The class row the API returns carries all three.

- [ ] **Step 1: Write the failing tests**: `POST /api/classes` without `sprint_count` → 422; with `{"start_date": "2026-09-21", "end_date": "2026-12-04", "sprint_count": 5, "sprint_frequency": "biweekly"}` → 201 and the stored row has `sprints_start_on == "2026-09-21"`; with `end_date: "2026-11-01"` → 422 whose detail contains `The sprints run past the last day of classes (2026-11-01)`; with `sprints_start_on: "2026-09-14"` → 422 `The first sprint starts before the class does`; with no `end_date` → 201.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_sprint_schedule.py -v`
Expected: FAIL (201 without the fields; no columns stored)

- [ ] **Step 3: Implement** the model fields and validator, thread the values through the view into `create_class`, and fix the existing create-class tests' bodies.

- [ ] **Step 4: Run the classes suite**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_sprint_schedule.py tests/test_classes_create_and_list.py tests/test_classes_end_date.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/classes backend/tests
git commit -m "feat(classes): a class is created with its sprint schedule"
```

### Task 7: New teams get their sprints

**Files:**
- Modify: `backend/app/projects/controller.py:122-260` (`create_project`)
- Modify: `backend/tests/test_projects_batching.py` (budget pin), `backend/tests/test_projects_membership.py` fixtures if they build classes
- Test: `backend/tests/test_class_sprint_schedule.py` (project-creation cases)

**Interfaces:**
- Consumes: `scrum.controller.ensure_project_sprints`, `schedule.Schedule.from_class`.
- Produces: `create_project` already reads the class in its `fan_out` (`client.table("classes").select("id, created_by")`, ~line 158): extend that select with `sprint_count, sprint_frequency, sprints_start_on`, and after the member insert call `ensure_project_sprints(client, project_id=…, project_name=name, schedule=Schedule.from_class(row))` when the schedule is not `None`. Its failure must not lose the project: wrap in `try/except HTTPException` → log at WARNING and continue (the instructor's PATCH can repair). Budget: the existing pin plus 2 (the sprints read inside `ensure_project_sprints` and its bulk insert).

- [ ] **Step 1: Write the failing tests**: creating a project in a class seeded with `sprint_count 3, biweekly, sprints_start_on 2026-09-28` leaves three `sprints` rows for the new project with sequences 1–3; in a class with NULL schedule columns, none; the batching test's expected count moves by the number of new round trips.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_sprint_schedule.py -k project -v`
Expected: FAIL (no sprint rows)

- [ ] **Step 3: Implement** the hook; update the budget pin with the measured count.

- [ ] **Step 4: Run the projects and schedule suites**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_sprint_schedule.py tests/test_projects_batching.py tests/test_projects_membership.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/projects/controller.py backend/tests
git commit -m "feat(projects): a new team gets its class's sprints"
```

### Task 8: `PATCH /api/classes/{id}/sprints` and the last-day guard

**Files:**
- Modify: `backend/app/classes/models.py` (new `UpdateClassSprintsRequest`), `backend/app/classes/controller.py` (new `update_class_sprints`; `update_class_end_date` ~872), `backend/app/classes/views.py`, `backend/app/classes/url.py:16` (add `router.patch("/{class_id}/sprints")(views.update_class_sprints)`)
- Test: `backend/tests/test_class_sprint_schedule.py` (PATCH cases), `backend/tests/test_classes_end_date.py` (one new case)

**Interfaces:**
- Produces: `UpdateClassSprintsRequest(sprint_count: int ge 1 le 20, sprint_frequency: Literal[...], sprints_start_on: datetime.date)`; `update_class_sprints(class_id: UUID, instructor_id: str, data: UpdateClassSprintsRequest) -> dict` returning `{"class": <row>, "teams": n, "created": n, "updated": n, "deleted": n}`; the view answers `{"message": "Sprint schedule updated", **result}`. Rules: class instructor only (404 missing, 403 others, as `update_class_end_date`); `schedule_problem` against the class's `start_date`/`end_date` → 422 with the spec details. Then, before any write, the conflict check across teams: read the class's project ids and names (one read), the sprints of those projects with `sequence > sprint_count` (one `.in_()` read), and the stories of those sprints (one `.in_()` read, `id, sprint_id`); the first team with a story in such a sprint raises 409 `SPRINTS_IN_USE` with its name and the lowest such `k`, and nothing is written. Only then write the class row and `fan_out` `ensure_project_sprints` over every project (its own check cannot fire now). The response sums the teams' counts. `update_class_end_date`: after its attendance check, when the class has a schedule and `schedule_end(...) > end_date`, raise 409 `END_DATE_BEFORE_SPRINTS` with `k = sprint_count` and the end date in ISO form.

- [ ] **Step 1: Write the failing tests**: a student → 403; the instructor with `{"sprint_count": 4, "sprint_frequency": "weekly", "sprints_start_on": "2026-09-28"}` on a class with two teams → 200, `teams == 2`, each team has 4 sequenced sprints, the class row updated; `sprints_start_on` before `start_date` → 422; past `end_date` → 422; one team with a story in Sprint 5 and a request with `sprint_count 4` → 409 with that team's name in the detail, the class row unchanged and the other team's sprints untouched (`executes` stops at the three reads); `PATCH …/end-date` to a day before Sprint 4's end → 409 `Sprint 4 ends 2026-10-25; change the sprint schedule first`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_sprint_schedule.py -k "patch or end_date" tests/test_classes_end_date.py -v`
Expected: FAIL with 404/405 for the new route; the end-date case answers 200

- [ ] **Step 3: Implement** the model, controller, view and route.

- [ ] **Step 4: Run the classes suite and the drift check**

Run: `cd backend && .venv/bin/python -m pytest tests/test_class_sprint_schedule.py tests/test_classes_end_date.py tests/test_classes_authz.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/classes backend/tests
git commit -m "feat(classes): instructors set the sprint schedule and every team's sprints follow"
```

### Task 9: Web API client, types and the actions catalog

**Files:**
- Modify: `frontend/src/lib/api/types.ts` (`ApiClass` ~20, `ApiScrumBoard` ~931 and its burnup/progress types, the update-sprint body type), `frontend/src/lib/api/classes.ts:18` (`createClass` data; new `updateClassSprints`), `frontend/src/lib/api/scrum.ts:26` (`getScrumBoard(projectId, sprintId?, unit?)`)
- Modify: `frontend/public/.well-known/grepthink-actions.json` (`create_class` params; new `update_class_sprints`; `get_scrum_board` gains `unit`; `update_sprint` loses `status`)
- Modify: `frontend/src/lib/__tests__/apiFacade.test.ts` (METHODS), `frontend/src/lib/api/__tests__/classes.test.ts`, `frontend/src/lib/api/__tests__/scrum.test.ts`, `frontend/src/lib/__tests__/responseShapes.test.ts`

**Interfaces:**
- Produces: `ApiSprintFrequency = 'weekly' | 'biweekly' | 'monthly'`; `ApiClass` gains `sprint_count: number | null; sprint_frequency: ApiSprintFrequency | null; sprints_start_on: string | null`; `api.createClass` data gains `sprint_count: number; sprint_frequency: ApiSprintFrequency; sprints_start_on?: string`; `api.updateClassSprints(classId: string, body: { sprint_count: number; sprint_frequency: ApiSprintFrequency; sprints_start_on: string }) => Promise<{ message: string; class: ApiClass; teams: number; created: number; updated: number; deleted: number }>`; `ApiScrumBurnupUnit = 'points' | 'hours'`; `ApiScrumBurnup` becomes `{ unit: ApiScrumBurnupUnit; units_available: ApiScrumBurnupUnit[]; tasks_without_points: number; sprint: ApiBurnupSeries | null; cumulative: ApiBurnupSeries }`; sprint progress gains `hours_done: number; hours_total: number`; `api.getScrumBoard(projectId: string, sprintId?: string, unit?: ApiScrumBurnupUnit)` appends `unit` to the query.

- [ ] **Step 1: Write the failing tests**: `classes.test.ts` asserts `updateClassSprints` issues `PATCH /api/classes/c1/sprints` with the JSON body; `scrum.test.ts` asserts `getScrumBoard('p1', 's1', 'hours')` requests `/api/projects/p1/scrum/board?sprint_id=s1&unit=hours`; `apiFacade.test.ts` METHODS includes `updateClassSprints`; `responseShapes` fixture for the board carries the new burnup fields.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib`
Expected: FAIL (`updateClassSprints is not a function`; query string mismatch)

- [ ] **Step 3: Implement** the types, methods and catalog entries (the catalog's `update_class_sprints` role `instructor`, method `PATCH`, endpoint `/api/classes/{class_id}/sprints`, params `{"sprint_count": "int!", "sprint_frequency": "enum(weekly|biweekly|monthly)!", "sprints_start_on": "date!"}`).

- [ ] **Step 4: Run the tests and the type check**

Run: `cd frontend && npx vitest run src/lib && npm run build`
Expected: PASS; build clean

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib frontend/public/.well-known/grepthink-actions.json
git commit -m "feat(api): class sprint schedule and burnup unit in the web client and the catalog"
```

### Task 10: Create Class asks for the schedule

**Files:**
- Create: `frontend/src/features/app/utils/sprintSchedule.ts`
- Test: `frontend/src/features/app/utils/__tests__/sprintSchedule.test.ts`
- Modify: `frontend/src/features/app/components/Classes/CreateClassModal.tsx` (~163, the submit body) and its SCSS
- Modify: `frontend/src/features/app/components/Classes/__tests__/CreateClassModal.test.tsx`

**Interfaces:**
- Produces: `sprintWindows(startOn: string, count: number, frequency: ApiSprintFrequency): { startsAt: string; endsAt: string }[]` and `scheduleEnd(startOn, count, frequency): string` (ISO dates, same arithmetic as Task 2, with `date-fns` `addDays`, `addMonths`, `lastDayOfMonth`); the modal's new state `sprintCount` (default 5), `sprintFrequency` (default `'biweekly'`), `sprintsStartOn` (default = the term start, follows it until edited). The preview line under the fields: `Sprint {count} ends {MMM d}` or, when `scheduleEnd > termEndDate`, the warning `Sprint {count} would end after the last day of classes` and the submit button disabled. The last day of classes becomes required in this form.

- [ ] **Step 1: Write the failing tests**: `sprintSchedule.test.ts` pins the Task 2 values (`sprintWindows('2026-01-31', 3, 'monthly')` ends `['2026-02-27', '2026-03-30', '2026-04-29']`); the modal test renders, fills a term start `2026-09-21`, end `2026-12-04`, count 5, biweekly, and asserts the preview reads `Sprint 5 ends Nov 29` (five biweekly sprints from Sep 21), then sets end `2026-11-01` and asserts the warning and a disabled submit; a submit with valid values posts `sprint_count: 5, sprint_frequency: 'biweekly', sprints_start_on: '2026-09-21'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/app/utils src/features/app/components/Classes/__tests__/CreateClassModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement** the util and the fields with the shared kit (`Input type=number`, `Select`, `DatePickerField`), copy from the spec's table (`Sprints · How many · Every: week / two weeks / month · First sprint starts`).

- [ ] **Step 4: Run the tests, lint and build**

Run: `cd frontend && npx vitest run src/features/app && npm run lint && npm run lint:design && npm run build`
Expected: PASS, no findings

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/app
git commit -m "feat(classes): the Create Class form asks for the sprint schedule"
```

### Task 11: Class Settings edits the schedule

**Files:**
- Modify: `frontend/src/features/app/components/Classes/ClassSettingsModal.tsx` (a "Sprints" section after the last-day section, ~300–320) and its SCSS
- Modify: `frontend/src/features/app/components/Classes/__tests__/ClassSettingsModal.test.tsx`

**Interfaces:**
- Consumes: `api.updateClassSprints`, `sprintSchedule.scheduleEnd`.
- Produces: the section shows the saved values (or "Set up sprints" when `sprint_count` is null), the three fields, the preview `Sprint {count} ends {MMM d}` (also rendered beside the last-day field), the button `Save and update every team's sprints`, inline success `Sprints updated for {teams} teams` and the API's `detail` on 409/422; the class in context is refreshed from the response's `class`.

- [ ] **Step 1: Write the failing tests**: a class with no schedule shows `Set up sprints`; saving `4, weekly, 2026-09-28` calls `updateClassSprints('c1', {...})` and shows `Sprints updated for 2 teams` from a mocked response; a mocked 409 shows its detail verbatim.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/app/components/Classes/__tests__/ClassSettingsModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement** the section following the last-day section's save-state pattern (`isSavingEndDate` / `endDateSaveError` at ~43–60 and ~194).

- [ ] **Step 4: Run the tests, lint and build**

Run: `cd frontend && npx vitest run src/features/app/components/Classes && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/app/components/Classes
git commit -m "feat(classes): instructors edit the sprint schedule in Class Settings"
```

### Task 12: The board shows the unit and nudges for points

**Files:**
- Modify: `frontend/src/features/scrum/components/BurnupChart.tsx` (prop `unit`), `frontend/src/features/scrum/pages/ScrumBoardPage.tsx` (~423–440 the burnup view; the empty-state copy), `frontend/src/features/scrum/hooks/useScrumBoard.ts:91` (a `unit` state passed to `getScrumBoard`, `setBurnupUnit(unit)` reloads), `frontend/src/features/scrum/components/Chips.tsx:8` (`PointsChip` gains `missing?: boolean`), `frontend/src/features/scrum/components/TaskCard.tsx:44`, `frontend/src/features/scrum/components/TaskEditorModal.tsx` (points field hint), `frontend/src/features/scrum/components/SprintPicker.tsx` (progress text in the board's unit), `frontend/src/features/scrum/scrum.scss` / chip SCSS
- Modify: `frontend/src/features/scrum/__tests__/fixtures.ts` (burnup fields), `ScrumBoard.test.tsx`, `scrumComponents.test.tsx`, `sprintPicker.test.tsx`, `taskEditor.test.tsx`
- Modify (if present, git-excluded): `frontend/scrum-mock/` in-memory board gains `unit`, `units_available`, `tasks_without_points`, `hours_done/total`

**Interfaces:**
- Consumes: `ApiScrumBurnup`, `api.getScrumBoard(..., unit)`.
- Produces: `BurnupChart` prop `unit: 'points' | 'hours'` → axis label `hours` / `points`; above the chart, when `units_available.length === 2`, a `SegmentedControl` `Points | Hours` bound to `setBurnupUnit`; when `unit === 'hours'`, the line `Burnup in hours · Add points to tasks for a points burnup ({n} tasks without points)` (omit the parenthesis when `n === 0`); `PointsChip missing` renders `– pts` with the muted dashed border and `aria-label="No points yet"`; `TaskCard` renders it when `task.points == null`; the task editor's points field hint `Used by the burnup`; `SprintPicker` rows show `12/20 h` when the board's unit is hours; the empty board reads the spec's copy by `board.access` (`member` → the student line, `staff` → the instructor line).

- [ ] **Step 1: Write the failing tests**: `scrumComponents.test.tsx` — `PointsChip missing` has text `– pts` and the aria-label; `TaskCard` with `points: null` shows it; `ScrumBoard.test.tsx` — with `unit: 'hours', tasks_without_points: 7` the burnup view shows the nudge line, with `units_available: ['points','hours']` the toggle appears and clicking `Hours` calls `getScrumBoard` with `'hours'`; the empty board shows the member and staff copy; `sprintPicker.test.tsx` — hours progress text.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/scrum`
Expected: FAIL

- [ ] **Step 3: Implement** with the design tokens only (no hex; `lint:design` enforces it); the chip's dashed border uses the muted border token.

- [ ] **Step 4: Run the tests, lint, design lint and build**

Run: `cd frontend && npx vitest run src/features/scrum && npm run lint && npm run lint:design && npm run build`
Expected: PASS, no findings

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/scrum
git commit -m "feat(scrum): the burnup names its unit, offers a toggle and nudges for points"
```

### Task 13: Docs, schema mirror and the PR

**Files:**
- Modify: `AGENTS.md` (Gotchas: "Sprints come from the class" — `classes.sprint_*`, `sprints.sequence`, `ensure_project_sprints`, no New sprint in the client; "Sprint status is derived from dates"; "The burnup counts tasks in hours or points")
- Modify: `supabase/schema.sql` (append the two migrations' DDL to the hand-maintained block, as the task-dependencies change did, once DEV has them)
- Modify: `backend/README.md` only if the drift check's instructions mention routes by count

- [ ] **Step 1: Write the AGENTS.md lines** (three bullets, two sentences each) and mirror the DDL in `supabase/schema.sql`.

- [ ] **Step 2: Run every gate**

Run: `cd backend && .venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/python -m pytest` then `cd frontend && npm run lint && npm run lint:design && npm run build && npx vitest run`
Expected: all green; note the totals for the PR body.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md supabase/schema.sql
git commit -m "docs: sprints come from the class; schema records the schedule and burnup columns"
```

- [ ] **Step 4: Open the PR onto `beta`** (push with the maintainer's word, per the repo's flow) with a body that carries: the two migrations and their PROD apply order (both before the release merge, expand-only), the "existing classes need a schedule in Class Settings" note, the two plan-added error details, the `update_class_sprints` partial-regeneration note from Task 8, and the gate totals.

---

## Self-review notes

- Spec coverage: Part 0's three sections map to Tasks 1–8 (backend) and 9–12 (web); D5's cron file belongs to PR A (documents) and is not here; D9's `HOURS_REQUIRED` is PR A's finalize rule.
- Names used across tasks: `Schedule`, `sprint_windows`, `schedule_end`, `sprint_status`, `schedule_problem`, `ensure_project_sprints`, `Totals`, `units_available`, `default_unit`, `UNIT_UNAVAILABLE`, `updateClassSprints`, `sprintWindows`, `scheduleEnd`, `setBurnupUnit`, `PointsChip missing` — each defined once above where it is produced.
- Review Focus lines 1–5 are pinned in Tasks 2, 6/8, 5/8, 3 and 4.
