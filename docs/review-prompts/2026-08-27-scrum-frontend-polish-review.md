# Fable 5 polish review — Scrum Board frontend (Part 2)

Run this on the branch that carries the scrum frontend (`feat/scrum-board-part1`
or its successor) — either at a checkpoint or once F1–F9 are complete. It is a
*polish and fidelity* review — correctness bugs are the job of `/code-review`,
which should be run separately (and was run on the Part-1 backend already).

**Before running it, refresh the "Current state" block below** so the reviewer knows
which tasks exist; otherwise it reports unbuilt work as missing.

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

## Current state (as of 2026-08-28 — update before each run)

Built and committed, gates green (`npm run build`, `npx vitest run`, `npm run lint:design`):

- **F1** — the route (`/app/projects/:projectId/board`, lazy), `ScrumBoardPage` shell +
  `ScrumBoardSkeleton`, the three-tab `[Board | Backlog | Burnup]` switch with `?view=`
  URL state, the project tab strip, and the breadcrumb case.
- **F2** — `scrum.scss` (the ported design layer), two palette tokens, and the leaf
  components: `TagBadge`, `Chips` (Points/Estimate/PRLink/UserPair), `TaskCard`,
  `StoryCard`, `BacklogRow`, `BurnupChart`, `ScalePicker`/`PointPicker`, plus the pure
  utils `rollups` / `prLabel` / `relativeTime` and 26 tests.

**Not built yet — do not report these as gaps:** F3 data layer (`useScrumBoard`,
optimistic move), F4 board columns + DnD, F5 story modal, F6 page composition (the tabs
still render a placeholder), F7 settings + repo manager, F8 comments, F9 toasts + polish.
Sections of this prompt that target unbuilt tasks (most of §2, parts of §3–§5) simply do
not apply yet — say so rather than speculating.

**Intentional deltas — do not report as defects** (in addition to the plan's ⚑L table):

- `frontend/src/features/scrum/scrum.scss` omits the `.gt-aidraft` block that exists in
  `design/components/scrum/scrum.css` — AI drafting is off for this release (L6), so
  shipping its CSS would be dead weight.
- `--gt-purple` and `--gt-gold-text` were **added** to `frontend/src/styles/tokens/colors.css`
  to replace the two literals `scrum.css` carries inline (`#7D3C98` on the ui/ux tag and the
  merged PR chip; `#8A6D00` on the design tag). Per `design/PORTING.md` the repo's styles
  layer is the token source of truth, so the design side is what needs to sync back here.
  Flagging the *values* as wrong is fair game; flagging the tokens' existence is not.
- Components are ported but not yet mounted anywhere (F6 composes them) — that is sequencing,
  not dead code, until F6 lands.

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
