# Scrum Board Sprint Picker with Progress — Design Spec

**Date:** 2026-10-16
**Branch:** `feat/scrum-sprint-picker`, stacked on `fix/scrum-board-batch1` (head `21a99779`; not yet merged)
**Status:** Reviewed against the code on 2026-10-16 (Fable); implementation-ready. The maintainer asked
to "plan and do" this batch, so every open question below ends in a decision. Amended the same day after
browser verification: D7.

## The ask (maintainer, 2026-10-15, Board note 3)

"The sprint drop down on the scrum board — let's add a hover that allows to select a sprint while also
viewing the progress of it (like a progress bar)."

## Decisions

- **D1. The bar measures tasks done.** The project page's `SprintProgressCard` already draws sprint
  progress as `counts.done / total` tasks (`features/app/components/Project/SprintProgressCard.tsx:102-104`);
  the picker uses the same measure, so the two never disagree, and a team that doesn't estimate still
  gets a bar. Each row also prints points when the sprint has any: done = points of done tasks, total =
  story points — the burnup's units (`_totals`, `app/scrum/controller.py:474-478`).
  *The maintainer was told "completed points out of total"; switching the bar to points is one line
  (`percentDone(points_done, points_total)`).*
- **D2. Opens on click (and Enter / Space / ArrowDown / ArrowUp), not on hover.** Rows highlight on hover
  (`.gt-menu__item:hover`, `components/Menu/Menu.scss:25`). Hover-to-open fails keyboard and touch users and
  opens by accident; the maintainer can still ask for it.
- **D3. Live numbers, no extra queries.** `get_board` loads every story (round 1, `controller.py:659-661`)
  and every task (round 2, `:676-682`) and already computes any sprint's live totals from those rows
  (`live_stories` `:762`, `sprint_totals` `:765`; the cumulative loop at `:814-824` calls it for every
  sprint without a snapshot). Progress for all sprints comes from the same rows: the round-trip budget in
  `tests/test_scrum_board.py:135` (`<= 12`) does not move.
- **D4. The switch keeps its spinner; focus comes back afterwards.** `selectSprint` sets `loading`
  (`hooks/useScrumBoard.ts:147-153`) and the page then renders `ScrumBoardSkeleton` in place of
  everything (`pages/ScrumBoardPage.tsx:254`), which unmounts the picker. A keyboard user's focus would
  land on `body`. The page refocuses the picker's trigger once the switched board is on screen (see
  "ScrumBoardPage"). Not for the `?sprint=` deep link, which also calls `selectSprint`
  (`ScrumBoardPage.tsx:143-153`): nothing had focus. *Follow-up, not this batch:* keep the header mounted
  during a switch (skeleton only in the panel, pending sprint name on the trigger) — needs a
  `pendingSprintId` in the hook.
- **D5. Design system.** The export has no sprint selector with progress: its board header is a native
  `Select` with "Sprint 3 · Jan 12 – Jan 25" labels
  (`design/design_handoff_scrum_board/scrum-board.reference.html:126-131`), and its `ProgressBar`
  primitive (`design/components/display/ProgressBar.jsx`, `.gt-progress`, 4/8/12px tracks) is not ported
  (no `gt-progress` in `frontend/src`). The picker composes the ported `Popover` + `Menu`
  (`components/{Popover,Menu}`) and draws its bar with the card's tokens at the primitive's `sm` height
  (4px). Porting `ProgressBar` for both the card and the picker is a follow-up.
- **D6. Resolved open questions** (details in "Open questions, answered"): one chronological list, no
  groups; rows are `menuitemradio`; the trigger shows no bar.
- **D7. Phones and an older backend** (added after browser verification). Three gaps the review missed:
  (a) `align="end"` hangs the menu from the trigger's right side, but the gear and New Story follow the
  trigger, so at 382px the menu started 122px off the left of the screen. Once open, the picker moves the
  menu right just enough to stay 24px (the board's padding) inside the viewport, centring it when there
  is less to spare — `DefinitionPopover`'s pattern (`features/analytics/components/DefinitionPopover.tsx`).
  (b) A long sprint name kept the 240px trigger from shrinking, which squeezed the gear to 24px and
  wrapped New Story onto two lines: the picker now gives way (`min-width: 0` down to the trigger) and those
  two never shrink. (c) The two Vercel projects deploy separately, so a new client can briefly meet an old
  backend: `progress` is optional, and a row without it shows the dates alone (it crashed the menu).
  Rows also keep one height with or without the `%` (the progress line is 18px either way).

## Backend

`app/scrum/controller.py` only. No route, model or `lib/api/scrum.ts` change.

Add a module-level helper next to `_totals`:

```python
def _sprint_progress(stories: list[dict]) -> dict:
    """Live progress of one sprint from its live stories (``tasks`` embedded): tasks done over
    tasks, and points of done tasks over story points — the burnup's units (``_totals``)."""
    tasks = [t for s in stories for t in s["tasks"]]
    done = [t for t in tasks if t.get("status") == "done"]
    points_total, points_done = _totals(stories, done)
    return {
        "tasks_done": len(done),
        "tasks_total": len(tasks),
        "points_done": points_done,
        "points_total": points_total,
    }
```

In `get_board`, after `live_stories` (`:762`): compute every sprint once and derive the existing
`sprint_totals` from it, so there is one pass and one definition of "live":

```python
    progress = {s["id"]: _sprint_progress(live_stories(s["id"])) for s in sprints}

    def sprint_totals(sid: str) -> tuple[int, int]:
        p = progress[sid]
        return p["points_total"], p["points_done"]
```

Return the sprints with their progress attached, order unchanged (`starts_at`, `:657`):

```python
        "sprints": [{**s, "progress": progress[s["id"]]} for s in sprints],
```

Every sprint in the response therefore gains

```json
"progress": { "tasks_done": 5, "tasks_total": 8, "points_done": 12, "points_total": 20 }
```

counted over its *live* stories (`sprint_id == sprint` and not legacy-archived — the `live_stories`
rule). A backlog story's tasks count nowhere. `get_summary` and the other endpoints are unchanged.

## Frontend

### Types — `lib/api/types.ts`

```ts
export interface ApiSprintProgress {
  tasks_done: number;
  tasks_total: number;
  /** Points of done tasks over story points: the burnup's units. */
  points_done: number;
  points_total: number;
}
/** A sprint as the board lists it: with its live progress. */
export interface ApiScrumBoardSprint extends ApiScrumSprint {
  /** Missing only from a backend older than this client (the two deploy separately). */
  progress?: ApiSprintProgress;
}
```

`ApiScrumBoard.sprints: ApiScrumBoardSprint[]`. `ApiScrumSprint` stays as it is: `ApiScrumSummary.sprint`
(`:827`), `ApiUpdateSprintBody` (`:862`), `StoryModal` (`:22`) and `StoryEditorModal` (`:10`) keep taking
it, and `board.sprints` still satisfies them.

### Shared sprint helpers — `features/scrum/utils/sprints.ts` (new)

Non-component module (react-refresh). Moved out of `SprintProgressCard.tsx:13-22` and imported there
from `@features/scrum/utils/sprints`:

```ts
export const STATUS_LABELS: Record<ApiScrumSprint['status'], string> = {
  active: 'Active', planned: 'Planned', completed: 'Completed',
};
/** "Sep 7 – Sep 20" from the sprint's ISO dates. */
export function sprintDates({ starts_at, ends_at }: Pick<ApiScrumSprint, 'starts_at' | 'ends_at'>): string
/** 0–100 share of `total` that is `done`, rounded; 0 when there is nothing to count. */
export function percentDone(done: number, total: number): number
```

`SprintProgressCard` uses `percentDone(counts.done, total)` in place of its inline arithmetic (`:104`).

### `SprintStatusPill` — `features/scrum/components/SprintStatusPill.tsx` + `.scss` (new)

`({ status }: { status: ApiScrumSprint['status'] })` →
`<span className={`sprint-status sprint-status--${status}`}>{STATUS_LABELS[status]}</span>`.
The `.sprint-status` rules are the card's `&__status` block (`SprintProgressCard.scss:35-55`) moved:
padding `2px var(--gt-space-sm)`, `--gt-radius-pill`, `--gt-text-caption`, `--gt-weight-medium`;
active `--gt-success-soft` / `--gt-success-text`, planned `--gt-info-soft` / `--gt-info-text`,
completed `--gt-surface-sunken` / `--gt-text-secondary`. `SprintProgressCard` renders the pill
(`:110-112`) and drops the block from its SCSS; its test (`getByText('Active')`) is unchanged.

### `Menu` additions — `components/Menu/Menu.tsx`

Two small, recorded additions (the `checked` docstring at `:56-59` is the precedent; extend it):

- `MenuItem` gains `radio?: boolean`: with `checked`, the row is a `menuitemradio` (one choice in the
  menu) instead of a `menuitemcheckbox`. `ITEMS` (`:4`) adds `[role="menuitemradio"]:not(:disabled)`,
  so arrow keys, Home/End and autofocus reach the rows.
- `Menu.autoFocus?: boolean | 'checked'`: `'checked'` focuses the row with `aria-checked="true"` on
  mount, else the first item (`:20-23`).

### `SprintPicker` — `features/scrum/components/SprintPicker.tsx` + `.scss` (new)

Replaces the header `<select>` (`ScrumBoardPage.tsx:286-293`).

```ts
interface SprintPickerProps {
  /** In starts_at order, as the API returns them. */
  sprints: ApiScrumBoardSprint[];
  selectedId: string | null;
  /** Called for a sprint other than the selected one. */
  onSelect: (sprintId: string) => void;
  /** The trigger button. React 19.2 passes `ref` as an ordinary prop — the first function component in
   *  this codebase to take one, so no precedent to copy; no `forwardRef`. */
  ref?: Ref<HTMLButtonElement>;
}
```

State: `open` (`useState`), `wrapperRef` (outer `<span className="sprint-picker">`, the pattern of
`ProjectMembersPopover.tsx:97-98` and `:171-186`), `triggerRef` merged with the `ref` prop. `selected =
sprints.find((s) => s.id === selectedId) ?? null`; the trigger reads `selected?.name ?? 'Sprint'`.

**Trigger** (the Popover's `anchor`): `<button type="button" className="sprint-picker__trigger"
aria-haspopup="menu" aria-expanded={open} aria-label={`Sprint: ${name}`} title={name}>` with
`<span className="sprint-picker__trigger-name">{name}</span>` and
`<ChevronDown size={14} aria-hidden="true" className="sprint-picker__chevron" />` (lucide). `onClick`
toggles; `onKeyDown` on `ArrowDown` / `ArrowUp` calls `preventDefault()` and opens (Enter and Space are
the button's own click). `aria-label` keeps the visible name inside the accessible name (WCAG 2.5.3).

**Surface:** `<Popover open onClose={close} anchor={trigger} placement="bottom" align="end"
padded={false}>` wrapping `<Menu ariaLabel="Sprints" autoFocus="checked" onClose={close}
onBlur={onMenuBlur} className="sprint-picker__menu">`. Focus lands on the selected row whether the
menu was opened by pointer or keyboard; arrow keys wrap (Menu); Home/End jump.

**Row** — one `MenuItem` per sprint, in the given order:

```tsx
<MenuItem key={s.id} radio checked={s.id === selectedId} className="sprint-picker__item"
  icon={<Check size={14} aria-hidden="true" />} onSelect={() => choose(s.id)}>
  <span className="sprint-picker__head">
    <span className="sprint-picker__name">{s.name}</span>
    <SprintStatusPill status={s.status} />
  </span>
  <span className="sprint-picker__meta">{sprintDates(s)} · {summary}</span>
  <span className="sprint-picker__progress">
    <span className="sprint-picker__bar" aria-hidden="true">
      <span className="sprint-picker__bar-fill" style={{ width: `${percent}%` }} />
    </span>
    {p.tasks_total > 0 && <span className="sprint-picker__pct">{percent}%</span>}
  </span>
</MenuItem>
```

with `p = s.progress`, `percent = percentDone(p.tasks_done, p.tasks_total)` and
`summary = p.tasks_total === 0 ? 'No tasks yet' : `${p.tasks_done}/${p.tasks_total} tasks${p.points_total > 0 ? ` · ${p.points_done}/${p.points_total} pts` : ''}``
— the story card's own vocabulary ("1/2 tasks · 3/8 pts", `StoryCard.tsx:50-52`). Spans only: the row is
a `<button>`, so `div`s are invalid, and the bar is decorative (`aria-hidden`, as `StoryCard.tsx:55`) —
a labelled `progressbar` inside the row would be read into the row's name. The row's accessible name
is its text: "Sprint 2 Active Sep 7 – Sep 20 · 5/8 tasks · 12/20 pts 63%". Without `progress` (D7c) the
row is the head and the dates alone: no summary, no bar.

**Closing.** The Popover takes Esc in the capture phase and stops it (`Popover.tsx:40-45`), so `Menu`'s
own Escape branch (`Menu.tsx:34`) never runs inside it: every way out goes through one stable `close`
(`useCallback`, the pattern of `ProjectView.tsx:213-218` and `TaskEditorModal.tsx:94-97`):

```ts
const close = useCallback(() => {
  // Keyboard users were inside the menu, so hand focus back to the trigger first — the row would be
  // unmounted under it. After a click outside, the browser then moves focus to what was clicked.
  if (document.activeElement?.closest('.sprint-picker__menu')) triggerRef.current?.focus({ preventScroll: true });
  setOpen(false);
}, []);
const choose = (id: string) => { close(); if (id !== selectedId) onSelect(id); };
const onMenuBlur = (e: FocusEvent<HTMLDivElement>) => {
  // Tab / Shift+Tab out of the menu closes it (menu-button pattern); focus is already elsewhere.
  if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
};
```

Esc → `close` (focus on trigger). Outside click → `close` (Popover's `mousedown`, `Popover.tsx:47-48`).
Pick → `close` then `onSelect`. The selected row → `close` only. Switching is open to anyone who can see
the board: `selectSprint` has no `canWrite` gate (`useScrumBoard.ts:147-153`) and the select was shown to
staff too (`ScrumBoardPage.tsx:286`). No sprints → the page renders no picker (as today, `:286`) and the
Board view's "No sprints yet" explains. One sprint → one checked row (its progress is still worth a look).

Hooks lint (every rule an error, no compiler): refs are read only in handlers, `close` and effects
(`react-hooks/refs` forbids `ref.current` during render); the one `setState` in an effect is D7a's
shift, a `useLayoutEffect` measuring from refs, which the rule allows (as in `DefinitionPopover`);
`onKeyDown`/`onBlur` are plain handlers.

### Styles — `SprintPicker.scss` (`@use '@styles/index.scss' as *;` for `$primary-font` and mixins)

Tokens only (`npm run lint:design` flags bare hex); every token below exists in `styles/tokens/*.css`.

- `.sprint-picker { display: inline-flex; min-width: 0; > .gt-popover-anchor { min-width: 0; } }` — gives
  way when the header's actions run out of room (D7b).
- `&__trigger`: the header's 34px control (`ScrumBoardPage.scss:151-170`): `display: inline-flex;
  align-items: center; gap: 6px; height: 34px; min-width: 0; max-width: 240px; padding: 0 10px` (explicit — the
  scaffold `button` rule in `index.css:51-59` pads `0.6em 1.2em`, see the note at
  `ScrumBoardPage.scss:177-181`); `border: 1px solid var(--gt-border); border-radius: var(--gt-radius-sm);
  background: var(--gt-gray-0); color: var(--gt-text-primary); font-family: $primary-font; font-size:
  12.5px; font-weight: var(--gt-weight-medium); cursor: pointer; @include gt-transition(border-color,
  color)`; `&:hover, &[aria-expanded='true'] { border-color: var(--gt-primary); }`;
  `&:focus-visible { outline: none; box-shadow: var(--gt-focus-ring); }`.
- `&__trigger-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
  `&__chevron { flex-shrink: 0; color: var(--gt-text-tertiary); }`.
- `&__menu { width: min(360px, calc(100vw - 48px)); max-height: min(420px, calc(100vh - 140px));
  overflow-y: auto; }` — many sprints scroll; `focus()` on the checked row scrolls it into view. On a
  phone the menu would run off the left of the screen from `align="end"`; the picker moves it in (D7a:
  24px from either side, the board's padding, `ScrumBoardPage.scss:9`; the sidebar is off-canvas below
  768px, `Layout/Sidebar.scss:34-44`).
- `&__item { height: auto; padding: 8px 10px; align-items: flex-start; }` and
  `&__item .gt-menu__label { display: flex; flex-direction: column; gap: 4px; min-width: 0;
  white-space: normal; }` — `MenuItem` is a 32px, `nowrap` row (`Menu.scss:10,29`).
- `&__item .gt-menu__icon { margin-top: 2px; }` and
  `&__item:not([aria-checked='true']) .gt-menu__icon { visibility: hidden; }` — every row carries the
  check so labels align; only the selected one shows it (`.gt-menu__item--checked .gt-menu__icon` is
  already `--gt-primary`, `Menu.scss:34`).
- `&__head { display: flex; align-items: center; gap: var(--gt-space-sm); }`,
  `&__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
  `&__item[aria-checked='true'] &__name { font-weight: var(--gt-weight-semibold); }`.
- `&__meta { font-size: var(--gt-text-caption); font-weight: var(--gt-weight-regular); color:
  var(--gt-text-tertiary); font-variant-numeric: tabular-nums; }` (wraps if it must).
- `&__progress { display: flex; align-items: center; gap: var(--gt-space-sm); min-height: 18px; }` (one
  line with or without the `%`, so every row is one height; `&__pct` sets `line-height: 18px`),
  `&__bar { flex: 1; display: block; height: 4px; overflow: hidden; border-radius: var(--gt-radius-pill);
  background: var(--gt-surface-sunken); }` (the card's track, `SprintProgressCard.scss:92-98`, at the
  design primitive's `sm` height), `&__bar-fill { display: block; height: 100%; border-radius: inherit;
  background: var(--gt-primary); }` (no width transition: rows mount at their value),
  `&__pct { min-width: 3ch; text-align: right; font-size: var(--gt-text-caption); color:
  var(--gt-text-tertiary); font-variant-numeric: tabular-nums; }`.
- Reduced motion: nothing to add — `index.css:91-96` kills animations and transitions, and
  `Popover.scss:37-40` swaps the slide for a fade.

`ScrumBoardPage.scss`: drop `&__sprint-select select` (`:151`, `:165-170`); add `margin-left: auto` to
`&__header-actions` (`:22-26`) so the row sits at the right when the header wraps (`flex-wrap`,
`justify-content: space-between`, `:14-20`, leaves a lone wrapped item at the start), and `min-width: 0`
so it is never wider than that line; `flex-shrink: 0` on `&__icon-button` and `&__primary` (D7b). The board's three
columns have no narrow layout (`:82-87`); phones are not a supported board layout today, and this batch
only has to avoid making the header worse.

### `ScrumBoardPage`

- Render `<SprintPicker ref={pickerRef} sprints={board.sprints} selectedId={board.sprint_id}
  onSelect={pickSprint} />` where the `<label>`/`<select>` was (`:286-293`), still behind
  `board.sprints.length > 0`. Drop the `sr-only` "Sprint" span with it (the `.sr-only` rule stays: other
  scrum views use it).
- D4: `const pickerRef = useRef<HTMLButtonElement>(null); const refocusPicker = useRef(false);`
  `pickSprint = (id) => { refocusPicker.current = true; void selectSprint(id); }` and
  `useEffect(() => { if (loading || !refocusPicker.current) return; refocusPicker.current = false;
  pickerRef.current?.focus({ preventScroll: true }); }, [loading]);` — runs after the commit that
  mounts the switched board; a failed switch shows the error block and the ref is null. The deep-link
  effect (`:143-153`) keeps calling `selectSprint` directly.
- Comments naming "the sprint select": the page's at `:140-142` ("so the sprint picker is free to move
  on") and the test's at `__tests__/ScrumBoardPage.test.tsx:411-412`.
- `ScrumBoardSkeleton` (`:45`) keeps its 140×34 block for the control.

## Testing

### Backend — `tests/test_scrum_board.py`

Per `backend/README.md` ("one test per call"), the progress assertion joins `test_board_shape_and_burnup`
(same GET) rather than a new test. `_seed` gains a done task on the backlog story,
`_task("d1", "D", 2, "done", "6")` — counted nowhere (`backlog` stays `["D", "E"]`, the burnup numbers
and the budget are untouched). Assert:

```python
    # Live stories only: E is archived, D is backlog (its done task counts nowhere).
    assert {s["id"]: s["progress"] for s in body["sprints"]} == {
        "S1": {"tasks_done": 1, "tasks_total": 2, "points_done": 3, "points_total": 5},
        "S2": {"tasks_done": 1, "tasks_total": 2, "points_done": 5, "points_total": 8},
        "S3": {"tasks_done": 0, "tasks_total": 0, "points_done": 0, "points_total": 3},
    }
```

`test_board_round_trips_do_not_grow_with_sprints` keeps `<= 12`. Authz lives in
`tests/test_scrum_authz.py` — nothing to add.

### Frontend

- **Fixtures** (`__tests__/fixtures.ts`): add `makeSprint(over: Partial<ApiScrumBoardSprint> = {}):
  ApiScrumBoardSprint` — `sp1` / "Sprint 1" / 2026-08-10 → 2026-08-23 / active /
  `progress: { tasks_done: 0, tasks_total: 1, points_done: 0, points_total: 8 }` (makeBoard's one story,
  one todo task, matching `makeSummary`); `makeBoard` uses `[makeSprint()]`. `ScrumBoardPage.test.tsx`'s
  `TWO_SPRINTS` literal (`:34-37`) becomes `[makeSprint(), makeSprint({ id: 'sp2', name: 'Sprint 2',
  starts_at: '2026-08-24', ends_at: '2026-09-06' })]` — tests are type-checked by `tsc -b`
  (`tsconfig.app.json` includes `src`), so a sprint without `progress` fails the build.
- **`__tests__/sprintPicker.test.tsx`** (new; render the component alone, no router). Sprints: sp1
  "Sprint 1" planned 1/4 tasks, 3/8 pts; sp2 "Sprint 2" active, 0/0 tasks, 0/13 pts; sp3 "Sprint 3"
  completed 2/2 tasks, points_total 0. `selectedId="sp2"`.
  1. Trigger: `getByRole('button', { name: 'Sprint: Sprint 2' })`, `aria-haspopup="menu"`,
     `aria-expanded="false"`; no `menu` in the document.
  2. Click opens `getByRole('menu', { name: 'Sprints' })`; `getAllByRole('menuitemradio')` are
     "Sprint 1", "Sprint 2", "Sprint 3" in order; "Sprint 2" is `aria-checked="true"` and has focus;
     "Sprint 1" shows `Planned`, `/Aug 10 – Aug 23/`, `1/4 tasks · 3/8 pts`, `25%`, and its fill has
     `width: 25%`.
  3. `No tasks yet` on "Sprint 2" with no `%` text; "Sprint 3" shows `2/2 tasks` with no `pts`
     and `100%`.
  4. Clicking "Sprint 1" calls `onSelect` once with `'sp1'` and closes the menu.
  5. Clicking the selected row closes without calling `onSelect`; the trigger has focus.
  6. Esc closes; the trigger has focus.
  7. `ArrowDown` on the focused trigger opens with focus on "Sprint 2"; `ArrowDown` moves to
     "Sprint 3"; `Enter` calls `onSelect('sp3')`.
  8. `userEvent.tab()` out of the menu closes it.
  9. `fireEvent.mouseDown(document.body)` closes it.
  10. (D7c) A sprint without `progress` lists its dates alone, with no bar.
  11. (D7a, layout faked as `DefinitionPopover`'s tests do) the menu hangs from the trigger when it fits;
      moves right until its left side is 24px in; is centred with less than 48px to spare.
- **`scrumUtils.test.ts`**: `percentDone(0, 0) === 0`, `(1, 4) === 25`, `(2, 3) === 67`;
  `sprintDates` gives `'Sep 7 – Sep 20'`; `STATUS_LABELS` has the three labels.
- **`ScrumBoardPage.test.tsx`**: "switches sprints from the picker and hands focus back to it" — with
  `getScrumBoard` answering sp2 as the deep-link tests do (`:371-379`): open the picker, click
  "Sprint 2" → `getScrumBoard` last called with `('p1', 'sp2')`, then the trigger reads
  `Sprint: Sprint 2` and `toHaveFocus()`. The `?sprint=` test (`:370-384`) adds: the trigger reads
  `Sprint: Sprint 2` and does not have focus. The staff test (`:349-354`) adds: the picker's trigger is
  enabled.
- **`components/__tests__/designSystemPorts.test.tsx`**: `radio` rows are `menuitemradio` with their
  state and reachable by `ArrowDown`; `autoFocus="checked"` focuses the checked row, and the first item
  when none is checked.
- **`SprintProgressCard.test.tsx`**: unchanged, must pass with the shared helpers and the pill.

Gates before commit: backend `ruff format . && ruff check . && python -m pytest`; frontend
`npm run lint && npm run lint:design && npm run build && npx vitest run`.

## Open questions, answered

1. **Group sprints (Active / Planned / Completed) or one chronological list?** One list, ascending
   `starts_at`, as the API, the old select and the cumulative burnup order them. The pill on every row
   already says the status; groups would reorder time and put separators in the arrow-key path. Focus
   opens on the selected row, so a long list still lands where the user is.
2. **`menuitemcheckbox` or `menuitemradio`?** Radio. A checkbox tells a screen reader each sprint can be
   toggled on its own; the sprint is one choice. `Menu` learns the role in two lines (above).
3. **Bar on the trigger too?** No. The trigger stays name + chevron: the board under it is the current
   sprint's progress (column counts), the project page's card shows the same bar, and a 34px control with
   a bar reads as a second meter. A `--compact` trigger can reuse `sprint-picker__bar` later.
4. **Focus on open?** The selected row, for pointer and keyboard opens alike (`autoFocus="checked"`);
   `ArrowUp` opens the same way. Esc, a pick and the selected row return focus to the trigger; a click
   outside hands it back and the browser moves it on; Tab out closes without touching focus; after a
   switch the page refocuses the trigger (D4).
