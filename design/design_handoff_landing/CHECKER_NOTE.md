# Design-system check: the "components named after nothing in the kit" flag (119 as of 2026-10-07)

**Status: confirmed intentional. Do not rename.**

## What the checker compares
The compiler diffs the exported component names against the component families in the
attached Figma file ("Grepthink (Copy).fig"). That file's component sets are generic UI-kit
library artifacts — `Scrollbar`, `Monitor`, `Thumb`, `ToggleSwitch`, `3D Avatars / 6`, etc. —
not GrepThink's product components.

## Why the names differ
This design system is named after the **codebase and the written spec**, so it maps 1:1 onto
`frontend/src`: `Button`, `Input`, `Card`, `Table`, `TSRForm`, `RosterRow`, `ScrumBoard`,
`AssistantIcon`, `AssistantSuggestionCard`, `Spotlight`, … Renaming them to the kit's
vocabulary would break that mapping (and the `gt-*` BEM class ↔ SCSS port in `PORTING.md`).

## Where it's documented
- `readme.md` → **"Intentional additions"** lists every component with a one-line rationale.
- The 16 Figma families were materialized under `components/figma-reference/` until 2026-10-20,
  when the folder was removed: no screen used them. The checker still lists them as "Kit families
  not yet built" — informational, nothing to build.

## Why it never clears
The checker has no machine-readable "confirmed" hook, so the line reappears on every run.
Treat it as informational. Everything else the check reports (manifest in sync, cards, tokens) is the real signal.

## Second expected line — resolved (2026-10-07)
The analytics series-identity classes originally set `--series` under `.gt-series--*`; the checker
only registers custom properties under `:root`/`[data-*]`. Resolved by registering `--gt-series-1…4`,
`--gt-series-gray` and `--gt-status-*` at `:root` (tokens/colors.css) and having the classes set
`color` (marks paint with `currentColor`). The codebase may still use the `--series` form.

## For Claude Code
When porting from `design/`, use the component names as they are. If a future check
also flags new components, add them to the "Intentional additions" list in `readme.md`
rather than renaming.
