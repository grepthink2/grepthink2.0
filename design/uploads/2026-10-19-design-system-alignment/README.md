# Brief for Claude Design — design-system alignment round (2026-10-19)

The codebase is about to move every basic UI element onto shared React components. This round makes the design
system complete enough for that. It closes the gaps between what the design system defines and what the app
actually uses, adds the components the app needs that the design system does not have yet, and rewrites
`PORTING.md` for the new mapping. The Settings round and the C2 final-review sign-up round come after this one
and design with the result.

## 1. Why now

- `frontend/src/components/` holds only Popover, Menu, Tooltip, Toast, Skeleton, Markdown and ErrorBoundary.
  Every other basic element is built by hand in each feature. A sweep of beta (`b6fff628`, 2026-10-19) found
  385 `<button>`s in 129 files styled by 87 stylesheets, 144 native form fields in 65 files, 24 hand-built
  modals, 131 inline alerts, 84 empty states, 108 status pills, 35 avatar render sites, about 55 card surfaces,
  10 tab strips and 18 segmented controls.
- Features that followed recent handoffs copied the primitives' CSS into their own stylesheets because the
  components did not exist in the codebase. Team meetings copied Button, the field shell, Input, Textarea,
  Select and Alert; schedule copied Badge and Avatar; analytics declares its own `.gt-empty` and `.gt-table`.
- The codebase will now port each basic component once, into `frontend/src/components/<Name>/`, with typed props
  from your `.d.ts` and SCSS ported class for class from your CSS, and migrate every screen onto them.
- **The maintainer decided that migrated screens take the design system's look**, even where that visibly
  changes them. About 40 button paddings become three sizes, nine disabled opacities become one, and hover lifts
  and scale presses go. So wherever the app needs something the design system lacks, the design system has to
  grow it first. Otherwise the port invents it, and the design side never hears about it.

## 2. Decisions already made (binding)

Made with the maintainer on 2026-10-19:

1. Migrated screens take the design system's look.
2. Button gets an `outline` variant (§4.1).
3. The design system gets a shared **Combobox** (§5.1).
4. One status colour rule, applied to every status the app shows (§4.8).
5. New components: PasswordField, CodeInput, SearchField (promoted), ConfirmDialog, Drawer, Spinner, FilterChip,
   Stepper, FileUpload and MarkdownEditor, plus a pressed state for Button and IconButton (§5, §4.1).
6. `PORTING.md`: basic components map to `frontend/src/components/`, only feature-specific CSS goes in feature
   SCSS, and **the port ledger is dropped in this round** (§6).
7. Tab strips keep the grey segmented track that your team-meetings screen draws for Edit Project and that the
   app uses today. The Tabs component changes to match (§4.6).
8. This round is its own pass and lands before the Settings and C2 rounds. Do not design those screens here.

## 3. Rules for the whole round

- **Tokens only** (`var(--gt-*)`). The codebase's `lint:design` fails on a raw hex literal anywhere outside its
  token files, so the component CSS must already use tokens for the port to stay a verbatim copy. Today
  `display.css` has `#8a6d00` (gold badge text: `--gt-gold-text`), `#7d3c98` and `#b26a00` (stat-card accents:
  `--gt-purple`, `--gt-warning`) and `#f5f5f5` (skeleton shimmer), and `navigation.css` has `#ffffff` and
  `#000000` in the sidebar item. A new token goes in `tokens/*.css` first.
- **Flat and calm**: 0.2s / 0.3s ease, fades and small slides, the 0.5px press. No scale transforms and no hover
  lift inside the app (lifts are marketing-only). Light mode only.
- **Accessibility**: WCAG 2.1 AA (4.5:1 for text, 3:1 for control boundaries), the global 2px accent focus ring,
  every interactive part operable by keyboard with the WAI-ARIA pattern named in its `.prompt.md`, touch targets
  of at least 44px on phones (under 768px, see §4.1), and `prefers-reduced-motion` honoured.
- **Prop names**: no prop may shadow an HTML or ARIA attribute (§4.8 renames Badge's `role`). Keep existing
  names stable where the codebase already ports them (Popover, Menu, Tooltip, Toast).
- **Names**: never rename an existing component. Add each new one to `readme.md` → "Intentional additions" (the
  checker's "named after nothing in the kit" flag is informational).

## 4. Existing components: what changes

### 4.1 Button (`primitives/Button`)
- **Add `variant="outline"`** (decided): `--gt-surface` fill, 1px `--gt-border`, `--gt-text-secondary` text;
  on hover `--gt-surface-muted` with `--gt-border-strong`. It is the app's most common secondary style (49
  classes in 33 files: most modals' Cancel buttons, page-toolbar actions such as Roster's Upload and Timeline,
  Analytics' Refresh and Export, the preview banner's Exit). The grey `secondary` fill is `--gt-gray-100`, the
  canvas colour, so it has no edge on canvas pages. Document when to use outline, secondary and ghost.
- **Add a pressed state** (`pressed?: boolean`, rendered as `aria-pressed`) for toggle buttons. The app has 23
  `aria-pressed` toggles (Table toggles, chart legends, the admin toggle, editor toolbar buttons, password eye
  toggles). The app also gives five buttons a soft green "selected" look (Invited, Copied, Edit submission, an
  active editor toolbar button, Clear filter). Where the button is a toggle, the pressed state replaces that look
  (`--gt-primary-soft` with `--gt-primary-hover` text is a fair start). Decide what the others become, for
  example a status Badge beside an outline button.
- **Links that look like buttons**: `href` renders an `<a>` with the same classes. The app has five (the Join
  Zoom links and Browse projects); the landing page's CTAs stay in the marketing family. Show it in the gallery.
- **Quiet destructive actions**: the app has 5 solid danger buttons and 10 quiet ones (red text, or red on
  hover: Remove, Unsend, Delete in rows). Decide one quiet destructive form (for example a ghost button in
  `--gt-error-text`) and keep the solid `danger` for the confirming step.
- **Busy state**: your Button keeps its label and adds a spinner; 53 buttons in the app swap their label to
  "Saving…" instead. Decide and document one pattern. Whichever it is, the button keeps its width.
- **Reduced motion**: the codebase keeps the spinner turning, slower, with
  `animation-duration: 1.6s !important; animation-iteration-count: infinite !important`, because its global
  reduced-motion kill switch would otherwise stop it (the `gt-spinner` mixin in `_motion.scss`). Your CSS has the
  1.6s rule without `!important`. Align it.
- **Phones**: the schedule and team-meetings handoffs each ask for 44px controls under 768px. Make it the
  primitives' rule (Button, IconButton, Input, Select, the Checkbox and Toggle rows) so features stop repeating
  it, and choose how: a minimum height, or a larger hit area that keeps the visual size.
- **Sizes**: document which size goes where (md in forms and pages, sm in rows, cards and toolbars, lg and
  `fullWidth` on the sign-in pages). Keep `type="button"` as the default.

### 4.2 IconButton
- Add `pressed`, as on Button.
- One canonical close button: the × of a modal or drawer is IconButton md ghost labelled "Close". The app has
  22 modal close buttons with 20 different classes and 6 different labels ("Close", "Close modal", "Close
  settings", "Close requests", "Close editor", "Close story"). Dismissing an alert, toast or banner is "Dismiss";
  removing a chip is "Remove {name}".
- Decide whether an icon button shows its label as a Tooltip on hover and focus. The app has 73 icon-only
  buttons, and 3 have no accessible label at all today.

### 4.3 Field shell, Input, Textarea, Select
- Every field links its help and error text with `aria-describedby` and sets `aria-invalid` when it has an
  error. Your Input does both; your Select and Textarea do neither. 50 of the app's 144 fields have no
  programmatic label at all.
- Add `hideLabel` (the label stays for screen readers but is visually hidden) for fields whose purpose is obvious
  on screen (search boxes, inline editors), and a `.gt-visually-hidden` utility class in the system. A placeholder
  is never the label.
- Add a text `prefix` slot beside `iconLeft` and `suffix` (5 uses: "linkedin.com/in/", "github.com/", "@").
- Add a compact field size (32px) for toolbars and filter rows. The analytics filter row and the schedule
  toolbar already specify 32px selects.
- Textarea counter: the app has 5 counters in 4 formats. Pick one (format, when it turns to the error colour,
  whether it is announced), and say what happens past the limit (blocked by `maxLength`, or allowed and flagged,
  as the message composer does).
- Document the form pattern the team-meetings handoff started: the field grid, required and optional marking,
  the error under its field, focus moving to the first invalid field on submit, a save error as an Alert above
  the actions, and the actions right-aligned (outline Cancel, primary submit).
- Select stays native for short, fixed lists (role, term, sprint, duration; `optgroup` children allowed).
  Anything searchable or multi-select is the Combobox (§5.1).

### 4.4 Checkbox, Toggle, RadioGroup
- Checkbox and Toggle stay as designed. Check the hidden native input's position: `.gt-check__input` is
  `position: absolute` inside a label that is not positioned. Settings' email preferences use Toggle with a
  description.
- RadioGroup: the app has no native radios, but it has single choices with no semantics at all: the Draft /
  Published status cards in the assignment create and edit modals, and the template picker. Add a card variant
  (title, description, selected border) so they become a real radio group.

### 4.5 SegmentedControl
- The app has 18 segmented controls and view toggles. Only one is fully accessible: the analytics range chips,
  with a roving tabindex, arrow keys and Home/End. Give SegmentedControl that keyboard model, an `ariaLabel` for
  the group, an optional count per option (the search scopes show counts) and a full-width phone layout.
- Write the rule for choosing between them: Tabs switch between panels of different content; SegmentedControl
  switches the view or unit of the same content (Table / Cards, Tasks / Points); FilterChip narrows a list. Some
  app strips use the wrong one today, such as a course filter built as a tablist.
- With §4.6, Tabs and SegmentedControl share the track look. Keep both, since screen readers announce them
  differently (tabs and panels versus a choice). Make the visible difference deliberate: tabs stretch across
  their container, as Edit Project's do, while a segmented control sizes to its options.

### 4.6 Tabs
- Tab strips keep the grey segmented track (decided): a `--gt-gray-100` track with 4px padding and a white active
  tab with a 1px shadow. That is how your team-meetings screen draws Edit Project (`.tm-ep__tabs`), and how the
  app draws its tabs in five stylesheets today. **Update the Tabs component to that look.** Today it draws
  underlines and says it mirrors Edit Project, which no longer matches either.
- It covers Edit Project's Details / Team / Meetings, Requests' Incoming / Outgoing, the scrum board's Board /
  Backlog / Burnup, the TA meeting tabs and the member manager. Only 4 of the app's 10 strips have tab semantics
  today, and none supports arrow keys.
- Specify the keyboard model (arrows, Home/End, and automatic or manual activation), a `TabPanel` linked with
  `aria-controls` and `aria-labelledby`, the count pill on the track, icon plus label, tabs at the top of a modal
  body, and phones. Your team-meetings screen hides tab labels at phone width with `display: none`, which also
  removes them from screen readers. Keep each label in the accessible name (visually hidden) when a tab shows
  only its icon.

### 4.7 Card and StatCard
- Card: the app's ~55 card surfaces follow five or six recipes. Add:
  - a **bordered** variant for cards nested in a card or a list (1px `--gt-border`, no shadow, radius 7: member
    cards, request cards, TA cards, slot rows);
  - an **interactive** state for a card that is a link or a button (hover `--gt-shadow-hover`, focus ring,
    selected border: class cards, project cards);
  - a header **actions** slot (title left, actions right, as ChartCard has).
- StatCard: merge in analytics' StatTile (`delta`, the `trend` sparkline, `failed`, `loading`, `format`) so one
  component serves the Dashboard (DashboardMetricCard, 4 uses) and Analytics (StatTile, 6 uses). Add an info
  trigger on the label: the Dashboard explains each metric today with a tooltip only a mouse can open.

### 4.8 Badge, Tag and counts
- **Status colour rule** (decided): green = done or positive; blue = in progress or informational; amber =
  needs attention soon; red = a problem (overdue, denied, absent, dropped); grey = not started or inactive. Apply
  it to every status below, and give Badge a `status` preset prop, as it has role presets, so a feature picks a
  status rather than a colour. Put the resulting map in `NOTES.md`.

  | Area | Statuses the app shows [today's conflicts] |
  |---|---|
  | Assignment, instructor view | Active, Draft, Closed [the Dashboard swaps Active's and Closed's colours relative to the assignments list] |
  | Assignment, student view | Not started, In progress, Submitted (Completed), Due soon, Opens later, Closed [Not started is amber on the student home and grey in the assignments table] |
  | Class | Active, Complete |
  | Project, browse grid | Open, Closed, Member |
  | Sprint | Active, Planned, Completed |
  | Task | To do, In progress, Done, Blocked |
  | Pull request | Open, Merged, Closed, Draft (GitHub's conventions; Merged in purple is the documented exception) |
  | Attendance | Present, Late, Absent, Unmarked [the same map is implemented three times] |
  | TA meeting setup | Meets weekly, No Zoom link yet |
  | Roster | Enrolled, Waitlisted, Dropped, Not on roster, Manual, Registered, Not registered; TA |
  | Requests and invitations | Incoming, Invitation, Pending, Denied |
  | Project health and sentiment | Excellent, Warning, Poor; Positive, Neutral, Negative |
  | Live | Live (schedule, analytics, team meetings) |

- **Category labels are not statuses**: conversation type (TA / Instructor / Team), "Company Sponsored", member
  counts. Decide their look (we suggest neutral with an icon) so they stop borrowing status colours.
- **Rename Badge's `role` prop to `projectRole`**: `role` shadows the ARIA attribute on the element the Badge
  renders. The app's role values contain spaces (`product owner`, `scrum master`); the port maps them to your
  keys. Decide whether role badges carry the icons the app uses today (Crown, Star, Shield). Two screens use
  them, and they disagree on which role is amber.
- **Counts**: the app has 31 count pills (one 26px green recipe copied four times) and unread counts in three
  colours. Promote `UnreadBadge` (`domain/ConversationListItem.jsx`, `.gt-unread`) into `display/` as the one
  unread pill wherever unread items are counted (sidebar, header bell, conversation list, message widget), with
  its accessible text built in ("3 unread"). Add a neutral count badge for everything else (tab counts, list
  totals). Our call is that unread is always red; say so in `NOTES.md` if you disagree.
- **Tag** stays. Its remove button must be reachable by keyboard; one tag in the app is a clickable `<span>`.

### 4.9 Avatar
- One palette and one hash everywhere (`AVATAR_COLORS`, `hashColor`). The app has seven colour schemes, and one
  of them (join requests) produces colours that fail 4.5:1 behind white initials.
- Add `decorative` (`aria-hidden` and an empty `alt`) for an avatar beside a visible name. Five screens read
  the initials aloud next to the name today.
- When `src` fails to load, show the initials.

### 4.10 ProgressBar
- The app has 8 meters, and one has `role="progressbar"`. Add an inline meter (3–4px, no label) that is
  decorative when the number is printed beside it (table cells, story cards, the sprint picker).

### 4.11 Table
- Document sortable headers (a button inside the `<th>`, `aria-sort`), `scope="col"`, a visually hidden
  caption, loading rows (Skeleton), an empty row (a compact EmptyState), dense rows, a sticky header (as
  analytics has), and horizontal scrolling inside the card on phones.
- Rows that open something: the link or button lives in the first cell and the row only shows hover. The app
  has `<tr onClick>` rows that no keyboard can reach.

### 4.12 Tooltip and InfoPopover
- Tooltip stays: short, one-line labels on hover and focus.
- **Promote analytics' DefinitionPopover to a shared InfoPopover**: an ⓘ trigger that opens on click or Enter
  and closes on Esc, with a title and body on the Popover surface, for explanations. It replaces the app's
  StatTooltip (9 uses) and GroupTooltip (2 uses), which only a mouse can open.
- A disabled button cannot take focus, so a `title` explaining why it is disabled is unreachable (3 places).
  Say where the reason goes instead: helper text under the control, or an InfoPopover beside it.

### 4.13 Modal
The codebase will build one Modal with these behaviours. Design to them:
- `role="dialog"` and `aria-modal` on the sheet (not the scrim), labelled by its title. Focus moves in (to the
  first field, or a chosen element), stays inside on Tab, and returns to the trigger on close. Esc and a scrim
  click close only the topmost dialog, and the shared Popover and the ⌘K palette take Esc first. `closeDisabled`
  holds the dialog open while it saves. Long content scrolls inside the body with the header and footer pinned
  (Edit Project's `max-height: 88vh`).
- **Layer**: the codebase puts modals at `--gt-z-modal` (100). That is above the sidebar (99) and the header,
  and below toasts (1000) and the date picker's calendar (1100), which renders outside the modal. Use
  `var(--gt-z-modal)` in place of `.gt-modal-backdrop`'s `z-index: 2000`.
- Closing is a 0.15s fade, and instant under reduced motion.
- Define sizes (the app's dialogs run from a 400px confirm to Edit Project's wide sheet) and the header of a form
  dialog (title on the left, tabs below it, as in Edit Project) as opposed to a message dialog (your centred
  title).
- Avoid dialogs over dialogs. A row-level delete inside a dialog uses an inline confirm row; team meetings'
  `.gt-tm-row--confirm` is the model. Document that pattern.

### 4.14 Alert
- Add an `actions` slot (Try again, Restore draft, Discard, Unsend). Today `children` sit inside a `<p>`, so no
  button can go there.
- Document which to use when: a persistent condition is an Alert; a passing confirmation ("Saved", "Invite
  sent") is a Toast; a field error sits under its field; a save error is an Alert above the form's actions.
  Error alerts are announced at once (`role="alert"`); the other tones are status messages.

### 4.15 EmptyState
- Define the variants the app needs: page (yours), card (analytics' `.gt-empty--card`), quiet (the schedule's
  left-aligned `--quiet` with no icon well), and an error state that is never a red panel (quiet text with a Try
  again link, as the schedule handoff says). The heading level comes from the context (`titleAs`).
- "No class selected" appears on 14 pages as a bare heading and sentence. Write it once: the copy, the icon, and
  the action (open the class selector).

### 4.16 DatePickerField: align the design to the codebase
The codebase's DatePickerField has 10 uses in 5 files, so its API is the contract. Please adopt it in the
`.d.ts`:
- `label: string; value: string` ('yyyy-MM-dd', 'yyyy-MM-dd HH:mm' or ''); `onChange(value: string)`;
  `showTime?: boolean`; `disabledBefore?: Date`; `disabled?: boolean`.
- Add what it lacks: `error`, `helperText`, `required`, `disabledAfter` and `id`.

Strings keep a date-only value from shifting across time zones. Design the time row (a labelled time input and a
Done button), and fix what the codebase's version gets wrong:
- Esc closes the calendar and returns focus to the trigger.
- The trigger has `aria-haspopup="dialog"` and `aria-expanded`.
- The trigger reads its label and the chosen value. Today its `aria-label` "Pick {label}" hides the value.

The calendar renders outside any modal (portaled, at z-index 1100) and flips up or down to fit.

### 4.17 Not changing
- Pagination: no screen uses numbered pages (search has its own compact pager). Keep it; the codebase will not
  port it until a screen needs it.
- SidebarNavItem: it has one consumer, the app sidebar, which stays in the layout code.
- Popover, Menu, Toast and Skeleton are already ported. Adopt the codebase's additions on your side:
  - Menu's `checked` rows (menuitemcheckbox), `radio` rows (menuitemradio) and `autoFocus="checked"`;
  - Tooltip's `focusable={false}`, for a trigger inside another control;
  - Popover's own text colour, and its capture-phase Esc, so a popover inside a modal closes alone.

## 5. New components

For each one, deliver `.jsx` + `.d.ts` + `.prompt.md` in the group folder named, the CSS in that group's CSS
file, and every state in the group's `*.card.html` gallery.

### 5.1 Combobox (`primitives/`)
- The WAI-ARIA combobox pattern: an input with `role="combobox"`, a listbox popup and `aria-activedescendant`.
  Up, Down, Home, End, Enter and Esc work as the pattern says, and Backspace in an empty input removes the last
  chip.
- Modes:
  - single select with type-to-filter;
  - multi-select with chips (Tag) and an optional maximum;
  - async results: debounced, with loading, empty and error rows;
  - creatable entries ("Add 'React'", validated email addresses);
  - grouped options;
  - option rows with an avatar or icon and a second line (people, projects).
- It replaces the TSR view's searchable dropdown, the interest form's multi-select and ranked project pickers,
  the staffing project search, the new-conversation people search, the create-project skills input and the
  invite modal's email chips. It does not replace the ⌘K palette, and not the class and school switchers, which
  stay Menus.
- Align its option rows with the scrum MentionListbox.

### 5.2 PasswordField (`primitives/`)
An Input with a show/hide IconButton in the suffix, labelled "Show password" / "Hide password", with
`aria-pressed`. It covers 5 fields on the sign-in, sign-up and reset pages.

### 5.3 CodeInput (`primitives/`)
One-time code boxes: 8 characters for a class join code, 6 digits for email verification codes (3 screens).
Pasting fills every box, typing advances, Backspace steps back, and the group has one label. Include error and
disabled states.

### 5.4 SearchField (promoted from `search/`)
The search layer's `SearchField` (`.gt-search-field`, with a search icon and a clear button) becomes a primitive
for the app's search boxes.

### 5.5 ConfirmDialog (`feedback/`)
- `role="alertdialog"`, with a title and a message that names the thing and the consequence.
- Cancel (outline) takes focus first; Confirm is primary, or danger when the action destroys something.
- While the action runs, Confirm shows its busy state, everything else waits, and Esc and the scrim are blocked.
  If the action fails, the error shows inside the dialog as an Alert.
- It replaces the app's ConfirmModal (5 callers), 5 `window.confirm` calls and 3 `alert()` calls.

### 5.6 Drawer (`feedback/`)
A side sheet with the Modal's behaviour: 420px from the right for editors (the assignment editor today), from
the left for the phone navigation. It has a header, a scrolling body and a pinned footer; it slides in over 0.2s
(a fade under reduced motion) and is full width on phones.

### 5.7 Spinner (`feedback/`)
The one loading indicator: sizes 14, 16, 20 and 24, a `label` for screen readers and `role="status"`. Say when
to use it rather than Skeleton. It replaces 20 spinner elements built on 9 separate keyframes.

### 5.8 FilterChip (`navigation/`)
Promote the search layer's scope chip (`.gt-scope`) and analytics' range chip (`.gt-filter__chip`) into one chip;
the schedule handoff already says its chip is the scope spec. It comes in sm (26px) and md (32px), with an
optional count. A single-choice group of chips is a radio group; multi-choice chips are pressed toggles.

### 5.9 Stepper (`navigation/`)
The TSR form's steps: each step's label and state (done, current, upcoming, error), how a done step is marked
besides colour, whether steps are links or tabs, and the compact phone form ("Step 2 of 4").

### 5.10 FileUpload (`primitives/`)
Two forms:
- an image picker for avatars and project logos, with a preview, Change, Remove, and a message giving the
  accepted types and size (the Settings round needs it);
- a drop area for CSV files (the roster import in Create Class and on the Roster page): a button that opens the
  file picker, the chosen file's name, replace, and errors.

### 5.11 MarkdownEditor (`primitives/`)
Write / Preview, a small toolbar (bold, italic, link, list, code), the Textarea with its counter, and the preview
through the codebase's MarkdownText (GitHub-flavoured Markdown). Its uses are project descriptions (a Template /
Markdown switch today) and the public issue form (Write / Preview today). The invite modal's email body is rich
text today: give it the same chrome, and the port will decide whether it stores Markdown.

## 6. PORTING.md and readme.md

Rewrite `PORTING.md` for the new mapping:
- `components/{primitives,display,feedback,navigation}/<Name>` → `frontend/src/components/<Name>/<Name>.tsx` +
  `<Name>.scss`. Class names stay 1:1, the SCSS is a port of the component's CSS block, and the typed props come
  from the `.d.ts`. Codebase-side additions are recorded in the component's doc comment and in "Known deltas".
- The feature layers (`components/{domain,scrum,analytics,schedule,search,assistant,marketing}`) → their feature
  folders and feature SCSS, as now.
- The rule that ends the copying: feature SCSS never re-declares a shared component's `.gt-*` block. A feature
  adjusts a shared component only from its own class, the way your CSS already does
  (`.gt-filter__select .gt-select__control { height: 32px }`).
- **Drop the port ledger** (decided). Put a component map in its place: each design component and its codebase
  path (SidebarNavItem → the app's sidebar; Pagination → not ported).
- Update "Known deltas" (the codebase additions in §4.17 and the spinner's reduced-motion rule) and the token
  list.

Also:
- `readme.md`: Index entries for the new components and one "Intentional additions" line for each.
- Update `_ds_manifest.json` as earlier rounds did. Leave `components/figma-reference/` untouched.

## 7. Deliverables

1. The changed and new components, with galleries showing every state: default, hover, focus, pressed,
   disabled, busy, error, empty, and phone width.
2. `design_handoff_ui_alignment/README.md` in the shape of the earlier handoffs (overview, decisions, component
   specs with exact values, keyboard and screen-reader behaviour, tokens, files), and a `NOTES.md` with the
   decisions you made, the status map (§4.8), your answers to §8, and questions for the port.
3. `PORTING.md`, `readme.md` and `_ds_manifest.json` as in §6.
4. No screen redesigns. Touch `ui_kits/` only where a screen shows a changed component; the Settings and C2 rounds
   come next.

## 8. Questions we are leaving to you (answer in NOTES.md)

1. Busy buttons: keep the label with a spinner, or switch to an "-ing…" label?
2. The quiet destructive button.
3. Does an icon button show its label as a tooltip?
4. Modal sizes, and the header of a form dialog.
5. How the 44px phone rule is met: height or hit area.
6. Do role badges carry icons?
7. The counter pattern, and what happens past the limit.
8. How required and optional fields are marked.
9. Stepper steps: links or tabs?
10. The look of category labels (conversation type, "Company Sponsored").
