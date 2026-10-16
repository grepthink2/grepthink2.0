# Scrum Board Task Dependencies ("depends on") — Design Spec

**Date:** 2026-10-16
**Branch:** `feat/scrum-task-dependencies`, stacked on `feat/scrum-task-hours` (which stacks on
`feat/scrum-sprint-picker` `039a6c63`). This batch is implemented after the task-hours batch has landed on
its branch, and the plan targets that head. Code references below are to `039a6c63`; the task-hours batch
touches `TaskOut`, `ApiScrumTask`, `makeTask`, `TaskCard.tsx:34`, `TaskEditorModal`'s state and props,
`test_scrum_board.py`'s `_seed` and the `view_scrum_board` catalog note, so those citations may have drifted
by a few lines by then.
**Status:** Approved in conversation (maintainer, 2026-10-16); builder-checked the same day (D9–D11 came
out of that check); implementation-ready.

## The ask (maintainer, 2026-10-15, Board note 5)

"There is no concept of dependency or relationship between two tasks — can we add this? Let's just do a
simple 'depends on'."

Decisions given on 2026-10-16: **block** (not warn); **cross-sprint dependencies are allowed**; **show the
other side too, linked to the task that blocks.**

## Decisions (mine, flagged)

- **D1. What "blocked" stops.** A task is *blocked* while it is in To do and any task it depends on is not
  Done. A blocked task cannot leave To do: a move to In progress or Done is refused, by the web client before
  it asks and by the API (409) as the safety net. A move back to To do is always allowed. A task that already
  left To do is never pulled back: if a dependency is reopened, the dependent keeps its column (the editor
  still lists the dependency with its status).
- **D2. One rule, three surfaces.** The board card shows a "Blocked" chip; the task editor's Status select
  disables In progress and Done and says why; the board's drag-and-drop is refused with a toast. All three
  read the same `depends_on` list that the board payload carries, so they never disagree with each other.
  They can only be stale together, and the board keeps them fresh for the viewer's own moves (D9) and
  corrects itself whenever a refusal happens (D10).
- **D3. The board payload carries everything; no new reads from the editor.** `get_board` already loads
  every story and every task of the project (`controller.py:663-681`), so one extra read of the project's
  dependency rows (round 1, keyed by `project_id`) is enough to attach `depends_on` and `blocks` to every task
  and to list every task of the project for the picker (`task_index`). Cross-sprint targets are in memory
  already. The board's round-trip budget rises from 12 to 13 (it is exactly 12 today: measured 2026-10-16).
- **D4. Cycles are refused, the whole chain.** A → B is refused when B already depends on A, directly or
  through other tasks. The check walks the project's edges in Python (one read); projects have at most a few
  hundred tasks.
- **D5. Same project only.** Both tasks must belong to the project; a target in another project is 404
  (`TASK_NOT_FOUND`), the same answer as a missing task, so nothing leaks. The picker never offers one.
- **D6. Links switch the board.** A dependency's key opens that task. A task in the current sprint or the
  backlog opens in place (`?task=`); a task in another sprint goes through `?sprint=<its sprint>&task=<id>`:
  the existing deep-link effect switches the sprint and the task opens once that board is on screen.
- **D7. Who.** Project members add and remove dependencies; staff (instructors, TAs) see both lists and
  nothing else, as for every other board write (`_require_writer`, `controller.py:111`).
- **D8. Not in this batch.** No "Blocked" marker on the story detail's task rows (`StoryModal.tsx:220-240`:
  the status column stays as it is; the task opens for detail). No dependency on a *story*. No product
  event (`app/core/events.py` records only `board_viewed` for the board). No notification when a blocker
  finishes — the natural follow-up once notifications read estimates and dependencies.
- **D9. The refs' status copies follow the viewer's own moves.** `depends_on` and `blocks` carry a copy of
  each named task's status, taken when the board loaded, and a move never refetches the board:
  `applyOptimisticMove` / `confirmMove` / `rollbackMove` (`utils/boardReducer.ts:35-72`) rebuild only the
  moved task. Without more, dragging GT-12 to Done would leave GT-15's copy of GT-12 at To do, so GT-15
  would stay "Blocked" until the window-focus refresh (`hooks/useScrumBoard.ts:139-143`). So every move
  path also rewrites the moved task's status into every ref that names it, across `stories` and `backlog`
  (`syncRefStatus`, Hook). A teammate's move is picked up on focus, as every other change is today (no
  realtime, D11 of the board spec).
- **D10. A refusal refreshes.** When the client refuses a move (the task is blocked on its copy of the
  board), it shows the toast and also refreshes the board in the background: if the copy was stale (a
  teammate finished the blocker), the chip clears on its own. When the server refuses with 409
  `task_blocked` (the copy was stale the other way), the card rolls back, the toast shows the server's
  `detail`, and the board refreshes. Both are rare, so the extra `board_viewed` event and burnup snapshot a
  load records (`controller.py:794,842`) do not matter; a refresh per ordinary drag would, which is why D9
  patches instead of refetching.
- **D11. Board-only fields survive single-task responses, and an older backend is tolerated.**
  `views._task_out` fills `depends_on` / `blocks` with empty lists on `update_task` and `move_task`
  responses, and `patchTask` (`hooks/useScrumBoard.ts:219-240`) and `confirmMove` spread the response over
  the board's task — a Save would wipe the lists (the chip would vanish, the editor would say "No
  dependencies.", the picker would offer the existing dependency and the API would answer 409). Today the
  same merges already reset `comment_count` to 0 and `patchTask` nulls `moved_by_name`. One merge helper
  keeps the board-only fields from the board's copy (Hook). And because the two Vercel projects deploy
  separately (the sprint-picker batch's D7c), `depends_on`, `blocks` and `task_index` are optional in the
  web client's types and read through `?? []`: a new client on an old backend shows no dependency UI and
  does not crash.

## Backend

### Migration — `backend/database/migrations/2026-10/2026-10-16_task_dependencies.sql`

Applied by hand, dev first, then prod **before** this code is deployed: `get_board` reads the table on every
load, and a missing table fails the whole board.

```sql
-- Task dependencies ("GT-15 depends on GT-12"), one row per edge. Both tasks must belong to
-- project_id: the controller checks it; the column makes the board's read one filter.
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id            uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CONSTRAINT task_dependencies_not_self CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS task_dependencies_project_idx    ON public.task_dependencies (project_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_idx ON public.task_dependencies (depends_on_task_id);
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_dependencies FROM anon, authenticated;
```

The same shape as `public.events` (`2026-10-06_assignment_deadlines_and_events.sql:77-94`): RLS on, no
policies, nothing for the browser roles (the 2026-09-21 lockdown). `supabase/schema.sql` gains the table
once the file is applied (AGENTS.md).

### Models — `app/scrum/models.py`

```python
class TaskRef(BaseModel):
    """A task named from another task, or in the board's task index."""
    id: str
    key: str
    title: str
    status: BoardStatus
    story_id: str
    story_key: str
    sprint_id: str | None = None   # the story's sprint; None = backlog


class AddDependencyRequest(BaseModel):
    depends_on_task_id: str


class DependenciesResponse(BaseModel):
    message: str
    depends_on: list[TaskRef]
```

`TaskOut` (`:138-156`) gains `depends_on: list[TaskRef] = Field(default_factory=list)` and
`blocks: list[TaskRef] = Field(default_factory=list)`. `BoardResponse` gains
`task_index: list[TaskRef]` ("every task of the project, in key order, for the dependency picker").
`views._task_out` (`:40-44`) copies model fields from the row, so the single-task responses of
`create_task` / `update_task` / `move_task` carry empty lists (they have no dependency rows in hand): the web
client never lets those lists overwrite the board's (D11).

### Routes — `app/scrum/url.py`

```python
router.post("/scrum/tasks/{task_id}/dependencies")(views.add_dependency)
router.delete("/scrum/tasks/{task_id}/dependencies/{depends_on_task_id}")(views.remove_dependency)
```

`views.add_dependency` → 201 `DependenciesResponse(message="Dependency added", depends_on=[…])`;
`views.remove_dependency` → 204 (the pattern of `delete_task`, `views.py:154-157`).

### Controller — `app/scrum/controller.py`

Fixed details (module constants beside `STORY_IN_SPRINT`, `:54`):

| Constant | Status | Detail |
|---|---|---|
| `TASK_BLOCKED` | 409, code `task_blocked` (`AppError`, `app/core/errors.py:44`) | `Finish the tasks this one depends on first` |
| `DEPENDENCY_CYCLE` | 409 | `That would make the tasks depend on each other` |
| `SELF_DEPENDENCY` | 422 | `A task can't depend on itself` |
| `ALREADY_DEPENDS` | 409 | `Already a dependency` |
| `DEPENDENCY_NOT_FOUND` | 404 | `Dependency not found` |

Every detail reaches the user as it is, through `noticeFor` (`hooks/useScrumBoard.ts:20-25`). The web
client branches on `code == "task_blocked"` for one thing only: to refresh the board after the rollback
(D10). The `code` is also what an API consumer keys on.

- `_task_ref(task, story) -> dict`: `{id, key, title, status, story_id, story_key: story["key"], sprint_id: story.get("sprint_id")}`.
- `add_dependency(*, task_id, user_id, depends_on_task_id) -> list[dict]`:
  1. `if depends_on_task_id == task_id: 422 SELF_DEPENDENCY`.
  2. One read: `tasks` `.in_("id", [task_id, depends_on_task_id])` `.select("*")`; both rows must exist and
     share `project_id`, else 404 `TASK_NOT_FOUND`.
  3. `_require_writer(client, project_id=…, user_id=user_id)`.
  4. One read: `task_dependencies` `.select("task_id, depends_on_task_id").eq("project_id", pid)`.
     If `(task_id, depends_on_task_id)` is among them → 409 `ALREADY_DEPENDS`. Cycle: walk from
     `depends_on_task_id` along `task_id → depends_on_task_id` edges (what it depends on, transitively); if
     `task_id` is reached → 409 `DEPENDENCY_CYCLE`.
  5. Insert `{task_id, depends_on_task_id, project_id, created_by: user_id}`; a `23505` race surfaces as the
     existing `DatabaseError` conflict (409).
  6. Return the task's `depends_on` refs: one read of the target tasks `.in_("id", ids)`, and their stories
     for `story_key` / `sprint_id` — either embedded on that read (`user_stories(key, sprint_id)`, which
     needs a `("tasks", "user_stories")` entry in `scrum_support.RELATIONS` for the fake) or one more read of
     `user_stories` `.in_("id", story_ids)` `.select("id, key, sprint_id")`. Budget: 5 round trips with the
     embed, 6 without (the task pair, the writer check, the edges, the insert, the targets, their stories);
     pin whichever the implementation reaches, and never more than 6 (`FakeSupabase.executes`).
- `remove_dependency(*, task_id, user_id, depends_on_task_id) -> None`: `_get_task_or_404`,
  `_require_writer`, then `task_dependencies.delete().eq("task_id", …).eq("depends_on_task_id", …)`; an
  empty `data` → 404 `DEPENDENCY_NOT_FOUND`. 3 round trips.
- `move_task` (`:572-604`): after `_require_writer` and before the insert, when
  `task["status"] == "todo" and to_status != "todo"`: read the task's dependency rows
  (`.eq("task_id", task_id)`); if any, read those tasks' `status` (`.in_("id", ids).select("id, status")`);
  any status other than `done` → `TASK_BLOCKED`. +1 round trip for a task without dependencies, +2 with.
  `tests/test_scrum_moves.py` pins no budget today; the new tests do (below).
- `get_board` (`:648`): round 1 (`:663-681`) gains
  `"deps": lambda: rows(client.table("task_dependencies").select("task_id, depends_on_task_id").eq("project_id", pid))`.
  After tasks are attached to stories (`:748-754`), with `story_by_id` and `task_by_id` in hand:
  `t["depends_on"] = [ref(target) for each row with task_id == t.id]`,
  `t["blocks"] = [ref(source) for each row with depends_on_task_id == t.id]` (both in the rows' order; a row
  naming a task the board does not hold — impossible with the cascades, but cheap to guard — is skipped),
  and `task_index = [ref(t) for t in tasks]` sorted by the number in the key (`GT-2` before `GT-10`) when
  the part after the last `-` is an integer, and by the whole key as a string otherwise (`tasks.key` has no
  format check, and the board test's seed uses keys like `GT-a1`: a sort that raises would take the whole
  board down). The response gains `"task_index": task_index`. Budget 12 → 13
  (`tests/test_scrum_board.py:143`).
- `delete_task` / `delete_story`: nothing to do — `ON DELETE CASCADE` on both foreign keys. (The fake has
  no cascades; a test that deletes a task with a dependency row is not needed.)

### Catalog — `frontend/public/.well-known/grepthink-actions.json`

Two entries after `move_scrum_task` (`:341-344`):

```json
{
  "id": "add_task_dependency", "title": "Make a task depend on another task", "role": "project-member",
  "method": "POST", "endpoint": "/api/scrum/tasks/{task_id}/dependencies",
  "params": {"depends_on_task_id": "uuid!"}, "uiRoute": "/app/projects/{projectId}/board",
  "note": "Both tasks must be in the same project; any sprint or the backlog. Refused when it would form a cycle (409) or already exists (409). While a task in To do depends on a task that is not done, moving it out of To do is refused (409, code task_blocked)."
},
{
  "id": "remove_task_dependency", "title": "Remove a task's dependency on another task", "role": "project-member",
  "method": "DELETE", "endpoint": "/api/scrum/tasks/{task_id}/dependencies/{depends_on_task_id}", "uiRoute": "/app/projects/{projectId}/board"
}
```

`move_scrum_task` gains the note "Refused (409, code task_blocked) while the task is in To do and depends on
a task that is not done." `view_scrum_board`'s note mentions `depends_on` / `blocks` on every task and
`task_index`.

## Frontend

### Types — `lib/api/types.ts`

```ts
/** A task named from another task's dependencies, or in the board's task index. */
export interface ApiTaskRef {
  id: string;
  key: string;
  title: string;
  status: ApiBoardStatus;
  story_id: string;
  story_key: string;
  /** The story's sprint; null = backlog. */
  sprint_id: string | null;
}
```

`ApiScrumTask` gains `depends_on?: ApiTaskRef[]` and `blocks?: ApiTaskRef[]`; `ApiScrumBoard` gains
`task_index?: ApiTaskRef[]` — all three optional with the doc comment "Missing only from a backend older
than this client (the two deploy separately)", as `ApiScrumBoardSprint.progress` is (`types.ts:773-776`).
Readers go through `task.depends_on ?? []` (the helpers below do it once).

### API client — `lib/api/scrum.ts`

```ts
addTaskDependency: async (taskId: string, dependsOnTaskId: string) =>
  apiRequest<{ message: string; depends_on: ApiTaskRef[] }>(`/api/scrum/tasks/${taskId}/dependencies`, {
    method: 'POST', body: JSON.stringify({ depends_on_task_id: dependsOnTaskId }),
  }),
removeTaskDependency: async (taskId: string, dependsOnTaskId: string) =>
  apiRequest<void>(`/api/scrum/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { method: 'DELETE' }),
```

(Match the file's existing call shape — `moveScrumTask` at `:98` — for headers and the preview guard.)

### Helpers — `features/scrum/utils/dependencies.ts` (new, non-component module)

```ts
/** The tasks that keep `task` in To do: its dependencies that are not done. */
export function blockers(task: Pick<ApiScrumTask, 'depends_on'>): ApiTaskRef[] {
  return (task.depends_on ?? []).filter((d) => d.status !== 'done');
}
/** Blocked = in To do with an unfinished dependency (spec D1). */
export function isBlocked(task: Pick<ApiScrumTask, 'status' | 'depends_on'>): boolean {
  return task.status === 'todo' && blockers(task).length > 0;
}
/** "GT-15 is blocked by GT-12" / "… by GT-12 and GT-13" / "… by GT-12, GT-13 and GT-14". */
export function blockedMessage(task: Pick<ApiScrumTask, 'key' | 'depends_on'>): string
```

### Reducer — `features/scrum/utils/boardReducer.ts`

```ts
/** A moved task's new status, written into every ref that names it (spec D9). */
export function syncRefStatus(stories: ApiScrumStory[], taskId: string, status: BoardStatus): ApiScrumStory[]
/**
 * A single-task response over the board's copy. The response never carries what only the board load
 * supplies — `depends_on`, `blocks`, `comment_count` — and `update_task`'s carries no `moved_by_name`
 * (spec D11); those stay as the board had them. A move response's `moved_by_name` wins (it is resolved).
 */
export function mergeTaskResponse(boardTask: ApiScrumTask, response: ApiScrumTask): ApiScrumTask
```

`confirmMove` (`:56-65`) becomes `mapTask(stories, taskId, (prev) => mergeTaskResponse(prev, serverTask))`
with its existing `moved_by_name ?? prev.moved_by_name` rule kept inside the helper; `patchTask`'s
`local(task)` call (`hooks/useScrumBoard.ts:232`) goes through the same helper (`applyTaskPatch` stays as it
is for the optimistic body patch). The `comment_count` reset after a Save is an existing bug this fixes in
passing.

### Hook — `features/scrum/hooks/useScrumBoard.ts`

- `moveTask` (`:156-180`): after the `snapshot` guard,
  `if (to !== 'todo' && isBlocked(snapshot)) { setNotice({ kind: 'error', message: blockedMessage(snapshot) }); void refresh(); return; }`
  — before the optimistic update, so the card never moves, and with the background refresh of D10.
- Every `setBoard` in `moveTask` also syncs the refs (D9): optimistic →
  `{ ...prev, stories: syncRefStatus(applyOptimisticMove(prev.stories, taskId, to, mover), taskId, to), backlog: syncRefStatus(prev.backlog, taskId, to) }`;
  confirm → the same with `task.status` from the response after `confirmMove`; rollback → the same with
  `snapshot.status` after `rollbackMove`.
- The `catch`: on an `ApiError` whose `code === 'task_blocked'`, roll back, `setNotice(noticeFor(err, …))`
  as today (the server's detail), and `void refresh()` (D10). Any other error: as today.
- New, with `mutate`: `addDependency(taskId, dependsOnTaskId)` ("Couldn’t add the dependency") and
  `removeDependency(taskId, dependsOnTaskId)` ("Couldn’t remove the dependency"); both refresh the board.
  Exported from the hook's return (`:314-333`).

### Task card — `features/scrum/components/TaskCard.tsx` + `TaskCard.scss` (new)

In `gt-task__top`, after the story key (`:32`):

```tsx
{isBlocked(task) && (
  <span className="gt-task__blocked" title={blockedMessage(task)}>
    <Lock size={10} aria-hidden="true" />
    Blocked
  </span>
)}
```

`TaskCard.scss` (the card's other classes live in `scrum.scss`, a 1:1 port of the design export that is not
hand-edited; this one is ours): `.gt-task__blocked { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: var(--gt-radius-pill); background: var(--gt-warning-soft); color: var(--gt-warning-text); font-size: 10px; font-weight: var(--gt-weight-medium); }`.
`title` is the whole message so a hover names the blockers; the chip's text is in the card's accessible name.

### Task editor — `features/scrum/components/TaskEditorModal.tsx`

New props:

```ts
/** The board's sprints, to group the dependency picker ("Sprint 2", "Backlog"). */
sprints: ApiScrumSprint[];
/** Every task of the project (board.task_index), for the picker. */
taskIndex: ApiTaskRef[];
/** Open another task from its key (a dependency or a dependent); the page switches sprints if needed. */
onOpenRef: (ref: ApiTaskRef) => void;
/** Present only when the viewer can edit dependencies (a team member). */
onAddDependency?: (dependsOnTaskId: string) => void;
onRemoveDependency?: (dependsOnTaskId: string) => void;
```

- **Status select** (`:160-173`): `const blocked = isBlocked(task)`; when blocked, the In progress and Done
  options get `disabled`, and the hint (`#task-editor-status-hint`) reads `blockedMessage(task)` instead of
  "Applies right away.".
- **Dependencies section**, edit mode only, after the Pull request field (`:286-306`) and before the footer:

  ```tsx
  {editing && (
    <section className="task-editor__deps" aria-labelledby="task-editor-deps-title">
      <h3 className="task-editor__section-title" id="task-editor-deps-title">Depends on</h3>
      {task.depends_on.length === 0 && <p className="task-editor__hint">No dependencies.</p>}
      <ul className="task-editor__dep-list">
        {task.depends_on.map((d) => (
          <li key={d.id} className="task-editor__dep">
            <button type="button" className="task-editor__dep-key" onClick={() => onOpenRef(d)}>{d.key}</button>
            <span className="task-editor__dep-title">{d.title}</span>
            <span className={`task-editor__dep-status task-editor__dep-status--${d.status}`}>{statusLabel(d.status)}</span>
            {onRemoveDependency && (
              <button type="button" className="task-editor__dep-remove" aria-label={`Remove dependency on ${d.key}`}
                onClick={() => onRemoveDependency(d.id)}><X size={12} aria-hidden="true" /></button>
            )}
          </li>
        ))}
      </ul>
      {onAddDependency && (
        <div className="task-editor__dep-add">
          <label className="sr-only" htmlFor="task-editor-dep-pick">Add a dependency</label>
          <select id="task-editor-dep-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add a dependency…</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.tasks.map((t) => <option key={t.id} value={t.id}>{t.key} · {t.title}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className="task-editor__dep-add-button" disabled={!pick}
            onClick={() => { onAddDependency(pick); setPick(''); }}>Add</button>
        </div>
      )}
      <span className="task-editor__hint">Applies right away. A task in To do can’t start until every task it depends on is done.</span>
      {task.blocks.length > 0 && (
        <>
          <h3 className="task-editor__section-title">Blocks</h3>
          <ul className="task-editor__dep-list">{/* same row markup, no remove button */}</ul>
        </>
      )}
    </section>
  )}
  ```

  `groups`: the sprints in `sprints` order, each with the `taskIndex` tasks whose `sprint_id` matches, then
  "Backlog" (`sprint_id === null`); groups with no offerable task are omitted. Offerable = not this task, not
  already in `depends_on`, not in `blocks` (a direct cycle; deeper ones are the API's). A sprint's label is
  its name, with " (completed)" after a completed sprint's name, as the story modal's sprint select does.
  `pick` is `useState('')`. The `sr-only` class exists in the page's stylesheet (`ScrumBoardPage.scss`); if
  it is not reachable from the editor, a `task-editor__label` with visible text "Add a dependency" is fine.
- `TaskEditorModal.scss`: `&__deps { display: flex; flex-direction: column; gap: 8px; }`,
  `&__dep-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }`,
  `&__dep { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; }`,
  `&__dep-key { font-family: var(--gt-font-mono); font-size: 11px; color: var(--gt-primary); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; &:focus-visible { outline: none; box-shadow: var(--gt-focus-ring); } }`,
  `&__dep-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
  `&__dep-status { font-size: 11px; color: var(--gt-text-tertiary); &--done { color: var(--gt-success-text); } }`,
  `&__dep-remove { the icon-button pattern of the editor (see the labels button) }`,
  `&__dep-add { display: flex; gap: 8px; select { flex: 1; min-width: 0; } }`. Tokens only.

### Board page — `features/scrum/pages/ScrumBoardPage.tsx`

- `setParams` (`:177-186`) accepts `'sprint'` too: `Partial<Record<'task' | 'story' | 'sprint', string | null>>`.
- `openTaskRef = (ref: ApiTaskRef) => { setAddTaskStoryId(null); setParams({ story: null, task: ref.id, sprint: ref.sprint_id && ref.sprint_id !== board.sprint_id ? ref.sprint_id : null }); }`
  — the deep-link effect (`:143-154`) switches the sprint and drops `sprint`; `openTaskPair` (`:114-121`)
  finds the task once the switched board is on screen. A backlog ref (`sprint_id` null) or a ref in the
  current sprint opens at once.
- The edit-mode `TaskEditorModal` (`:446-464`) gets `sprints={board.sprints}`, `taskIndex={board.task_index ?? []}`,
  `onOpenRef={openTaskRef}`, and, when `canWrite`, `onAddDependency={(id) => addDependency(openTaskPair.task.id, id)}`
  / `onRemoveDependency={(id) => removeDependency(openTaskPair.task.id, id)}`. The create-mode editor
  (`:466-476`) gets `sprints`, `taskIndex` and `onOpenRef` too (its section does not render: no task yet).
- `ScrumBoard` (`components/ScrumBoard.tsx:40-48`) needs no change: a refused drop reaches `moveTask`, which
  declines with the toast (Hook).

### Harness

`frontend/scrum-mock*` is git-excluded and maintained in the main session: not the implementer's.

## Testing

### Backend

- `tests/test_scrum_dependencies.py` (new; `scrum_db(monkeypatch, user_stories=…, tasks=…, task_dependencies=…)`,
  two sprints and a backlog story):
  1. `add_dependency` inserts `{task_id, depends_on_task_id, project_id, created_by}` and returns the ref of
     the target with its `story_key` and `sprint_id`; `db.executes <= 5`.
  2. Across sprints and onto a backlog task: accepted.
  3. Self → 422 `SELF_DEPENDENCY`; a task of `OTHER_PID` → 404; a missing id → 404.
  4. Duplicate → 409 `ALREADY_DEPENDS`; a direct cycle (B→A then A→B) and a two-step one (C→B, B→A, then
     A→C) → 409 `DEPENDENCY_CYCLE`.
  5. Staff (`INSTR`, `TA`, `MEETING_TA`) and `STUDENT`, `OUTSIDER` → 403 on add and remove (`MEMBERS_ONLY`
     / `NOT_PROJECT_MEMBER`, as `test_scrum_authz.py` asserts them).
  6. `remove_dependency` deletes the row (`db.executes <= 3`); a missing row → 404.
- `tests/test_scrum_moves.py`: a To do task whose dependency is `in_progress` → `move_task(…, "in_progress")`
  and `(…, "done")` are 409 with `detail == TASK_BLOCKED` and the body's `code == "task_blocked"` (through the
  app, in `test_scrum_endpoints.py`); once the dependency is `done` the move succeeds; a blocked task moved
  to `todo` (from `todo`) writes nothing, as today; an `in_progress` task with a reopened dependency moves to
  `done`; a task with no dependencies moves with one more read than today (pin the count).
- `tests/test_scrum_board.py`: `_seed` gains
  `task_dependencies=[{"task_id": "b2", "depends_on_task_id": "b1", "project_id": PID}, {"task_id": "b2", "depends_on_task_id": "d1", "project_id": PID}]`
  (`b1`, `b2` are on story `B` in the active sprint `S2`, which the default load returns; `d1` is on the
  backlog story `D`; `a2` is in the completed `S1` and is not returned). Assert `b2.depends_on` is the refs
  of `b1` (`story_key == "US-B"`, `sprint_id == "S2"`, `status == "done"`) and `d1` (`sprint_id is None`),
  `b1.blocks == [ref of b2]`, `task_index` lists all five tasks (seed keys are `GT-a1`…, so the string
  order), and the budget is `<= 13` (update the assertion and its comment).

### Frontend

- `__tests__/fixtures.ts`: `makeTask` gains `depends_on: []`, `blocks: []`; `makeBoard` gains
  `task_index: []`; a `makeRef(over)` helper.
- `__tests__/scrumUtils.test.ts`: `blockers`, `isBlocked` (todo + unfinished dep → true; done dep → false;
  in_progress task → false; a task without the field → false), `blockedMessage` for one, two and three
  blockers.
- The reducer tests (`grep -rn "applyOptimisticMove\|confirmMove" frontend/src/features/scrum/__tests__`):
  `syncRefStatus` rewrites the status in a dependent's `depends_on` and a dependency's `blocks`, and touches
  nothing else; `mergeTaskResponse` keeps `depends_on`, `blocks`, `comment_count` from the board's task and
  `moved_by_name` from a move response (and from the board's task when the response has none).
- `__tests__/scrumComponents.test.tsx`: the task card shows "Blocked" (with the message as `title`) for a
  blocked task, nothing for an unblocked one, and renders without error for a task that has no
  `depends_on` at all (an older backend).
- `__tests__/taskEditor.test.tsx`: the Depends on section lists dependencies with status; the key button
  calls `onOpenRef` with the ref; the remove button calls `onRemoveDependency(id)`; the picker groups by
  sprint and backlog, omits the task itself, its dependencies and its dependents; Add calls
  `onAddDependency(pickedId)` and resets; without `onAddDependency` there is no picker and no remove button
  (staff); the Blocks list renders; a blocked task's Status select has In progress and Done disabled and the
  hint reads the blocked message; a new task (create mode) has no section.
- `__tests__/useScrumBoard.test.ts` (or wherever `moveTask` is tested today — `grep -rn "moveTask" frontend/src/features/scrum/__tests__`):
  moving a blocked task to `in_progress` calls no move API, moves no card, sets the error notice
  "GT-2 is blocked by GT-1" and reloads the board once (D10); moving it to `todo` is a no-op as today;
  after GT-1 is moved to `done`, GT-2's `depends_on[0].status` is `done` at once (optimistic) and GT-2 is no
  longer blocked; after a rollback of that move it is `todo` again; a 409 with `code: 'task_blocked'` rolls
  back, shows the server's detail and reloads the board; a Save through `updateTask` keeps the task's
  `depends_on`, `blocks` and `comment_count`.
- `ScrumBoardPage.test.tsx`: opening a ref in another sprint sets `?sprint=` and `?task=`, the board reloads
  with that sprint and the task editor opens on it; a backlog ref opens in place.

Gates before each commit: backend `ruff format . && ruff check . && python -m pytest`; frontend
`npm run lint && npm run lint:design && npm run build && npx vitest run`.

## Rollout

1. Apply the migration on DEV (Supabase MCP, dev project) before the branch is tested there; on PROD before
   the release that carries this code. The PR body says so.
2. Deploy the code. No contract step: nothing is removed.
