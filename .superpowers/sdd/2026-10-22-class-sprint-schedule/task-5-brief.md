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

