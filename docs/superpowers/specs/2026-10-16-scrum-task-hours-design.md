# Scrum Board Task Estimates in Hours — Design Spec

**Date:** 2026-10-16
**Branch:** `feat/scrum-task-hours`, stacked on `feat/scrum-sprint-picker` (head `039a6c63`; batches 1 and 2 are
not yet merged). Code references below are to that head.
**Status:** Approved in conversation (maintainer, 2026-10-16); implementation-ready.

## The ask (maintainer, 2026-10-15, Board note 4)

"Standardize time estimate in a task since it's currently free text? This would help later for
notifications."

Decisions given on 2026-10-16:

- **Hours only, whole hours, 1 to 15.** "Let it be hours for now, no days, just keep the validation on
  hours (cap at 15h since UCSC's guideline is that these courses consume 15 hrs per week of a student's
  time)."
- **A story's time is the sum of its tasks' hours; the story's own estimate goes away.**
- **Existing data:** "wipe all estimates that are not in '1h' formats." Only a value already written as a
  whole number of hours followed by `h` ("4h", "10h") converts, and only when it is within 1–15; everything
  else ("1d", "4hrs", "1", "2d", "98325789", "1.5h", "20h") is dropped.

## Decisions (mine, flagged)

- **D1. A new column, not a retyped one.** `tasks.estimate_hours smallint` (CHECK 1–15) is added beside the
  legacy `tasks.time_estimate text`; the code reads and writes only the new column. The legacy columns on
  `tasks` and `user_stories` are dropped by a separate contract migration that runs only after this code
  is live (expand/contract, as the final-reviews work did). Reason: the code must work on the schema that is
  live at every moment of the rollout, and a column swap in one step would break whichever side deploys
  second.
- **D2. The story's hours are computed, never stored — twice.** `get_board` sums each story's task hours
  into `StoryOut.estimate_hours` (`null` when no task has one) for API and agent readers. The web client
  does not read that field: it computes the same sum itself from `story.tasks` (`storyHours`, below),
  because task and story edits are optimistic and never refetch the board — `patchTask` and `patchStory`
  (`hooks/useScrumBoard.ts:187-240`, reached from `ScrumBoardPage.tsx:242-247`) patch one task or one story
  in place, and `patchStory` spreads the single-row PATCH response over the board's story (`:208`), which
  would blank a server value. A client-side sum is right after every optimistic patch with no reducer
  change. The story create/update endpoints stop accepting an estimate, and `StoryOut` stops exposing the
  legacy text. The single-row responses of `create_story` / `update_story` carry no tasks, so their
  `estimate_hours` is `null`; nothing reads it, and the type's doc comment says so.
- **D3. The editor's input is a plain number box, no presets.** "Just keep the validation on hours." A
  `type="number"` input with `min=1 max=15 step=1`, an "h" after it, and a hint; the form refuses to submit
  anything else and the API refuses it too (422).
- **D4. The AI draft endpoint is left as it is.** `app/scrum/ai_draft.py:22-24` asks the model for
  `time_estimate` strings and `AiDraft` / `AiDraftTask` (`models.py:193-201`) carry them; the web client
  has no caller (`grep aiDraftScrum frontend/src` finds only the api method), and the maintainer paused the
  feature on 2026-10-13. Nothing in this batch touches it. When it comes back it gets `estimate_hours`.
- **D5. Chip copy.** The clock chip (`components/Chips.tsx:17-24`, `.gt-estimate`) now reads "4h". A story
  with tasks summing to 12 hours shows "12h" on its card, backlog row and detail; a story whose tasks have no
  hours shows no chip. The chip keeps the design system's `estimate: string` prop
  (`design/components/scrum/PointsChip.d.ts`); callers format the hours.
- **D6. The rollout window.** The expand migration is applied on PROD immediately before the release merge.
  Until the new code is live, the old code keeps writing text, and a "4h" typed in those minutes is not
  converted (the expand's UPDATE has already run) and is dropped by the contract; the contract does not
  re-convert, so it can never bring back an estimate that someone cleared in the new editor. The PR body
  names the window. The expand's UPDATE converts only rows whose `estimate_hours` is still NULL, so
  re-running it after the deploy changes nothing.

## Backend

### Migration — `backend/database/migrations/2026-10/2026-10-16_task_estimate_hours.sql` (expand)

Applied by hand, dev first, then prod **before** this code is deployed (the code writes the new column on
every task save; without it every save is a 500).

```sql
-- Task estimates become whole hours (1–15). Expand step: the legacy text columns stay until
-- 2026-10-16_task_estimate_hours_contract.sql runs, after this code is live.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS estimate_hours smallint;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_estimate_hours_valid;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_estimate_hours_valid
  CHECK (estimate_hours IS NULL OR estimate_hours BETWEEN 1 AND 15);

-- Only a value already written as whole hours ("4h", " 10h ") within the cap converts (maintainer
-- 2026-10-16: "wipe all estimates that are not in '1h' formats"). Everything else stays NULL.
UPDATE public.tasks
SET estimate_hours = (regexp_match(time_estimate, '^\s*(\d{1,2})\s*h\s*$'))[1]::smallint
WHERE estimate_hours IS NULL
  AND time_estimate ~ '^\s*\d{1,2}\s*h\s*$'
  AND (regexp_match(time_estimate, '^\s*(\d{1,2})\s*h\s*$'))[1]::int BETWEEN 1 AND 15;
```

Lower-case `h` only: that is the format the placeholder taught ("4h"); an upper-case `H` is one of the
things being wiped. The `estimate_hours IS NULL` guard makes a re-run harmless after the new code has
written hours (D6).

### Migration — `backend/database/migrations/2026-10/2026-10-16_task_estimate_hours_contract.sql`

Header: **run only after the code from this spec is live on the same environment** (it stops reading and
writing these columns). Drops `public.tasks.time_estimate` and `public.user_stories.time_estimate`
(`ALTER TABLE … DROP COLUMN IF EXISTS`); no re-conversion first (D6). `supabase/schema.sql` is updated
when each file is applied (AGENTS.md).

### Models — `app/scrum/models.py`

- `CreateStoryRequest` (`time_estimate` at `:58`) and `UpdateStoryRequest` (`:67`): drop `time_estimate`.
  Pydantic ignores unknown fields, so an older client that still sends it is not refused; the field is simply
  not written.
- `CreateTaskRequest` (`:76`) and `UpdateTaskRequest` (`:85`): `time_estimate` becomes
  `estimate_hours: int | None = Field(None, ge=1, le=15)`. An explicit `null` on update clears it, as for
  `description_md`.
- `TaskOut` (`:145`): `time_estimate` → `estimate_hours: int | None = None`.
- `StoryOut` (`:166`): `time_estimate` → `estimate_hours: int | None = None` (the board's derived sum; `null`
  on single-row responses, D2).
- `AiDraftTask` / `AiDraft` (`:193`, `:200`): unchanged (D4).

`views._task_out` / `views._story_out` (`views.py:40-55`) copy whatever model fields the row carries, so
the new field flows through once it is in the model; the legacy `time_estimate` key on a row is ignored.

### Controller — `app/scrum/controller.py`

- `create_story` (`:259`) and `update_story` (`:278`): remove `"time_estimate"` from the field tuples.
- `create_task` (`:331`) and `update_task` (`:353`): `"time_estimate"` → `"estimate_hours"` in the field
  tuples. Validation is the model's (422); the CHECK constraint is the backstop.
- `get_board`: where tasks are attached to their stories (`:757-766`, `s["tasks"] = tasks_by_story…`), add
  `s["estimate_hours"] = sum(t.get("estimate_hours") or 0 for t in s["tasks"]) or None`. Live tasks only
  is automatic: the board attaches every task of the story, and a story in the backlog or legacy-archived
  still sums its own tasks. No new query; the round-trip budget (`tests/test_scrum_board.py:143`, `<= 12`)
  does not move.
- `get_summary` (`:861`): untouched (counts only).
- `search/controller.py` (`_TASK`, `_STORY`, `:34-35`): untouched (neither selects an estimate).

### Catalog — `frontend/public/.well-known/grepthink-actions.json`

- `create_story` (`:313-315`) and `update_story` (`:317-320`): drop `"time_estimate"` from `params`.
- `create_scrum_task` (`:327-330`) and `update_scrum_task` (`:332-335`): `"time_estimate": "string"` →
  `"estimate_hours": "int (whole hours, 1-15)"`; on update add "(explicit null clears it)".
- `view_scrum_board` note: mention that each story carries `estimate_hours`, the sum of its tasks'.

## Frontend

### Types — `lib/api/types.ts`

- `ApiScrumTask` (`:786`): `time_estimate: string | null` → `estimate_hours: number | null`
  (doc: "Whole hours, 1–15.").
- `ApiScrumStory` (`:809`): `time_estimate: string | null` → `estimate_hours: number | null`
  (doc: "The board's sum of its tasks' hours, null when none has one; single-row story responses send null.
  The web client computes its own with `storyHours` (utils/rollups.ts), which stays right after an
  optimistic edit.").
- `ApiCreateStoryBody` (`:884`) and `ApiUpdateStoryBody` (`:895`): drop `time_estimate`.
- `ApiCreateTaskBody` (`:905`): `time_estimate?: string` → `estimate_hours?: number`.
- `ApiUpdateTaskBody` (`:915`): `time_estimate?: string | null` → `estimate_hours?: number | null`
  (explicit null clears it).

### Story hours — `features/scrum/utils/rollups.ts`

Beside `storyRollup` ("always derived, never stored"):

```ts
/** A story's hours: the sum of its tasks' estimates; null when no task has one (spec D2). */
export function storyHours(story: Pick<ApiScrumStory, 'tasks'>): number | null {
  const hours = story.tasks.reduce((sum, t) => sum + (t.estimate_hours ?? 0), 0);
  return story.tasks.some((t) => t.estimate_hours != null) ? hours : null;
}
```

### Chip — `features/scrum/components/Chips.tsx:17-24`

`EstimateChip` keeps its `estimate: string` prop (D5). Callers: `TaskCard.tsx:34` becomes
`task.estimate_hours != null && <EstimateChip estimate={`${task.estimate_hours}h`} />`;
`StoryCard.tsx:42`, `BacklogRow.tsx:28` and `StoryModal.tsx:153` compute `const hours = storyHours(story)`
and render `hours != null && <EstimateChip estimate={`${hours}h`} />` — never `story.estimate_hours` (D2).

### Task editor — `features/scrum/components/TaskEditorModal.tsx`

- State (`:66`): `const [hours, setHours] = useState(task?.estimate_hours == null ? '' : String(task.estimate_hours));`
  — a string, so the controlled number input can hold what the user is typing.
- Bad input: Firefox and Safari report `value === ''` for text a number box cannot parse ("4h"), which the
  string check alone would take for "cleared" and Save would silently wipe the estimate. Track it:
  `const [hoursBad, setHoursBad] = useState(false);` and in `onChange`
  `setHours(e.target.value); setHoursBad(e.target.validity.badInput);`.
- Validity, next to `prInvalid` (`:71`):
  `const hoursInvalid = hoursBad || (hours.trim() !== '' && !/^(?:[1-9]|1[0-5])$/.test(hours.trim()));`
  (whole hours 1–15; the regex avoids `Number('1e1')`-style surprises). Submit (`:97-99`) returns early
  and the Save/Add button (`:322`) is disabled when `hoursInvalid`, exactly as for `prInvalid`.
- Body: `estimate_hours: hours.trim() === '' ? null : Number(hours)` in the edit body (`:111`, explicit null
  clears, like `description_md`), and `...(hours.trim() ? { estimate_hours: Number(hours) } : {})` in the
  create body (`:122`).
- Markup (`:265-276`), in the same `task-editor__field` of the estimate/assignee row:

  ```tsx
  <label className="task-editor__label" htmlFor="task-editor-estimate">Time estimate</label>
  <div className="task-editor__hours">
    <input
      id="task-editor-estimate"
      type="number"
      inputMode="numeric"
      min={1}
      max={15}
      step={1}
      value={hours}
      placeholder="4"
      aria-invalid={hoursInvalid || undefined}
      aria-describedby="task-editor-estimate-hint"
      onChange={(e) => { setHours(e.target.value); setHoursBad(e.target.validity.badInput); }}
    />
    <span className="task-editor__hours-unit" aria-hidden="true">h</span>
  </div>
  <span className="task-editor__hint" id="task-editor-estimate-hint">
    {hoursInvalid ? 'Enter whole hours, 1 to 15.' : 'Whole hours, up to 15.'}
  </span>
  ```

  The accessible name stays "Time estimate" (`getByLabelText('Time estimate')` in the tests); the unit is
  decorative. `TaskEditorModal.scss`: `&__hours { display: flex; align-items: center; gap: 6px; input { flex: 1; min-width: 0; } }`,
  `&__hours-unit { font-size: 12.5px; color: var(--gt-text-tertiary); }`. The existing
  `input[aria-invalid='true'] + .task-editor__hint` rule (`:189`) no longer matches because the hint is no
  longer the input's next sibling: add `&__hours:has(input[aria-invalid='true']) + &__hint { color: var(--gt-error-text); }`
  beside it (`:has()` is already used in the codebase; check `grep -rn ':has(' frontend/src --include=*.scss`
  and, if it is not, use a `task-editor__hint--invalid` class toggled from `hoursInvalid` instead).

### Story editor — `features/scrum/components/StoryEditorModal.tsx`

Remove the estimate state (`:32`), its body entry (`:51`) and the "Time estimate" field (`:108-118`); the
assignee field keeps the `story-editor__row`. The story's hours are shown, not typed (D2).

### Story detail — `features/scrum/components/StoryModal.tsx:153`

The chip reads the derived `story.estimate_hours` (above). The task rows (`:220-240`) are unchanged.

### Harness

`frontend/scrum-mock*` is git-excluded and maintained in the main session: not the implementer's.

## Testing

### Backend

- `tests/test_scrum_stories_tasks.py`: `create_task` writes `estimate_hours` and never `time_estimate`
  (assert the inserted row); `update_task` with `estimate_hours: None` clears it (the payload carries the
  null); `create_story` / `update_story` ignore a `time_estimate` in `fields` (nothing written).
- `tests/test_scrum_endpoints.py` (request validation through the app): `POST …/tasks` with
  `estimate_hours: 0`, `16`, `2.5` and `"4h"` are 422; `15` is accepted; `PATCH …/stories/{id}` with
  `time_estimate` is accepted and the field is not stored.
- `tests/test_scrum_board.py`: in `_seed`, give `b1` 3 hours and `b2` 2 hours (story `B` is in the active
  sprint `S2`, which the default load opens; `A` is in the completed `S1` and is not returned); assert story
  `B` reports `estimate_hours == 5`, the backlog story `D` (no hours) reports `None`, and the round-trip
  budget stays `<= 12`.

### Frontend

- `__tests__/fixtures.ts:12,19`: `time_estimate: null` → `estimate_hours: null` on `makeTask` / `makeStory`.
- The rollups tests (`grep -rn storyRollup frontend/src/features/scrum/__tests__`): `storyHours` is `null`
  for no tasks and for tasks without hours, `5` for tasks of 3 and 2 hours, `3` when one of two tasks has
  hours.
- `__tests__/scrumComponents.test.tsx:33`: the story card shows "12h" for tasks whose hours sum to 12
  (`estimate_hours` on the story fixture may be anything: the card must not read it), and no chip when no
  task has hours; the task card shows "4h".
- A hook test (where `patchTask` / `patchStory` are covered today — `grep -rn "updateTask\|updateStory" frontend/src/features/scrum/__tests__`):
  after an optimistic task save that changes `estimate_hours` from 3 to 8, the story card's chip reads the
  new sum; after a story points change through `updateStory`, the chip is still there.
- `__tests__/taskEditor.test.tsx:150-164, 206-211`: the edit body carries `estimate_hours: 2` from a task with
  `estimate_hours: 2`, and `estimate_hours: null` after clearing the box; typing `4` into "Time estimate"
  sends `estimate_hours: 4`; typing `16` (or `0`, `2.5`) shows "Enter whole hours, 1 to 15." and disables
  Save; the hint reads "Whole hours, up to 15." otherwise.
- `__tests__/storyEditor.test.tsx:53-62`: there is no "Time estimate" field; the create body has no
  `time_estimate`.
- `ScrumBoardPage.test.tsx`: unchanged unless a fixture literal names `time_estimate` (type-checked by
  `tsc -b`, so the build finds every one).

Gates before each commit: backend `ruff format . && ruff check . && python -m pytest`; frontend
`npm run lint && npm run lint:design && npm run build && npx vitest run`.

## Rollout

1. Apply the expand migration on DEV (Supabase MCP, dev project) before the branch is tested there; on PROD
   immediately before the release merge that carries this code (D6: text typed in between is lost). The PR
   body says so.
2. Deploy the code.
3. Apply the contract migration (dev, then prod) once the code is live; update `supabase/schema.sql` after
   each file is applied.
