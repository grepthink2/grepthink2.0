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

