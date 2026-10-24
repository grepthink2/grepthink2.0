# Notes — design-system alignment round (2026-10-19)

## 1. Status colour map (brief §4.8)
Rule (decided): **green** done or positive · **blue** in progress or informational · **amber** needs attention soon ·
**red** a problem · **grey** not started or inactive. Features pass `<Badge status="area.key" />`; the colour comes from
`BADGE_STATUS` (`components/display/Badge.jsx`). Conflicts the brief listed are resolved in **bold**.

| Area | Status → colour |
| --- | --- |
| Assignment, staff | Active → blue · Draft → grey · Closed → grey (**the Dashboard and the assignments list now agree**) |
| Assignment, student | Not started → **grey** (the student home's amber goes) · In progress → blue · Submitted (Completed) → green · Due soon → amber · Opens later → grey · Closed → grey · Missed → red (new key for a closed, unsubmitted assignment) |
| Class | Active → blue · Complete → green |
| Project, browse grid | Open → green (joinable) · Closed → grey · Member → blue |
| Sprint | Active → blue · Planned → grey · Completed → green |
| Task | To do → grey · In progress → blue · Done → green · Blocked → red |
| Pull request | Open → green · Merged → **purple** (documented exception) · Closed → red · Draft → grey — GitHub's conventions |
| Attendance | Present → green · Late → amber · Absent → red · Unmarked → grey (label "Not marked", as the schedule says) — **one map** (`attendance.*`) replaces the three implementations |
| TA meeting setup | Meets weekly → blue · No Zoom link yet → amber |
| Roster | Enrolled → green · Waitlisted → amber · Dropped → red · Not on roster → amber (the instructor should resolve it) · Registered → green · Not registered → grey · **Manual and TA are categories**, not statuses |
| Requests and invitations | Incoming → amber (needs your answer) · Invitation → amber · Pending → blue (waiting on someone else) · Denied → red |
| Project health | Excellent → green · Warning → amber · Poor → red |
| Sentiment | Positive → green · Neutral → grey · Negative → red |
| Live | Live → blue (schedule, analytics, team meetings: in progress) |

The schedule's Now line stays green (`--gt-sched-now`) — it is a time marker, not a status pill.

**Category labels** (conversation type TA / Instructor / Team, "Company Sponsored", Manual, member counts) use
`<Badge category=… />`: white fill, 1px `--gt-border`, radius 7, secondary text and a 12px icon — the shape and the
outline mark them as labels, and they never borrow a status colour.

## 2. Answers to brief §8
1. **Busy buttons** — switch to the "-ing…" label *with* the spinner (`loadingLabel`), because 53 buttons already say "Saving…" and the words stay familiar. The idle and busy faces share one grid cell, so the button keeps its width in both states; it stays focusable (`aria-disabled`, `aria-busy`) and ignores clicks. Callers pass `loadingLabel` up front.
2. **Quiet destructive** — `variant="danger-ghost"`: transparent, `--gt-error-text`, `--gt-error-soft` on hover (Remove, Unsend, Delete in rows). Solid `danger` only confirms (ConfirmDialog, InlineConfirm).
3. **Icon-button tooltips** — yes, by default: the `ariaLabel` shows as a Tooltip on hover and keyboard focus (the bubble is `aria-hidden`). Opt out with `tooltip={false}` (inside another tooltip, or an absolutely positioned ×). The three icon buttons with no name today get one; IconButton requires it.
4. **Modal sizes and the form header** — sm 400 (confirms, messages), md 560 (forms), lg 760 (Edit Project). Form header: title 18/600 left, subtitle 13 secondary, × top-right, tabs under the title, pinned footer with right-aligned actions. Message header: centred 28px title (JoinClassModal).
5. **44px on phones** — minimum height (and width for icon buttons) on the control itself, not a hidden hit area: simpler, survives `overflow: hidden`, never overlaps neighbours. Exceptions: a Tag × keeps its look with a 44px hit area, and an 8-box CodeInput is one target (a tap lands on the first empty box; boxes stay 52px tall).
6. **Role badges** — yes, they carry the app's icons (Owner Crown, Product Owner Star, Scrum Master Shield, Admin Key) in the neutral category look. No role is amber, which settles the two screens' disagreement.
7. **Counter** — "128 / 500", tertiary, tabular, right of the help line. Past the limit the text is kept and flagged (counter + border red), and the form blocks the save with "Shorten this by 12 characters." — never cut by `maxlength`. A polite live region speaks at 20 left, at the limit, and when over.
8. **Required and optional** — mark the optional fields with "(optional)"; required fields carry no visible mark (the `required` attribute is announced; DatePickerField appends "required" to its name). No asterisks.
9. **Stepper** — buttons, not links or tabs: the TSR steps share one route and are completed in order. Done and error steps are buttons back; upcoming steps are inert text.
10. **Category labels** — outlined neutral pill + 12px icon (§1).

## 3. Decisions made in this round
- **Field boundaries** moved to a new `--gt-border-control` (#858585): #DADADA was 1.4:1 against white, below the 3:1 the brief requires for control boundaries. gray-500 (#8A8A8A) would pass on white but miss on the #EEEEEE canvas by 0.03. Buttons and chips keep `--gt-border` (their text identifies them).
- **Disabled fields** use the sunken fill and tertiary text with no opacity, so a value typed before saving stays readable. Buttons, chips, tabs and checks share the one opacity, 0.45.
- **Active tab / option**: white on the grey track is only 1.16:1, so the active tab also switches to primary text at 600.
- **FilterChip selected stays solid green** (both existing chips already did); Button / IconButton *pressed* is the soft green with a green border, which reads as a toggle, not a filter.
- **PasswordField**: the eye keeps the constant name "Show password" with `aria-pressed` (APG: a toggle's name shouldn't flip with its state); only the visual tooltip says Show / Hide. The brief asked for both labels — see Q3.
- **InlineConfirm** became a small component (beyond the §5 list) so the row-level delete isn't copied again; team meetings' `.gt-tm-row--confirm` is its model.
- **Modal defaults to the form header**; message dialogs pass `variant="message"`.
- **Unread is always red** — agreed. UnreadBadge is solid `--gt-error` (#DC2626, 4.8:1 behind white); the sidebar's `#FF3B30` (3.5:1, failing for 11px text) retires with it.
- **StatCard** keeps a `compact` density so analytics' tile rows keep their rhythm; one component, two densities.
- **Live** maps to blue under the rule (it is "in progress"); the analytics LivePill and the schedule's live pill should render `status="live"` when ported. **Done 2026-10-22:** ScheduleItem and the team-meetings row render `<Badge status="live" />`; the schedule's green pill, its dot and keyframes are deleted (`schedule.css`), as the codebase did in PR #269. The analytics LivePill follows when the analytics area is redone.
- **"Copied" and similar soft-green buttons**: toggles become `pressed`; "Invited" becomes `<Badge status="request.pending">Invited</Badge>` beside an outline Resend; "Copied" is the outline button's label swapping to "Copied" with a check for 2s (announced politely); "Edit submission" is an outline button; "Clear filters" is a ghost button shown only while filters apply.

## 4. Where the brief and the checkout disagreed
The checkout read was the local working tree, not `b6fff628`.
- `DatePickerField.tsx` there also has `labelClassName`; the design drops it (the FieldShell owns the label). Keep it only if a caller needs it.
- The calendar's z-index 1100 and the sidebar's 99 are literals there; the design names them `--gt-z-picker` and `--gt-z-sidebar`.
- Nothing else conflicted: Menu (`checked`, `radio`, `autoFocus="checked"`), Tooltip (`focusable`), Popover (capture-phase Esc) and the `gt-spinner` mixin match the brief and are now in the design.
- The sweep's counts (385 buttons, 144 fields, …) come from the brief; they weren't re-counted here.

## 5. Questions for the port
1. **`title` props.** Card, Modal, Alert, EmptyState, ConfirmDialog, Drawer and InfoPopover keep `title` for their visible heading; none forwards it to the DOM and the `.d.ts` files omit the HTML `title`. A strict reading of "no prop shadows an HTML attribute" would rename it `heading` (~40 call sites across the feature layers). We kept it; say if you want the rename and it's one codemod.
2. **⌘K palette and the dialog stack.** CommandPalette should join `useDialog`'s stack (or take Esc in the capture phase), so Esc closes the palette before a modal under it.
3. **Password eye name.** Constant "Show password" + `aria-pressed` (our call) or the brief's flipping label?
4. **Tooltip dismissal.** WCAG 1.4.13 wants hover content dismissible without moving the pointer: add an Esc handler that hides open bubbles in the port's Tooltip.
5. **Busy buttons** need `loadingLabel` passed up front to reserve the width — worth a lint warning when `loading` is used without it?
6. **Palette scopes and the analytics range** are single-choice: port them as `FilterChipGroup type="single"` (radio). The design's CommandPalette and AnalyticsFilterRow only swapped classes this round. The range's "Custom…" chip opens a popover; render it as a separate button after the group.
7. **Kit Roster "All students / Unteamed"** is a filter of the same list, so it should be a single-choice FilterChipGroup, not Tabs (left as Tabs in the kit screen; fix when the roster migrates).
8. **StatCard `info` copy** — the Dashboard's metric explanations need wording from the maintainer (today they only exist in hover tooltips).
9. **Team meetings** should drop its copied Button / field / Select / Alert CSS and `.gt-tm-row--confirm` in favour of the shared components and InlineConfirm.
10. **`--gt-border-control`**: confirm #858585 (or choose a ramp step) when it lands in `frontend/src/styles/tokens/colors.css`.

## 6. The port's answers to §5 (follow-up round, 2026-10-20)
From the follow-up brief (PR #257). Where an answer asked for a change, it was made this round.
1. **`title` props** stay as they are.
2. **⌘K palette and the dialog stack** — the palette joins the stack when its area migrates. The design's CommandPalette now
   runs on `useDialog` (as Modal and Drawer do): Esc and the scrim close only the topmost layer, Tab stays inside, focus returns
   to the trigger, and it portals to `<body>`; `inline` renders it in place for galleries. The search gallery shows the order:
   open "Edit project", search from inside it, the first Esc closes the palette, the second the dialog.
3. **PasswordField** keeps the constant name "Show password" with `aria-pressed` — accepted.
4. **Tooltip** hides an open bubble on Esc (WCAG 1.4.13) — added to `Tooltip.jsx` (`useTooltipDismiss`) and to IconButton's
   built-in tooltip; captured and stopped only while a bubble shows.
5. **`loadingLabel`** gets no lint rule.
6. **Single-choice filters** are `FilterChipGroup type="single"` (radio group: one tab stop, arrows move and select): the palette's
   scopes, the analytics range (with "Custom…" a separate chip button after the group: `aria-haspopup="dialog"`, `aria-expanded`,
   reading "Custom: Sep 1 – Sep 30" once applied), and the kit roster's All students / Unteamed / Invited (formerly Tabs).
7. **StatCard `info`** — only Registered Students has an explanation: "Students registered in GrepThink". The kit Dashboard's
   tile is now "Registered Students" with that ⓘ; the galleries and `StatCard.prompt.md` use it; no other tile carries one.
8. **Team meetings** — the kit screen is rebuilt from the shared Button, fields, Alert and InlineConfirm, as the codebase does.
9. **`--gt-border-control`** at #858585 is accepted.

## 7. Found this round
- **The logo.** This design tool removes `<style>` elements from any SVG it saves (tested with a two-rule file: both rules gone,
  the shapes fell back to black). The logo's colours lived in such a block, so every save — the 2026-09-24 copy-in and the
  2026-10-19 export — blackened it; the no-raw-hex rule was not involved. A copy saved as plain bytes keeps the block but is no
  longer served as an image, so byte-for-byte restoration isn't possible here. Both logo files now carry the original colours as
  `fill` attributes on the same shapes (27 `#fff`, 7 `#006837`, from the originals' `.cls-*` rules, nothing else changed). The
  repo's own files stay the originals; PORTING.md → "Assets keep their colours".
