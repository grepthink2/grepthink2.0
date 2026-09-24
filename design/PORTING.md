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
| runtime `--gt-*` custom props | `frontend/src/styles/theme.scss` |
| `components/**/*.css` (BEM `.gt-*`) | feature/component SCSS (same class names) |
| `components/**/<Name>.jsx` + `.d.ts` | React TSX components (typed props match `.d.ts`) |

## Vocabulary map (both names work in design-side CSS)

- `--gt-canvas` ↔ theme.scss `--gt-bg`
- `--gt-success-soft` / `-warning-` / `-error-` / `-info-` ↔ `--gt-success-bg` etc.
- SCSS `$primary-color/$text-primary/$border-color…` ↔ `--gt-primary/--gt-text-primary/--gt-border`

## Known deltas (deliberate, don't "fix" silently)

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
under `frontend/` in this folder. Last parity check: 2026-08-08 against the local working tree.
