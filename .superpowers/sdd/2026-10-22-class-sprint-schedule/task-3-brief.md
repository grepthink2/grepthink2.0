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

