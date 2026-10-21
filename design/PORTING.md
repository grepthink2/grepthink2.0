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
| Slider | `components/Slider/` — the TSR contributions step (`features/app/components/TSRS/ContributionsTab.tsx`) drops its `.contributions-tab__slider` and `__number-input` styling for it; member colours pass as `color` token references |
| Badge, CountBadge, UnreadBadge, Tag | `components/Badge/` (+ `badgeStatus.ts` from `BADGE_STATUS`), `components/CountBadge/`, `components/UnreadBadge/`, `components/Tag/` |
| Avatar (+AvatarGroup, AVATAR_COLORS, hashColor) | `components/Avatar/` — the one palette and hash; every avatar render site uses it |
| Card, Table | `components/Card/`, `components/Table/` (loading rows reuse `components/Skeleton/TableSkeleton`) |
| StatCard | `components/StatCard/` — Dashboard's `DashboardMetricCard` and analytics' StatTile both render it |
| ProgressBar | `components/ProgressBar/` |
| Tooltip | `components/Tooltip/` (ported; `focusable` and Esc-to-hide in both) |
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
| `components/finalreviews/*` | `features/finalReviews/` per `design_handoff_final_review_signup/` (`finalReviews.scss` is a 1:1 port of `finalreviews.css`); SlotBoard replaces `pages/FinalReviews.tsx`'s body, ReviewWorkspaceHeader replaces `FinalReviewDetail.tsx`'s topbar + meta, TeamReview `card` goes in `ProjectView.tsx`'s aside; the seven status keys join the Badge status map |
| `components/domain/*` (others) | the feature that owns each card (roster, projects, requests, messaging) |
| `components/gallery.css`, `*.card.html` | not ported (design-side galleries) |

## Assets keep their colours

Files under `assets/` and `frontend/src/assets/` are brand and image assets: never strip, recolour or tokenise their fills — an
SVG used as an image cannot read `--gt-*`. The raw-hex rule covers component CSS and code, not assets.

**This design tool drops `<style>` elements from an SVG whenever it saves one** (confirmed 2026-10-20 with a two-rule test file).
That, not the hex rule, is what turned the logo black: its colours lived in a `<style>` block (`.cls-1` white, `.cls-2`/`.cls-3`
`#006837`). The design's two logo copies now carry those colours as `fill` attributes on the same shapes (27 white, 7 dark green),
derived from the originals with nothing else changed, so they render correctly but are **not byte-for-byte**. When porting, keep
the repo's own SVGs: never overwrite `frontend/src/assets/` or `design/assets/` from a design export without diffing first.

## Tokens and global rules

| Design side | Codebase side |
| --- | --- |
| `tokens/colors.css`, `typography.css`, `spacing.css` | `frontend/src/styles/tokens/*.css` (runtime `--gt-*`, imported by `main.tsx`) + the SCSS bridge (`_colors.scss`, `_fonts.scss`, `_variables.scss`) |
| motion (0.2s / 0.3s ease, 0.5px press, 6px slide) | `styles/_motion.scss` mixins (`gt-transition`, `gt-press`, `gt-popover-enter`, `gt-spinner`); reduced-motion kill switch in `index.css` |
| `keyframes.css` — `gt-pop-in`, `gt-rise-in`, `gt-spin`, `skeleton-shimmer` | `styles/keyframes.css`, loaded once by `main.tsx`; the mixins animate with them by name |
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

- **Adopted from the codebase, 2026-10-20 (PR #259, the button kit)** — now in the design, so the next re-port is a no-op:
  1. **Tooltip dismissal** (`useTooltipDismiss(enabled)` in `Tooltip.jsx` ↔ `components/Tooltip/useTooltipDismiss.ts`): Esc is heard on
     `window` in the capture phase and stopped only while a bubble shows; a mouse / pen press or Enter / Space on the control also
     hides it (a touch press does not); it comes back when the pointer enters again or focus arrives by keyboard; a plain key pressed
     while a click-focused control has focus counts as keyboard focus (`:focus-visible`'s rule). Handlers are pointer events now
     (`onPointerEnter/Leave/Down`, `onFocus`, `onBlur`, `onKeyDown`).
  2. **IconButton** keeps its `gt-icon-tip gt-tooltip` wrapper while disabled, with no bubble, so the button stays the same element
     when it turns disabled and back; `tooltip={false}` still drops the wrapper. `aria-label` / `aria-pressed` apply after `{...rest}`.
  3. **Button**: never the native `disabled` while `loading`, even with `disabled`; `aria-disabled`, `aria-busy` (and `aria-pressed`)
     and the click guard apply after `{...rest}`; the face that is not showing is `aria-hidden`; a busy `href` link takes
     `tabIndex={0}`, a disabled one leaves the tab order. `Button.d.ts` / `IconButton.d.ts` declare the aria attributes the
     components set themselves as `never` (Button: `aria-disabled`, `aria-busy`, `aria-pressed`; IconButton: `aria-label`, `aria-pressed`).
- **Codebase additions, 2026-10-20** (recorded here; the design shows the same thing its own way): **Button `to`** renders a
  react-router `<Link>` (the design's `href` renders an `<a>` — the kit has no router). **Tooltip Esc** hides an open bubble
  (WCAG 1.4.13); the design adopted it the same round (`useTooltipDismiss` in `Tooltip.jsx`, shared with IconButton's tooltip),
  captured and stopped only while a bubble shows, so the first Esc closes the bubble and the next reaches a dialog.
- **Skeleton** is `.gt-skeleton` in the codebase too now (it was `.skeleton`); its sweep is the shared `skeleton-shimmer`.
- **Keyframes** — four shared keyframes live once in `frontend/src/styles/keyframes.css` (loaded by `main.tsx`; design: root
  `keyframes.css`): `gt-pop-in`, `gt-rise-in` (4px), `gt-spin`, `skeleton-shimmer`. `_motion.scss` and `_skeleton.scss` keep only
  their mixins. Every other keyframe is named after its component and defined once: Toast's entrance is `gt-toast-rise-in` (8px),
  Popover's reduced-motion fade `gt-popover-fade-in`, and from this round Modal's and Drawer's fades `gt-modal-fade-in/-out` and
  `gt-drawer-fade-in/-out`. Toast keeps `gt-fade-in/-out`, which search, scrum and the combobox borrow — still one definition each.
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
- **`lint:design`** runs two checks in the repo (`frontend/scripts/design-adherence.mjs` walks the tree and runs both; the design
  export's `_adherence.oxlintrc.json` does not run there):
  1. **Raw hex** — bare hex in `.scss/.css/.ts/.tsx` outside `frontend/src/styles/tokens/*.css`, unless the file carries a ledger comment.
  2. **Ownership** (`frontend/scripts/ownership.mjs`) — a shared component in `src/components/<Name>/` owns the classes its own
     stylesheet's rules begin with. Outside `src/components/`, a feature stylesheet fails when a selector *begins* with an owned class
     (`.gt-button`, `.gt-button--sm:hover`, `body .gt-button`), and feature markup fails when a string writes an owned class by hand
     (`className="gt-button gt-button--sm"`). Adjusting a component from the feature's own class (`.feature .gt-button`) passes.
     Deliberate exceptions go in `OWNERSHIP_ALLOWLIST`, each with its reason. Design-side feature CSS follows the same rule (this round's
     `.gt-palette__scopes .gt-filter-chips` is the passing form).

## Sync back (codebase → design)

When tokens change in the repo first: update `tokens/*.css` here to match `frontend/src/styles/tokens/` + the SCSS bridge (that
layer is the source of truth), and refresh the reference copies under `frontend/` in this folder.

**Last parity check: 2026-10-21** — reference copies from `beta`: `features/app/components/Layout/Sidebar.scss`, `Layout/Header.scss`,
`index.css`, `features/scrum/scrum.scss`, `features/app/components/Classes/CreateClassModal.scss`. Before that, 2026-10-20 — the button kit (PR #259): `components/{Tooltip/useTooltipDismiss.ts,IconButton,Button}` folded back, and the
reference copies `styles/_skeleton.scss`, `styles/tokens/colors.css` (now with the schedule kind palette) and `styles/tokens/spacing.css`
(now with `--gt-z-palette`) refreshed from that branch. Before that, 2026-10-20 — the C2 final-review brief (PR #258, branch `docs/c2-final-review-signup-brief`) plus that branch's
`pages/FinalReviews.tsx`, `FinalReviewDetail.tsx` (header), `finalReviewTemplate.ts`, `config/sidebar.ts` and the review-slot API; disagreements in
`design_handoff_final_review_signup/NOTES.md` §5. Before that, 2026-10-20 — the follow-up brief (PR #257, branch `docs/design-followup-2026-10-20`) plus that branch's
`components/{Tooltip,Toast,Popover,Skeleton}`, `styles/{keyframes.css,_motion.scss,_skeleton.scss}`, `scripts/ownership.mjs`,
`features/app/components/TeamMeetings/` and `TSRS/ContributionsTab`. Previous: 2026-10-19 — the alignment brief (a sweep of beta at `b6fff628`) plus the local checkout's
`components/{Menu,Tooltip,Popover}`, `styles/_motion.scss`, `styles/tokens/spacing.css` and
`features/app/components/Fields/DatePickerField.tsx`. Where the brief and the checkout disagreed, the brief won (see
`design_handoff_ui_alignment/NOTES.md`). Previous: 2026-10-09 (Fira Code mono, `--gt-gold-text`, `--gt-surface-sunken`).
