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

