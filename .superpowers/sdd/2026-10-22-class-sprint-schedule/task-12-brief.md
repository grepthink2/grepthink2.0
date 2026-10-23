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

