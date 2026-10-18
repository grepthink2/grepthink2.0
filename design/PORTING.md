# Porting: design system → codebase

This folder is the **design side** of GrepThink. Look-and-feel changes are made here first,
then ported into `frontend/src/` — the reverse of `/design-sync`. This file is the recipe.

## The loop

1. Design changes land in this folder (tokens, `components/*/[name].css`, screens).
2. Commit this folder in the repo as `design/`. After each design update, replace it
   (or re-drop the zip) — **`git diff design/` is the exact changelog** of what moved.
3. In Claude Code, from the repo root:
   > Read design/SKILL.md and design/PORTING.md. Port the changes in `git diff design/`
   > into frontend/src, using the vocabulary map below.
4. Feature-sized additions ship with a `design_handoff_<feature>/README.md` (spec, schema,
   integration research) — implement from that doc, not by reverse-engineering the HTML.

## Port ledger (as of the 2026-10-09 parity check)

| Feature | Handoff | Codebase | Status |
| --- | --- | --- | --- |
| Scrum board | `design_handoff_scrum_board/` | `features/scrum/` + shared `components/{Popover,Menu,Toast,Tooltip,Markdown}` | ported (see codebase-side deltas below) |
| Landing + assistant | `design_handoff_landing/` | `features/landing/**`, `features/app/components/Assistant/` | ported |
| Analytics | `design_handoff_analytics/` | `features/analytics/` (`analytics.scss` mirrors `components/analytics/analytics.css` class-for-class, incl. `.gt-status--in_progress`, `--wide`, `--stacked`, `.gt-table__export` + `utils/csv.ts`) | ported; timeliness (TimelinessBars / OnTimeMeter) deferred as planned |
| ⌘K search | `design_handoff_search/` | — | **not started** (no `features/search`, header still has the pseudo search input) |
| Schedule | `design_handoff_schedule/` | — | **not started** (Student Home's card is still the commented-out mock; no `/app/schedule`, no `class_events` table) |

## What maps where

| Design side | Codebase side |
| --- | --- |
| `tokens/colors.css` | `frontend/src/styles/tokens/colors.css` (runtime `--gt-*`, imported by `main.tsx`); SCSS bridge `styles/_colors.scss` (`$primary-color`, `$error-color`…) |
| `tokens/typography.css` | `frontend/src/styles/tokens/typography.css`; SCSS bridge `styles/_fonts.scss` |
| `tokens/spacing.css` | `frontend/src/styles/tokens/spacing.css`; SCSS bridge `styles/_variables.scss` |
| motion rules (0.2s / 0.3s, 0.5px press, 6px popover slide) | `styles/_motion.scss` mixins `gt-transition`, `gt-transition-medium`, `gt-press`, `gt-popover-enter` (+ `gt-pop-in`, `gt-rise-in` keyframes); reduced-motion kill switch in `index.css` |
| `--gt-focus-ring` on every control | one global rule in `index.css`: `:where(a, button, input, …):focus-visible { box-shadow: var(--gt-focus-ring) }` — components only opt out with `inset var(--gt-focus-ring-tight)` |
| `tokens/marketing.css` (`--gt-mkt-*`) | landing-only SCSS (`Hero.scss`, `Spotlight.scss`, … — mirror as `$mkt-*`; carry the `lint:design` ledger comment) |
| `components/marketing/*` | `frontend/src/features/landing/components/**` (`gt-landing-header` ↔ `landing-header`, `gt-hero` ↔ `hero`, `gt-float-card` ↔ `float-card`, `gt-spotlight` ↔ `Spotlight.tsx`, `gt-stage-card` ↔ `StageCard.tsx`, `gt-closing` ↔ `ClosingBand.tsx`) |
| `components/assistant/*` | `frontend/src/features/app/components/Assistant/` |
| `components/scrum/*` | `frontend/src/features/scrum/` (`scrum.scss` is a 1:1 port of `scrum.css`; re-port, never hand-edit values) |
| `components/analytics/*` | `frontend/src/features/analytics/components/` (`/app/analytics`); class names 1:1 (`.gt-analytics`, `.gt-chart-card`, `.gt-legend`, `.gt-tooltip`, `.gt-filter`, `.gt-line`, `.gt-split`, `.gt-stack`, `.gt-cols`, `.gt-trend`, `.gt-table`, `.gt-series--*`/`.gt-status--*` → `--series`); `StatTile` = extend `Dashboard/DashboardMetricCard` with `__delta`/`__spark` (see `design_handoff_analytics/NOTES.md`) |
| `components/search/*` | new `frontend/src/features/search/` (palette, trigger, model) + replace `.app-header__search-bar` with `SearchTrigger` — per `design_handoff_search/README.md` |
| `components/schedule/*` | new `frontend/src/features/schedule/` (`ScheduleList`, `ScheduleItem`, `ScheduleDivider`, `ScheduleDayHeader`, `scheduleModel.ts`) + the `/app/schedule` route; the compact variant replaces the mock block in `Home/StudentHomeDashboard.tsx` (`.student-home__schedule-*`) — per `design_handoff_schedule/README.md` |
| `components/**/*.css` (BEM `.gt-*`) | feature/component SCSS (same class names) |
| `components/**/<Name>.jsx` + `.d.ts` | React TSX components (typed props match `.d.ts`) |

## Vocabulary map (both names work in design-side CSS)

- `--gt-canvas` ↔ legacy alias `--gt-bg`; `--gt-success-soft` / `-warning-` / `-error-` / `-info-` ↔ `--gt-success-bg` etc.
  (aliases from an earlier `theme.scss` draft — the codebase token layer uses the `--gt-canvas` / `-soft` names directly)
- SCSS `$primary-color/$text-primary/$border-color…` ↔ `--gt-primary/--gt-text-primary/--gt-border`
- Chart slots: the design's `--gt-chart-1..4 / -context / -grid / -axis` resolve in `analytics.scss` to
  `--gt-primary / --gt-accent / --gt-purple / --gt-warning / --gt-gray-400 / --gt-gray-200` inline; `--gt-chart-wash`
  is `opacity: 0.1` on the area, `--gt-opacity-refetch` is the literal `0.6`. Adding the tokens to
  `tokens/colors.css` verbatim lets `.gt-series--*` read them unchanged.

## Tokens the codebase layer does not have yet (design-only; add on first use)

`--gt-blue-50…900` (codebase has `--gt-blue-500` only) · `--gt-red-*`, `--gt-error-icon` · `--gt-amber-*` ·
`--gt-chart-*`, `--gt-opacity-refetch`, `--gt-series-*`, `--gt-status-*`, `--series` · `--gt-sched-*` (schedule kind palette + Now line) · `--gt-gold-deep` ·
`--gt-text-dark` (`$text-dark` exists in `_colors.scss`) · `--gt-disabled-bg/-text`, `--gt-button-secondary/-hover`
(`$disabled-bg`, `$button-secondary*` exist in `_colors.scss`) · `--gt-text-xs` (11px) · the `--gt-bg` / `--gt-*-bg` aliases.
`frontend/src/styles/tokens/*.css` are the only files `lint:design` lets a hex literal live in, so a new
`--gt-*` goes there first, then the component reads it.

## Known deltas (deliberate, don't "fix" silently)

- **Avatar palette (2026-09):** `AVATAR_COLORS` in `components/display/Avatar.jsx` swapped `#2771FF` → `#1B57D6`
  and `#B26A00` → `#8A5200` for 4.5:1 with white initials; port to the codebase's avatar hashing and to the
  landing's `FloatingCards.tsx` (drop `#d9822b` / `#9b51e0`).
- **Landing eyebrow text:** `#016547` (was `$primary-color` on the tint, ~4.3:1).
- **Error red — converged (2026-10):** `_colors.scss` now sets `$error-color: #DC2626` (+ `$error-soft`, `$error-text`
  matching the tokens). The raw `#ff3b30` survives only in the sidebar unread badge (`Sidebar.scss`, ledger
  comment "kept verbatim"); design side renders that badge with `--gt-error-icon` and nothing else.
- **Codebase-side scrum deltas** (header of `features/scrum/scrum.scss`, keep on re-port): `.gt-aidraft` omitted
  (AI drafting is off, L6); `.gt-pointpicker__chip--blocked` marks values the points budget forbids;
  `.gt-story--active` gains a soft green fill and keeps its ring on hover; `.gt-comments__input` sets an explicit
  background.
- **Runtime props:** the codebase token layer carries the semantic set plus spacing / radius / shadow / focus-ring /
  type-scale / z-index / layout props (`--gt-sidebar-w`, `--gt-container`). Design-only extras are listed above.
- **`lint:design`** = `frontend/scripts/design-adherence.mjs` in the repo (not copied here — the design compiler would bundle it): flags bare hex
  literals in `.scss/.css/.ts/.tsx` outside the token-definition files unless the file carries a ledger comment
  ("kept verbatim", "bespoke", "left as raw hex", …). The design export's `_adherence.oxlintrc.json` does not run in
  the repo (oxlint has no `no-restricted-syntax`); this script is the whole gate.

## Sync back (codebase → design)

When tokens change in the repo first: update `tokens/*.css` here to match
`frontend/src/styles/tokens/` + the SCSS bridge (that layer is the source of truth), and refresh the reference
copies under `frontend/` in this folder (`src/styles/**`, `src/index.css`, the app-shell SCSS, the ported
`analytics.scss` / `scrum.scss`).

**Last parity check: 2026-10-09** against the local working tree. Pulled into the design side:
- `--gt-font-mono` → `'Fira Code', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`; Fira Code 400/500 is
  loaded in `index.html` next to Poppins (`tokens/fonts.css` imports it too). `$mono-font` no longer exists.
- `--gt-gold-text: #8A6D00` added (codebase token for the gold tag text); `scrum.css` reads it and `--gt-purple`
  instead of literals, as `scrum.scss` does.
- `--gt-surface-sunken` → `var(--gt-gray-100)` (was gray-50 here; the codebase uses it for table heads and inset
  wells — analytics table head, search entity disc and the empty-state icon wells now render #EEEEEE).
- Error-red convergence and the global focus-ring rule recorded above.
Previous parity check: 2026-09-24 (`frontend/src/features/landing/**` read for the marketing layer).
