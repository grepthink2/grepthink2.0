# Brief for Claude Design — kit fold-back round (2026-10-22)

The codebase now holds the core kit, ported from your export:
- buttons (PR #259);
- fields (#261), and the Slider (#263);
- dialogs and messages (#265);
- badges, chips and avatars (#266);
- cards, tabs and tables (#268).

Each component was rendered beside your gallery and compared element by element: size, colour, border, font, padding,
ARIA and keys. That turned up a few bugs in the design's own CSS, and a few behaviours the codebase had to add. This
round folds them back, so the next re-port changes nothing. It also applies two maintainer decisions and the naming
audit.

Run it before the C2 final-review screens. It adds no components and redesigns no screens.

## 1. Make the galleries render like the app

Most of the bugs in §2 hide in the galleries and only show in the app, because the app's base styles differ from the
gallery's:
- `*, *::before, *::after { box-sizing: border-box; }`;
- `body { line-height: 1.5; }`;
- a global `button` rule: padding `0.6em 1.2em`, weight 500, radius 8px, a border-colour transition.

Your reference copy `frontend/src/index.css` has all three, but no gallery loads it.

**Do:** load that reference copy in every `*.card.html` page, after `styles.css`, so each gallery shows what the app
will show. Then fix what it reveals: §2's box-model and button items are the known ones.

## 2. Bugs in the design's CSS that the port fixed

Fix each one in the design, so the re-port stays a no-op.

**Raw buttons (every component).** A component that renders a raw `<button>` must set its own padding, weight,
radius and transition. Otherwise the app's global `button` rule leaks in. These fixed it in code:
- the search box's clear button;
- the date picker's trigger, month arrows and day cells;
- the Tag's ×;
- the filter chips;
- tabs and segmented options;
- the table's sort and open-row buttons;
- the Card's stretched title button, which is `border-radius: 0`.

**primitives.css**
1. **DatePickerField's calendar header.** `th.dpf__cal-weekday { display: inline-flex }` takes the weekday cells out
   of the table, so the header reads "SUMOTUWE…" and the first column is wide. Your own gallery shows it. Use
   `display: table-cell; text-align: center; vertical-align: middle`.
2. **"(optional)"** needs a space before it: "Description (optional)", not "Description(optional)".
3. **DatePickerField on phones:** the month buttons are 44px.
4. **Slider:**
   - values snap to the steps that run from `min`, and the top is the last step inside `max`. On 0…10 in steps of 3,
     the export reports 10 while the thumb sits at 9.
   - the focus ring is the thumb's alone. The range's own box drops the global ring, which otherwise outlines the
     whole control.

**feedback.css**

5. **The card EmptyState** sets `min-height: 120px` on a padded box with no `box-sizing`. That counts the padding in
   the app, so the card renders 32px short: 144px against your 176px. Set `box-sizing: border-box` and
   `min-height: 176px`.
6. **InfoPopover's panel** renders inside its label and inherits the label's text styles. In a StatCard caption
   (uppercase, tracked, semibold), "Learn more" shows as "LEARN MORE". `.gt-infopop__panel` resets `text-transform`,
   `letter-spacing`, weight, `font-style`, `line-height` and `white-space`.

**display.css**

7. **Card clips what sits in it.** `.gt-card { overflow: hidden }` cuts off three things:
   - the tooltip of an IconButton in `actions`;
   - any Menu or Popover hung from `actions`, which render in place;
   - the focus ring of a flush table's scroll region, which fails WCAG 2.4.7.

   The codebase drops the root clip:
   - `.gt-card__body--flush` clips and rounds its own corners: the top ones when it comes first, the bottom ones when
     it comes last;
   - a focused flush child rings the card, as the interactive card does;
   - the stretched title's `::after` takes the card's radius (radius-sm when bordered).
8. **Badges, counts, tags and avatars** set their own `text-transform`, `letter-spacing` and `font-style`, because
   they sit inside uppercase captions and headings.
9. **AvatarGroup's ring** uses `box-sizing: content-box`, so a grouped avatar is 32px across as you draw it.
10. **StatCard's sparkline** has `overflow: visible`. The 3px padding clipped the end dot's ring.
11. **Table:**
    - `aria-sort` only on the sorted column, not `none` on the others: ARIA 1.2 wants one per table.
    - a neutral up-down glyph (lucide ChevronsUpDown) while a column is unsorted. A figure column sorts largest-first
      on the first click, so an up chevron there points the wrong way.
    - `stickyHeader` sticks only inside the Table's own wrapper, because its `overflow-x: auto` makes the wrapper the
      scroll box. Your sticky demo limits an outer box, which doesn't stick. Limit the wrapper instead, and say so in
      `Table.prompt.md`.

**navigation.css**

12. **The phone rule loses** (line 182). `.gt-tabs__tab, .gt-segmented__option { min-height: 44px }` has one class, so
    the size rules beat it, because they have two: `.gt-tabs--sm .gt-tabs__tab` and
    `.gt-segmented--md/--sm .gt-segmented__option`. On phones, small tabs stay 28px and segmented options 30 or 24px;
    your phone frame shows 30px. In the phone block, repeat the rule with the size rules' selectors.

**analytics.css**

13. **The breakdown table:**
    - its `thead th` rule outranks `.gt-table__num`, so the figure headers don't align right;
    - its row heights assume content-box cells.

## 3. Behaviour the codebase added

Mirror these into the `.jsx`, `.d.ts` and `.prompt.md`, and list them in `PORTING.md` → Known deltas.

**Dialogs (`useDialog` in `Modal.jsx`, shared by Modal, Drawer and ConfirmDialog):**
- the scroll lock is counted, and the last release restores the page's `overflow` only if it is still the value the
  lock set;
- focus moves in on the next task, so the key that opened the dialog can't press the field it lands on;
- on close, focus goes back past a dialog that closed in the same update, to the first opener still in the page;
- Esc is ignored while composing, when the key repeats, or when something already handled it;
- the Tab trap counts only real tab stops: visible elements with `tabIndex >= 0`, and one radio per group.

**Other components:**
- **ConfirmDialog:** the message is also the dialog's `aria-describedby`.
- **InlineConfirm:** Esc is stopped even while it is busy.
- **CodeInput:**
  - each keystroke reads the input's current value;
  - typing over a collapsed caret replaces the character;
  - `onComplete` fires once per new full code.
- **DatePickerField:** the chosen day's name ends ", selected", and `showTime` defaults to 08:00.
- **`gt-fade-in`** lives in the shared `keyframes.css`.
- **FilterChip:** a space before the count, so the name reads "TA meetings 3".
- **FilterChipGroup and SegmentedControl:** pressing the checked option, or arrowing back onto it, reports no change,
  as with native radios.
- **StatCard:** the sparkline is decorative (`aria-hidden`), since the figures are in the text. The delta tone follows
  the rounded figure, so there is no green "0%".
- **ProgressBar:** `aria-valuenow` is clamped to 0…max without rounding, and a value that isn't a number counts as 0.
- **Tabs:** `aria-controls` is set only when `idBase` is given.
- **Table:**
  - a sortable header is a button only when the table has `onSort`;
  - `rowTo` opens an in-app route; `rowHref` stays for external URLs.
- **Card:** a link card takes `to` for in-app routes, as Button does. A selected link card is `aria-current="true"`.
- **Avatar:**
  - a failed photo falls back to initials without an effect;
  - an avatar with no name is named "Avatar";
  - a caller's `style` merges over the colour.
- **AvatarGroup** is keyed by position, and `max` is at least 1.

## 4. Two decisions

1. **Live is the blue status badge.** The schedule row's green LIVE pill becomes `<Badge status="live" />`, as
   `NOTES.md` already says. That pill is `.gt-sched-item__live` with its pulsing dot, in `ScheduleItem.jsx` and
   `schedule.css`. Delete the pill's CSS and keyframes. The codebase switched in PR #269 (merged), for the Meetings tab's live row as well. The analytics LivePill
   follows when the analytics area is redone.
2. **Names: the codebase's names win.** The naming audit is attached as `REPORT.md`, from your
   `design_handoff_naming_alignment`. Rename the design side where it lists a difference:

   - **Replace with the kit component the codebase uses:**
     - `analytics/StatTile` becomes `StatCard` with `compact`;
     - `analytics/DefinitionPopover` becomes `InfoPopover`;
     - `analytics/ChartEmptyState` becomes `EmptyState` with `variant="card"`;
     - `ChartCardTool` becomes `Button` (`pressed` for the Table toggles, `outline` for Refresh and Export CSV), and
       `ChartCardCheck` becomes `Checkbox`. The codebase moves analytics onto both when analytics adopts the kit.
   - **Move (same names, other files):**
     - `MarkdownText` goes out of `scrum/CommentThread.jsx` into the kit, as `display/Markdown.jsx`;
     - export `SortableHeader` and `useTableSort` from `display/Table.jsx`;
     - `scrum/PointsChip.jsx` becomes `scrum/Chips.jsx` (PointsChip, EstimateChip, PRLinkChip, UserPair);
     - optional: give `Skeleton` its own `feedback/Skeleton.jsx`.
   - **Keep your names (decided):**
     - `LandingHeader` and `LandingFooter`, for good;
     - `MeetingCard`, since "team meeting" means the one-off kind (the codebase card will take a TA-meeting name);
     - `TeamMemberCard`, the broader name (the codebase card will take it).

     The exports the codebase builds inside a larger component, and the private constants, also keep their names.
     REPORT.md lists them.
   - **RoleSelect:** the app assigns roles the other way round, one select per role that picks a member. Draw the Team
     tab's Product Owner and Scrum Master pickers instead.
   - **PORTING.md:** the feature map's TeamMeetings paths are stale. The code is in
     `features/app/components/TeamMeetings/`.

`lint:design` now has a third check, `frontend/scripts/names.mjs`. It fails when a kit component's folder or file
name differs from your export. Update `PORTING.md`'s `lint:design` bullet.

## 5. Deliver

1. The galleries load the reference `index.css` (§1).
2. The CSS fixes in `primitives.css`, `feedback.css`, `display.css`, `navigation.css`, `analytics.css` and
   `schedule.css` (§2, §4.1).
3. The `.jsx`, `.d.ts` and `.prompt.md` changes from §3 and §4.
4. `PORTING.md`: Known deltas (§3), and the `lint:design` bullet (§4.2).
5. `NOTES.md`: §4.1 marked done.
6. `_ds_manifest.json` updated, as in earlier rounds.

No new components and no screen redesigns. Raw hex stays out of component CSS.
