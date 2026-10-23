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

