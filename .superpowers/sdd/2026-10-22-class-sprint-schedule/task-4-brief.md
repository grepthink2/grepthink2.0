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

