# Porting: design system → codebase

This folder is the **design side** of GrepThink. Look-and-feel changes are made here first, then ported into
`frontend/src/` — the reverse of `/design-sync`. This file is the recipe.

## The loop

1. Design changes land in this folder (tokens, `components/*/[name].css`, screens).
2. Commit this folder in the repo as `design/`. After each design update, replace it (or re-drop the zip) —
   **`git diff design/` is the exact changelog** of what moved.
3. In Claude Code, from the repo root:
   > Read design/SKILL.md and design/PORTING.md. Port the changes in `git diff design/` into frontend/src,
   > using the component map below.
4. Feature-sized additions ship with a `design_handoff_<feature>/README.md` (spec, schema, integration research) —
   implement from that doc, not by reverse-engineering the HTML. The shared components have their own:
   `design_handoff_ui_alignment/`.

## Basic components → `frontend/src/components/<Name>/`

`components/{primitives,display,feedback,navigation}/<Name>` → `frontend/src/components/<Name>/<Name>.tsx` + `<Name>.scss`.

- **Class names stay 1:1.** The SCSS is a port of the component's block in the group CSS file (`primitives.css`,
  `display.css`, `feedback.css`, `navigation.css`) — copied, not restyled; tokens stay `var(--gt-*)`.
- **Props come from the `.d.ts`.** The `.prompt.md` names the WAI-ARIA pattern and the keyboard model to keep.
- **Codebase-side additions** are recorded in the component's doc comment and in *Known deltas* below, then
  folded back into the design on the next round (as this round did for Menu, Tooltip and Popover).
- Every screen migrates onto these components and **takes the design system's look** (decided 2026-10-19).

## The rule that ends the copying

Feature SCSS **never re-declares a shared component's `.gt-*` block** (no copied `.gt-button`, `.gt-field`,
`.gt-select`, `.gt-badge`, `.gt-empty`, `.gt-table`…). A feature adjusts a shared component only from its own class:

```scss
.gt-filter__select .gt-select__control { min-width: 200px; }   // ok: scoped by the feature's class
.gt-button { padding: 0 18px; }                                 // never: re-declares the shared block
```

When a feature needs something the kit lacks, the kit grows it first (a design round), then the port.

## Component map

| Design component | Codebase |
| --- | --- |
| Button, IconButton | `components/Button/`, `components/IconButton/` |
| FieldShell, Input, Textarea, Select | `components/FieldShell/` (+ the `.gt-visually-hidden` utility in `index.css`), `components/Input/`, `components/Textarea/`, `components/Select/` |
| SearchField | `components/SearchField/` (was `search/SearchTrigger.jsx`) |
| PasswordField, CodeInput | `components/PasswordField/`, `components/CodeInput/` |
| Combobox | `components/Combobox/` (option row matches `features/scrum` MentionListbox) |
| Checkbox, RadioGroup, Toggle | `components/Checkbox/`, `components/RadioGroup/`, `components/Toggle/` |
| DatePickerField | `components/DatePickerField/` — moves from `features/app/components/Fields/DatePickerField.tsx`; same string API + `error`, `helperText`, `required`, `disabledAfter`, `id` |
| FileUpload | `components/FileUpload/` |
| MarkdownEditor | `components/MarkdownEditor/` — preview renders `components/Markdown/MarkdownText` |
| Badge, CountBadge, UnreadBadge, Tag | `components/Badge/` (+ `badgeStatus.ts` from `BADGE_STATUS`), `components/CountBadge/`, `components/UnreadBadge/`, `components/Tag/` |
| Avatar (+AvatarGroup, AVATAR_COLORS, hashColor) | `components/Avatar/` — the one palette and hash; every avatar render site uses it |
| Card, Table | `components/Card/`, `components/Table/` (loading rows reuse `components/Skeleton/TableSkeleton`) |
| StatCard | `components/StatCard/` — Dashboard's `DashboardMetricCard` and analytics' StatTile both render it |
| ProgressBar | `components/ProgressBar/` |
| Tooltip | `components/Tooltip/` (ported; `focusable` now in the design) |
| InfoPopover | `components/InfoPopover/` — replaces StatTooltip and GroupTooltip; analytics' DefinitionPopover renders it |
| Modal (+useDialog) | `components/Modal/` (+ `useDialog.ts`) — the 24 hand-built modals move onto it |
| ConfirmDialog (+InlineConfirm) | `components/ConfirmDialog/` — replaces ConfirmModal, `window.confirm`, `alert()` |
| Drawer | `components/Drawer/` |
| Alert, Spinner | `components/Alert/`, `components/Spinner/` (the `gt-spinner` mixin stays the reduced-motion source) |
| EmptyState (+NoClassSelected) | `components/EmptyState/`; Skeleton is already `components/Skeleton/` |
| Toast, Popover, Menu | already ported — `components/Toast/`, `components/Popover/`, `components/Menu/` |
| Tabs (+TabPanel), SegmentedControl | `components/Tabs/`, `components/SegmentedControl/` |
| FilterChip (+FilterChipGroup), Stepper | `components/FilterChip/`, `components/Stepper/` |
| Pagination | **not ported** — no screen uses numbered pages (search has its own pager) |
| SidebarNavItem (+SidebarSectionTitle) | **the app's sidebar** (layout code), its one consumer; its badge renders UnreadBadge |

Feature layers keep their folders and feature SCSS, as before:

| Design side | Codebase side |
| --- | --- |
| `components/marketing/*` | `features/landing/components/**` (`gt-landing-header` ↔ `landing-header`, `gt-hero` ↔ `hero`, …) |
| `components/assistant/*` | `features/app/components/Assistant/` |
| `components/scrum/*` | `features/scrum/` (`scrum.scss` is a 1:1 port of `scrum.css`; re-port, never hand-edit values) |
| `components/analytics/*` | `features/analytics/components/` (`analytics.scss` 1:1); StatTile → StatCard `compact`, DefinitionPopover → InfoPopover, range chips → FilterChip |
| `components/search/*` | `features/search/` per `design_handoff_search/`; scope chips → FilterChip `sm` |
| `components/schedule/*` | `features/schedule/` per `design_handoff_schedule/`; kind chips → FilterChip `sm` |
| `components/domain/TeamMeetings*` | `EditProject/MeetingsTab.tsx` + `features/project/teamMeetingsModel.ts` per `design_handoff_team_meetings/`; its fields, buttons and alert are the shared components (drop the copies) |
| `components/domain/*` (others) | the feature that owns each card (roster, projects, requests, messaging) |
| `components/gallery.css`, `*.card.html` | not ported (design-side galleries) |

## Tokens and global rules

| Design side | Codebase side |
| --- | --- |
| `tokens/colors.css`, `typography.css`, `spacing.css` | `frontend/src/styles/tokens/*.css` (runtime `--gt-*`, imported by `main.tsx`) + the SCSS bridge (`_colors.scss`, `_fonts.scss`, `_variables.scss`) |
| motion (0.2s / 0.3s ease, 0.5px press, 6px slide) | `styles/_motion.scss` mixins (`gt-transition`, `gt-press`, `gt-popover-enter`, `gt-spinner`); reduced-motion kill switch in `index.css` |
| `--gt-focus-ring` | one global `:focus-visible` rule in `index.css`; components opt out only with `inset var(--gt-focus-ring-tight)` |
| `tokens/marketing.css` (`--gt-mkt-*`) | landing-only SCSS (`$mkt-*`, with the `lint:design` ledger comment) |

`frontend/src/styles/tokens/*.css` are the only files `lint:design` lets a hex literal live in, so a new `--gt-*` goes
there first, then the component reads it. The design's component CSS carries **no raw hex** (checked every round).

### Tokens the codebase layer does not have yet (add on first use)

- Alignment round: `--gt-border-control` (#858585 — field, checkbox, radio and toggle boundaries at ≥ 3:1),
  `--gt-border-control-hover`, `--gt-opacity-disabled` (0.45), `--gt-avatar-1…6`, `--gt-gold-soft`, `--gt-purple-soft`,
  `--gt-info-soft-hover`, `--gt-warning-soft-hover`, `--gt-skeleton-shine`, `--gt-black`, `--gt-sidebar-text`,
  `--gt-sidebar-text-active`, `--gt-z-sidebar` (99), `--gt-z-picker` (1100); marketing `--gt-mkt-note-ring`,
  `--gt-mkt-chrome-red / -yellow / -green`.
- Earlier rounds: `--gt-blue-50…900` (codebase has `--gt-blue-500` only) · `--gt-red-*`, `--gt-error-icon` · `--gt-amber-*` ·
  `--gt-chart-*`, `--gt-opacity-refetch`, `--gt-series-*`, `--gt-status-*`, `--series` · `--gt-sched-*` · `--gt-gold-deep` ·
  `--gt-text-dark` · `--gt-disabled-bg/-text`, `--gt-button-secondary/-hover` · `--gt-text-xs` · the `--gt-bg` / `--gt-*-bg` aliases.

## Vocabulary map (both names work in design-side CSS)

- `--gt-canvas` ↔ legacy alias `--gt-bg`; `--gt-success-soft` / `-warning-` / `-error-` / `-info-` ↔ `--gt-success-bg` etc.
- SCSS `$primary-color / $text-primary / $border-color…` ↔ `--gt-primary / --gt-text-primary / --gt-border`.
- Chart slots `--gt-chart-1..4 / -context / -grid / -axis` resolve in `analytics.scss` to `--gt-primary / --gt-accent /
  --gt-purple / --gt-warning / --gt-gray-400 / --gt-gray-200`.
- Badge `role` → **`projectRole`** (the old name shadowed the ARIA attribute; the app's spaced values `product owner`
  map to the keys). SearchField / Combobox / field sizes are **`compact`**, not `size` (`size` is an input attribute);
  Input's text prefix is **`prefixText`** (`prefix` is an HTML attribute).

## Known deltas (deliberate, don't "fix" silently)

- **Adopted from the codebase this round** (now in the design, so the next re-port is a no-op): Menu `checked` rows
  (`menuitemcheckbox`), `radio` rows (`menuitemradio`) and `autoFocus="checked"`; Tooltip `focusable={false}`; Popover's
  own text colour and capture-phase Esc. The design adds a 16px check slot to checkable Menu rows without an icon.
- **Spinner under reduced motion:** `animation-duration: 1.6s !important; animation-iteration-count: infinite !important`
  in `.gt-spinner`, matching the `gt-spinner` mixin (the global kill switch would otherwise freeze it).
- **Avatar palette:** `AVATAR_COLORS` are token references (`var(--gt-avatar-n)`), the same six colours as the 2026-09 fix
  (`#1B57D6`, `#8A5200` …); every scheme in the app ports to it (the join-request scheme fails 4.5:1 today).
- **Unread red:** UnreadBadge is solid `--gt-error` (#DC2626, 4.8:1 behind white). The sidebar's `#FF3B30` (3.5:1)
  retires with it; `--gt-error-icon` stays only as a token.
- **Field boundaries** move from `--gt-border` (#DADADA, 1.4:1) to `--gt-border-control` (3.7:1) — WCAG 1.4.11.
- **Error red — converged (2026-10):** `$error-color: #DC2626` (+ soft / text) everywhere.
- **Codebase-side scrum deltas** (header of `features/scrum/scrum.scss`, keep on re-port): `.gt-aidraft` omitted;
  `.gt-pointpicker__chip--blocked`; `.gt-story--active` soft fill; `.gt-comments__input` background.
- **`lint:design`** = `frontend/scripts/design-adherence.mjs` (in the repo, not here): flags bare hex in `.scss/.css/.ts/.tsx`
  outside the token files unless the file carries a ledger comment. The design export's `_adherence.oxlintrc.json` does not run
  in the repo.

## Sync back (codebase → design)

When tokens change in the repo first: update `tokens/*.css` here to match `frontend/src/styles/tokens/` + the SCSS bridge (that
layer is the source of truth), and refresh the reference copies under `frontend/` in this folder.

**Last parity check: 2026-10-19** — the alignment brief (a sweep of beta at `b6fff628`) plus the local checkout's
`components/{Menu,Tooltip,Popover}`, `styles/_motion.scss`, `styles/tokens/spacing.css` and
`features/app/components/Fields/DatePickerField.tsx`. Where the brief and the checkout disagreed, the brief won (see
`design_handoff_ui_alignment/NOTES.md`). Previous: 2026-10-09 (Fira Code mono, `--gt-gold-text`, `--gt-surface-sunken`).
