# Scrum Board (Part 2 of 2 — Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans, task-by-task. Prefer SMALL task scopes — three long-running subagents stalled during Part 1; anything bigger than ~30 minutes of work should be split.

**Goal:** The per-project scrum board UI at `/app/projects/:projectId/board` — lean, dense, Shortcut-like in feel but built from GrepThink's own design language, against the live Part-1 API (PR #177).

**Architecture:** A lazy route rendering inside the existing `/app` shell. Leaf components port near-verbatim from `design/components/scrum/` (token-exact `scrum.css`); the **page composition deliberately deviates from the handoff layout** where it's clunky — each deviation is recorded in the ⚑L table below (all now decided by the maintainer). The ⚑M design-system gaps were filled by the 2026-08-27 bundle refresh, so no task here is design-gated.

**Tech Stack:** React 19 + TS + SCSS (`.gt-*` classes kept verbatim per D12), HTML5 DnD (Assign-board precedent), hand-rolled SVG burnup (D13), `api.ts` scrum methods, plain `useState`/`useEffect` + optimistic reducer (messages pattern). **No AI UI anywhere** (feature off per maintainer 2026-08-21).

**Inputs:** Spec Part 3 (`docs/superpowers/specs/2026-08-12-scrum-board-design.md`) · design refs `design/components/scrum/` + `design/design_handoff_scrum_board/README.md` · mentions plan (`2026-08-13-mentions-system.md`, M4–M5 land into F8's seams once approved) · Part-1 responses (branch `feat/scrum-board-part1`).

---

## ⚑L — Lean audit (deviations from the handoff, for sign-off)

The handoff design is faithful to the requirements but heavier than the "minified
Shortcut" target. Each row: what the design doc says → the lean call this plan makes.

| # | Handoff design | Lean call in this plan | Cost of the lean call |
|---|---|---|---|
| L1 | 3-across `StoryCard` grid above the board | **DECIDED 2026-08-21 (maintainer): keep the design-doc 3-across grid** — the slim-rail idea is dropped; DnD polish (todo → in-progress → done) is the priority. Story-click still filters the board (active ring per `.gt-story--active`) | — |
| L2 | Right rail (300px) permanently stacking sprint burnup + cumulative burnup + backlog panel | **DECIDED 2026-08-27 (maintainer): the right rail is removed entirely.** The page becomes a three-tab view — `[Board \| Backlog \| Burnup]` segmented switch in the header. **Board** = story grid + the 3 DnD columns at **full width** (more room per column — the DnD polish priority from L1); **Backlog** = BacklogRow list; **Burnup** = its own tab showing *both* charts (sprint + cumulative side by side, which the full width now affords) | Charts are one click away instead of always-on. Pure recomposition — no new design |
| L3 | `ScalePicker` as a permanent full-width row above the story strip (a settings control occupying prime board space on every visit) | Move it into a **Board settings modal** (gear `IconButton` in the board header) together with the D8 **repo manager**. Modal exists ✓, and **Popover now ships too (M1)** — F7 may build straight to the popover composition from `popover.card.html` | None |
| L4 | Task-card audit line (dashed top border) on every moved card | **Kept as designed** — requirement 6 wants the audit visible; it's one 9.5px line. (A tooltip-only variant is possible later if cards still feel tall) | — |
| L5 | Header carries a "Grepthink 2.0 · Team 1" badge | **Dropped** — the app shell + breadcrumb already state project context. Header = title · sprint `<select>` · settings gear · primary "New Story" | — |
| L6 | `AIDraftButton` in header + "Suggest tasks" in modal | **Removed entirely** (feature off). No conditional rendering, no dead UI | Re-adding later = small isolated diff |

Everything else ports as designed: 3 columns + DnD + drag-over states, TaskCard chip
grammar, story modal at 640px, PR chips, tag palette, burnup visual language.

## ⚑M — Missing from the design system (create these first; nothing in Phase 2A blocks on them)

| # | Component | Needed by | What the design should cover |
|---|---|---|---|
| M1 ✅ | **Popover / Menu primitive** | Mention autocomplete, settings popover, card overflow menus | **DELIVERED 2026-08-27** — `design/components/feedback/{Popover,Menu}.{jsx,d.ts}` + `feedback.css`, plus `design/components/scrum/MentionListbox.*` (async-first: local `members` OR `onSearch`, five states, `.gt-mentionbox`) |
| M2 ✅ | **Toast / Snackbar** | Move-rollback, repo saved/deleted, read-only-preview notice | **DELIVERED 2026-08-27** — `design/components/feedback/Toast.{jsx,d.ts}` (`Toast` + `ToastStack`: variants success/error/info/neutral, error+action = sticky, max 3, bottom-right). No interim `Alert` seam needed — F9 ports the real thing |
| ~~M3~~ | ~~Slim story pill~~ | **Dropped 2026-08-21** with L1 — the design-doc StoryCard grid ships instead | — |
| M4 | Mention listbox row | Mentions plan M4 composer | Covered by M1 + one row spec (InitialsAvatar 18px + name); no separate component needed |
| M5 (opt.) | Board skeleton reference | Loading state | Non-blocking — codebase `Skeleton` exists; a design-side reference keeps parity |
| M6 (opt.) | Drawer / side panel | Possible future Shortcut-style story detail replacing the modal | Only if wanted later; the 640px Modal ships in v1 |

## Phase 2A — buildable now (F1–F9)

Conventions: frontend commands from `frontend/` (`npm run build`, `npx vitest run`,
`npm run lint:design`); commit per task with the trailer
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; feature lives in
`frontend/src/features/scrum/`; `.gt-*` class names verbatim from
`design/components/scrum/scrum.css` (D12); all colors via tokens — add
`--gt-purple: #7D3C98;` to `frontend/src/styles/tokens/colors.css` (F2, spec-sanctioned).

### F1 — Route, scaffold, tabs, breadcrumb
- `App.tsx`: lazy `<Route path="projects/:projectId/board" element={<ScrumBoardPage />} />` inside the `/app` tree (charts justify lazy, precedent `App.tsx:38-65`). Not added to `routePermissions` lists.
- `features/scrum/pages/ScrumBoardPage.tsx` + `.scss`: shell-page skeleton (`ScrumBoardSkeleton` exported alongside, page-per-skeleton convention), `bottom-clearance-for-message-widget` mixin, **full-width content column** (L2 removed the 300px rail), padding 20/24 on the `--gt-canvas` background.
- `ProjectView.tsx`: tab strip **Overview | Scrum Board** (port design-system `navigation/Tabs` pattern as scrum-local BEM or reuse `TsrsStepper` idiom — smallest diff wins); board tab navigates with `location.state.projectName` for the breadcrumb.
- `Header.tsx` `buildBreadcrumbs`: case for `/app/projects/:id/board` → `Projects / {name} / Scrum Board`.
- Test: route renders skeleton; breadcrumb unit case.

### F2 — Token + leaf-component ports (pure, no data)
Port from `design/components/scrum/` to typed TSX, one commit per cluster:
1. `scrum.scss` = `scrum.css` verbatim (nested minimally), `--gt-purple` token, ledger-free.
2. `config/scrumTags.ts` (`TASK_TAGS`, `ESTIMATE_SCALES`, `BOARD_COLUMNS`) + `scrumTypes.ts` (UI types over `ApiScrum*`).
3. `TagBadge`, `Chips.tsx` (PointsChip/EstimateChip/PRLinkChip/UserPair — people props become `{user_id, name, image_url}`, avatars via `InitialsAvatar` xs=18/sm=24, lucide `Clock`/`GitPullRequest`/`ArrowRight`).
4. `TaskCard` (lucide `MessageSquare`, `Repeat` audit glyph; `moved` renders `moved_by_name` + `relativeTime(moved_at)` via date-fns), `StoryCard` (design-doc variant — used by L1-fallback and Backlog), `BacklogRow` (lucide `RotateCcw`), `BurnupChart` (SVG port, token classes), `ScalePicker`+`PointPicker`.
- Utils: `rollups.ts` (tasksDone/total, pointsDone, column sums), `prLabel.ts` ("PR #42" / "!17" from `pr_url`+`pr_provider`), `relativeTime.ts`.
- Vitest: rollups, prLabel, TagBadge palette class, BurnupChart path math (labels/points given series).

### F3 — Data layer: `useScrumBoard`
- `hooks/useScrumBoard.ts`: fetch `api.getScrumBoard(projectId, sprintId?)`; expose board slices + `selectSprint`, `refresh`; refetch on window focus; monotonic `requestSeq` ref (messages precedent) so stale responses never commit.
- Optimistic move: `moveTask(taskId, to)` applies locally, calls `api.moveScrumTask`, reconciles with the returned task, rolls back on error (incl. `ReadOnlyPreviewError` → surface via the F9 alert seam). Pure reducer in `utils/boardReducer.ts`, fully unit-tested (apply/confirm/rollback/out-of-order).
- After first board render: fire-and-forget `api.refreshScrumPrStates(projectId)`, patch `updated` map into task state.
- CRUD wrappers (`createStory`, `updateStory`, `createTask`, `updateTask`, `deleteTask`, `createSprint`, `updateSprint`, `updateSettings`) that call `api.*` then `refresh()`.

### F4 — Board columns + DnD
- `components/ScrumBoard.tsx`: port from reference (`text/plain` id payload, drag-over column highlight, 40% ghost, dashed empty target), `useGlobalDragEnd` reuse, `onMove` → hook's optimistic `moveTask`, `onOpenTask` → story modal focused on the task.
- Keyboard path: cards are focusable; status changes are available via the modal's `<select>` (F5) — noted in an `aria-describedby` hint.
- Vitest: render 3 columns, fireEvent dragstart/drop calls `onMove(taskId, 'done')`, same-column drop is a no-op.

### F5 — Story modal (view / edit / create + task rows)
- `components/StoryModal.tsx` on the `ConfirmModal` backdrop/Esc idiom, 640px, design paddings. Modes: **view** (meta row: PointsChip · EstimateChip · UserPair · PointPicker bound to `updateStory`; description via shared `MarkdownText` — plain markdown now, mention chips arrive with the mentions plan; child-task mini-rows: key · title · 2 tags · **status `<select>`** (the DnD a11y fallback, wired to `moveTask`) · delete (ConfirmModal); "Add task" inline row; **Archive story** footer action; **Move to sprint / to backlog** select), **create** (New Story button; title/description/points via PointPicker/estimate/assignee/sprint), **edit** inline via the same fields.
- Opened from TaskCard → scrolls to + highlights that task row (and hosts its comment thread, F8); `?task=` query param opens it directly (mentions deep-link M5 lands free).
- Vitest: create submits `api.createStory` body; status select fires move; archive calls `updateStory({archived: true})`.

### F6 — Page composition (applies L1/L2/L5)
- Header row: page title 20/600 · sprint `<select>` (styled native, primitives/Select look) · gear `IconButton` (opens F7) · primary "New Story".
- **Three-tab sub-view** (L2, SegmentedControl port) — the page has no right rail; every tab is full width:
  - **Board** — 3-across `StoryCard` grid (L1, gap 10; click filters the columns to that story via `.gt-story--active`, click again clears) followed by `ScrumBoard`'s three DnD columns across the full content width.
  - **Backlog** — `BacklogRow` list (archived + unscheduled): restore = `updateStory({sprint_id})` sprint picker, title click = StoryModal.
  - **Burnup** — both charts side by side in one panel row (`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`, stacking under ~700px): "Sprint N burnup" (`board.burnup.sprint`, subtitle = date range) and "Cumulative" (`board.burnup.cumulative`, labels S1…Sn), each with its own `n/m pts` header stat.
- Tab state lives in the URL (`?view=board|backlog|burnup`, default board) so a reload/deep link keeps the tab; `?task=` still opens the StoryModal (F5) regardless of tab.
- Empty states: no sprints → EmptyState-style panel with "Create sprint" (opens a small create-sprint modal: name + two `DatePickerField`s); empty columns per design; Burnup tab with no sprint shows the same create-sprint prompt.

### F7 — Board settings modal (Scale + D8 repos)
- Sections: **Estimate scale** (`ScalePicker` → `api.updateScrumSettings`; hint "changing the scale only changes offered values") and **Repositories** (D8): `api.getScrumRepos` on open → rows (provider icon · repo_url · `has_token` chip "token set" · delete IconButton w/ confirm) + add form (URL `Input` + optional token `Input type="password"` + hint "write-only — re-add to rotate; git.ucsc.edu state-checks may be unreachable for now") → `api.addScrumRepo`.
- Vitest: token field never renders a fetched value (only `has_token`); add posts normalized body.

### F8 — Comments v1 (task threads)
- `components/CommentThread.tsx` port with a **plain textarea** composer (⌘/Ctrl+Enter, disabled-empty, 4000-char guard); shared `components/Markdown/MarkdownText.tsx` (react-markdown, code/link overrides — the mention-chip override + `MentionTextarea` swap in when the mentions plan M4 is approved and M1 exists).
- Mounted in StoryModal's focused-task section (`api.getScrumComments('tasks', id)` / `createScrumComment`); story-level thread hidden in v1 (D10-revised: task comments are the surface) — API stays ready.
- `comment_count` chips update from responses.

### F9 — Toasts + polish + gates
- Port `design/components/feedback/Toast.jsx` → `frontend/src/components/Toast/` (`Toast` + `ToastStack`, `.gt-toast*` classes from `feedback.css`) — shared, not scrum-local, since messages/settings will reuse it. A tiny `useToasts()` hook (array state + `push`/`dismiss`) feeds the stack; mount `ToastStack` once in `ScrumBoardPage`.
- Wire the F3 seams to real toasts: move-rollback → `error` + "Undo"-style retry action (sticky per the contract), `ReadOnlyPreviewError` → `neutral` "Read-only preview — changes are disabled", repo saved/deleted (F7) → `success`.
- Skeletons (board grid ghost via `Skeleton`), focus-visible audit, `npm run lint:design` clean, `npm run build` + full vitest green, spec Part 3 checklist walk.

## Phase 2B — follow-ons (no longer design-gated; M1/M2 delivered 2026-08-27)

- ~~F10 Toasts~~ — **folded into F9**, which now ports the real `Toast`/`ToastStack`.
- **F11 Popover/Menu** (M1 available): port `Popover` + `Menu` to `frontend/src/components/Popover/`; task-card overflow menu (Edit · Copy link · ─ · Delete) and, optionally, the F7 settings modal re-hosted as a popover. Independent of F1–F9.
- **F12 (optional) Drawer** (M6): story detail as side panel — only on explicit request.
- **Mentions M4–M5** (mentions plan): `MentionTextarea` composes the delivered `MentionListbox`; scrum passes the board payload's `members` (local source), a future messages-scale consumer passes `onSearch`. Design's `MentionMember` is `{id?, name, secondary?}` — map `user_id → id`, role/email → `secondary`.

## Phase 2C — maintainer visual-pass findings (2026-08-29)

First authenticated pass (maintainer, on the seeded Trailhead board) surfaced five
findings. Verified root causes and the fix plan; **F13 is a true gap** — the F5 create
mode was planned but never implemented (and was mis-reported as shipped).

### F13 — Create Story flow (finding 1: "New Story" does nothing)
- New `components/StoryEditorModal.tsx` (create-only; 640px, ConfirmModal idiom):
  **title*** · description (markdown textarea, mono hint) · points (`PointPicker`, active
  scale) · time estimate · assignee (member `<select>`) · sprint (defaults to the viewed
  sprint; "Backlog" option). Submit → `createStory` → success toast with the new key →
  **immediately opens the new story in `StoryModal`** so the flow continues straight into
  task creation (the maintainer's intended flow: New Story → story popup → add tasks).
- Wire the header button (`ScrumBoardPage.tsx:172` — currently no onClick); stays
  disabled for staff.
- Tests: submit body shape, sprint default, staff-disabled, created story opens.

### F14 — Task editor popup (findings 4 + 5: no tags at creation; points should suggest)
- Replace the inline title-only add-task row with an **"Add task" button** opening a
  compact `TaskEditorModal`, rendered inside `StoryModal` — reachable **only** from the
  story popup, by construction. Fields: **title*** · **tags** (toggleable `TagBadge`
  chips of all 10 presets, shown in their real colors) · points (`PointPicker`) ·
  estimate · assignee.
- **Remaining-budget suggestion** (finding 5): `remaining = story.points − Σ(child task
  points)`, floored at 0. Hint beside the picker: "N pts unassigned in US-x"; scale
  values above `remaining` render de-emphasized but stay selectable — a suggestion, not
  a cap (story points are an estimate, not a contract). No hint when the story has no
  points. The story card's progress bar already derives from **tasks completed**
  (`rollups.ts` `tasksDone/tasksTotal`), which is the basis finding 5 asks for — no
  board-side change.
- Tests: tag toggling lands in the create body; remaining math incl. over-assignment;
  de-emphasis class; popup unreachable outside StoryModal (no other import site).

### F15 — Story vs task visual differentiation (finding 3) ⚑ design delta
- Board: `.gt-story` gains a **3px left accent border** in `--gt-primary` so story cards
  read as a different species from task cards at a glance.
- StoryModal: the table-ish task rows become **compact task mini-cards** (bordered,
  `.gt-task`-derived: key · title · tags · points chip · status select · delete).
- ⚑ Both deviate from the design bundle. Options: accept as code-first deltas (design
  side syncs back per `design/PORTING.md`) — the default — or maintainer updates the
  design first and we port. Recorded in the intentional-deltas list either way.

### F16 — Optimistic story/task field edits (finding 2: point changes are slow)
- Root cause: `updateStory` runs PATCH + a full board `refresh()` (the ~8–10-query
  aggregate) before the modal re-renders — ~1s frozen picker.
- Fix: `applyStoryPatch` / `applyTaskPatch` in `boardReducer.ts`; the hook applies field
  edits locally first, PATCHes, reconciles with the server row, rolls back with an error
  toast on failure — the exact `moveTask` lifecycle, generalized. The full `refresh()`
  stays only for structural changes (sprint move, archive, create, delete).
- Tests: reducer patch/reconcile/rollback; hook mirrors the existing optimistic-move suite.

### F17 — Driven visual-pass bug batch (2026-08-29, Chrome-connector pass)

Found on a live authenticated board (screenshots in session); all verified against
running code, none caught by the 182 unit tests:

1. **P1 · `sr-only` labels render visibly** — the app has no global `.sr-only` utility;
   "Status of GT-n" ghosts over the focused task row (and the sprint-select label sits in
   the header). Fix: add the standard clipped `.sr-only` utility to `index.css` (or swap
   those labels to `aria-label`).
2. **P1 · Dark input fields** — add-task input, comment composer, settings URL/token
   inputs all render near-black: a global input style wins because neither the design CSS
   nor the ports set an explicit background. Fix: `background: var(--gt-gray-0)` (+ text
   color) on `.gt-comments__input` and the scrum form inputs.
3. **P1 · Settings gear icon invisible** — the header icon-button renders empty (lucide
   `Settings` collapses); the entry point to F7 is undiscoverable. Inspect the computed
   size/color; likely a global `svg` rule. (Button itself works — opened via a11y click.)
4. **P1 · Move audit name chain** — optimistic stamp shows a raw email (viewer name comes
   from `user_metadata.full_name ?? email`, both poor), then server reconcile wipes it to
   "Unknown" (`move_task`'s response carries no `moved_by_name`). Fix all three sides:
   viewer name resolves from the board's members map; backend `move_task` returns
   `moved_by_name` (it knows the caller); `confirmMove` never overwrites a present name
   with an absent one.
5. **P2 · Story-modal task titles truncate early** — ellipsis at ~25 chars with free row
   space remaining; flex measurement bug in `.story-modal__task`.
6. **P2 · "UN" avatar for unassigned** — the Unassigned placeholder renders as an
   initials avatar ("UN"), reading like a real user. Render a hollow/dashed avatar or
   omit the assignee slot instead.
7. **P2 · Sprint-burnup leading-scope cliff** — days before the first snapshot carry
   scope forward from 0, drawing a vertical wall to today. Backfill leading days with the
   first known scope (snapshot or live) — completed already reconstructs from task_moves.
8. **P3 · Burnup subtitle is raw ISO** ("2026-08-22 – 2026-09-04") → format "Aug 22 – Sep 4".
9. **P3 · Breadcrumb says "Project" on deep links** — no `location.state.projectName`
   when arriving by URL; fall back to the board payload's project name.

**Verified working in the same pass:** auth-gated route, skeleton, three tabs, story
strip with correct task-based rollups, click-to-filter + clear pill, sprint-scoped
columns/counts, all tag colors, PR chips incl. null→gray-draft on the git.ucsc MR,
comment threads with markdown (bold/code), comment counts, focused-task highlight +
`?task=` deep link, Esc close, settings modal (scale cards + repo empty state),
backlog both states, optimistic move via the status select (instant, columns recount),
burnup day-by-day completed line from task_moves reconstruction, and cumulative-chart
numbers reconciled exactly against DB truth after live maintainer edits. Console clean
throughout. **Not verified:** pointer drag feel (synthetic drags can't fire native
HTML5 DnD — needs a human hand) and responsive reflow (extension window resize did not
propagate to the viewport).

### F18 — Key allocation is not self-healing (robustness)

**What happens today.** Every story/task key comes from `scrum_next_key(project_id, kind)`,
a Postgres function that bumps a per-project counter in `scrum_counters` and returns the
next number; the controller formats it as `US-n` / `GT-n`. `user_stories` and `tasks` each
carry a `UNIQUE (project_id, key)` constraint, so a stale counter produces a duplicate key
and Postgres rejects the INSERT with SQLSTATE **23505**. Nothing catches that: it escapes
`create_story` / `create_task` as a raw `postgrest.APIError`, becomes a 500, and the user
sees a bare "Request failed" toast with no idea what went wrong or what to do.

**How the counter can go stale.** Only when rows are written around the RPC — exactly what
happened on the 2026-08-29 dev seed: rows were inserted directly with hand-written keys
while `scrum_counters` had no row yet, so the seed's `UPDATE` matched nothing and the RPC
started from 1 and collided with the seeded `US-1`. Normal app traffic can't drift (the RPC
is the only writer), so this is a **robustness/DX issue, not a live-traffic bug** — it bites
seeding, restores, imports, and manual SQL fixes, i.e. exactly when someone is already
debugging something else.

**Fix.** In `backend/app/scrum/controller.py`, wrap the story/task INSERT: on APIError with
code `23505` **on the key constraint specifically**, resync the counter from the table's own
max key and retry the insert **once**; if the retry also fails, raise a 409 with an
actionable message rather than a 500. A tiny SQL helper keeps it one round trip:

```sql
CREATE OR REPLACE FUNCTION scrum_resync_counter(p_project_id uuid, p_kind text) RETURNS integer ...
-- SET story_seq/task_seq = GREATEST(current, max(numeric part of existing keys)), RETURN next
```

Guard the retry so it can only run once per request (no loops), and keep it narrow: match
the constraint name, never blanket-retry 23505 — a genuine duplicate elsewhere must still
fail loudly.

**Tests.** Controller-level with the MagicMock pattern: first insert raises 23505 on the key
constraint → resync called → second insert succeeds; a 23505 on a *different* constraint is
re-raised untouched; two consecutive failures surface a 409, not a 500.

**Pass status:** the runtime checklist items in the polish doc (§2 drag feel, §4 states,
§5 responsive) are still pending eyes-on — Chrome extension wasn't connected for a
driven pass; the maintainer's manual pass produced the findings above. **Refresh the
polish prompt's current-state block after F13–F16 before running the Fable review.**

## Sign-off status (updated 2026-08-27) — **all decisions closed**

1. **L1** ✅ design-doc 3-across StoryCard grid (slim rail dropped); click-to-filter.
2. **L2** ✅ right rail removed; three full-width tabs `[Board | Backlog | Burnup]`, both charts living in the Burnup tab.
3. **M1/M2** ✅ delivered in the 2026-08-27 design bundle (`Popover`, `Menu`, `Toast`/`ToastStack`, `MentionListbox`) — nothing in this plan is design-gated any more.

**F1–F9 are all unblocked and can run in order.** F11 (Popover/Menu port) is an independent follow-on.
