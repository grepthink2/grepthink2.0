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

