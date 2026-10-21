# Notes — final-review slot sign-up (C2), 2026-10-20

From the brief in `uploads/2026-10-20-final-review-signup/` (PR #258). §2's decisions and calls 12–16 are followed as written; nothing here overrides them.

## 1. Decisions made in this round
1. **No disabled button carries a hidden reason.** Where an action isn't offered, the row says why in text ("You’re the Home TA", "Sign-ups are closed"); Your team's review says it with a lock line ("Sign-ups are closed, so your slot can’t change. Ask your instructor for any change."). Product Owners' rows simply have no Book once sign-ups close — the reason sits once at the top instead of on 20 rows.
2. **A first booking doesn't confirm.** Nothing is lost (a first booking keeps an appointed Review TA), it stays reversible while sign-ups are open, and the toast names the time. Moves, releases, stepping down, closing sign-ups and the day delete confirm.
3. **Refusals are said above the board, successes in a toast.** A 409 / 403 refreshes the board (frame held, `aria-busy`) and shows a dismissible warning Alert with the board's own sentence (`errorCopy`): "That slot was just taken, so your team keeps Mon, Dec 7 · 9:00 AM. The board is up to date." A network failure is an error toast, or stays inside the open dialog with the choice kept.
4. **Past rows recede by colour, not opacity** (tertiary text), so text keeps 4.5:1. The schedule layer dims past rows to 0.55, which drops body text below AA — see question 9.
5. **Delete a single free slot: immediate, with Undo** (Undo posts that time again). No team is affected, so a confirmation would only slow the instructor down; the day-level delete confirms because it removes several.
6. **After the instructor moves a team that had a Review TA, the toast offers "Appoint again"** (brief §5.4), which re-appoints the same TA in one step.
7. **Step down confirms**: the team loses its reviewer and nobody is notified.
8. **The board reflows on its own width** (container queries), so the 375px phone, a narrow window and the gallery's two-column frames share one layout rule set; the kit's media queries still give every control 44px on phones.
9. **TAs see "Final Reviews" once.** The codebase builds a TA's sidebar from the student groups plus TA Review; adding the item to the students' Coursework group would list it twice for TAs, so the port drops it from the TA's copy of Coursework (the kit shell does).
10. **The instructor's Review TA dialog shows each TA's load** ("Priya Nair · reviews 1") and never lists the team's Home TA ("Fog City’s Home TA, Priya Nair, isn’t listed."). A reviewer who is no longer a class TA stays visible as "(no longer listed)", as the codebase's select does today.
11. **"Choose a slot" / "Change slot" don't open anything new**: on the page they filter the board to Free and scroll to it; on the project card they lead to the board with `?show=free`.
12. **Free is green** (`slot.free`, bookable — the same reading as `project.open`), and `slot.past` appears only on a free slot that has started; booked past rows recede instead of carrying a pill each.

## 2. Answers to brief §12
1. **The board's form** — day sections of rows, one component for every lens (`SlotBoard` + `SlotRow`). Not a Table: Product Owners book on phones, rows must reflow there, and day sections need no group-row addition. Not a day × time grid: it can't carry reviewers, reasons and actions, and breaks on phones. Rows keep table-like columns on desktop (fixed time and actions columns) so 40 rows scan.
2. **How the Product Owner books** — a **Book** button on each free slot (and **Move here** once the team has one). A first booking doesn't confirm (§1.2); a move does, naming the slot given up and any Review TA dropped.
3. **The instructor's slot actions** — free rows: **Place a team…** + Delete inline (the two things a free slot needs); booked rows: **Open review** inline + a Menu per row (**Appoint / Change Review TA…**, **Move to another slot…**, **Release slot…**), each one dialog that names the consequence before its button. Inline Selects on 40 rows (today's page) would be noisy and auto-commit on change; a panel per slot would push the board around.
4. **The posting flow** — a right **Drawer** (480): the board stays visible behind it and a 40-time list gets the full height. Days and times on the campus clock: a day, a first and a last start fill every hour; no last start adds one time; × removes one, "Remove day" a day. Native `date` / `time` inputs (as team meetings chose). **Overlapping starts are refused** (call 15, as confirmed): the time turns into an error naming the slot it overlaps, **Change** puts it back into the Add fields to retype, × removes it, and nothing posts until each is fixed. Hourly fills never overlap themselves; a single time or a fill beside posted slots can.
5. **Deleting several free slots at once** — yes, by day: the day header's Menu offers "Delete n free slots" (ConfirmDialog, booked slots stay). No multi-select mode — checkboxes on every row add a mode for a rare task, and over-posting happens a day at a time.
6. **The sign-ups control** — a **Button beside a status Badge**, not a Toggle. Every lens sees the Badge (`signups.open` / `signups.closed`); the instructor's button names the action ("Close sign-ups") and the line under it says what the state means. **Closing confirms** ("Product Owners can no longer book, move or release, and TAs can no longer sign up to review. Review TAs can still step down, and you can still change anything. Nobody is notified."); opening doesn't, and with no slots posted the header says nobody can book yet.
7. **Where the campus time sits** — on a second line under the viewer's time, always visible: rows "9:00 AM PT on campus" / "Mon 3:00 PM PT on campus" (weekday only when the campus day differs); cards and the workspace header with the campus date ("Mon, Dec 7 · 3:00 PM PT on campus"); toasts and dialogs in parentheses. The board says the mismatch once: "Times in GMT+5:30 · campus is PT". The posting form, typed on the campus clock, shows the viewer's equivalent beside each time.
8. **The project-page card** — a card of its own (`TeamReview variant="card"`), not the compact `ScheduleItem`: its states (the call to book, who books, no Product Owner, the reasons, Release) are more than a schedule row carries. It borrows the `final_review` kind's purple tile and ClipboardCheck so the two read as one family — and the schedule layer is untouched this round.
9. **Getting around a long board** — day jump links with free counts, sticky day headers, a single-choice filter (students: Free; TAs: Teams I review · No Review TA; instructor: Free · No Review TA), and fully past days folded behind "Past days (n)" while later days remain (all shown once every day is past).
10. **Status keys and colours** — §3.

## 3. Kit additions
Only the Badge status map grows (`components/display/Badge.jsx` `BADGE_STATUS`, `.d.ts`, `display.card.html` "Final reviews" row, `Badge.prompt.md`):

| Key | Label | Colour | Why (the rule) |
|---|---|---|---|
| `signups.open` | Sign-ups open | green | positive: booking is possible (as `project.open`) |
| `signups.closed` | Sign-ups closed | grey | inactive |
| `slot.free` | Free | green | bookable |
| `slot.yours` | Your team | blue | informational |
| `live` (existing) | Live | blue | in progress |
| `slot.past` | Past | grey | a free slot that has started: inactive |
| `review.no_review_ta` | No Review TA | amber | staff should act soon |
| `review.no_product_owner` | No Product Owner | amber | the instructor should resolve it (as `roster.not_on_roster`) |

Considered and **not** added, because composing was enough: a selectable time control (the Product Owner presses Book in the row), a time-list control (posting is rows of campus times with Badge flags and an × IconButton inside a Drawer), a Table group row (the board is day sections, not a Table). Everything else is kit as the alignment round left it, plus the schedule layer's `ScheduleDayHeader` and the team-meetings model's `zonedToInstant`. Nothing the codebase lacks at C2 is used: no Combobox (native Select with optgroups for teams, slots and TAs), no FileUpload, MarkdownEditor or Stepper.

## 4. The brief's §10 file list
**Confirmed**, with these amendments:
- **New**: `frontend/src/features/finalReviews/` — `finalReviewsModel.ts` (+ tests), `components/SlotBoard.tsx`, `SlotRow.tsx`, `SlotTime.tsx`, `TeamReview.tsx`, `UnbookedTeams.tsx`, `FinalReviewsHeader.tsx` (+ `ZoomRoomField`), `SlotActionDialog.tsx`, `PostSlotsDrawer.tsx`, `ReviewWorkspaceHeader.tsx`, and `finalReviews.scss` (a 1:1 port of `finalreviews.css`). `FinalReviewsIcon` becomes lucide-react imports, no file.
- **The status map file** is `components/Badge/badgeStatus.ts` (maintainer, §6), built from `BADGE_STATUS`; it gains the seven keys above.
- **Sidebar**: besides the student item, the TA's copy of the student Coursework group drops Final Reviews so TAs see it once (§1.9) — `config/sidebar.ts` + `config/__tests__/sidebar.test.ts`.
- **Schedule layer: not touched.** The project card is `TeamReview`, not `ScheduleItem` (§2.8), so `ScheduleItem.tsx`, `schedule.scss` and `scheduleModel.ts` stay out of C2.
- **`FinalReviews.scss` is replaced** by `finalReviews.scss`; `FinalReviews.tsx` stops importing `TAManagement.scss` (that file doesn't change), as the brief says.
- `ProjectView.tsx`: one element — the "Final review" card in the aside after Sprint progress, before Team meetings, behind `showTeamReviewCard`.
- **Overlap refusal (call 15)**, as the updated brief lists: `backend/app/tas/review_slots.py` (`create_review_slots` refuses a start less than 60 minutes from another slot in the request or already posted), `backend/tests/test_tas_review_slots.py`, `backend/app/tas/models.py` if the in-request check lives in the request model, and the `create_review_slots` note in `frontend/public/.well-known/grepthink-actions.json`. The form's own check is `postingDraft().overlaps`; the server's refusal maps through `errorCopy('post', …)`.
- `App.tsx`: the `/app/ta-review/final-reviews` redirects are temporary and retire once C2 is complete.
- **The refused sign-up (§6.3)**: `backend/app/tas/controller.py` (`set_review_ta` takes the `slot_id` the TA saw and answers 409 "This team moved to another slot." when the team now holds another), `backend/app/tas/models.py` (the request model's `slot_id`), their tests, `frontend/src/lib/api/tas.ts` (`setReviewTA(projectId, userId?, slotId?)`) and `NO_SLOT_HINT` in `FinalReviews.tsx`, as the brief's §10 anticipated.

## 5. Where the brief and the checkout disagree
The local checkout's `design/` predates the alignment round; the branch (`docs/c2-final-review-signup-brief`) was read for code.
1. §3.1 lists the core kit's **"Field"**; the design kit's shell is **FieldShell** (`components/FieldShell/` in `PORTING.md`). Same component.
2. §3.4 says the codebase has `zoneDiffers`, `zoneLabel`, `fmtTime`, `fmtDayLabel`, `countdown`, `isJoinable`, `campusTimeOf`. On the branch `campusTimeOf` and `zonedToInstant` live in `features/app/components/TeamMeetings/teamMeetingsModel.ts`; the rest are the schedule model's. `FinalReviewsModel` imports from both the same way the design does.
3. Today's page labels a missing Review TA **"Open"** (and the instructor's select option "Open"); the brief's vocabulary is "No Review TA" — the design follows the brief.
4. Today's "Review" button carries its meaning in a `title` ("Open scores & review notes"); the design's button says **Open review**.
5. **The brief changed during this round** (the branch moved from `b2548099` to `50a23703` while the design was in progress): the maintainer confirmed calls 12–16 and changed call 15 from "overlaps allowed with a warning" to **"slots never overlap"** — the posting form refuses them and the backend will too. The design was updated to the new call (§2.4, `PostSlotsDrawer`, the README); the other edits (the Today's Schedule card is redesigned later and the review joins it then; the old staff addresses' redirects retire once C2 is complete) change nothing on these screens. `uploads/2026-10-20-final-review-signup/` holds the updated brief.

## 6. Questions for the port — and the maintainer's answers (2026-10-20)
Answered, and applied to the design:
1. **Status map file** — `components/Badge/badgeStatus.ts` (not `statusTones.ts`).
2. **Several Product Owners** — name the first Product Owner only (as `my_team.product_owner` already does).
3. **A TA's sign-up after the team moved** — **refused, not accepted.** The request carries the slot the TA saw; the server answers 409 when the team has moved since. `errorCopy('sign_up', { status: 409, detail: 'This team moved to another slot.' }, { team, when })` → "Your sign-up for Redwood Labs didn’t go through: the team moved to Tue, Dec 8 · 10:00 AM after you loaded the board. Sign up again at the new time?"; the board refreshes and the warning Alert carries **Sign up for Tue, Dec 8 · 10:00 AM** (SlotBoard `alertActions`). The accept-and-say success line is gone. Shown in the states sheet and the kit screen (next request → "409 team moved").
4. **The Home TA doesn't sit in the review** — from the TA side only the Review TA does. The Home TA still scores the team's categories in the scoring workspace, so the workspace header's Home TA view stays, without Join Zoom. "Teams I review" counts Review TA teams only (empty: "You’re not the Review TA of any booked team."); the TA header reads "You’re the Review TA for n teams"; Your team's review names the Review TA as who the team presents to and drops the Home TA line; a student's own board row shows only the Review TA; staff rows keep both names; a TA's row offers Join Zoom only as Review TA.
5. **Undo of a deleted slot** re-posts the same start (a new slot id) — kept.
8. **Pre-slots classes** — assume 60-minute reviews — kept.

Still open:
6. **Sticky day headers** stick to the app's content scroller (`top: 0`). If the app header ever scrolls with the content, they need its height as `top`.
7. **`?show=free`** on `/app/final-reviews` — the project card's Choose / Change slot link sets the board's filter from the URL. Agree on the parameter name.
9. **The schedule layer's past rows** use `opacity: 0.55`, which takes body text below 4.5:1; this family uses tertiary colour. Align the schedule layer when its area migrates?
11. **The schedule layer's `final_review` rows** list both reviewers as the event's people (Home TA + Review TA). With answer 4 that implies the Home TA attends; when the schedule endpoint lists final reviews, show only the Review TA there (a schedule-layer change, out of this round).
10. **The compact `ScheduleItem`** still shows the campus time only in a tooltip; when the schedule endpoint lists final reviews (kind `final_review`), it needs the visible campus line (`SlotTime`'s rule) — a later round's change, flagged here so it isn't missed.
