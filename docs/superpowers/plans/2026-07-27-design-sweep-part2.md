# Design Sweep Part 2 (Phases C–E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the design system (tokens, motion, skeletons, focus, a11y) to the app shell and the final-reviews surfaces that landed on main, redesign the interaction defects found there, and finish the app-wide sweep (adherence lint, code splitting, cleanup).

**Architecture:** Same foundations as Part 1 — `--gt-*` tokens (`frontend/src/styles/tokens/`), motion mixins (`_motion.scss`: `gt-transition`, `gt-transition-medium`, `gt-press`, `gt-popover-enter`, keyframes `gt-pop-in`/`gt-rise-in`), skeleton mixin (`_skeleton.scss`), global focus ring (`index.css`), `bottom-clearance-for-message-widget` mixin (`_mixins.scss`). Reference implementations to imitate: `frontend/src/features/messages/pages/Messages.scss` (token/motion adoption), `ConversationThread.tsx` (skeleton usage), the A3 focus-ring idioms (layered ring over resting shadow; `inset var(--gt-focus-ring-tight)` in clipped contexts).

**Context established by exploration (2026-07-27):** the four main merges (#167/#170/#171/#172) added `FinalReviews.tsx/.scss` (467/354 L), `FinalReviewDetail.tsx/.scss` (611/290 L), `finalReviewTemplate.ts`, `RosterTimelineModal.tsx/.scss`, sidebar expandable "TA Review" group, routes `/app/ta-review/final-reviews[/:projectId]` (no role guard), and backend review endpoints under `/api/tas`. None of the new SCSS uses `--gt-*`; no transitions in the two pages; no skeletons; five `:focus { outline: none }` rules. The sidebar scroll bug is already fixed (`13ae086`).

**Prior spec:** `docs/superpowers/specs/2026-07-14-group-messaging-and-design-system.md` (Phases C–E were deferred to this plan). Baselines: backend 170 pytest green (`backend/.venv`), frontend build clean + 76 vitest green.

**Conventions:** per-task commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; frontend gates = `npm run build && npx vitest run` from `frontend/`; backend gate = `.venv/bin/python -m pytest tests/ -q` from `backend/`; static-harness visual verification against the compiled bundle for auth-gated surfaces (pattern: scratchpad HTML + real dist CSS + computed-style assertions, as used for F6/A3/sidebar).

---

## Task C1: Sidebar — tokens, animated groups, a11y, scroll affordance

**Files:** `frontend/src/features/app/components/Layout/Sidebar.scss`, `Sidebar.tsx`

- [ ] Tokenize every raw hex in `Sidebar.scss`: `#018156→var(--gt-primary)`, `#ffffff→var(--gt-text-inverse)` (text/icons) or `--gt-surface` (fills), `#eeeeee→var(--gt-canvas)`, `#e0e0e0→var(--gt-gray-200)`, `#000000→var(--gt-text-primary)`, `#666/#666666→var(--gt-text-tertiary)`, `#f5f5f5→var(--gt-gray-50)`, `#e8f5e9→var(--gt-green-50)`. The unread badge `#ff3b30` KEEPS its pinned literal + comment. Hardcoded `transition: … 0.2s/0.3s` → `@include gt-transition(...)`/`gt-transition-medium(...)`; chevron rotate transition too.
- [ ] Animate group expand/collapse (currently `{!collapsed && open && <ul>}` — no animation possible). Restructure in `Sidebar.tsx` to always-mount the wrapper when not collapsed, animate with the grid-rows technique:
  ```tsx
  {!collapsed && (
    <div className={`sidebar-subitems-wrap ${open ? 'open' : ''}`} id={groupId} >
      <ul className="sidebar-subitems">…existing children…</ul>
    </div>
  )}
  ```
  ```scss
  .sidebar-subitems-wrap {
    display: grid;
    grid-template-rows: 0fr;
    @include gt-transition-medium(grid-template-rows);
    > .sidebar-subitems { overflow: hidden; min-height: 0; }
    &.open { grid-template-rows: 1fr; }
  }
  ```
  CAUTION: `.sidebar-subitems` currently relies on `overflow: visible` for the child half-pill `::before` (`left: -2.85rem`). With `overflow: hidden` on the inner ul the pill would clip — move the pill's escape room INSIDE the ul by converting the child indicator to an inset style: `&.active::before { left: 0; }` with a reduced-width pill, OR pad the ul left and keep the pill within bounds. Pick whichever preserves the visual; verify in the harness with an active child.
- [ ] A11y: give the wrap an `id` (e.g. `sidebar-group-${item.path}`), set `aria-controls={groupId}` on the group button, keep `aria-expanded={open}` when expanded-capable (not collapsed). Fix the stale-override bug (`Sidebar.tsx:223`): `const open = (openGroups[item.path] ?? false) || anyChildActive;` — navigating to a child always reveals it; manual close while a child is active is no longer possible (documented trade-off, matches every mainstream sidebar).
- [ ] Scroll affordance (greenfield judgment call, sanctioned): keep the rail calm but stop hiding that it scrolls — replace the blanket scrollbar hiding with a hover-visible thin thumb:
  ```scss
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
  &:hover::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.25); }
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  &:hover { scrollbar-color: rgba(255, 255, 255, 0.25) transparent; }
  ```
- [ ] Verify in the sidebar harness (rebuild bundle, extend the existing scratchpad harness): expand/collapse animates; active child pill intact; scrollbar thumb appears on hover; collapsed rail (64px) and mobile drawer unaffected. Gates + commit `feat(design): sidebar on gt tokens with animated groups + scroll affordance`.

## Task C2: Shell polish — Header/AppView leftovers

**Files:** `frontend/src/features/app/components/Layout/Header.scss`, `frontend/src/features/app/AppView.scss`

- [ ] Sweep both files for remaining raw hexes/rgba and `transition:` literals → tokens + motion mixins (Header already has A3's layered focus rings — don't touch those blocks' shadow values except to substitute exact-equal tokens). `AppView.scss`: `.app-main` margin transition → `gt-transition-medium(margin-left)`; `.app-nav-backdrop` → `background: var(--gt-scrim)` + fade-in via `gt-popover-enter` semantics (opacity-only variant is fine).
- [ ] Gates + commit `feat(design): header/shell token + motion pass`.

## Task D1: FinalReviews page — tokens, motion, skeletons, guard, safer time edits

**Files:** `frontend/src/features/app/pages/FinalReviews.tsx`, `FinalReviews.scss`, `frontend/src/App.tsx` (guard), possibly `frontend/src/features/app/config/…` (none expected)

- [ ] Tokenize `FinalReviews.scss` (exploration map): `rgba($primary-color, 0.1)→var(--gt-primary-soft)` (L21); `rgba($error-color, .4/.08/.45/.07)` → `var(--gt-error-soft)` for fills, `var(--gt-error)` for borders (L100,102,296,298); odd rem font sizes (`0.6rem` L243 etc.) → nearest `--gt-text-caption`/`--gt-text-body`; ad-hoc `gap: 3/5/6/7px` → `var(--gt-space-xs)`/`var(--gt-space-sm)`; card shadows → `var(--gt-shadow-card)`. Add `@include gt-transition(background-color, color, border-color)` to `.fr-btn`, `.fr-row__open-btn`, `.fr-day__zoom`, `.fr-row__time-clear`; `@include gt-press` on buttons. Replace the five `&:focus { outline: none; … }` with `&:focus-visible { border-color: var(--gt-accent); box-shadow: var(--gt-focus-ring-tight); }` (drop the outline suppression — the global handles it).
- [ ] Page-level skeleton: replace `<p>Loading…</p>` (`FinalReviews.tsx:273`) with a skeleton layout (header bar + 3 day-section stubs of 3 `.fr-row`-shaped `skeleton-block` rows) so the page doesn't jump. Add `@include bottom-clearance-for-message-widget;` to the page root.
- [ ] Client-side ordering: make `groupByDay` sort days ascending and force the "Unscheduled" bucket last regardless of server order (pure function — add a vitest for it: scheduled days sorted, unscheduled last, stable within day).
- [ ] Safer instructor time edits (currently blur-commits `new Date(draft).toISOString()` per row, no validation): commit on Enter or an explicit ✓ button next to the input; on invalid parse show `aria-invalid` + `--gt-error` border and do NOT mutate; blur without commit reverts to the saved value. Keep the payload/endpoint unchanged.
- [ ] Role guard: in `App.tsx`, wrap the two `ta-review/final-reviews` routes with a small `RequireReviewAccess` element (student-role users who are NOT class TAs → `<Navigate to="/app" replace />`; reuse however the sidebar decides to show the TA Review group — same signal, one shared helper if trivial to extract). A plain student must no longer see the raw backend error page.
- [ ] Gates (vitest count +1) + commit `feat(design): final-reviews schedule on gt tokens with skeletons + safe time edits`.

## Task D2: FinalReviewDetail — tokens/motion/skeleton + save-UX redesign (greenfield)

**Files:** `frontend/src/features/app/pages/FinalReviewDetail.tsx`, `FinalReviewDetail.scss`; backend ONLY if score-clearing needs it: `backend/app/tas/controller.py` + tests

- [ ] Tokenize + motion + skeleton + `bottom-clearance-for-message-widget`, same treatment as D1 (shadow `0 6px 24px rgba(0,0,0,.12)` → `var(--gt-shadow-pop)`; odd rems → scale; `:focus` → `:focus-visible` ring idiom on `.frd__score-input`, `.frd__note-input`, `.frd__textarea`).
- [ ] ONE save affordance: remove the per-card `.frd__card-actions` buttons; the sticky savebar is the single save surface. Savebar: `gt-pop-in` entrance, `var(--gt-shadow-pop)`, sits `right: calc(var(--gt-space-lg) + 48px + var(--gt-space-md))` or simply add the message-widget clearance so it never underlaps the floating tab; shows "Save scores" / "Save notes" only for the dirty card(s) plus a combined "Save all" when both dirty.
- [ ] "Set all ↓" redesign: the header input becomes draft-only; values apply ONLY when its ✓ "Apply to column" button is pressed (single undoable action — keep the previous column values in a ref and offer one-shot "Undo" in the savebar toast area until the next edit). No keystroke propagation.
- [ ] Clearing scores: blanking an input and saving must clear the stored value. Frontend sends explicit `null` for blanked previously-saved cells. Check `PUT /projects/{id}/final-review/scores` handling in `backend/app/tas/controller.py`: if nulls are dropped/rejected, extend the handler to treat explicit null as delete-that-cell (TDD: failing test first in `backend/tests/`, then implement; suite stays green). If the backend already handles nulls, just wire the frontend and say so.
- [ ] Partial Home-TA rows: validate at entry — when 1–2 of product/team/scrum are filled for a student, mark the empty ones `aria-invalid` + `--gt-error-soft` background immediately and disable save for that card with an inline count ("2 students incomplete"), replacing the after-the-fact top banner.
- [ ] Scores table ergonomics: sticky first (student) column; horizontal-scroll edge fade (mask-image or gradient overlay) on `.frd__grid-scroll` so cut-off columns are discoverable.
- [ ] Gates + commit `feat(design): final-review workspace redesign — single save bar, safe set-all, clearable scores`.

## Task D3: RosterTimelineModal — gt modal idioms + focus management

**Files:** `frontend/src/features/app/components/Roster/RosterTimelineModal.tsx`, `.scss`, plus a tiny shared `frontend/src/features/app/utils/reviewDates.ts` if extracting the formatter

- [ ] Scrim → `var(--gt-scrim)` + fade-in; panel → `var(--gt-shadow-modal)`, `gt-popover-enter`; spinner → 5 `skeleton-block` table rows; bespoke spin keyframes deleted.
- [ ] Focus management for `aria-modal`: on open, focus the close button; trap Tab within the dialog; Escape closes; on close, return focus to the "Timeline" trigger. (Hand-rolled ~20-line trap consistent with the codebase's no-dependency stance — mirror any existing modal that already traps; if none do, this becomes the reference implementation with a comment saying so.)
- [ ] Date idiom: single formatter with explicit timezone label (`America/Los_Angeles`, matching the review pages' term context) shared by the modal and (if trivially reusable) `formatReviewDay`/`formatReviewTime` in `finalReviewTemplate.ts` — do not fork a third idiom.
- [ ] Gates + commit `feat(design): roster timeline modal on gt idioms with real focus management`.

## Task E1: Remaining-page token/skeleton/focus sweep

**Files:** the non-adopted feature SCSS: Home dashboards, MyClasses, Roster/*, EditProject, TSRS/*, Interest/*, Staffing/*, Assignments/*, Classes/* modals, TAManagement, Feedback (enumerate at execution: `grep -rL "var(--gt-" frontend/src/features/app --include='*.scss'`)

- [ ] Mechanical value sweep per file: raw hexes/`rgba($var, α)` → tokens (`--gt-*` + soft-pair semantics), `transition:` literals → motion mixins, dropped-shadow literals → `--gt-shadow-*`. NO layout/structural changes in this task. The 18 remaining legacy `-webkit-focus-ring-color` `:focus-visible` rules: delete the dead outline declarations (suppressed globally since A3) and, where the control has a resting shadow, apply the A3 layered-ring idiom.
- [ ] Bare `Loading…` text nodes (grep `>Loading`) → skeleton blocks matching each page's layout (keep it proportionate — one skeleton shape per page type).
- [ ] Login page a11y (pre-existing, sanctioned here): "Forgot Password?" span, password-visibility img, "Sign Up" div → real `<button type="button">`/links, tabbable, with focus-visible rings.
- [ ] Gates + commit per 2–3 files batch (`feat(design): token sweep — <area>`), final combined vitest/build green.

## Task E2: Adherence lint

**Files:** `frontend/package.json`, `frontend/.oxlintrc-adherence.json` (copied from the design-system zip's `_adherence.oxlintrc.json` at `/Users/pronei/work/CSE115C/grepthink2.0/GrepThink Design System.zip`)

- [ ] Extract the zip's `_adherence.oxlintrc.json`, inspect what it enforces, vendor it, add `"lint:design": "oxlint -c .oxlintrc-adherence.json src"` (adjust to the config's actual engine/paths; oxlint is not currently a dependency — add as devDependency at latest version). Run it; fix violations in files this branch touched; allowlist/document pre-existing violations in untouched files rather than churning them.
- [ ] Commit `chore(design): adherence lint wired into npm scripts`.

## Task E3: Route-level code splitting

**Files:** `frontend/src/App.tsx` (+ a shared `PageFallback` skeleton component)

- [ ] `React.lazy` + `<Suspense>` the heavy leaf routes: Messages, FinalReviews, FinalReviewDetail, TSRS pages, Staffing, EditProject-bearing views (enumerate by size from the build's chunk report). Fallback = minimal centered skeleton consistent with E1's shapes. Keep eagerly-loaded: shell, auth, dashboards.
- [ ] Verify: `npm run build` chunk report shows the main chunk shrinking meaningfully (record before/after sizes in the commit body); vitest green; view transitions still work on messages navigations (lazy + `viewTransition` compose — verify a route mount).
- [ ] Commit `perf(frontend): route-level code splitting`.

## Task E4: Cleanup strays

**Files:** deletions + tiny fixes

- [ ] Delete `frontend/src/features/app/components/Dashboard/DashboardMetricCard 2.tsx` and `dashboardData 2.ts` (re-verify zero importers first — same drill as the `.scss` twin removed earlier).
- [ ] Leftover shadow tokens flagged in the F6 review: `.conversation-menu__dropdown`, `.message-widget--tab`, `.new-conv-search__panel` raw rgba shadows → `--gt-shadow-pop`/`--gt-shadow-hover` equivalents (visual parity, not redesign).
- [ ] Gates + commit `chore: remove stray duplicates, finish shadow token adoption`.

## Task V2: Verification pass

- [ ] Backend suite (170), frontend build + vitest (77+), `npm run lint:design` clean-or-allowlisted.
- [ ] Harness passes: sidebar (C1 items), a FinalReviews skeleton/token render, FinalReviewDetail savebar-vs-widget clearance (fixed-position math), modal focus trap (scripted Tab cycle).
- [ ] Preview servers against dev (migration is applied; `.env` in worktree root): unauthenticated surfaces + console scan. Authenticated pass requires the maintainer's login — hand off with a checklist (channels visible, sidebar scroll+animation, final-reviews flows, score clearing).
- [ ] Fixes discovered → one commit each.

## Final: whole-branch re-review + finishing

- [ ] Dispatch the final reviewer over `origin/main..HEAD` (delta since the last final review: rebase + C/D/E work) — same brief as Part 1's final review.
- [ ] superpowers:finishing-a-development-branch — merge/PR decision is the maintainer's; PR body carries the deploy ordering (PROD migration BEFORE merge; envPrefix secret-leak fix recommended pre-deploy).

## Out of scope

Dark mode; backend feature work beyond the score-clearing null handling; the pre-existing `get_class_students` authz chip (separate session per the user's chip); the vite envPrefix secret fix (chip filed, user-visible decision); prod migration (deploy-time, maintainer-gated).
