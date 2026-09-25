# Fable 5 polish review — Scrum Board frontend (Part 2)

Phase 2A (F1–F9) is complete, so this is ready to run as-is on
`feat/scrum-board-part1`. It is a *polish and fidelity* review — correctness bugs are
the job of `/code-review`, which should be run separately (and was run on the Part-1
backend already).

If you run it again after further work, refresh the "Current state" block first so the
reviewer isn't told that finished work is missing.

Paste everything below the line into a fresh Fable 5 session at the repo root.

---

You are doing a **design-fidelity and UX-polish review** of a newly built feature.
Read-only: do not edit files, do not run the dev server, do not commit. Produce a
findings report; the maintainer decides what to apply.

## Context

GrepThink 2.0 (React 19 + TS + SCSS + Vite; UCSC CSE 115 team-project platform) just
gained a per-project **Scrum Board** at `/app/projects/:projectId/board`. It was built
from a design bundle mirrored in-repo, against a backend that shipped in Part 1.

Read these first, in order:
1. `docs/superpowers/plans/2026-08-21-scrum-board-part2-frontend.md` — the plan that was
   executed, including the ⚑L table of *deliberate* deviations from the design docs
   (L1–L6) and the maintainer decisions recorded there. **A deviation listed in ⚑L is
   intended — do not report it as a defect.** Report only drift the plan did not sanction.
2. `docs/superpowers/specs/2026-08-12-scrum-board-design.md` Part 3 (frontend architecture)
   and its decision table (D12 = keep `.gt-*` class names verbatim; D13 = hand-rolled SVG
   burnup, not recharts).
3. `design/design_handoff_scrum_board/README.md` — the design handoff (component specs
   with exact px/color values).
4. `design/components/scrum/*.jsx` + `.d.ts` + `design/components/scrum/scrum.css`, and
   `design/components/feedback/{Popover,Menu,Toast}.*` + `feedback.css` — the reference
   implementations that were ported.
5. The implementation: `frontend/src/features/scrum/**` and
   `frontend/src/components/{Toast,Markdown,Mentions}/**` (whichever exist).

Repo conventions that constrain any suggestion you make: `AGENTS.md` (stack, gates),
BEM SCSS co-located with components, tokens only — `npm run lint:design` fails on bare
hex outside token files, lucide-react for icons, no new dependencies without a strong
reason, Vitest + Testing Library.

## Current state (2026-08-28 — Phase 2A complete)

All of F1–F9 is built and committed on `feat/scrum-board-part1`, gates green
(`npm run build`, `npx vitest run` — 182 tests, `npm run lint:design` — 0 violations):

| | |
|---|---|
| F1 | Route `/app/projects/:projectId/board` (lazy), page shell + skeleton, `[Board \| Backlog \| Burnup]` tabs with `?view=` state, project tab strip, breadcrumb |
| F2 | `scrum.scss` (ported design layer), `--gt-purple`/`--gt-gold-text` tokens, leaf components (TagBadge, Chips, TaskCard, StoryCard, BacklogRow, BurnupChart, ScalePicker/PointPicker), pure utils |
| F3 | `boardReducer` + `useScrumBoard`: aggregate load, sprint switching, focus refetch, stale-response guard, optimistic move + rollback, background PR-state patch, CRUD wrappers |
| F4 | `ScrumBoard`: three columns, HTML5 DnD, ghost/highlight/empty target, same-column no-op, read-only staff mode |
| F5 | `StoryModal` (640px) + shared `components/Markdown/MarkdownText` |
| F6 | Composed page: header, three tabs on live data, story filter, backlog, both burnup charts, empty/error states |
| F7 | `BoardSettingsModal`: estimate scale + D8 repo registry (write-only tokens) |
| F8 | `CommentThread` on task threads |
| F9 | `components/Toast/` (Toast + ToastStack + `useToasts`), replacing the inline notice seam |

**Deliberately not built — do not report as gaps:**

- **AI drafting UI** — the feature is off for this release (L6). There should be no
  AIDraftButton, no "Suggest tasks", and no dead conditional for them anywhere.
- **@mentions** — the mentions plan (`docs/superpowers/plans/2026-08-13-mentions-system.md`)
  is approved-pending, not built. `MarkdownText` has no mention override and the comment
  composer is a plain textarea; both are documented seams. The design system's
  `MentionListbox` exists but is intentionally unported.
- **Story-level comment threads** — D10 makes task threads the v1 surface; the API supports
  story comments and the board payload still carries `comment_count` on stories.
- **Realtime** — D11: v1 refetches on mutation and window focus; there is no subscription.
- **Popover/Menu port (F11)** — the design components landed but the settings surface is a
  modal for now, and there is no card overflow menu yet.

**Intentional deltas — do not report as defects** (beyond the plan's ⚑L table):

- `scrum.scss` omits the `.gt-aidraft` block from `design/components/scrum/scrum.css`
  (dead CSS with AI off).
- `--gt-purple` and `--gt-gold-text` were added to `frontend/src/styles/tokens/colors.css`
  to replace two literals the design file carries inline. Per `design/PORTING.md` the repo's
  styles layer is the token source of truth, so the design side syncs back — flagging the
  *values* is fair, flagging the tokens' existence is not.
- Component ports take API objects (`ApiScrumTask`, member maps) rather than the design
  `.d.ts` flat string props; the DOM and classes should still match.

**Not yet done — worth your attention:** the board has never had an **authenticated visual
pass**. Everything below has been verified by tests and by reading, not by looking at a
populated board in a browser. Call out anything that genuinely needs eyes on a real screen.

## What to review

**1. Token and pixel fidelity.** `frontend/src/features/scrum/scrum.scss` is meant to be a
1:1 port of `design/components/scrum/scrum.css` (minus the sanctioned `.gt-aidraft` omission
and the two tokenised literals). Verify that mechanically — e.g. strip both files to
`selector { prop: value }` pairs and compare sets — rather than by eye, and report any
drifted value (padding, radius, font-size, weight, line-height, shadow, border), any class
dropped or renamed (D12 keeps `.gt-*` verbatim), and any colour that should be a `--gt-*`
token. Do the same for `feedback.css` once F9/F11 port Toast and Popover.

Then check the **component** ports against `design/components/scrum/*.jsx` + `.d.ts`: same DOM
structure and class placement, same conditional-render rules (e.g. the audit line only when the
task has moved; the story chip only when a parent key is passed), and prop contracts that match
the `.d.ts` intent even though the TSX takes API objects instead of flat strings.

**2. Interaction polish.** The maintainer's stated bar is "lean like a minified Shortcut,
with real polish on dragging cards todo → in-progress → done". Assess:
- Drag & drop: is the drag-over column state, dragged-card ghost, empty-column drop target,
  and cursor feedback faithful and *fluid*? Any jank, missing affordance, or state that can
  get stuck (e.g. a column left highlighted after a drop outside)?
- Optimistic move: does the card move instantly, reconcile, and roll back visibly on failure
  (with a toast)? Is there any flash-of-old-state or double-render?
- Transitions: all 0.2s ease per the motion spec, `prefers-reduced-motion` respected, no
  scale transforms (the system uses a 0.5px translateY press).

**3. Accessibility.** HTML5 DnD is mouse-only by design here — verify the documented
fallback (status `<select>` in the story modal) actually exists and works, that tabs use
proper `role="tab"`/`aria-selected`, the modal traps focus and restores it on close, every
icon-only button has an accessible name, and focus-visible rings are present (2px accent
blue) and never suppressed by an `outline: none` without a replacement.

**4. Loading, empty, and error states.** Every async surface should have all four: loading
(skeleton that matches the real layout — no layout shift), empty (no sprints / empty column /
empty backlog / no comments), error, and the read-only "View as student" preview state
(`previewGuard` throws `ReadOnlyPreviewError` on writes — is it surfaced as a calm toast, not
a crash?).

**5. Responsive behavior.** The board is full-width with three columns. Check ~1280px,
~1024px, and ~768px: do the columns/story grid reflow sensibly, does the burnup tab's
two-chart row stack, does anything overflow the page horizontally (wide content must scroll
inside its own container, never the body)?

**6. Copy.** Button labels, empty-state text, toast messages, and hints: user-facing language,
active voice, says what will happen. Flag jargon leaking from the schema (e.g. "archived_at",
"sprint_id") and any error text that doesn't tell the user what to do next.

**7. Derived-not-stored discipline.** The spec requires story rollups, column point sums and
PR chip labels to be *derived* at render, never persisted or duplicated in state
(`utils/rollups.ts`, `utils/prLabel.ts`). Flag any place that caches or recomputes them
inconsistently, any `points ?? 0` coercion that hides a real null, and any spot where a task
with an unknown `pr_state` renders as something other than the gray draft chip.

**8. Dead weight.** AI drafting is deliberately OFF for this release (maintainer decision) —
flag any leftover AI UI, unused imports, dead props, `console.log`, commented-out blocks, or
components ported but never mounted.

## Output

A markdown report grouped by the headings above (skip any that do not apply yet). For each finding:
`file:line` · what's wrong · **the concrete fix** (exact value/snippet where it's a token or
px drift) · severity **P1** (breaks the experience or the design contract) / **P2** (visible
polish gap) / **P3** (nit).

Then close with:
- **Top 5 fixes by impact** — the shortlist the maintainer should apply first.
- **What's already good** — brief, so the maintainer knows what not to touch.

Be specific and verifiable; if you assert a value drifted, quote both the design value and the
implemented value. If you cannot verify something without running the app, say so explicitly
rather than guessing.
