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

