# Shared UI components — design (2026-10-19)

Status: approved by the maintainer on 2026-10-19.
Appendix: [inventory of hand-rolled elements](2026-10-19-shared-ui-components-inventory.md) (beta `b6fff628`).
Companion: the Claude Design alignment brief in
`docs/superpowers/handoffs/2026-10-19-design-system-alignment/` (approved and sent on 2026-10-19).

## Intent

The design system in `design/` defines GrepThink's basic UI elements as React components with typed props
(`design/components/**/<Name>.d.ts`) and BEM `.gt-*` CSS. The codebase has shared versions of only five of them
(Popover, Menu, Tooltip, Toast and Skeleton; `frontend/src/components/` also holds Markdown and ErrorBoundary).
Every other button, field, modal, alert, badge, avatar, card and tab strip is built by hand inside its feature.
`design/PORTING.md` told features to copy each design component's CSS into their own SCSS, so they did:
team meetings re-declares Button, the field shell, Input, Textarea, Select and Alert; schedule re-declares
Badge and Avatar; analytics declares its own `.gt-empty` and `.gt-table`. Across the app that means 385
hand-built buttons, 144 hand-built fields, 24 hand-built modals (one traps focus), 131 inline alerts (43%
announced to screen readers) and about 28,500 lines of SCSS in 140 files.

This work gives every basic element one shared component in `frontend/src/components/`, ported from the design
system, and moves every screen onto them, so that a design change lands in one place, the next feature (the
Settings redesign and the C2 final-review sign-up screens come next) builds from the kit instead of copying CSS,
and keyboard and screen-reader behaviour is right by construction rather than per screen.

Success looks like this: no feature stylesheet re-declares a shared component's classes, and a check fails the
build if one does; every dialog, field, alert, tab strip and icon button in the app comes from the kit; the
Settings and C2 screens are built with it; and `PORTING.md` maps basic components to `frontend/src/components/`.

## Goals

1. One shared component per basic element the app uses, in `frontend/src/components/<Name>/`, its SCSS ported
   class for class from the design CSS, its typed props from the design `.d.ts`, with tests.
2. Every screen in scope moved onto the kit, area by area, with the SCSS that only styled hand-built elements
   deleted. Feature SCSS keeps only feature-specific rules.
3. The accessibility the shared components carry by construction: labelled fields with linked help and errors,
   dialogs that trap focus and close one at a time, announced alerts, tabs and segmented controls with the
   WAI-ARIA keyboard models, labelled icon buttons, explanations a keyboard can open.
4. A `lint:design` check that stops features re-declaring or hand-rendering shared components.
5. `PORTING.md` maps basic components to `frontend/src/components/`; the port ledger is gone.
6. The core kit lands before the C2 screens are built, and the whole kit before the Settings redesign is
   implemented.

## Non-goals

- Redesigning screens. Layouts stay; only their basic elements change (and with them, their look: see the
  first decision below).
- The public site (`features/landing/**`, including the contact page's contact and issue cards). It is the
  marketing family, with its own tokens and allowed hover lifts.
- Feature component families (scrum, analytics charts, schedule, search palette, assistant, domain composites
  such as RosterRow or ProjectCard) beyond their use of basic elements.
- Settings and the final-review pages: their redesigns adopt the kit (see "Pull requests").
- Backend changes, dark mode, a committed component gallery or Storybook, new runtime dependencies.
- Dead code and bugs unrelated to the kit (listed under follow-ups).

## Anti-goals

This fails even if it technically works when:

- A screen looks different depending on which page loaded first (two sets of rules for one class).
- A shared component's look is overridden per screen, so the duplication comes back under new names.
- A migration breaks keyboard or screen-reader behaviour that worked (focus lost on submit, Esc closing two
  dialogs, a label dropped).
- A coverage threshold goes down, or a gate is skipped, to get a PR through.
- One giant PR sits open for weeks and rots against beta.
- The migration edits Settings or the final-review pages while they are being redesigned.
- The codebase invents variants the design system does not know about, so the two drift apart.

## Decisions made with the maintainer (2026-10-19)

From the session that set up this work:

- Shared basic components live in `frontend/src/components/`; only feature-specific CSS goes in feature SCSS.
- The port ledger in `PORTING.md` is dropped once it is no longer needed.
- The plan stays local (`docs/superpowers/plans/` is gitignored); the spec goes in a PR onto `beta`.

In this session:

1. **Migrated screens take the design system's look**, even where that visibly changes them.
2. **The design system is aligned first.** A Claude Design round, its own pass before the Settings and C2
   rounds, adds what the app needs. Its brief (approved and sent) decides:
   - Button gets an `outline` variant and a pressed state;
   - a shared Combobox;
   - one status colour rule (green done or positive, blue in progress or info, amber needs attention soon, red a
     problem, grey not started or inactive), applied through Badge `status` presets;
   - new components: PasswordField, CodeInput, SearchField (promoted), ConfirmDialog, Drawer, Spinner,
     FilterChip, Stepper, FileUpload, MarkdownEditor;
   - tab strips keep the grey segmented track the app uses today, and the Tabs component changes to match;
   - `PORTING.md` gets the new mapping and **drops the ledger in that round**.
3. **About 14 pull requests, one area at a time** (this spec has 16: see "Pull requests").
4. **C2 goes right after the core kit.** Final reviews start in about six weeks (the 2026-10-18 note: "nobody
   reviews for about six weeks"), and teams cannot book a slot in the app until C2 ships: the booking API exists,
   but no screen calls it. So the C2 screens start as soon as Kit D2 (PR 7) has merged; Kit E and the seven
   adoption PRs wait until C2 ships. If the alignment export is late, the kit starts from today's design and
   picks up the export's changes when it lands.

## Calls made in this spec (for the maintainer to check)

1. A foundation PR goes in while Claude Design works: the `lint:design` ownership check, one copy of each shared
   animation instead of 33, and a coverage floor for `src/components/`.
2. The kit waits for the alignment export so no component is ported twice, with one exception (decision 4):
   "late" means the export has not been imported by the time the foundation PR merges. Kit PRs built before the
   import port today's design CSS, and the import PR then ports the export's changes into them.
3. Each kit PR deletes the feature copies of its own classes and moves those features onto it in the same PR.
4. Components are imported by path (`@/components/Button/Button`). No barrel file: Vite treats each stylesheet
   import as a side effect, so a barrel would pull every component's CSS into any page that uses one.
5. Modal, Drawer and ConfirmDialog are built on a portal with a focus trap and a dialog stack, not on the native
   `<dialog>` element: `showModal()` makes everything outside the dialog inert, which would disable the date
   picker's calendar (it renders outside the modal), and jsdom 30, which runs the tests, does not implement it.
6. A busy Button keeps keyboard focus: `aria-disabled` and `aria-busy` with clicks ignored, rather than the
   native `disabled` the design's JSX uses, which drops focus to the page when you submit.
7. Modals sit on `--gt-z-modal` (100): above the sidebar and header, below toasts and the date picker's
   calendar. The six that use 2000 today move down.
8. The ownership check allows a feature to adjust a shared component from its own class (`.feature .gt-x`),
   never to re-declare one. Exceptions live in a short, commented allowlist in the script.
9. No new runtime dependency. The Combobox is built in-house on the WAI-ARIA pattern; the ⌘K palette already
   implements one.
10. DatePickerField moves into `components/` keeping its string API (the alignment brief asks the design to
    adopt it); `SortableHeader` and `useTableSort` move into `components/Table/`; InitialsAvatar and the four
    initials helpers give way to Avatar and `lib/avatarColors.ts`.
11. Visual checks use local, git-excluded harness pages (the repo's existing practice); no committed gallery.
12. 16 PRs rather than 14: the display kit is split in two to keep each PR reviewable.
13. Every file the C2 handoff names joins the adoption PRs' exclusion list from the day the handoff lands until
    C2 merges, wherever its student screens end up (team page, student home, schedule card, a new route).
14. If C2 needs a Kit E piece, it uses the nearest core-kit control (a Select rather than a Combobox), and the
    swap happens when Kit E's consumers move.

## Constraints

- React 19, TypeScript 5.9 (Dependabot's TypeScript 7 bump, #242, is open), Vite 8 (rolldown), SCSS with
  `--gt-*` tokens. Path aliases `@/`, `@components/`, `@features/`, `@styles/`.
- `npm run lint` (ESLint; every react-hooks rule is an error; `react-refresh/only-export-components`, so a
  component module exports components only), `npm run lint:design` (no raw hex outside the token files),
  `npm run build` (`tsc -b && vite build`), `npm run test:coverage` (thresholds in `vite.config.ts`: lines 52,
  statements 52, branches 48, functions 48; they only ever go up). CI runs all four on every PR into `beta`.
- Baseline on `b6fff628`: 135 test files, 1,507 tests, coverage lines 58.66%, statements 57.89%, branches 56.23%,
  functions 54.59%. The shared components today: lines 98.1%, branches 90.5%, functions 93.3%. Built CSS:
  487,222 bytes in 37 files.
- The design export replaces `design/` wholesale on every import, and only imports change `design/PORTING.md`.
  Claude Design reads the maintainer's local main checkout, so anything it must know goes in its brief.
- Claude never signs in, so signed-in screens are checked through local harness pages (git-excluded
  `frontend/<name>-mock.html` rendering real components on sample data).
- PRs go onto `beta`, one at a time, each cut from fresh `origin/beta`. Never push to `main`.

## Where things stand

Full detail, with paths, is in the [appendix](2026-10-19-shared-ui-components-inventory.md).

| Design component | Hand-built today | Copies of the design's classes |
|---|---|---|
| Button, IconButton | 385 `<button>`s in 129 files, styled by 87 stylesheets; about 40 paddings; 73 icon-only (3 unlabelled); 10 links styled as buttons; 53 busy buttons swap their label | `.gt-button*` in `TeamMeetings/teamMeetings.scss` |
| Input, Textarea, Select, field shell | 144 native fields in 65 files; 50 with no programmatic label; 12 custom dropdowns | `.gt-field*`, `.gt-input`, `.gt-textarea`, `.gt-select*` in `teamMeetings.scss` |
| Checkbox, Toggle, RadioGroup | 4 checkboxes, 1 switch; radio-like status cards with no semantics; 18 segmented controls | — |
| DatePickerField | the app's own (10 uses in 5 files), missing Esc, focus return and popup state | `.dpf` is the app's block |
| Modal | 24 overlays; 13 with `role="dialog"`, 1 traps focus, 3 restore focus; stacked pairs close together on Esc | — |
| Alert, Toast | 131 inline messages, 43% announced; Toast used only on the scrum board | `.gt-alert*` in `teamMeetings.scss` |
| EmptyState, Skeleton | 84 empty states; 14 copies of "No class selected"; 20 spinners on 9 keyframes | analytics' own `EmptyState` and `.gt-empty` |
| Badge, Tag | 108 pills with conflicting status colours; 31 count pills; unread counts in 3 colours | `.gt-badge*` in `features/schedule/schedule.scss` |
| Avatar | 35 render sites; 7 colour schemes (one fails contrast); 4 initials helpers | `.gt-avatar*` in `schedule.scss` |
| Card, StatCard, ProgressBar | ~55 card surfaces; DashboardMetricCard + StatTile; 8 meters (1 with `role="progressbar"`) | — |
| Table | 16 tables; mouse-only sorting in one; unreachable clickable rows | analytics' own `.gt-table` |
| Tabs, SegmentedControl | 10 tab strips (4 with tab semantics, none with arrow keys) | — |
| Tooltip | 2 hover-only tooltip components (11 uses); 36 `title` attributes | — |

Also: 5 `window.confirm` and 3 `alert()` calls; global class collisions (`.tsrs-btn`, `.status-badge`,
`.ta-card`, `.formGroup`, `.error`, `.buttonRectangle`) where the last stylesheet loaded wins; every stylesheet
that imports `@styles/index.scss` re-emits four keyframes (33 copies each in the build).

## Design

### 1. Order of work

1. **Foundation PR** (now, while Claude Design works): the ownership check, the keyframes fix, the coverage
   floor for `src/components/`. No visible change.
2. **Import PR**: the alignment export replaces `design/`. It brings the new `PORTING.md` and the props contracts
   the kit ports. (If the export is late, it lands between kit PRs and ports the export's changes into the
   components already built: call 2.)
3. **Core kit PRs** (five: A, B, C, D1, D2): build the components, delete the feature copies of their classes,
   move those features.
4. **C2**, the final-review sign-up screens: their own work under the schedule-sources spec, built from the C2
   Claude Design handoff with the core kit (decision 4).
5. **Kit E**: the composites (Combobox, FileUpload, MarkdownEditor, Stepper).
6. **Adoption PRs** (seven): move one area at a time onto the kit and delete its hand-built styles.
7. **Cleanup PR**: remove what the kit made obsolete globally; raise the coverage thresholds.

The Settings implementation starts once Kit E has landed (it needs FileUpload and CodeInput) and adopts the kit
directly. Neither C2 nor Settings counts among this spec's 16 PRs.

### 2. Conventions for every shared component

**Files.** `frontend/src/components/<Name>/<Name>.tsx`, `<Name>.scss` imported by the component, and
`__tests__/<Name>.test.tsx`. Helpers, constants and types that other modules import live in sibling modules
(`react-refresh/only-export-components`), e.g. `components/Button/buttonClassName.ts`. A family may share a folder
(`components/Field/` holds the shell; `components/Modal/` holds `useDialog`). Import by path; no barrel file.

**Porting the CSS.** The component's SCSS is the design CSS block for that component, in the design's order, with
the same class names, so `git diff design/` after an import maps line for line onto it (Popover, Menu and Tooltip
already work this way). Allowed changes, each with a comment: a raw value replaced by its `--gt-*` token;
codebase-side additions (named in the TSX doc comment and the PR, so the design side can adopt them at its next
sync); and the spinner's reduced-motion rule (below). Component SCSS reads runtime `--gt-*` custom properties, not
SCSS `$` variables, and does not `@use '@styles/index.scss'` unless it needs a mixin.

**Props.** The design `.d.ts` after the import is the contract. Every component:
- accepts `className`, appended to its BEM classes, and spreads remaining native props onto its main native
  element;
- takes `ref` as a prop (React 19) and passes it to that element, so a form can focus its first invalid field;
- works controlled, and uncontrolled where the native element allows (no forced `checked={false}` defaults);
- uses lucide-react icons, `aria-hidden`, in place of the design's inline SVGs.

Where the export and this spec disagree, the export decides the look and the prop names, and this spec decides
behaviour and accessibility; the PR names the difference.

**Accessibility baseline.** Native elements first. Every control has an accessible name. Help and error text is
linked with `aria-describedby`; invalid fields carry `aria-invalid`. Keyboard models follow the WAI-ARIA
Authoring Practices pattern named per component below. The global focus ring in `index.css` stays the only focus
style (components opt out only with `inset var(--gt-focus-ring-tight)` where they clip). Touch targets reach 44px
on phones as the export specifies. `prefers-reduced-motion` stops motion; spinners keep turning, slower (the
`gt-spinner` mixin's `!important` rule, which beats `index.css`'s kill switch).

**Tokens.** Colours, radii, shadows, spacing, type and z-index come from `--gt-*` properties. A new token goes in
`frontend/src/styles/tokens/*.css` first (the only files where `lint:design` allows hex), mirrored on the design
side at its next sync.

**Tests.** Testing Library, querying by role and name. Each component's test covers defaults, every prop's effect,
the accessibility wiring, its keyboard model, and its interactions. The `src/components/**` coverage floor (lines
and statements 90, branches and functions 85) keeps the kit tested.

### 3. The components

Kit PR letters refer to "Pull requests" below. "From" names the design source after the import.

| Component | From | Kit | Replaces first |
|---|---|---|---|
| Button | `primitives/Button` | A | team meetings' `.gt-button` copy |
| IconButton | `primitives/IconButton` | A | — |
| Spinner | new, `feedback/` | A | team meetings' spinner and duplicate `gt-spin` |
| Field (shell) | the `.gt-field` block | B | team meetings' inline field helpers |
| Input, Textarea, Select | `primitives/` | B | team meetings' field copies |
| SearchField | promoted from `search/` | B | — |
| PasswordField, CodeInput | new, `primitives/` | B | — |
| Checkbox, Toggle, RadioGroup | `primitives/` | B | — |
| DatePickerField | `primitives/DatePickerField` (codebase API) | B | `features/app/components/Fields/DatePickerField` (moved) |
| Modal (+ `useDialog`) | `feedback/Modal` | C | Edit Project's shell and its nested confirm |
| Drawer | new, `feedback/` | C | — |
| ConfirmDialog | new, `feedback/` | C | `features/app/components/Overlays/ConfirmModal` (5 callers) |
| Alert | `feedback/Alert` | C | team meetings' `.gt-alert` copy |
| EmptyState | `feedback/EmptyState` | C | analytics' own `EmptyState` and `.gt-empty` |
| InfoPopover | promoted from `analytics/DefinitionPopover` | C | analytics' `DefinitionPopover` |
| Badge | `display/Badge` (`status`, `projectRole`) | D1 | schedule's `.gt-badge` copy and local `Badge` |
| UnreadBadge, CountBadge | promoted from `domain/` (+ neutral count) | D1 | — |
| Tag | `display/Tag` | D1 | — |
| FilterChip | new, `navigation/` | D1 | — |
| Avatar, AvatarGroup | `display/Avatar` | D1 | schedule's `.gt-avatar` copy and `Face`; messages' `InitialsAvatar` |
| Card | `display/Card` | D2 | — |
| StatCard | `display/StatCard` (+ StatTile) | D2 | `Dashboard/DashboardMetricCard`, analytics' `StatTile` |
| ProgressBar | `display/ProgressBar` | D2 | — |
| Tabs, TabPanel | `navigation/Tabs` (segmented track) | D2 | Edit Project's tab strip |
| SegmentedControl | `navigation/SegmentedControl` | D2 | — |
| Table (+ SortableHeader, useTableSort) | `display/Table` | D2 | `shared/SortableHeader`, `utils/useTableSort`, analytics' `.gt-table` |
| Combobox | new, `primitives/` | E | — |
| FileUpload | new, `primitives/` | E | — |
| MarkdownEditor | new, `primitives/` | E | — |
| Stepper | new, `navigation/` | E | — |
| Popover, Menu, Tooltip, Toast, Skeleton | already shared | — | unchanged API; adoption only |

Not ported: Pagination (no screen uses numbered pages; search keeps its compact pager), SidebarNavItem (one
consumer, the app sidebar), the `figma-reference/` set, and the feature families.

The behaviour each component must have, beyond its `.d.ts`:

**Button.** Variants from the export (primary, secondary, outline, ghost, danger, and its quiet destructive
form), sizes sm/md/lg, `fullWidth`, `iconLeft`/`iconRight`, `loading`, `pressed` (`aria-pressed`). `type`
defaults to `"button"`. `href` renders an `<a>`; `to` renders a react-router `Link` (codebase addition), both with
the button's classes; a link cannot be disabled, so a disabled link-button renders without `href` and with
`aria-disabled`. `loading` keeps focus (call 6), shows the Spinner and follows the export's busy-label decision.
`buttonClassName({ variant, size, fullWidth })` in a sibling module serves the rare element that cannot be a
Button. Tokens: `--gt-primary`, `--gt-primary-hover`, `--gt-gray-100`, `--gt-surface`, `--gt-surface-muted`,
`--gt-border`, `--gt-border-strong`, `--gt-text-secondary`, `--gt-error`, `--gt-error-text`, `--gt-radius-sm`,
`--gt-focus-ring`, `--gt-transition-fast`.

**IconButton.** `ariaLabel` is required and becomes `aria-label`; variants ghost/solid/danger; sizes 28/36/44;
`pressed`; the label tooltip if the export adds one. The close button of every dialog and drawer is IconButton
md ghost labelled "Close"; dismiss is "Dismiss"; removing a chip is "Remove {name}".

**Spinner.** Sizes from the export; with `label`, it renders `role="status"` and visually hidden text; inside a
busy button it is `aria-hidden`. It replaces the app's 20 spinner elements and their 9 keyframes.

**Field family.** `Field` renders the label (or a visually hidden one with `hideLabel`), the required marker, the
control, help or error text, and an optional footer (the counter), and gives its control an `id` (from `useId`
unless one is passed), `aria-describedby` (merged with any the caller passes) and `aria-invalid`. Input,
Textarea, Select, SearchField, PasswordField, CodeInput, DatePickerField and Combobox all render through it. Field
errors are not live regions: the form moves focus to the first invalid field on submit, and a save error is an
Alert above the actions. Input adds `prefix`, `iconLeft`, `suffix` and the compact size; Textarea adds the
export's counter pattern; Select keeps native options and `optgroup` children. PasswordField puts a pressed
IconButton ("Show password" / "Hide password") in the suffix. CodeInput renders N boxes (8 characters for a join
code, 6 digits for a verification code) as one labelled group: typing advances, Backspace steps back, paste fills
every box, the first box carries `autocomplete="one-time-code"`.

**Checkbox, Toggle, RadioGroup.** Native inputs, visually replaced, positioned inside their label.
`indeterminate` is set through a ref. Toggle is `role="switch"`. RadioGroup is a `fieldset` with a `legend`, plus
the card variant for the assignment modals' Draft / Published choice.

**DatePickerField.** Moves to `components/DatePickerField/`, keeping its API (`label`, string `value` in
`yyyy-MM-dd` or `yyyy-MM-dd HH:mm`, `onChange(value: string)`, `showTime`, `disabledBefore`, `disabled`) and adding
`disabledAfter`, `required`, `helperText`, `error` and `id`. `DATE_ONLY_FORMAT` and `DATETIME_FORMAT` move to a
sibling module. Fixes: Esc closes the calendar and returns focus to the trigger; the trigger has
`aria-haspopup="dialog"` and `aria-expanded`, and its accessible name is its label plus the chosen value; the
time input is labelled and controlled. Its SCSS moves from `$` variables to `--gt-*` tokens. The calendar stays
portaled at z-index 1100.

**Modal, Drawer, ConfirmDialog.** One internal hook, `useDialog`, gives all three the same behaviour:
- The dialog renders through a portal into `document.body`. The sheet (never the scrim) has `role="dialog"` (or
  `alertdialog`), `aria-modal="true"`, and `aria-labelledby` pointing at the title (`aria-describedby` at the
  subtitle when there is one).
- A module-level stack orders open dialogs; only the topmost reacts to keys and the scrim.
- On open, focus moves to `initialFocus`, else the first focusable element in the body, else the sheet. Tab and
  Shift+Tab wrap inside the sheet (the RosterTimelineModal trap is the reference). The trap acts only on Tab
  keydown inside the sheet and never pulls focus back from outside, so a portaled layer opened from the dialog
  (the date picker's calendar) keeps working. On close, focus returns to the element that had it, if it still
  exists.
- Esc closes the topmost dialog. The listener sits on `document` in the bubble phase, so the shared Popover and
  the ⌘K palette (capture phase) and any inner component that stops Esc (the team-meetings form) win. Composition
  input is ignored. `closeDisabled` blocks Esc, the scrim and the ×.
- A scrim click closes the dialog only when the mousedown started on the scrim itself.
- Body scroll is locked while any dialog is open, by a counter that restores the previous `overflow` value (the
  app's modals reset each other's locks today).
- Closing plays the export's exit (a short fade) with a `--leaving` class, then unmounts; under reduced motion it
  unmounts at once. `lazyModal` keeps working: it mounts the dialog on first open and leaves it mounted.
- Layer: `var(--gt-z-modal)` (call 7).

Modal follows `feedback/Modal`, with the export's sizes and its form-dialog header (title left, tabs below). Long
content scrolls inside the body with the header and footer pinned. Drawer is the side sheet (right for editors,
left for the phone navigation). ConfirmDialog is `role="alertdialog"`, focuses Cancel first, and takes
`onConfirm: () => void | Promise<void>`: while the promise is pending, Confirm shows its busy state and everything
else, including Esc and the scrim, waits; a rejection shows an Alert inside the dialog. Everything ConfirmModal
offers (`isOpen`, `onClose`, `onConfirm`, `onCancel`, `title`, `message`, `confirmText`, `cancelText`) has a
counterpart under the export's prop names, and today's semantics stay: Confirm runs `onConfirm` and then closes;
the Cancel button runs `onCancel` (if given) and then closes; ×, Esc and the scrim only close. One caller needs
care: CreateProject's "Switch to Template?" dialog uses its Cancel button as the action ("Continue" switches and
drops content, "Stay" is the confirm). Since ConfirmDialog focuses Cancel first, that dialog moves with its
buttons swapped: Confirm is "Switch to template" (destructive), Cancel is "Stay". A ConfirmDialog may open over
a Modal; a row-level delete inside a dialog uses the inline confirm row instead (the team-meetings pattern).

**Alert.** Tones success/warning/error/info, title, body, dismiss, and the export's `actions` slot. Error alerts
are `role="alert"`, the others `role="status"`. A persistent condition is an Alert; a passing confirmation is a
Toast.

**EmptyState.** The export's variants (page, card, quiet, error) and a `titleAs` heading level. One shared
"No class selected" composition replaces the 14 copies (copy, icon and the action that opens the class
selector).

**InfoPopover.** The ⓘ trigger (a real button with an accessible name, e.g. "About Messages") opens the Popover
surface on click or Enter; Esc and outside clicks close it. It replaces the hover-only StatTooltip and
GroupTooltip and explains disabled controls where a `title` attribute cannot be reached.

**Badge, UnreadBadge, CountBadge, Tag, FilterChip.** Badge takes `tone`, `projectRole` (the export's rename of
`role`), `status` (keys from the export's status map, kept in a sibling `statusTones.ts`) and `solid`; a helper
maps `project_members.role` values (`product owner`, `scrum master`) to the role keys. Badge never sets an ARIA
role. UnreadBadge is the one red unread pill, with its accessible text built in ("3 unread"); CountBadge is the
neutral or primary count. Tag's remove control is an IconButton. FilterChip is a pressed toggle in multi-choice
groups and a radio in single-choice groups (roving tabindex, arrow keys).

**Avatar, AvatarGroup.** One palette and hash: `lib/avatarColors.ts` keeps `AVATAR_COLORS` and gains `hashColor`
and `initialsOf`, replacing `memberUtils.getInitials`, `joinRequests.initialsFromEmail` and `avatarBgFromEmail`
(the one that fails contrast), `search/format.initialsOf` and the student home's `initialsFromName`. `decorative`
hides an avatar that sits beside a visible name. A failed image falls back to the initials.

**Card, StatCard, ProgressBar.** Card adds the export's bordered variant, interactive state and header actions;
StatCard merges DashboardMetricCard and analytics' StatTile (delta, sparkline, failed, loading, format) and puts
an InfoPopover on its label; ProgressBar is `role="progressbar"` with value attributes, and its inline meter is
`aria-hidden` when the number is printed beside it.

**Tabs, TabPanel, SegmentedControl.** Tabs take the segmented-track look (decision 2). Tabs are `role="tablist"`
with `tab`s linked to `TabPanel`s (`aria-controls` / `aria-labelledby`, ids from a base `id`), a roving tabindex,
arrow keys and Home/End, activation as the export says. SegmentedControl is `role="radiogroup"` with a required
`ariaLabel`, a roving tabindex and arrow keys (the analytics range chips are the reference implementation). Tabs
stretch across their container; a segmented control sizes to its options.

**Table.** `Table` follows `display/Table` (columns, rows, controlled sort, loading rows, empty row, row keys)
plus a visually hidden caption and `scope="col"` headers. `SortableHeader` (a button inside the `<th>`,
`aria-sort`) and `useTableSort` move into `components/Table/`. A row that opens something carries its link or
button in a cell, per the export; `<tr onClick>` goes away. A table whose structure does not fit `Table` uses the
`.gt-table` classes through `Table`'s parts rather than hand-written markup (the builder decides per table).

**Combobox.** The WAI-ARIA combobox pattern (input with `role="combobox"`, listbox popup,
`aria-activedescendant`), single and multi-select with chips, async results with loading, empty and error rows,
creatable entries, grouped options and rich option rows, as the export specifies. The ⌘K palette's input and
listbox code is the reference. Built in-house (call 9).

**FileUpload, MarkdownEditor, Stepper.** As the export specifies. FileUpload's drop area is a button that opens
the file picker. MarkdownEditor previews through `components/Markdown/MarkdownText` and uses Tabs for Write /
Preview. Stepper marks the current step with `aria-current="step"`.

### 4. The ownership check (`lint:design`)

`frontend/scripts/design-adherence.mjs` gains a second check beside the hex scan:

- **Owned selectors** are every selector declared in `frontend/src/components/**/*.scss`, read from that code with
  SCSS nesting resolved (compiling with the `sass` dev dependency is one way). The list grows by itself as kit
  PRs land.
- **Styles rule.** A stylesheet outside `src/components/` fails when a selector's first compound selector is, or
  begins with, an owned class (`.gt-button`, `.gt-button--sm`, `.gt-badge--neutral`): that is a copy or a
  per-screen override. A selector whose first compound is the feature's own class (`.gt-tm__head .gt-button`,
  `.gt-filter__select .gt-select__control`) passes: it adjusts a shared component from the feature's context, and
  its extra specificity makes the result independent of stylesheet order.
- **Markup rule.** A `.tsx` file outside `src/components/` (tests excluded) fails when a string in it contains an
  owned class as a whole class token (`className="gt-button gt-button--sm"` on a raw `<button>`): that is
  hand-rendered shared markup.
- **Allowlist.** A short list in the script, each entry naming the file, the selector or class and the reason,
  as `NON_COLOR_FALSE_POSITIVES` does today. The only expected entry is a composition the design itself defines on
  a shared block, such as analytics' `.gt-table--breakdown`, if the export keeps it.
- The message names the file, the selector, the owning component, and the fix ("use the component; adjust it from
  your feature's own class").
- A test runs both rules against fixture files and shows that contextual selectors pass.

Today it passes: features only reference Popover and Menu classes contextually. AGENTS.md gains the rule in the
foundation PR.

### 5. Pull requests

Each PR is cut from fresh `origin/beta`, opened onto `beta`, and leaves `npm run lint`, `npm run lint:design`,
`npm run build` and `npm run test:coverage` green with no threshold lowered. Each describes what it verified
(the PR template), with screenshots.

**PR 1 — Foundation.**
- Move `@keyframes gt-pop-in`, `gt-rise-in`, `gt-spin` (`_motion.scss`) and `skeleton-shimmer` (`_skeleton.scss`)
  into one stylesheet that `main.tsx` loads once; the partials keep their mixins. The build must then hold each
  keyframe once (33 today), and the PR reports the CSS size against 487,222 bytes.
- The ownership check (section 4), with its test.
- The coverage floor for `src/components/**` in `vite.config.ts` (aggregate; it passes today).
- AGENTS.md: the shared-components rule.

**PR 2 — Design import.** The alignment export replaces `design/` wholesale, by the recipe in `PORTING.md`:
remove the folder, unzip the export in its place, stage everything, and check the staged change against a
`diff -rq` with a scratch extraction; `git diff design/` is then the changelog. The repo is public, so read
anything new under `design/uploads/` before pushing. Check that `PORTING.md` carries the new mapping and no
ledger, and list the export's answers to the brief's open questions (its `NOTES.md`) in the PR. If the export
leaves out something the kit needs, say so in the PR and ask the maintainer whether to wait for another round or
go ahead. `design/` is never hand-edited.

**PR 3 — Kit A, buttons:** Button, IconButton, Spinner. Team meetings moves onto them; `teamMeetings.scss` loses
its `.gt-button*` block and its duplicate `@keyframes gt-spin` (and the TSX loses the `gt-button__label` and
`gt-button--loading` classes that had no CSS).

**PR 4 — Kit B, fields:** Field, Input, Textarea, Select, SearchField, PasswordField, CodeInput, Checkbox,
Toggle, RadioGroup, DatePickerField (moved, its 10 call sites and the two `DATETIME_FORMAT` importers updated).
Team meetings' form moves onto them, dropping its inline helpers and the `.gt-field`, `.gt-input`,
`.gt-textarea` and `.gt-select` copies.

**PR 5 — Kit C, dialogs and messages:** `useDialog`, Modal, Drawer, ConfirmDialog, Alert, EmptyState,
InfoPopover. ConfirmModal's five callers move to ConfirmDialog and `Overlays/ConfirmModal` is deleted. Edit
Project's shell moves onto Modal (so it gains `role="dialog"`, the focus trap, and an Esc that closes only its
confirm). Team meetings' `.gt-alert` copy goes. Analytics moves to the shared EmptyState (its `.gt-empty` rules
become the export's card variant) and InfoPopover.

**PR 6 — Kit D1, badges and people:** Badge, UnreadBadge, CountBadge, Tag, FilterChip, Avatar, AvatarGroup, and
`lib/avatarColors.ts`'s helpers. Schedule drops its `.gt-badge` and `.gt-avatar` copies, its local `Badge` and
`Face`; messages' InitialsAvatar (6 consumers) gives way to Avatar.

**PR 7 — Kit D2, structure:** Card, StatCard, ProgressBar, Tabs, TabPanel, SegmentedControl, Table with
SortableHeader and useTableSort. The Dashboard and analytics move to StatCard; Edit Project's tabs move to Tabs;
SortableHeader's three consumers update their imports; analytics' table moves to the shared Table classes as the
export defines them.

**C2 (not one of the 16).** Once PR 7 has merged, the final-review sign-up screens are built from the C2 Claude
Design handoff with the core kit, under the schedule-sources spec (piece C2). Kit E and the adoption PRs wait
until C2 ships (decision 4). If C2 needs a Kit E piece (a Combobox to pick a team, say), the C2 PR uses the
nearest core-kit control (Select) and the swap happens in Kit E's adoption.

**PR 8 — Kit E, composites:** Combobox, FileUpload, MarkdownEditor, Stepper, after C2 ships. No existing copies;
their consumers move in the adoption PRs.

**PRs 9–15 — Adoption, one area each.** Each PR moves every basic element in its area onto the kit (buttons,
fields, dialogs, alerts, empty states, spinners, badges, avatars, cards, tabs, toggles, tooltips), replaces the
area's `window.confirm` and `alert()` calls, removes its global class collisions, and deletes the SCSS that only
styled what moved, keeping layout rules. Before deleting a class, it searches the other areas for users: some
classes are shared across features (`join-class-modal__*` is used by Settings' ChangeEmailModal and
EduVerifyModal; `ta-page__empty` by the final-review pages; `browse-projects__empty` by MyProject;
`create-class-modal__term-button` by MyClasses; `gt-sched-item__live` by team meetings; `.add-assignment-btn` by
four files). Those move with their remaining users into a stylesheet of their own rather than disappearing.
1. **Auth** (`features/auth/**`): PasswordField, CodeInput for email verification, Alert for the eight
   unannounced form errors; the global `.formGroup`, `.error`, `.buttonRectangle`, `.authButton`, `.eyeToggle`
   collisions go. AccountDetails renders Settings' EduVerifyModal; that modal stays as it is (Settings owns it).
2. **Classes and modules**: CreateClassModal, JoinClassModal, ClassSettingsModal, MyClasses, Modules,
   AssignmentList, CreateAssignmentModal, AssignmentEditorModal (onto Drawer), Assignments and
   StudentAssignmentsTable, AssignmentDetail, AddAssignmentButton.
3. **Roster**: the Roster page, RosterList, ControlBar, InviteModal (email chips onto Combobox; the body editor
   keeps rich text with the MarkdownEditor's chrome), AddStudentModal, RosterTimelineModal, PieCharts.
4. **Projects**: ProjectView, ProjectDetails, ProjectList, ProjectGrid, MemberManagerModal, RequestModal,
   ProjectMembersPopover, the rest of Edit Project (Details, Team, admin toggles, logo FileUpload), CreateProject
   and its sections (MarkdownEditor, skills Combobox), BrowseProjects, MyProject, the staffing flow under
   `Project/Assign/` (ProjectSearchBar onto Combobox, StatTooltip and GroupTooltip onto InfoPopover, keyboard
   sorting in StaffingTable), and the project action buttons.
5. **Home, dashboard, TSRs, feedback, interest**: Home, StudentHomeDashboard, InstructorHomeDashboard,
   RequestsModal, Dashboard, `TSRS/**` (TsrsStepper onto Stepper, the TSR view's dropdown onto Combobox,
   `.tsrs-btn`), FeedbackForm and FeedbackView, InterestForm (multi-select and ranked pickers onto Combobox),
   NonSubmittersList, `Stats/**`.
6. **TA pages**: TAManagement (page and components: TeamMeetingCard, AddZoomModal, DesignateTAsModal,
   TAScheduleView, WeekNavigator) and TAReview. The final-review pages are left to C2.
7. **Scrum, messages, search, analytics, app shell**: the scrum modals and board, Messages and its components
   (people search onto Combobox, unread counts onto UnreadBadge, ConversationMenu's confirm and alert), MessageButton,
   search's result badges (the palette keeps its own structure), what remains of analytics, and the shell
   (Header's icon buttons and dropdowns onto Popover and Menu, the sidebar's class selector and unread badge,
   SchoolSwitcher, PreviewBanner, the phone navigation onto Drawer).

The order above is a suggestion; swap areas to avoid conflicts with concurrent work. Every adoption PR stays out of
the excluded files:
- `features/app/pages/Settings.*` and `features/app/components/Settings/**`, until the Settings redesign merges;
- `features/app/pages/FinalReviews.*`, `features/app/pages/FinalReviewDetail.*`, and every other file the C2
  handoff names (its student screens may sit on the team page, the student home, the schedule card or a new
  route), from the day that handoff lands until C2 merges;
- `features/landing/**`, always.

If the Settings redesign has not started by the time PR 15 is ready, ask the maintainer whether to migrate its
pages as they are.

**PR 16 — Cleanup.** Remove `index.css`'s scaffold `button {}` rule once no button relies on it (ErrorBoundary's
two buttons move to Button first); delete files the kit made empty; confirm the ownership allowlist holds only
reasoned entries; raise the global coverage thresholds to the new floor, rounded down; update AGENTS.md's list of
shared components; report the built CSS size against the baseline.

### 6. PORTING.md and the ledger

`design/PORTING.md` belongs to the design side, so its change travels with the alignment export (decision 2):
`components/{primitives,display,feedback,navigation}/<Name>` maps to `frontend/src/components/<Name>/`, only
feature-specific CSS goes in feature SCSS, a feature adjusts a shared component only from its own class, the
ledger is replaced by a component map, and "Known deltas" lists the codebase's additions. PR 2 checks the export
carries it. Later codebase additions (named in each kit PR) reach `PORTING.md` through the design side's next
sync-back, never by editing `design/` in the repo.

### 7. Testing, coverage and verification

- Each kit PR adds component tests (conventions above) and keeps the `src/components/**` floor. Each adoption PR
  keeps the area's feature tests passing, rewrites queries that relied on removed classes (24 test files select
  by class today) to role and name queries, and adds tests where behaviour changes (a `window.confirm` becoming a
  ConfirmDialog, a dialog's Esc order).
- Gates per PR: `npm run lint`, `npm run lint:design`, `npm run build`, `npm run test:coverage`, plus the built CSS
  size reported against the previous PR.
- Visual: each kit PR renders every component state on a local harness page next to the design's
  `components/<group>/*.card.html` gallery and attaches screenshots; each adoption PR attaches before and after
  screenshots of its screens from harness pages, and the maintainer clicks through the area.
- Keyboard: each PR that touches a dialog, tab strip or picker walks it by keyboard (Tab cycle, Esc order, arrow
  keys) and records the result in the PR.

### 8. Risks

| Risk | Where it is handled |
|---|---|
| Two sets of rules for one class during the changeover | Each kit PR deletes the copies of its classes; the ownership check keeps them gone |
| Dialog behaviour regressions (Esc order, nested dialogs, portaled calendars, layers, exit animations) | `useDialog` (section 3), PR 5 starts with Edit Project and ConfirmModal, keyboard walk per PR |
| Visible change across the app | Decision 1; screenshots per PR; the maintainer's click-through |
| The export misses something the kit needs | PR 2 lists gaps and asks before proceeding |
| C2 misses the final-review window (about six weeks out) | Decision 4: C2 right after the core kit; the kit does not wait for a late export |
| Merge conflicts with concurrent work | One PR at a time off fresh beta; areas can be reordered; Settings and C2 files excluded |
| Coverage dips when tested feature code is deleted | Kit tests first; the components floor; thresholds only rise |
| A cross-feature class deleted with its area | The search-before-delete rule in PRs 9–15 |
| Scope creep into dead code and unrelated bugs | Follow-ups below |

## Left to the builder

- The internals of `useDialog`, the roving-tabindex helper and the Combobox state machine.
- How the ownership check reads selectors (compiling with `sass`, or a nesting-aware scan).
- Per table, whether `Table` fits or the table composes `Table`'s parts.
- Per screen, which variant each old button becomes (by the export's usage rules).
- The harness pages, and how each PR's screenshots are captured.
- Splitting an adoption PR further if it grows past a comfortable review.

## Follow-ups (not in this work)

- Dead code: `features/app/components/Settings/InstructorSettings`, `StudentSettings` and `Blocks/` (never
  imported), `auth/components/LogoutButton` (unused), `.dev-toggle-*` in `AppView.scss`, `.gt-mention*` and
  `.gt-mentionbox*` in `scrum.scss`, `MOCK_OUTGOING_JOIN_REQUESTS` in `Home/mockData.ts`.
- `lint:design` does not scan `rgba()` colour literals (its own header says so).
- The landing page's buttons and forms, if the marketing family ever adopts the app kit.
- The sidebar `<nav>` has no accessible name; the ⌘K palette restores focus only when focus fell to the page.
- The search palette's own skeleton could use the shared Skeleton.
