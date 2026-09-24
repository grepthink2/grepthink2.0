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

## What maps where

| Design side | Codebase side |
| --- | --- |
| `tokens/colors.css` ramps | `frontend/src/styles/tokens/_palette.scss` |
| `tokens/colors.css` semantic aliases | `frontend/src/styles/_colors.scss` |
| `tokens/typography.css` | `frontend/src/styles/_fonts.scss` |
| `tokens/spacing.css` | `frontend/src/styles/_variables.scss` |
| `tokens/marketing.css` (`--gt-mkt-*`) | landing-only SCSS (`Hero.scss`, `Spotlight.scss`, … — mirror as `$mkt-*`; carry the `lint:design` ledger comment) |
| `components/marketing/*` | `frontend/src/features/landing/components/**` (`gt-landing-header` ↔ `landing-header`, `gt-hero` ↔ `hero`, `gt-float-card` ↔ `float-card`, `gt-spotlight` ↔ `Spotlight.tsx`, `gt-stage-card` ↔ `StageCard.tsx`, `gt-closing` ↔ `ClosingBand.tsx`) |
| `components/assistant/*` | new `frontend/src/features/app/components/Assistant/` (coming-soon feature) |
| runtime `--gt-*` custom props | `frontend/src/styles/theme.scss` |
| `components/**/*.css` (BEM `.gt-*`) | feature/component SCSS (same class names) |
| `components/**/<Name>.jsx` + `.d.ts` | React TSX components (typed props match `.d.ts`) |

## Vocabulary map (both names work in design-side CSS)

- `--gt-canvas` ↔ theme.scss `--gt-bg`
- `--gt-success-soft` / `-warning-` / `-error-` / `-info-` ↔ `--gt-success-bg` etc.
- SCSS `$primary-color/$text-primary/$border-color…` ↔ `--gt-primary/--gt-text-primary/--gt-border`

## Known deltas (deliberate, don't "fix" silently)

- **Avatar palette (2026-09):** `AVATAR_COLORS` in `components/display/Avatar.jsx` swapped `#2771FF` → `#1B57D6`
  and `#B26A00` → `#8A5200` for 4.5:1 with white initials; port to the codebase's avatar hashing and to the
  landing's `FloatingCards.tsx` (drop `#d9822b` / `#9b51e0`).
- **Landing eyebrow text:** `#016547` (was `$primary-color` on the tint, ~4.3:1).
- **Error red:** design solid is `--gt-error #DC2626` (spec target); the codebase keeps legacy
  `$error-color #ff3b30` for icons/unread badges (108 refs). Design side exposes it as
  `--gt-error-icon`. Converge when the codebase migrates.
- **Mono font:** system stack (`ui-monospace, SFMono-Regular, Consolas…`) — no mono webfont.
- **Runtime props:** theme.scss exposes only the semantic set. The design side also uses
  extensions not yet in theme.scss (spacing/radius/shadow/focus-ring/type-scale props,
  `--gt-surface-muted`, `--gt-border-subtle`, `--gt-text-link`…). When porting a component that
  uses one, either add the prop to theme.scss or substitute the SCSS var at build time.
- Design-side extras with no SCSS counterpart yet: `--gt-radius-pill`, shadow tokens
  (`--gt-shadow-card` = the signature `0 0 2.61px rgba(0,0,0,.25)`), `--gt-focus-ring*`.

## Sync back (codebase → design)

When tokens change in the repo first: update `tokens/*.css` here to match
`frontend/src/styles/` (that layer is the source of truth), and refresh the reference copies
under `frontend/` in this folder. Last parity check: 2026-09-24 against the local working tree
(`frontend/src/features/landing/**` read for the marketing layer).
