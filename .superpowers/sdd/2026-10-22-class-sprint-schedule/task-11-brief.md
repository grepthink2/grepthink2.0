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

