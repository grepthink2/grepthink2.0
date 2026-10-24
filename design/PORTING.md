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
| Card, Table (+SortableHeader, useTableSort) | `components/Card/`, `components/Table/` (`Table.tsx`, `SortableHeader.tsx`, `useTableSort.ts`; loading rows reuse `components/Skeleton/TableSkeleton`) |
| StatCard | `components/StatCard/` — Dashboard's `DashboardMetricCard` and the analytics tiles (`compact`) both render it |
| ProgressBar | `components/ProgressBar/` |
| Tooltip | `components/Tooltip/` (ported; `focusable` and Esc-to-hide in both) |
| InfoPopover | `components/InfoPopover/` — replaces StatTooltip and GroupTooltip; ChartCard's ⓘ renders it |
| Markdown (MarkdownText) | `components/Markdown/` — the one Markdown renderer (comments, story modal, project page, the landing issue card); `display/Markdown.jsx` since 2026-10-22 |
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
| `components/scrum/*` | `features/scrum/` (`scrum.scss` is a 1:1 port of `scrum.css`; re-port, never hand-edit values); the four chips share `Chips.jsx` ↔ `components/Chips.tsx`; comments render the kit's MarkdownText |
| `components/analytics/*` | `features/analytics/components/` (`analytics.scss` 1:1); the tiles are StatCard `compact`, the ⓘ InfoPopover, the per-card empty state EmptyState `card`, the header tools Button (`pressed` / `outline`) and Checkbox, range chips → FilterChip |
| `components/search/*` | `features/search/` per `design_handoff_search/`; scope chips → FilterChip `sm` |
| `components/schedule/*` | `features/schedule/` per `design_handoff_schedule/`; kind chips → FilterChip `sm` |
| `components/domain/TeamMeetings*` | `features/app/components/TeamMeetings/` (`TeamMeetingForm.tsx`, `TeamMeetingsList.tsx`, `teamMeetingsModel.ts`) per `design_handoff_team_meetings/`; its fields, buttons and alert are the shared components (drop the copies) |
| `components/finalreviews/*` | `features/finalReviews/` per `design_handoff_final_review_signup/` (`finalReviews.scss` is a 1:1 port of `finalreviews.css`); SlotBoard replaces `pages/FinalReviews.tsx`'s body, ReviewWorkspaceHeader replaces `FinalReviewDetail.tsx`'s topbar + meta, TeamReview `card` goes in `ProjectView.tsx`'s aside; the seven status keys join the Badge status map |
| `components/releases/*` | `features/releases/components/` per `design_handoff_whats_new/` (`releases.scss` is a 1:1 port of `releases.css`): WhatsNewModal (the frame, rendered by the landing page and the app shell), ReleaseFeed (the lazy chunk: the list and its states), ReleaseEntry; `ReleasesModel` mirrors `version.ts` / `releaseNotes.ts` / `releaseDate.ts` and the seen rules; `releasesData.js` is gallery data. The landing tab is `WhatsNewTab` in `components/marketing/LandingHeader.jsx` → `features/landing/components/WhatsNewTab.tsx` (+ `Header.tsx` / `Header.scss`); the profile menu is `components/navigation/ProfileMenu` → `features/app/components/Layout/ProfileMenu.tsx` (replaces the dropdown in `Header.tsx` and `SchoolSwitcher.tsx`) |
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

- What's new round (2026-10-23): the on-dark ramp for `Modal tone="dark"` — `--gt-dark-surface` (#14291F), `--gt-dark-fill`, `--gt-dark-fill-hover`,
  `--gt-dark-hairline`, `--gt-dark-text`, `--gt-dark-text-muted`, `--gt-dark-text-faint`, `--gt-dark-link`, `--gt-dark-accent-soft`,
  `--gt-dark-accent-text`, `--gt-dark-scrim`, `--gt-dark-shadow-modal` (the landing page only; the app stays light) · `--gt-new-dot`, `--gt-new-dot-ring`.
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

- **What's new round, 2026-10-23** (`design_handoff_whats_new/`, brief and spec in `uploads/2026-10-22-whats-new/`): the kit grew Modal `tone="dark"`,
  `MenuGroup`, `MenuItem trailing`, `NewDot`, Badge `size="sm"` + `release.new`, and `.gt-modal__body { overscroll-behavior: contain }`; the
  releases family, the landing tab and the ProfileMenu are new feature layers (table above). **Two things to port with them:** the landing header's
  layer moves from `--gt-z-tooltip` (1000) to `--gt-z-sidebar` (99) — at 1000 it sat on top of the modal — and the header's 560px Features rule is
  now in the design (`.gt-landing-header__link--features`), with the ≤ 400 / ≤ 360 rules that fit the tab at 320px. The app's hand-built profile
  dropdown and `SchoolSwitcher` go.
- **Fold-back round, 2026-10-22** (the core kit ported in PRs #259, #261, #263, #265, #266, #268 and compared element by element) — now in
  the design, so the next re-port is a no-op. Brief and naming audit: `uploads/2026-10-22-design-foldback/`.
  1. **Galleries render like the app.** Every `*.card.html` loads the reference `frontend/src/index.css` after `styles.css` (border-box,
     `line-height: 1.5`, the global `button` rule). Every raw `<button>` in the kit sets its own padding, weight, radius and transition
     (search clear, date-picker trigger / arrows / days, Tag ×, chips, tabs, segmented options, table sort / open-row, the Card's stretched
     title at `border-radius: 0`).
  2. **CSS fixes the port found:** calendar weekdays are `table-cell`; a space before "(optional)"; 44px month arrows on phones; Slider values
     snap from `min` with the top at the last step inside `max`, and the range's own box drops the global focus ring; `.gt-empty--card` is
     `box-sizing: border-box; min-height: 176px`; `.gt-infopop__panel` resets `text-transform`, `letter-spacing`, weight, `font-style`,
     `line-height` and `white-space`; **Card no longer clips** (`.gt-card__body--flush` clips and rounds its own corners, a focused flush
     child rings the card, the stretch takes the card's radius); Badge, CountBadge / UnreadBadge, Tag and Avatar reset `text-transform`,
     `letter-spacing` and `font-style`; AvatarGroup's ring is `content-box`; the sparkline is `overflow: visible`; the phone 44px rule
     is repeated with the tabs' and segmented sizes' selectors; `.gt-tabs__panel[hidden] { display: none }`; the breakdown table's cells are
     `content-box` and `th.gt-table__num` aligns right.
  3. **Behaviour adopted:** dialogs (`useDialog` in `Modal.jsx`, shared by Modal, Drawer, ConfirmDialog) — a counted scroll lock that
     restores `overflow` only while it is still the lock's own, focus in on the next task (a field that took focus as it mounted keeps it),
     focus back past a dialog that closed in the same update to the first opener still in the page, Esc ignored while composing / repeating /
     already handled, a Tab trap over real tab stops (drawn, `tabIndex >= 0`, one radio per group); ConfirmDialog's message is the dialog's
     `aria-describedby` (Modal takes `aria-describedby`); InlineConfirm stops Esc while busy; CodeInput reads the input's current value per
     keystroke, replaces the character under a collapsed caret, fires `onComplete` once per new full code; DatePickerField's chosen day ends
     ", selected" and `showTime` defaults to 08:00; `gt-fade-in` is a shared keyframe (`keyframes.css`); FilterChip puts a space before
     the count; FilterChipGroup (single) and SegmentedControl report no change for the checked option; StatCard's sparkline is `aria-hidden`
     and the delta tone follows the rounded figure; ProgressBar's `aria-valuenow` is clamped to 0…max unrounded (non-numbers count as 0);
     Tabs set `aria-controls` only with `idBase`; Table's headers are buttons only with `onSort`, `aria-sort` sits on the sorted column
     only with a neutral ChevronsUpDown glyph elsewhere, `rowTo` is the in-app route (`rowHref` another site); Card takes `to` and a
     selected link card is `aria-current="true"`; Avatar falls back without an effect, is named "Avatar" when nameless and merges the
     caller's `style`; AvatarGroup is keyed by position with `max` at least 1. `rowTo` / `to` render an `<a>` here (no router).
  4. **Names (REPORT.md):** StatTile → `StatCard compact`; DefinitionPopover → InfoPopover; ChartEmptyState → `EmptyState variant="card"`;
     ChartCardTool → Button (`pressed` toggles, `outline` Refresh / Export CSV), ChartCardCheck → Checkbox; MarkdownText moved to
     `display/Markdown.jsx`; `SortableHeader` and `useTableSort` exported from `display/Table.jsx`; `scrum/PointsChip.jsx` →
     `scrum/Chips.jsx`; RoleSelect dropped (the Team tab picks a member per role with Select — `domain.card.html` draws the two pickers).
     Kept on purpose: LandingHeader, LandingFooter, MeetingCard, TeamMemberCard. **Design-only bundle namespaces:** this tool needs a
     same-named export per component file, so `Chips` and `Markdown` are plain objects (`{ PointsChip, … }`, `{ MarkdownText }`) —
     allowlist them beside `ModKey`.
  5. **Live is `<Badge status="live" />`** (blue, in progress) in ScheduleItem and the team-meetings row; the schedule's green pill, its dot
     and `gt-sched-pulse` are deleted (PR #269 on the codebase side). The analytics LivePill follows when analytics adopts the kit.
- **Codebase-side only (recorded, not mirrored):** Table's required `caption` named by `aria-labelledby`, overflow in both directions,
  `rowHeader` (`<th scope="row">` + the `.gt-table tbody th` rules), per-column `className`, `rowClassName`, native props and `ref`;
  Card `ref` and `to` as a react-router Link; FieldShell `showCount`; CodeInput `ref`; ConfirmDialog `className` / `ref`
  and per-try attempt state; InlineConfirm native props. They need no design counterpart.

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
- **`lint:design`** runs three checks in the repo (`frontend/scripts/design-adherence.mjs` walks the tree and runs them; the design
  export's `_adherence.oxlintrc.json` does not run there):
  1. **Raw hex** — bare hex in `.scss/.css/.ts/.tsx` outside `frontend/src/styles/tokens/*.css`, unless the file carries a ledger comment.
  2. **Ownership** (`frontend/scripts/ownership.mjs`) — a shared component in `src/components/<Name>/` owns the classes its own
     stylesheet's rules begin with. Outside `src/components/`, a feature stylesheet fails when a selector *begins* with an owned class
     (`.gt-button`, `.gt-button--sm:hover`, `body .gt-button`), and feature markup fails when a string writes an owned class by hand
     (`className="gt-button gt-button--sm"`). Adjusting a component from the feature's own class (`.feature .gt-button`) passes.
     Deliberate exceptions go in `OWNERSHIP_ALLOWLIST`, each with its reason. Design-side feature CSS follows the same rule (this round's
     `.gt-palette__scopes .gt-filter-chips` is the passing form).
  3. **Names** (`frontend/scripts/names.mjs`, 2026-10-22) — reads `_ds_manifest.json` and fails when a kit component's folder or file name
     differs from the design export (`src/components/<Name>/<Name>.tsx`, or the folder / file of the design file that groups it); feature
     layers and constants only warn, against `FEATURE_HOMES`. `NAMES_ALLOWLIST` records every deliberate difference with its reason
     (`uploads/2026-10-22-design-foldback/REPORT.md`); an entry that hides nothing any more warns, so remove it once the design catches up.

## Sync back (codebase → design)

When tokens change in the repo first: update `tokens/*.css` here to match `frontend/src/styles/tokens/` + the SCSS bridge (that
layer is the source of truth), and refresh the reference copies under `frontend/` in this folder.

**Last parity check: 2026-10-23** — the What's new brief (`docs/superpowers/handoffs/2026-10-22-whats-new/README.md`, revised 2026-10-23) and its spec
(`docs/superpowers/specs/2026-10-22-whats-new-design.md`) from the `gifted-williams-2c8524` worktree (the docs branch onto `beta` at `4376d1dd`), copied to
`uploads/2026-10-22-whats-new/`; that checkout's `features/landing/components/Header.{tsx,scss}` and `features/app/components/Layout/{Header.tsx,Header.scss,SchoolSwitcher.tsx}`
read for the tab, the 560px rule and the profile button; disagreements in `design_handoff_whats_new/NOTES.md` §5.
Before that, 2026-10-22 — the fold-back brief (`docs/superpowers/handoffs/2026-10-22-design-foldback/README.md` on `beta`) and the naming audit
(`docs/superpowers/handoffs/2026-10-22-naming-alignment/REPORT.md`), copied to `uploads/2026-10-22-design-foldback/`; the codebase's
`components/Modal/{useDialog.ts,dialogStack.ts,scrollLock.ts}`, `Table/{Table.tsx,SortableHeader.tsx,useTableSort.ts}`, `Card/Card.{tsx,scss}`,
`CodeInput/CodeInput.tsx`, `ConfirmDialog/ConfirmDialog.tsx`, `FieldShell/FieldShell.tsx` and the kit SCSS (Avatar, Badge, Slider, Tabs, Table) read for the mirrors.
Before that, 2026-10-21 — reference copies from `beta`: `features/app/components/Layout/Sidebar.scss`, `Layout/Header.scss`,
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
