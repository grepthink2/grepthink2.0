# Scrum Board Fixes, Batch 1 — Design Spec

**Date:** 2026-10-15
**Branch:** `fix/scrum-board-batch1` (cut from `origin/beta` @ `cf291c7f`)
**Status:** Approved by the maintainer on 2026-10-15 (including E2). Reviewed against the code
the same day; every file and line below was checked on this branch. Supersedes D10, D15 and requirement 12 of
`2026-08-12-scrum-board-design.md` (task-only comment UI, archive-only stories, backlog as archive).

## Scope

The maintainer's notes on the scrum board (numbering is theirs):

| Note | Ask |
|---|---|
| Board 1 | Once a story's tasks claim all its points, stop adding tasks. |
| Board 2 | The task editor's Save button looks wrong while saving. |
| Board 6 | The story modal shouldn't move tasks: drop the status dropdown, just show where each task is. |
| Board 7 | The story card's expand button overlaps the story's points. |
| Backlog 1 | Archive, restore and move-to-sprint are broken and inconsistent. |
| Backlog 2 | A backlog story's sprint dropdown offers "Backlog", where it already is. |
| (carried over) | Comments are unreachable in the UI (found 2026-10-15). |

Out of scope, each its own batch later: a sprint picker with progress (Board 3), structured time
estimates (Board 4), task dependencies (Board 5). Follow-ups found during review are listed at the end.

### Decisions taken (maintainer, 2026-10-15)

1. **Drop the archive.** A story is either in a sprint or in the backlog. No Archive or Restore.
2. **Permanent delete, backlog only.** A backlog story can be deleted with its tasks; a story in a
   sprint must be moved to the backlog first.
3. **Comments are in this batch:** a thread on each task (in the task editor) and one on each story
   (in the story modal).

## Findings (verified)

- **Backlog actions.** `user_stories` has two placement fields. The board treats a story as backlog
  when `sprint_id IS NULL OR archived_at IS NOT NULL` (`backend/app/scrum/controller.py:736`, and
  `get_summary` at `:861`); a sprint view excludes archived rows (`:732`, `:739`, and
  `_live_burnup_totals` at `:463`). Each UI action changes only one field:
  - Backlog row "Move to sprint" → `updateStory(id, {sprint_id: board.sprint_id})`
    (`ScrumBoardPage.tsx:367-369`) sets the sprint but leaves `archived_at` set, so an archived
    story never leaves the backlog.
  - Story modal "Restore story" → `{archived: false}` (`StoryModal.tsx:299`) clears `archived_at`
    only, so the story returns to whatever sprint it was archived from, completed or not.
  - The modal's sprint `<select>` (`StoryModal.tsx:288-294`) has the row button's flaw.
  - Sprint and archive writes go through `mutate()` (write, then refetch —
    `useScrumBoard.ts:264-270`), so what is on screen is the server's state: the bug is the
    server-side rule, not optimistic UI. `update_story` writes `archived_at` from the `archived`
    flag at `controller.py:276-277` and nothing else writes it.
  - Other readers of `archived`/`archived_at`: `app/search/controller.py:252,287` (hides archived
    stories and their tasks), `UpdateStoryRequest.archived` (`models.py:70`), `StoryOut.archived_at`
    (`models.py:155`), `ApiUpdateStoryBody.archived` / `ApiScrumStory.archived_at`
    (`lib/api/types.ts:886,799`), `BacklogRow.tsx:20,27` (the "archived <date>" tag), the hook's
    refetch test (`useScrumBoard.ts:266`), the catalog's `update_story` params, the backlog
    empty-state copy (`ScrumBoardPage.tsx:376`), and the analytics SQL
    (`analytics_live_tasks`, `analytics_scrum` in `supabase/schema.sql:1750,1879`; untouched here).
- **Comments unreachable.** `CommentThread` renders only inside `StoryModal` for a *focused* task
  (`StoryModal.tsx:270-282`, `focusTaskId` prop). Commit `26513772` (2026-09-10) stopped passing
  `focusTaskId`; today only `comments.test.tsx:117,121` sets it. Task cards still show
  `comment_count` (`TaskCard.tsx:49-54`). Story comments have routes (`url.py:24-25`) and a client
  (`lib/api/scrum.ts:100-109`, `parent: 'stories' | 'tasks'`) but never had a UI.
- **Save button.** Every scrum submit is `disabled` while in flight and `&:disabled` fades it to
  `opacity: 0.45`: `TaskEditorModal.tsx:285` / `.scss:226`, `StoryEditorModal.tsx:143` /
  `.scss`, `BoardSettingsModal.tsx:163`, and `CommentThread.tsx:105` (`.gt-comments__send:disabled`,
  `scrum.scss:385`). The label changes too ("Save task" → "Saving…"). Disabling the focused
  button also drops keyboard focus to `<body>`. The in-flight guard already lives in each submit
  function (`if (... || saving) return`), so `disabled` is not what stops double submits.
  Reusable pattern: `features/app/components/Home/StudentHomeDashboard.tsx:911-921` (`aria-busy` +
  lucide `Loader2` spinning).
  There is no `@keyframes gt-spin` in `frontend/src` (scrum.scss:494 references one that only exists
  in `design/components/primitives/primitives.css:43-51`); no global reduced-motion rule exists.
- **Expand button overlap.** `.story-slot__open` is absolute at `top: 6px; right: 6px`, 24×24
  (`ScrumBoardPage.scss:255-262`), over `.gt-story__top`, whose chips are pushed right by
  `.gt-story__key { margin-right: auto }` (`scrum.scss:137-144`). The card's own padding is 14px
  (`scrum.scss:114`), so the button covers the row's last 16px.
- **Points cap.** The story's points are a budget (maintainer 2026-08-29): the editor blocks point
  values above what is left (`TaskEditorModal.tsx:61-62,217`), but a task with no points can still be
  added when `remainingStoryPoints(story) === 0` (`utils/rollups.ts:60-63`). UI-only; the backend
  (`create_task`) enforces no budget, and the catalog's `create_scrum_task` bypasses the UI.
- **Status dropdown.** Each task row in `StoryModal` has a status `<select>` wired to `onMoveTask`
  (`StoryModal.tsx:233-244`). The component's own docstring (`:43-45`) and `ScrumBoard.tsx:25-26`
  call it the board's **only keyboard path** for moving a task (HTML5 drag and drop is mouse-only).
  Dropping it without a replacement removes that path; see E.
- **Delete cascade.** `backend/database/migrations/2026-08/2026-08-12_scrum_board.sql`: `tasks.story_id`
  (`:56`), `task_moves.task_id` (`:89`), `scrum_comments.story_id` / `.task_id` (`:118-119`) are all
  `ON DELETE CASCADE`; `supabase/schema.sql:1489,1551` agree. `FakeSupabase` does not cascade
  (`tests/fake_supabase.py:440-446`), so tests assert the story row only.

## Design

### A. Backlog without archive

**Backend** (`app/scrum/models.py`, `app/scrum/controller.py`):
- `UpdateStoryRequest` drops `archived`. Pydantic ignores unknown body fields, so an old client or
  the catalog sending `archived` is silently ignored (no 422).
- `update_story`: delete lines 276-277. Inside the `sprint_id` branch (after line 275) add
  `payload["archived_at"] = None` with the comment `# a sprint write also clears the legacy archive flag`.
  The snapshot trigger at line 288 becomes `{"points", "sprint_id"}`.
- Reads stay as they are: backlog = `sprint_id IS NULL OR archived_at IS NOT NULL`; sprint views,
  summary and `_live_burnup_totals` keep excluding `archived_at IS NOT NULL`. Legacy archived rows
  (DEV has Trailhead US-6 with `sprint_id NULL`; PROD may hold rows that still carry a `sprint_id`)
  therefore stay in the backlog, never reappear in an old sprint, and are normalised the first time
  they move. No migration; the code runs on the live schema. Add one helper
  `_in_backlog(story) -> bool` (`sprint_id is None or bool(archived_at)`) next to
  `_get_story_or_404`, used by B; `get_board`/`get_summary` may call it too (behaviour unchanged).
- **Search** (`app/search/controller.py`): add the same `_in_backlog` rule. `_stories` (`:252`) no
  longer skips archived rows; for a backlog story `sprint` is `None` (never the stale `sprints(name)`)
  and the href is `view=backlog` (pass `None` as `sprint_id` to `_board_href`). `_tasks` (`:286-288`)
  no longer skips tasks of archived stories; their href is `view=backlog` when the story is in the
  backlog. Keep `archived_at` in `_STORY`.

**Frontend:**
- New `features/scrum/utils/backlog.ts`: `export function isBacklogStory(s: Pick<ApiScrumStory,
  'sprint_id' | 'archived_at'>): boolean { return s.sprint_id == null || s.archived_at != null; }`
  (the board's rule; `archived_at` is a legacy flag the client never writes).
- `StoryModal` footer loses the Archive / Restore button (`story-modal__archive` TSX + SCSS).
- `BacklogRow`: drop the "archived <date>" tag and the `date-fns` import; rename `onRestore` →
  `onMoveToSprint`, add `sprintName: string`. Button text `Move to {sprintName}`,
  `aria-label="Move {story.key} to {sprintName}"`. `ScrumBoardPage` passes `sprintName={sprint.name}`
  (it already has `sprint`, `:257`) and keeps the `canWrite && board.sprint_id` condition.
- `ScrumBoardPage.tsx:376` empty-state copy → `Stories that aren't in a sprint show up here.`
- `useScrumBoard.updateStory`: the refetch test becomes `'sprint_id' in body`; comment:
  `/** A sprint move still refetches — it reshuffles the lists. */`.
- `lib/api/types.ts`: drop `ApiUpdateStoryBody.archived`; `ApiScrumStory.archived_at` stays with the
  doc `/** Legacy archive flag: set ⇒ the story is in the backlog whatever its sprint_id. Read-only. */`.
- Remove `.gt-backlog-row__archived` from `scrum.scss` and note the delta in its header comment.

**Catalog** (`frontend/public/.well-known/grepthink-actions.json`): `update_story` title →
`"Update or move a user story"`, drop the `"archived"` param; the rest is unchanged.

### B. Delete a story (backlog only)

- **Route:** `router.delete("/scrum/stories/{story_id}")(views.delete_story)` (`url.py`, after the
  PATCH). View mirrors `delete_task` (`views.py:149-151`): 204, no body.
- **Controller:**
  ```python
  #: 409: a story leaves through the backlog, so a sprint's scope never drops by deletion.
  STORY_IN_SPRINT = "Move the story to the backlog before deleting it"

  def delete_story(*, story_id: str, user_id: str) -> None:
      client = get_client()
      story = _get_story_or_404(client, story_id)
      _require_writer(client, project_id=story["project_id"], user_id=user_id)
      if not _in_backlog(story):
          raise HTTPException(status_code=409, detail=STORY_IN_SPRINT)
      client.table("user_stories").delete().eq("id", str(story_id)).execute()
  ```
  Three round trips. Postgres cascades tasks, comments and moves. No burnup snapshot: a backlog story
  is outside every sprint's scope (a legacy archived row was already excluded from its old sprint).
  409 matches the codebase's "state refuses the action" conflicts (`classes/controller.py:2039`).
- **Client:** `deleteScrumStory: async (storyId) => apiRequest<void>(`/api/scrum/stories/${storyId}`,
  { method: 'DELETE' })` in `lib/api/scrum.ts` after `updateStory`.
- **Hook:** `deleteStory(storyId): Promise<boolean>` —
  `mutate(async () => { await api.deleteScrumStory(storyId); return true; }, 'Couldn’t delete the story',
  'Story deleted').then((ok) => ok === true)`. A refused delete surfaces the server's `detail` as the
  error toast (`ApiError.message`), e.g. the 409 text; preview mode is refused by `previewGuard` as
  an info notice like every other write.
- **Page:** `const [deletingStory, setDeletingStory] = useState(false)`;
  `handleDeleteStory = async (id) => { setDeletingStory(true); const ok = await deleteStory(id);
  setDeletingStory(false); if (ok) closeStory(); }`. `closeStory` already clears `?story=` and any
  stale `?task=` (`:181-184`), so a `?task=` deep link into the deleted story cannot linger. The modal
  stays open on failure (the toast says why).
- **UI (`StoryModal`):** props `onDeleteStory: () => void` and `deleting?: boolean`. In the footer, right
  of the sprint select, a `story-modal__delete` button "Delete story" — only when `canWrite &&
  isBacklogStory(story)`. Danger outline: `border: 1px solid var(--gt-error); color: var(--gt-error-text);
  background: var(--gt-gray-0); &:hover { background: var(--gt-error-soft); }`, otherwise the
  `__archive` metrics it replaces. Clicking it opens the existing sticky confirm (`story-modal__confirm`,
  `role="alertdialog"`); the modal's confirm state becomes
  `confirm: { kind: 'task'; task: ApiScrumTask } | { kind: 'story' } | null`. The confirm's Cancel
  button gets `autoFocus` (an alertdialog must receive focus; applies to the task confirm too).
  Copy, `n = story.tasks.length`:
  - `n === 0`: `Delete US-6? Its comments go too. This can't be undone.`
  - else: `Delete US-6 and its {n} task{n === 1 ? '' : 's'}? Their comments and history go too. This can't be undone.`
  Buttons: `Cancel` / `Delete story`. While `deleting`, the Delete button shows the G spinner with
  `Deleting…`, `aria-busy`, and ignores clicks (guard in the handler).
- **Catalog:** after `update_story` add
  ```json
  {
    "id": "delete_scrum_story", "title": "Delete a backlog story and its tasks", "role": "project-member",
    "method": "DELETE", "endpoint": "/api/scrum/stories/{story_id}", "uiRoute": "/app/projects/{projectId}/board",
    "note": "Backlog stories only: 409 'Move the story to the backlog before deleting it' for a story in a sprint. Removes the story's tasks, comments and move history."
  }
  ```

### C. Sprint select in the story modal (Backlog 2)

In `StoryModal`'s footer `<select>` (label "Sprint"):
- `isBacklogStory(story)`: `value=""`, first option `<option value="" disabled>Move to a sprint…</option>`,
  then the sprints. A legacy archived story with a stale `sprint_id` therefore shows the placeholder,
  and picking any sprint (its old one included) PATCHes `{sprint_id}` and normalises it.
- In a sprint: `<option value="">Backlog</option>` then the sprints, as today.
- Every sprint is listed; a completed one is labelled `{name} (completed)` (modal select only).

### D. Comments

- `CommentThread` props: `parent: { kind: 'stories' | 'tasks'; id: string; key: string }` (the API's
  own literals, `lib/api/scrum.ts:100,104`), `members`, `onError`, `onPosted?`. Composer label
  `Comment on {parent.key}`; error fallback `Couldn’t post your comment on {parent.key}`. Callers key
  it by `parent.id` so a different parent starts with an empty thread and draft.
- **Task thread:** `TaskEditorModal` (edit mode only, `editing`) renders
  `<section className="task-editor__comments"><h3 className="task-editor__section-title">Comments</h3>
  <CommentThread key={task.id} parent={{ kind: 'tasks', id: task.id, key: task.key }} … /></section>`
  **after** the `<footer>` (Save/Cancel stay within the first screen; the backdrop already scrolls a
  tall dialog, `TaskEditorModal.scss:11-24`). `members` is already a prop; add
  `onCommentError?: (m: string) => void` and `onCommentPosted?: () => void` (optional, so create
  mode and tests omit them). `ScrumBoardPage` passes `push('error', m)` and `refresh`, as it does for the
  story modal today (`:454-455`). Posting never touches the form: the editor's fields are `useState`
  seeded from `task` and the page renders the editor without a key, so a refetch re-renders it with
  the same state. Add `key={openTaskPair.task.id}` on the edit-mode `<TaskEditorModal>` so a `?task=`
  change to another task resets the form while a refetch of the same task does not.
- **Story thread:** `StoryModal` renders `<section className="story-modal__comments">` with heading
  `Comments` and `<CommentThread key={story.id} parent={{ kind: 'stories', … }} … />` after the task
  section and before the footer. Rendered for staff too (D2: staff comment).
- `StoryModal` drops `focusTaskId`, `focusedTask`, `focusRef`, the scroll-into-view effect branch, the
  `--focused` row class and its SCSS; the close button still takes focus on mount.
- After a post, `onPosted → refresh()` keeps card counts in step (today's wiring).
- `comment_count` on story cards: not shown (open question 3).

### E. Story modal task rows (Board 6) and the keyboard path

- E1. The status `<select>` in each `StoryModal` task row becomes
  `<span className="story-modal__task-status">{statusLabel(t.status)}</span>` (`config/scrumTags.ts:29`;
  labels are `TODO` / `In Progress` / `Done`, the column headers' source). Drop `onMoveTask`,
  `BOARD_COLUMNS` and the `BoardStatus` import from `StoryModal`; rewrite its docstring. SCSS: replace
  `&__task-status select` with `&__task-status { font-size: 11px; color: var(--gt-text-tertiary);
  flex-shrink: 0; }` (keep `&__sprint select`).
- E2. **The keyboard path moves to the task's own detail**, where the original spec put it (F5): the
  task editor gets a `Status` select. New optional prop `onMove?: (to: BoardStatus) => void`. When
  present (edit mode), right under the `<h2>`: label `Status`, `<select id="task-editor-status"
  value={task.status}>` over `BOARD_COLUMNS`, `onChange → onMove(value)`, hint `Applies right away.`
  (class `task-editor__hint`). The page passes
  `onMove={canWrite && !isBacklogStory(openTaskPair.story) ? (to) => moveTask(openTaskPair.task.id, to) : undefined}`:
  `moveTask` is optimistic and only knows sprint stories (`useScrumBoard.ts:159`), and staff never
  move. Update the comment in `ScrumBoard.tsx:25-26` to name the task editor. (Approved by the
  maintainer on 2026-10-15.)

### F. Story card expand button (Board 7)

`ScrumBoardPage.scss`, next to `.story-slot`: `.story-slot > .gt-story .gt-story__top { padding-right: 24px; }`
(24px button + 6px offset − 14px card padding + 8px gap). The slot-scoped rule leaves `scrum.scss`
(a 1:1 port) untouched. The button only ever overlapped the top row (title starts ~40px down).

### G. Busy submit buttons (Board 2)

While a write is in flight the button keeps its colour, stays enabled and focusable, shows a spinning
lucide `Loader2` (`size={14}`, `aria-hidden`) before a busy label, sets `aria-busy="true"`, and ignores
clicks through the existing in-flight guard. `disabled` (faded) remains only for "can't submit yet"
(empty title, invalid PR link, empty repo URL, empty or over-long comment).

- `frontend/src/styles/_motion.scss`: add `@keyframes gt-spin { to { transform: rotate(360deg); } }` and
  ```scss
  /// A lucide icon spinning inside a busy button (design primitives `.gt-button__spinner`).
  /// Slower, not stopped, under reduced motion so the busy state stays visible.
  @mixin gt-spinner {
    flex-shrink: 0;
    animation: gt-spin 0.7s linear infinite;
    @media (prefers-reduced-motion: reduce) { animation-duration: 1.6s; }
  }
  ```
- Per button: a `&__spinner { @include gt-spinner; }` rule and `[aria-busy='true'] { cursor: progress; }`
  on the submit class. Buttons and busy labels:
  | File | Button | Idle | Busy |
  |---|---|---|---|
  | `TaskEditorModal` | `task-editor__submit` | `Save task` / `Add task` | `Saving…` |
  | `StoryEditorModal` | `story-editor__submit` | `Create story` | `Creating…` |
  | `BoardSettingsModal` | `board-settings__add-button` | `Add repository` | `Saving…` |
  | `CommentThread` | `gt-comments__send` (rule in `scrum.scss`, note the delta) | `Comment` | `Posting…` |
  | `StoryModal` confirm | `story-modal__confirm-delete` | `Delete story` | `Deleting…` |
  `disabled` expressions become: task editor `!title.trim() || prInvalid`; story editor `!title.trim()`;
  settings `!repoUrl.trim()`; comments `!draft.trim() || tooLong`. The colour never fades, and the
  button must not change width between idle and busy: give each submit class a `min-width` that fits
  its longest state (spinner + busy label, or the idle label), so the footer doesn't shift.

### H. Points cap (Board 1)

In `StoryModal`, `const capped = remainingStoryPoints(story) === 0` (null when the story has no points,
so never capped; 0 also when tasks already exceed the budget). "Add task" gets `disabled={capped}` and
`aria-describedby="story-modal-cap"` when capped, followed by
`<p className="story-modal__cap" id="story-modal-cap">All {story.points} points are assigned. Raise the
story's points to add a task.</p>` (`margin: 6px 0 0; font-size: 11px; color: var(--gt-text-tertiary)`).
UI-only, like the budget rule it completes; a teammate using the budget while the editor is open, or the
catalog's `create_scrum_task`, can still add a task — accepted.

## File-by-file change list

**Backend**
- `app/scrum/models.py`: drop `UpdateStoryRequest.archived`.
- `app/scrum/controller.py`: `STORY_IN_SPRINT`, `_in_backlog`, `update_story` (A), `delete_story` (B);
  touch the `get_summary` comment at `:850-851` ("legacy archived").
- `app/scrum/views.py`: `delete_story`. `app/scrum/url.py`: the DELETE route.
- `app/search/controller.py`: `_in_backlog`, `_stories`, `_tasks` (A).

**Frontend**
- `lib/api/scrum.ts`: `deleteScrumStory`. `lib/api/types.ts`: `ApiUpdateStoryBody`, `ApiScrumStory` docs.
- `features/scrum/utils/backlog.ts` (new): `isBacklogStory`.
- `features/scrum/hooks/useScrumBoard.ts`: `deleteStory`, `updateStory` refetch test, return it.
- `features/scrum/pages/ScrumBoardPage.tsx`: `deletingStory`, `handleDeleteStory`, BacklogRow props,
  StoryModal props (`onDeleteStory`, `deleting`, no `onMoveTask`), TaskEditorModal props
  (`key`, `onMove`, `onCommentError`, `onCommentPosted`), empty-state copy.
- `features/scrum/pages/ScrumBoardPage.scss`: F rule.
- `features/scrum/components/StoryModal.tsx` + `.scss`: A, B, C, D, E1, H.
- `features/scrum/components/TaskEditorModal.tsx` + `.scss`: D, E2, G.
- `features/scrum/components/CommentThread.tsx`: D, G.
- `features/scrum/components/BacklogRow.tsx`: A.
- `features/scrum/components/StoryEditorModal.tsx` + `.scss`, `BoardSettingsModal.tsx` + `.scss`: G.
- `features/scrum/components/ScrumBoard.tsx`: comment only (E2).
- `features/scrum/scrum.scss`: drop `.gt-backlog-row__archived`; `.gt-comments__spinner`; header deltas.
- `styles/_motion.scss`: `gt-spin`, `gt-spinner`.
- `public/.well-known/grepthink-actions.json`: `update_story`, `delete_scrum_story`.
- Lint will fail on imports left unused (`format`, `RotateCcw` stays, `BOARD_COLUMNS`, `BoardStatus`,
  `useRef` where no longer used): remove them.

## Copy (final)

| Where | Text |
|---|---|
| Backlog row button | `Move to {sprint name}` (aria-label `Move {key} to {sprint name}`) |
| Backlog empty state | `Stories that aren't in a sprint show up here.` |
| Story modal sprint placeholder | `Move to a sprint…` |
| Completed sprint option | `{name} (completed)` |
| Delete button | `Delete story` |
| Delete confirm, no tasks | `Delete {key}? Its comments go too. This can't be undone.` |
| Delete confirm, n tasks | `Delete {key} and its {n} task(s)? Their comments and history go too. This can't be undone.` |
| Confirm buttons | `Cancel` / `Delete story` (busy: `Deleting…`) |
| Delete toasts | `Story deleted` / `Couldn’t delete the story` (or the server's detail) |
| 409 detail | `Move the story to the backlog before deleting it` |
| Comments headings | `Comments` (both modals) |
| Comment composer | `Comment on {key}` (aria-label) |
| Task editor status | label `Status`, hint `Applies right away.` |
| Cap line | `All {points} points are assigned. Raise the story's points to add a task.` |
| Busy labels | `Saving…` / `Creating…` / `Posting…` / `Deleting…` |

## Testing

Conventions (`backend/README.md` Testing): one test per call, refusals in `test_scrum_authz.py`,
files named for the unit, `fake.executes` budgets, no framework tests. `test_api_surface.py` covers
the new route's 401 on its own.

**Backend**
- `tests/test_scrum_stories_tasks.py` (add a `SPRINT = {"id": "sp1", "project_id": PID, …}` seed row):
  - `test_update_story_sprint_write_clears_the_legacy_archive_flag` — parametrize target `("sp1", None)`;
    story `sprint_id="sp1", archived_at="2026-09-01T00:00:00Z"`; stored `archived_at is None`,
    `sprint_id == target`.
  - `test_update_story_ignores_an_archived_field` — `fields={"archived": True}` returns the story
    unchanged; stored row has no `archived_at`; no `update` query in `db.queries`.
  - `test_delete_story_removes_a_backlog_story` — `sprint_id=None`; `db.rows("user_stories") == []`;
    `db.executes <= 3`. Comment: tasks, comments and moves cascade in Postgres, not in the fake.
  - `test_delete_story_removes_a_legacy_archived_story_whatever_its_sprint` — `sprint_id="sp1"` +
    `archived_at` set → deleted.
  - `test_delete_story_refuses_a_story_in_a_sprint` — `(409, controller.STORY_IN_SPRINT)`, row kept.
  - `test_delete_story_404_when_missing`.
  - Replace `test_update_story_archive_sets_the_timestamp` (the flag is gone).
- `tests/test_scrum_authz.py`: `test_staff_cannot_delete_a_story` parametrized over
  `INSTR, TA, MEETING_TA` → `(403, controller.MEMBERS_ONLY)`, row kept.
- `tests/test_scrum_endpoints.py`: `test_delete_story_route_answers_204` (`client.delete`, member token).
- `tests/test_search_index.py`: give `st9` `sprint_id=SP1` (a legacy archived row that still names a
  sprint); `EXPECTED_STUDENT` gains
  `("story","st9"): ("Old idea", "1 pts · Grepthink 2.0", f"{BOARD}?view=backlog&story=st9")` and
  `("task","t4"): ("Task of an archived story", "Grepthink 2.0", f"{BOARD}?view=backlog&task=t4")`;
  update the comment at `:490`. TA/instructor expectations are unaffected (st9/t4 are UID's).
- `tests/test_scrum_moves.py:84` docstring: drop "archived" (comment only).

**Frontend** (mock `@/lib/api` wherever a thread now renders: `storyModal.test.tsx` and
`taskEditor.test.tsx` must `mockResolvedValue({ comments: [] })` for `getScrumComments`, or the
effect's `.then` throws; `ScrumBoardPage.test.tsx` already does and needs `deleteScrumStory: vi.fn()`)
- `__tests__/storyModal.test.tsx`:
  - `shows each task's status as text, with no way to move it` (no `combobox` named `Status of`;
    text `TODO`).
  - `disables Add task at the points cap and says why` (points 5, tasks 3+2; button disabled,
    `aria-describedby` resolves to the cap line; with points 8 it is enabled).
  - `never caps a story without points`.
  - `offers Delete story to a backlog story only` (sprint_id null → button; sprint_id set → none;
    legacy `archived_at` set + sprint_id set → button).
  - `confirms before deleting, then calls onDeleteStory` (confirm text for 2 tasks; Cancel has focus;
    click `Delete story` → `onDeleteStory` called once).
  - `shows "Move to a sprint…" and no Backlog option for a backlog story`; `offers Backlog to a sprint
    story`; `labels a completed sprint`.
  - `renders the story's comment thread` (`getScrumComments` called with `('stories', 's1')`;
    composer `Comment on US-1`).
  - `gives staff no Delete story and no sprint select, but the comment thread`.
- `__tests__/taskEditor.test.tsx`:
  - `shows the comment thread for an existing task only` (edit: `('tasks', 'a')` called, composer
    `Comment on T-1`; create: no composer).
  - `keeps unsaved edits when the thread posts and the parent re-renders` (type a title; rerender with
    a new `task` object of the same id and `comment_count + 1`; title value kept).
  - `moves the task from its status select right away` (`onMove` called with `'done'`; `onSave` not).
  - `stays enabled while saving, with aria-busy, and ignores a second click` (`saving`: button
    `Saving…` not disabled, `aria-busy="true"`, click → `onSave` not called).
- `__tests__/comments.test.tsx`: `renderThread` uses `parent={{ kind: 'tasks', id: 't1', key: 'T-1' }}`;
  the `StoryModal comment thread` describe becomes `TaskEditorModal comment thread` — rerender with
  task `b` → empty composer, last call `('tasks', 'b')`; add `posts to a story when the parent is a
  story` (`createScrumComment('stories', …)`), and `keeps Comment enabled while posting, with aria-busy`.
- `__tests__/storyEditor.test.tsx`: `blocks a double submit while saving` → `Creating…` is not disabled,
  has `aria-busy="true"`, click → `onCreate` not called.
- `__tests__/boardSettings.test.tsx`: `keeps Add repository enabled while saving` (pending promise →
  `Saving…`, `aria-busy`, not disabled).
- `__tests__/ScrumBoardPage.test.tsx`: replace `archives a story from the footer` with
  `deletes a backlog story and closes it` (`?view=backlog&story=s9`: Delete story → confirm → 
  `deleteScrumStory('s9')`; refetch returns a board without s9; no dialog; path
  `/app/projects/p1/board?view=backlog`) and `offers no Delete story for a sprint story`; replace
  `moves a task from the status select` with `moves a task from the task editor's status select`
  (open `Build form`, `selectOptions(getByLabelText('Status'), 'done')` → `moveScrumTask('a', 'done')`);
  in `opens a story from its card…` assert the status text instead of the combobox; add
  `moves a backlog story to the shown sprint` (Backlog tab → button `Move US-9 to Sprint 1` →
  `updateStory('s9', { sprint_id: 'sp1' })`); add `a refused delete keeps the story open and
  explains` (`deleteScrumStory` rejects with `new Error('Move the story to the backlog before deleting
  it')` → dialog still there, toast text present).
- `__tests__/useScrumBoard.test.ts` (mock `deleteScrumStory`): `deleteStory refetches, reports success
  and resolves true`; `a refused delete resolves false with the server's reason`.
- `__tests__/scrumComponents.test.tsx`: `BacklogRow` → `names the sprint in its move button`
  (`Move US-1 to Sprint 2`, aria-label `Move US-1 to Sprint 2`), and no "archived" text for a row
  with `archived_at` set.
- `__tests__/scrumUtils.test.ts`: `isBacklogStory` — null sprint → true; sprint → false; sprint +
  legacy `archived_at` → true.

**By hand** (dev server on this branch, DEV Trailhead data): move legacy US-6 to the shown sprint and
back; delete a backlog story with tasks and confirm the board, search index and task cards agree; post
a task comment with unsaved edits in the editor; post a story comment as a TA; hover a story card with
points and an estimate; watch each Save button while a write is slow (DevTools throttling).

## Open questions — answered

1. **Hide completed sprints from "Move to a sprint…"?** No: list every sprint and label completed ones
   `(completed)`. Teams do file late work into the sprint it belonged to; the label keeps the odd
   choice visible without blocking it, and the row button already names its target.
2. **Where does the task editor's comment section sit?** After the Save/Cancel footer. The form and
   its actions stay on the first screen; the thread grows below, and the backdrop already scrolls a
   tall dialog (`TaskEditorModal.scss:11-24`).
3. **Story-comment count on story cards?** Not now. The card is already crowded (Board 7), nobody
   asked, and the count is one click away in the modal; `comment_count` stays in the payload.
4. **409 message, and Delete on the backlog row?** Keep the message; it names the one thing to do.
   Delete only in the modal: one destructive path, one confirm, and the row keeps a single action.

## Follow-ups found during review (not in this batch)

- `Header.tsx:26-39` `notificationPath` has no case for `scrum_task` / `scrum_story`, so a mention
  notification (`notify_mention`, `entity_id="{project}:{id}"`) opens nothing. Route them to
  `/app/projects/{pid}/board?task=` / `?story=`.
- `TaskEditorModal` takes no `canWrite`: staff open an editable form whose Save answers 403.
- `useScrumBoard.moveTask` ignores tasks of backlog stories (`:159`); the UI hides the control for
  them (E2), the API accepts the move.
- Later cleanup: a migration normalising legacy rows (`sprint_id = NULL, archived_at = NULL`) and
  dropping `archived_at`; then remove the reads in `get_board`, `get_summary`, `_live_burnup_totals`,
  search, `isBacklogStory`, `StoryOut.archived_at`, the analytics SQL (`analytics_live_tasks`,
  `analytics_scrum`) and the "archived stories" sentence in `AnalyticsPage.tsx:27`.
