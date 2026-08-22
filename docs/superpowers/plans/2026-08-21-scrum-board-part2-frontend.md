# Scrum Board (Part 2 of 2 — Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans, task-by-task. Prefer SMALL task scopes — three long-running subagents stalled during Part 1; anything bigger than ~30 minutes of work should be split.

**Goal:** The per-project scrum board UI at `/app/projects/:projectId/board` — lean, dense, Shortcut-like in feel but built from GrepThink's own design language, against the live Part-1 API (PR #177).

**Architecture:** A lazy route rendering inside the existing `/app` shell. Leaf components port near-verbatim from `design/components/scrum/` (token-exact `scrum.css`); the **page composition deliberately deviates from the handoff layout** where it's clunky — every deviation is flagged (⚑L) for maintainer sign-off below, each with a design-doc-faithful fallback. Components the design system doesn't have yet are flagged (⚑M) for the maintainer to design first; nothing in Phase 2A depends on them.

**Tech Stack:** React 19 + TS + SCSS (`.gt-*` classes kept verbatim per D12), HTML5 DnD (Assign-board precedent), hand-rolled SVG burnup (D13), `api.ts` scrum methods, plain `useState`/`useEffect` + optimistic reducer (messages pattern). **No AI UI anywhere** (feature off per maintainer 2026-08-21).

**Inputs:** Spec Part 3 (`docs/superpowers/specs/2026-08-12-scrum-board-design.md`) · design refs `design/components/scrum/` + `design/design_handoff_scrum_board/README.md` · mentions plan (`2026-08-13-mentions-system.md`, M4–M5 land into F8's seams once approved) · Part-1 responses (branch `feat/scrum-board-part1`).

---

## ⚑L — Lean audit (deviations from the handoff, for sign-off)

The handoff design is faithful to the requirements but heavier than the "minified
Shortcut" target. Each row: what the design doc says → the lean call this plan makes.

| # | Handoff design | Lean call in this plan | Cost of the lean call |
|---|---|---|---|
| L1 ⚑ | 3-across `StoryCard` grid above the board (~3 rows of cards for 7 stories; duplicates info the task cards' `storyKey` chips already carry) | **One-line story rail**: horizontally scrollable slim pills (mono key · truncated title · `n/n` rollup · 3px progress bar), click = filter the board to that story (active ring), click again = clear | Needs a new design (⚑M3). **Fallback if not approved:** port the 3-across grid as designed — zero new design |
| L2 ⚑ | Right rail (300px) permanently stacking sprint burnup + cumulative burnup + backlog panel | **One burnup panel** with a `SegmentedControl` toggle **Sprint \| Cumulative** (design system has SegmentedControl ✓); **backlog leaves the rail** and becomes a board-page sub-view: `[Board \| Backlog]` segmented switch in the page header (BacklogRow list with restore/open) | Pure recomposition of existing designed pieces — no new design. Deviates from handoff layout only |
| L3 | `ScalePicker` as a permanent full-width row above the story strip (a settings control occupying prime board space on every visit) | Move it into a **Board settings modal** (gear `IconButton` in the board header) together with the D8 **repo manager**. Modal exists in the design system ✓. Upgrade path: settings *popover* later (needs ⚑M1) | None now; popover polish gated on M1 |
| L4 | Task-card audit line (dashed top border) on every moved card | **Kept as designed** — requirement 6 wants the audit visible; it's one 9.5px line. (A tooltip-only variant is possible later if cards still feel tall) | — |
| L5 | Header carries a "Grepthink 2.0 · Team 1" badge | **Dropped** — the app shell + breadcrumb already state project context. Header = title · sprint `<select>` · settings gear · primary "New Story" | — |
| L6 | `AIDraftButton` in header + "Suggest tasks" in modal | **Removed entirely** (feature off). No conditional rendering, no dead UI | Re-adding later = small isolated diff |

Everything else ports as designed: 3 columns + DnD + drag-over states, TaskCard chip
grammar, story modal at 640px, PR chips, tag palette, burnup visual language.

## ⚑M — Missing from the design system (create these first; nothing in Phase 2A blocks on them)

| # | Component | Needed by | What the design should cover |
|---|---|---|---|
| M1 ⚑ | **Popover / Menu primitive** | Mention autocomplete listbox (mentions plan M4), settings-popover upgrade (L3 polish), future card overflow menus | Anchored floating panel: white, `border 1px --gt-border`, radius 7–10, `--gt-shadow-pop`, `gt-popover-enter` motion (6px slide + fade 0.15s), listbox rows (hover/active/`aria-activedescendant` states), placement above/below |
| M2 ⚑ | **Toast / Snackbar** | Optimistic-move rollback ("Couldn't move GT-12 — put back"), repo saved/deleted, read-only-preview notice | Semantic variants (error / success / neutral) on the token pairs, auto-dismiss timing, optional action slot, stacking, reduced-motion behavior. **Interim in 2A:** inline `Alert` (exists) in the board header region |
| M3 ⚑ | **Slim story pill** (only if L1 approved) | The one-line story rail | ~32–36px row: mono key (green), 13px title ellipsis, 10px `n/n` rollup, 3px progress bar footer or inline; states: default / hover / active-filter (1px + ring `--gt-primary`) / archived (muted) |
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
- `features/scrum/pages/ScrumBoardPage.tsx` + `.scss`: shell-page skeleton (`ScrumBoardSkeleton` exported alongside, page-per-skeleton convention), `bottom-clearance-for-message-widget` mixin, grid `minmax(0,1fr) 300px` gap 20.
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
- `[Board | Backlog]` segmented switch (SegmentedControl port): Board = story rail + ScrumBoard; Backlog = `BacklogRow` list (archived + unscheduled; restore = `updateStory({sprint_id})` picker, open = StoryModal).
- Story rail per L1 decision: **slim pills** (needs M3 design first) or **fallback 3-across StoryCard grid** — build whichever is signed off; the rail filters `tasks` client-side by `story_id`.
- Right rail: single white panel — `BurnupChart` + SegmentedControl **Sprint | Cumulative** (labels/series straight from `board.burnup`), header stat "n/m pts".
- Empty states: no sprints → EmptyState-style panel with "Create sprint" (opens a small create-sprint modal: name + two `DatePickerField`s); empty columns per design.

### F7 — Board settings modal (Scale + D8 repos)
- Sections: **Estimate scale** (`ScalePicker` → `api.updateScrumSettings`; hint "changing the scale only changes offered values") and **Repositories** (D8): `api.getScrumRepos` on open → rows (provider icon · repo_url · `has_token` chip "token set" · delete IconButton w/ confirm) + add form (URL `Input` + optional token `Input type="password"` + hint "write-only — re-add to rotate; git.ucsc.edu state-checks may be unreachable for now") → `api.addScrumRepo`.
- Vitest: token field never renders a fetched value (only `has_token`); add posts normalized body.

### F8 — Comments v1 (task threads)
- `components/CommentThread.tsx` port with a **plain textarea** composer (⌘/Ctrl+Enter, disabled-empty, 4000-char guard); shared `components/Markdown/MarkdownText.tsx` (react-markdown, code/link overrides — the mention-chip override + `MentionTextarea` swap in when the mentions plan M4 is approved and M1 exists).
- Mounted in StoryModal's focused-task section (`api.getScrumComments('tasks', id)` / `createScrumComment`); story-level thread hidden in v1 (D10-revised: task comments are the surface) — API stays ready.
- `comment_count` chips update from responses.

### F9 — Polish + gates
- Skeletons (board grid ghost via `Skeleton`), inline `Alert` seam for move-rollback/preview-blocked (upgraded to Toasts in F10), focus-visible audit, `npm run lint:design` clean, `npm run build` + full vitest green, spec Part 3 checklist walk.

## Phase 2B — design-gated (after ⚑M items exist)

- **F10 Toasts** (M2): replace the inline-alert seam app-consistently.
- **F11 Popover** (M1): settings gear → popover (retire the settings modal or keep for repos), mention listbox styling for mentions-plan M4, card overflow menu (edit/delete/copy link).
- **F12 (optional) Drawer** (M6): story detail as side panel — only on explicit request.

## Sign-off needed before F6 starts

1. **L1**: slim story rail (then design M3 first) — or the design-doc 3-across grid?
2. **L2**: backlog as `[Board | Backlog]` switch + single toggled burnup panel — ok?
3. **M1/M2**: create Popover + Toast in the design system whenever ready — only 2B blocks on them.

F1–F5 + F7–F8 are decision-independent and can start immediately.
