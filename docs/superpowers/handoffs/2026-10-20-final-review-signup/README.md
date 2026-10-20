# Brief for Claude Design — final-review slot sign-up (C2), 2026-10-20

**From:** the grepthink2.0 codebase (beta at `666e927c`) · **To:** the "GrepThink Design System" Claude Design project
**Companion spec:** `docs/superpowers/specs/2026-10-18-schedule-sources-and-calendar-feed-design.md`, Piece C (data,
the atomic booking, the rules, the endpoints). The backend shipped in PR #250; no screen calls it yet.
**Builds on:** `design_handoff_ui_alignment/` (the kit), `design_handoff_schedule/` (the time-zone rule, the
`final_review` kind, `ScheduleItem`), `design_handoff_team_meetings/` (the form pattern, the inline confirm, the
project-page card).
**Sample data:** `sample-data.json` in this folder.
**Answer with:** `design_handoff_final_review_signup/README.md` and `NOTES.md`. The codebase builds the C2 screens
from that handoff.

## 1. What we are asking for

A final review is a team's end-of-term review: the team presents for one hour to two TAs, its **Home TA** (the TA
who runs its weekly meeting, the Meeting TA elsewhere in the app) and a **Review TA** (a second TA who signs up for
it). Until now the instructor typed
each team's time on the Final Reviews page. From this term the instructor posts a list of one-hour **slots**, each
team's **Product Owner** books one, and TAs sign up to review the teams that hold a slot. The backend for this
exists; this round designs its screens:

- **The Final Reviews page** for everyone in the class: the board of slots, in three lenses (student, TA,
  instructor), with the actions each role has (§5.1).
- **Your team's review** for students: at the top of that page, and as a card on the team's project page (§5.2).
- **The instructor's tools:** posting slots, deleting free slots, placing or moving any team, releasing any
  booking, the sign-ups switch, the shared Zoom room, appointing a Review TA (§5.3–5.5).
- **The header of the scoring workspace** (the Final Review detail page), so its time follows the time rule (§5.6).

Everything is built **from the kit** (§3.1). Final reviews start in about six weeks, around the end of instruction
(UCSC's Fall 2026 instruction ends Dec 4; finals week is Dec 7–11). The codebase builds these screens as soon as the
core kit's last pull request merges, so this round is next in line.

Not in scope: the backend and its authorization (done), notifications (none, decided), the body of the scoring
workspace (scores and notes), the Today's Schedule card and the `/app/schedule` agenda (they will list the review
as the `final_review` kind once the schedule endpoint exists), the calendar-feed settings, and the Settings round.

## 2. Decisions already made (binding)

From the approved spec (2026-10-18) and the backend as built:

1. **Slots.** The instructor posts slots as a list of start times; every slot lasts 60 minutes. A start time that
   already has a slot in the class is skipped. A slot is free, or held by exactly one team; a team holds at most one
   slot.
2. **One switch.** "Sign-ups open" governs both team booking and TA reviewer sign-up. Nothing opens or closes it on
   a schedule: the instructor flips it.
3. **Product Owner.** Only the team's Product Owner books, moves (to a free slot) or releases, and only while
   sign-ups are open, before the team's review time, and onto a slot that has not started. A team with no Product
   Owner cannot book until someone is made one (teams the instructor created start without one). A team may have
   several Product Owners; any of them can act.
4. **Instructor.** At any time, even after a slot has started: post slots, delete a free slot (a held slot is
   released first), open or close sign-ups, place any team on a free slot or move it there, release any booking,
   set the shared Zoom room, and appoint, replace or remove any team's Review TA. Placing a team on a slot that has
   already started is how a review held outside the app gets recorded.
5. **TAs.** A TA signs up as a team's Review TA only while sign-ups are open and the team holds a slot, and never
   for a team whose Home TA they are. One Review TA per team, first come, first served. A Review TA can step down at
   any time. TAs see the whole board.
6. **A slot change drops the Review TA.** When a team moves or releases (by its Product Owner or the instructor),
   its Review TA is removed, so nobody stays booked to review at a time they did not sign up for. This includes a
   Review TA the instructor appointed; the instructor can appoint them again. A first booking keeps a Review TA the
   instructor appointed before the team booked.
7. **Who sees what.** Everyone in the class sees every slot and the team holding it. Members of a team that holds a
   slot also see its time, both reviewers' names and the shared Zoom link. The board shows a student no other
   team's reviewers, and the Zoom room reaches a student only through their own team's booking. Staff see
   everything, including the teams without a slot and each one's Product Owner.
8. **One shared Zoom room** for every review in the class, set by the instructor.
9. **No notifications.** Booking, moving and releasing notify nobody. A later piece adds the review to each
   member's calendar feed.
10. **Times** show in the viewer's zone, with the campus time visible beside them when the two differ (§3.4).
    Today's Final Reviews page shows the browser's zone with no campus time; this round fixes that.
11. **The kit only.** No copied CSS and no new hand-built basics; what the kit lacks becomes a kit addition first
    (§3.1).

Calls this brief makes. The maintainer may override any of them on the pull request that adds this brief:

12. **Where students reach the screens** (§5.7): a "Final Reviews" item in the student sidebar opens the board, and
    a "Final review" card on the team's project page shows the team's booking. Not the Today's Schedule card yet.
13. **One page and one address for every role:** `/app/final-reviews`, with the scoring workspace under it at
    `/app/final-reviews/:projectId` (staff only). The old staff addresses under `/app/ta-review/final-reviews`
    redirect.
14. **Slot times are typed on the campus clock** (§5.3). Team meetings are typed on the viewer's clock, but slots
    are class-wide and finals week runs on campus time.
15. **Overlapping slots are allowed with a warning.** A start less than 60 minutes after another overlaps it, and
    every review uses the one shared Zoom room, so the posting form warns. It does not block: the backend accepts
    overlaps, and an instructor may run a second room.
16. **The scoring workspace is not redesigned.** Only its header is designed here (§5.6). The C2 implementation
    moves the rest of that page onto the kit as it stands, the way the adoption pull requests move other screens.

## 3. Rules for the whole round

### 3.1 The kit only

- Build every basic element from the kit (`components/primitives`, `display`, `feedback`, `navigation`, as the
  alignment round left them). Feature CSS holds layout and the feature's own blocks only. It never re-declares a
  kit block, and it adjusts a kit component only from its own class (`.gt-slots__row .gt-button`), never by
  restyling `.gt-button` itself.
- When a screen needs a basic element the kit does not have, add it to the kit first: in the right group, as
  `.jsx` + `.d.ts` + `.prompt.md`, its CSS in the group's file, every state in the group's gallery, and an Index line
  and an "Intentional additions" line in `readme.md`. List each one under "Kit additions" in `NOTES.md`; the
  codebase ports it into `frontend/src/components/` before it builds the screens. Compose existing components
  before you add one.
- What the codebase has when it builds C2 (the core kit): Button, IconButton, Spinner; Field, Input, Textarea,
  Select, SearchField, PasswordField, CodeInput, Checkbox, Toggle, RadioGroup, DatePickerField; Modal, Drawer,
  ConfirmDialog, InlineConfirm, Alert, EmptyState (with NoClassSelected), InfoPopover; Badge, CountBadge,
  UnreadBadge, Tag, FilterChip, Avatar, AvatarGroup; Card, StatCard, ProgressBar, Tabs, TabPanel,
  SegmentedControl, Table; and the earlier Popover, Menu, Tooltip, Toast and Skeleton.
- What it does **not** have yet: Combobox, FileUpload, MarkdownEditor and Stepper land after C2. Where a searchable
  picker would fit (choosing a team or a TA), design with Select (native, `optgroup` allowed). The codebase swaps in
  Combobox later.
- Feature layers you may reuse, as the codebase has ported them: the schedule layer (`ScheduleItem` compact,
  `ScheduleDayHeader`, the `ScheduleModel` helpers, the `final_review` kind's purple tint and `clipboard-check`
  icon) and the team-meetings patterns (the form layout, the inline confirm). The compact `ScheduleItem` shows the
  campus time only in a tooltip today, which §3.4 does not allow here; reusing it means changing it (§10 lists the
  files).

### 3.2 Status colours

Every status pill is a `Badge status="…"` from the kit's status map. The statuses this round needs are new keys in
that map, which makes them a kit addition (§9). Propose the keys and their colours by the rule (green done or
positive, blue in progress or informational, amber needs attention soon, red a problem, grey not started or
inactive), and add them to the status map in `NOTES.md`.

### 3.3 Acceptance rules

- Tokens only (`var(--gt-*)`), no raw hex anywhere in component CSS (the codebase's `lint:design` fails on one). A
  new token goes in `tokens/*.css` first.
- Flat and calm: 0.2s / 0.3s ease, no hover lifts or scale in the app, light mode only, no marketing tokens.
- WCAG 2.1 AA. Every action is a real button or link, operable by keyboard with the pattern its kit component
  names. Touch targets are at least 44px under 768px. `prefers-reduced-motion` is honoured.
- The reason beside a disabled control is visible text or an InfoPopover, never a `title` alone: a disabled button
  cannot take focus.
- Vocabulary: **Slot** (a final-review time), **Product Owner**, **Home TA** (the final-review name for the team's
  Meeting TA, `projects.assigned_ta_id`, who runs its weekly meeting), **Review TA**, **Sign-ups open / closed**,
  **Final review(s)**. Copy never calls the Review TA's place a "slot" or a "seat": it says "Review TA" ("No Review
  TA yet"). Title Case for titles and buttons, sentence case for help text.

### 3.4 Times (binding)

- The database holds instants. Every slot shows in the **viewer's** zone (the browser's).
- When the viewer's zone differs from the campus zone (compared by UTC offset at that instant, so PDT against PST
  never counts), the **campus time sits beside the viewer's time, visibly**, not only in a tooltip, with the campus
  weekday when the day differs. For example, "10:30 – 11:30 PM · 9:00 AM PT on campus"; the form is yours. The page
  also says the mismatch once ("Times in GMT+5:30 · campus is PT", the schedule layer's note).
- Days group by the viewer's zone, as in the schedule layer. A 3:00 PM PT Monday slot lists under Tuesday (4:30 AM)
  for a viewer in India.
- The posting form takes times on the campus clock and says so ("Campus time (PT)"). When the viewer's zone
  differs, it shows the viewer's equivalent beside each time.
- Every time renders as `<time datetime="<ISO instant>">`; a duration as "1 h" with `datetime="PT1H"` (the
  schedule layer's format).
- The campus zone is the class's school's (`institutions.timezone`: UC Santa Cruz `America/Los_Angeles`, İstinye
  `Europe/Istanbul`). The codebase already has the helpers (`zoneDiffers`, `zoneLabel`, `fmtTime`, `fmtDayLabel`,
  `countdown`, `isJoinable`, `campusTimeOf`).

## 4. Who sees what on these screens

| | Student | Product Owner | TA | Instructor |
|---|---|---|---|---|
| Every slot, its time, and the team holding it | yes | yes | yes | yes |
| A booked team's Home TA and Review TA | own team | own team | every team | every team |
| The shared Zoom link | own team, once booked | own team, once booked | yes | yes, and sets it |
| Teams without a slot, each with its Product Owner | no | no | yes | yes |
| Book, move or release a slot | no | own team: while sign-ups are open, before the team's review time, onto a slot that has not started | no | any team, any time |
| Sign up as Review TA, or step down | no | no | sign up while sign-ups are open and the team holds a slot, not as its Home TA; step down any time | appoint, replace or remove any time |
| Post slots, delete free slots, open or close sign-ups, set the Zoom room | no | no | no | yes |
| Open a team's scoring workspace | no | no | yes (read-only unless the team's Home or Review TA) | yes |

Also:
- A student on no team sees the board, read-only, with a line that says so.
- A Product Owner is a student; everything a student sees, they see too.
- The instructor's "View class as student" preview shows the student lens, read-only (the app blocks every write in
  preview). The instructor is on no team, so "Your team's review" shows its no-team state. There is no act-as, so
  in preview the page still reads the instructor's payload: the student lens ignores its staff fields
  (`unbooked_teams`, `review_zoom_url`).

## 5. Screens

### 5.1 The Final Reviews page: the board

- **Where:** `/app/final-reviews`, inside the app shell, for the class selected in the sidebar. The sidebar item
  "Final Reviews" (`clipboard-check`): the instructor keeps it in the Coursework group, the TA in the TA Review
  group, and students get it in their Coursework group after Assignments (TAs see it once, under TA Review).
- **Header:** the title; the sign-ups state; for TAs "You're reviewing 1 team" (the page shows this today); the
  counts ("12 slots · 7 booked · 5 free"; staff also "3 teams without a slot" and "3 booked teams without a Review
  TA");
  for staff the shared Zoom room (the instructor edits it). The instructor's actions: **Post slots** and **Open
  sign-ups** / **Close sign-ups**.
- **The zone note** when the viewer's zone differs from the campus zone (§3.4).
- **Students** see "Your team's review" (§5.2) above the board.
- **The board:** the slots by day, in time order. Each slot shows its time with the campus time when it differs,
  its state (free, held by a team, your team's, live, past) and the viewer's actions on it:
  - **Student:** none; their own team's slot is marked.
  - **Product Owner:** **Book** on a free slot while the team has none; **Move here** on a free slot once it has
    one; **Release** on their own slot. A free slot that has started cannot be booked, and shows as past.
  - **TA:** on a booked slot, the Home TA and the Review TA; **Sign up to review** when the team has no Review TA
    and the rules allow, otherwise the reason ("Sign-ups are closed", "You're the Home TA"); **Step down** when
    they are its Review TA; **Open review** to the scoring workspace. A filter for the teams they review (as Home or
    Review TA).
  - **Instructor:** on a free slot, **Place a team** (a Select: teams without a slot first, then booked teams, which
    move) and **Delete**; on a booked slot, **Move** (to a free slot), **Release**, the Review TA (a Select of the
    class's TAs other than the Home TA, with "No Review TA"), and **Open review**.
- **Teams without a slot** (staff): each team with its Product Owner, or "No Product Owner", and its Home TA; for the
  instructor, **Place on a slot** (a Select of free slots).
- **Density:** a class of 30–40 teams over three to five days means 40 or more slots. Design the long board, not
  only the sample: compact rows, day headers that stay in view, and a way to reach a day.
- A table or a list is your call. If it is a Table, the kit's Table rules hold: a row's action lives in a cell
  (never `<tr onClick>`), and on phones the table scrolls inside its card.

### 5.2 Your team's review (students)

At the top of the board for a student on a team, and as the "Final review" card on the team's project page (§5.7).
Its states:

| State | What it says and offers |
|---|---|
| No slot, sign-ups open, viewer is Product Owner | A call to book, leading to the free slots |
| No slot, sign-ups open, viewer is a member | "Your Product Owner, Jordan Lee, books your team's slot." |
| No slot, the team has no Product Owner | Nobody can book until someone is made Product Owner; ask the instructor |
| No slot, sign-ups closed | One state for both before sign-ups open and after they close: the app stores a single switch and cannot tell the two apart, so the copy must read right in both. The instructor can still place the team |
| No slot, every slot taken | Ask the instructor for a time |
| Booked | The day and time (with the campus time when it differs); a countdown within 7 days ("in 3 days", "tomorrow", "today"); the Home TA and the Review TA, or that no Review TA has signed up yet; the shared Zoom link, or that the instructor has not set it yet. For the Product Owner, **Change slot** and **Release** while the rules allow, otherwise the reason |
| Booked, sign-ups closed | The booking, read-only; the Product Owner is told to ask the instructor for any change |
| Joinable, then live | From 10 minutes before the start until the end, a primary **Join Zoom** (the schedule layer's Join window); from the start, the review is live |
| Past | The day the team was reviewed; no actions |
| On no team | That the viewer is not on a team, read-only |

### 5.3 Posting slots (instructor)

- Opens from **Post slots**, in a Modal or a Drawer (your call).
- The instructor enters days and times on the campus clock (§3.4): typically two to five days with five to eight
  hourly starts each, in one sitting, before sign-ups open. Picking a day, a first and a last start that fill in
  every hour between them, and adding or removing a single time cover the usual layouts.
- Before posting, the form shows the list it will post and marks the times that already have a slot (the server
  skips them) and the overlaps (§2, call 15).
- Times in the past are allowed, with a note that teams cannot book them but the instructor can place a team on
  them.
- At most 200 times per post (the API's limit).
- After posting: "Posted 8 slots.", or "Posted 6 slots. 2 times already had one."

### 5.4 Managing slots (instructor)

- **Place or move a team.** Moving a team that has a Review TA drops that Review TA (§2, decision 6), so the
  confirmation names them: "Move Trailhead to Tue, Dec 8 · 10:00 AM? Luis Ortega will no longer be its Review TA."
  After the move, offer to appoint the same TA again. Moving a team whose review time has passed carries the same
  warning as releasing one (below).
- **Release a booking.** The confirmation names the team, the time, and the Review TA it drops. When the review time
  has passed, the review may already have been held and scored. Say that releasing clears the team's time and its
  Review TA, while the scores already entered stay.
- **Delete a free slot.** No team is affected. A confirmation, an undo, or neither is your call. A held slot cannot
  be deleted ("Release the team first").
- **Review TA.** Appoint, replace or remove at any time, whether or not the team holds a slot (a first booking
  keeps the appointment).

### 5.5 Sign-ups and the Zoom room (instructor)

- **Open / Close sign-ups:** one control in the header; every lens sees the state. Closing stops Product Owners from
  booking, moving or releasing and TAs from signing up (a Review TA can still step down), while the instructor can
  still change anything; say so where the instructor flips it. Opening with no slots posted is allowed; say that
  nobody can book yet.
- **The shared Zoom room:** the instructor sets, edits or clears it; TAs see it; a student sees it only on their own
  booked team.

### 5.6 The scoring workspace header (staff)

At `/app/final-reviews/:projectId`: back to the board, the team's name, the viewer's role ("Instructor", "You're
the Home TA", "You're the Review TA", "Read-only"), the review's day and time (with the campus time when it
differs) or "No slot yet", the Home TA, the Review TA, and the Zoom link (a primary **Join Zoom** inside the
window). The rest of the page is not redesigned.

### 5.7 Where students reach it (recommendation)

- **A sidebar item** for students that opens the board. It shows all term, as the staff item does; before slots
  exist, the page says so. Reason: when the instructor says "book your slot on GrepThink", students need somewhere
  to look, and no notification points them there.
- **A card on the team's project page**, in the aside after Sprint progress and before Team meetings, for the
  team's own members only: "Your team's review" (§5.2) with a link to the board. The Product Owner's actions lead
  to the board, or act from the card (your call). The card appears once the class has slots or sign-ups are open,
  and is absent before. People who are not on the team see no card.
- **Not yet:** the Today's Schedule card and `/app/schedule` (they will list the review as the `final_review` kind
  when the schedule endpoint lands), a prompt on the student home, and the Edit Project modal.

## 6. States to show

Show each in the screen file, in every lens where it applies:

- First load (skeleton), refetching after an action (the board holds its frame), page error (quiet text with
  **Try again**, never a red panel).
- No slots posted: the instructor's empty state leads to **Post slots**; everyone else is told that slots are not
  posted yet.
- Sign-ups open; sign-ups closed, with slots posted and with none (before opening and after closing are one
  state, §5.2).
- A team booked, seen by its Product Owner, its member, another student, a TA (Home TA, Review TA, neither) and the
  instructor.
- **A slot taken by a race:** the Product Owner (or the instructor) picks a free slot that another team booked a
  moment earlier. The server answers 409 ("That slot was just taken."); the board refreshes, says so, and the team
  keeps the slot it had.
- A slot that started in the meantime (409), sign-ups closed in the meantime (403), the team's review time passed
  (403).
- **A move**, with and without a Review TA to drop; **a release**, with and without one.
- A live review (the Join window); a past review; past days on the board.
- Every slot taken while teams still have none; a team without a Product Owner; a student on no team.
- A TA who is the team's Home TA; another TA signing up as the team's Review TA a moment earlier (409).
- A finished class from before slots existed: its teams have review times but the class has no slots (§8).
- The instructor's actions on a slot that has started (placing a team to record a review; releasing one).
- An overlapping time and a past time in the posting form.
- A viewer in another zone (India, GMT+5:30): campus times visible, days regrouped.
- Phone width (375px); long team names; 40+ slots; many teams without a slot; the student-preview mode.

## 7. Actions, confirmations and errors

The web client throws an `ApiError` with the status and the backend's `detail`. The backend's sentences are
written for people, so the copy can stay close to them; adjust it where the screen needs. Success is a polite Toast
("Booked Mon, Dec 7 · 11:00 AM.", "Moved to Tue, Dec 8 · 10:00 AM. Luis Ortega is no longer your Review TA.").

| Action | Who | Request | Errors (status: detail) |
|---|---|---|---|
| Book, move, place | Product Owner (own team); instructor (any team) | `POST /api/tas/review-slots/{slot_id}/book` `{project_id}` → `{status: 'booked' or 'moved', slot_id, starts_at}` | 409: "That slot was just taken." · 409: "That slot has already started." · 403: "Sign-ups aren't open." · 403: "Your team's review time has passed." · 403: "Only the team's Product Owner can book a slot." · 404: "Slot not found" · 404: "Project not found" |
| Release | Product Owner (own team); instructor | `POST /api/tas/projects/{project_id}/review-slot/release` → `{released}` (false when the team held none) | 403: "Sign-ups aren't open." · 403: "Your team's review time has passed." · 403: "Only the team's Product Owner can release a slot." · 404: "Project not found" |
| Post slots | instructor | `POST /api/tas/classes/{class_id}/review-slots` `{starts_at: string[]}` → `{created}` | 422 when a time repeats in the list, lacks an offset, has seconds, or the list is empty or over 200 |
| Delete a free slot | instructor | `DELETE /api/tas/review-slots/{slot_id}` → 204 | 409: "Release the team before deleting its slot." (a team booked it in the meantime) · 404: "Slot not found" |
| Open or close sign-ups | instructor | `POST /api/tas/classes/{class_id}/review-window` `{open}` | — |
| Set the Zoom room | instructor | `POST /api/tas/classes/{class_id}/review-zoom` `{zoom_url}` (null clears) | — |
| Sign up as Review TA | TA (self); instructor (appoints, `user_id`) | `POST /api/tas/projects/{project_id}/review-tas` `{user_id?}` | 403: "The end-of-quarter review window is not open" · 403: "This team hasn't booked a review slot yet." · 400: "The additional reviewer must be a different TA than the team's assigned TA" · 400: "The reviewer must be a designated TA of this class" (a TA removed in the meantime) · 409: "This team already has an additional reviewer" |
| Step down, or remove a Review TA | the Review TA; instructor | `DELETE /api/tas/projects/{project_id}/review-tas/{user_id}` | 403 only for anyone else, which these screens never offer |

A repeated sign-up by the team's current Review TA succeeds and changes nothing. Confirmations: moving and
releasing always confirm, because both can drop a Review TA and a release leaves the team with no time. Whether a first booking confirms is your call (§12). Destructive confirmations follow the kit:
ConfirmDialog, or InlineConfirm inside a row or a dialog.

## 8. Data contract

The page reads `GET /api/tas/classes/{class_id}/review-slots` for every lens. Staff also read
`GET /api/tas/classes/{class_id}/final-reviews` (both at once) for the reviewers of every team, and the instructor
reads the class's TAs (`GET /api/tas/classes/{class_id}`) for the Review TA Select. The campus zone comes from the
class's school. The types, simplified from `frontend/src/lib/api/types.ts`:

```ts
/** GET /api/tas/classes/{class_id}/review-slots: every member of the class, the instructor, and its TAs. */
interface ApiReviewSlots {
  class_id: string;
  signups_open: boolean;              // classes.review_period_open, "Sign-ups open"
  slots: ApiReviewSlot[];             // every slot in the class, in starts_at order
  my_team: {                          // the caller's own team; null when on none (staff usually)
    project_id: string;
    name: string;
    is_product_owner: boolean;
    slot_id: string | null;
    starts_at: string | null;         // ISO instant, e.g. "2026-12-07T17:00:00+00:00"
    zoom_url: string | null;          // this, home_ta and review_ta are filled only once the team holds a slot
    home_ta: { user_id: string; name: string } | null;
    review_ta: { user_id: string; name: string } | null;
    product_owner: { user_id: string; name: string } | null;  // ADDED by the C2 implementation (see below)
  } | null;
  unbooked_teams: {                   // teams without a slot, by name: the instructor and TAs only, [] for others
    project_id: string;
    name: string;
    product_owner: { user_id: string; name: string } | null;
  }[];
  review_zoom_url: string | null;     // the shared room: the instructor and TAs only, null for others
}

interface ApiReviewSlot {
  id: string;
  starts_at: string;                  // ISO instant
  duration_minutes: number;           // always 60
  team: { project_id: string; name: string } | null;   // null = free
}

/** GET /api/tas/classes/{class_id}/final-reviews: the instructor and class TAs only. */
interface ApiFinalReviewSchedule {
  class_id: string;
  review_zoom_url: string | null;
  review_period_open: boolean;
  my_review_count: number;            // teams where the viewer is the Review TA
  teams: {                            // every team, by review time, teams without a slot last
    project_id: string;
    name: string | null;
    final_review_at: string | null;   // the team's slot start; null = no slot
    home_ta: { user_id: string; name: string | null; email?: string | null } | null;
    review_ta: { user_id: string; name: string | null; email?: string | null; claimed_at?: string | null } | null;
  }[];
}
```

- **`my_team.product_owner`** does not exist yet. The C2 implementation adds it, so that a member can be told who
  books and a team without one can be told why nobody can. Design with it. It names one Product Owner (the backend
  picks one when a team has several, as it already does for `unbooked_teams`), or null when the team has none.
- A free slot can be booked by a Product Owner until it starts. A booked slot is live from its start for 60 minutes
  and past after that, and its Zoom link is joinable from 10 minutes before the start until the end. The browser
  computes all of this from the instant and the clock.
- The slots read gives a student no reviewers for other teams and no Zoom link outside `my_team`, so the student
  lens has no place for them. (Another endpoint, `GET /api/tas/projects/{project_id}/review-tas`, lists any team's
  reviewers to members of the class; the board does not use it.)
- Classes from before slots existed (the finished summer 2026 class) have review times with no slots: the staff
  read lists each team's `final_review_at` while the slots read lists no slots. Show staff those times read-only,
  as history; students see the no-slots state.
- `sample-data.json` holds one class (CSE 115A, Fall 2026, UC Santa Cruz) with 12 slots over two days, 10 teams and
  4 TAs: the staff payload, the `my_team` of each student case, the staff schedule, the class's TAs, an empty
  class, three clocks (booking week, review day, after the reviews) and two viewer zones.

## 9. Kit additions we expect

Decide each in the round, and add to the kit only what composing cannot do:

- **Status keys** for this round in the Badge status map. Candidates: sign-ups open and closed; a free slot; your
  team's slot; a live review (the existing `live` key); a past review; a booked team with no Review TA yet (staff);
  a team without a Product Owner (staff).
- **Choosing a time**, if the Product Owner picks from a set of times rather than pressing a button in a row: a
  RadioGroup card or a single-choice FilterChipGroup may fit; a new selectable time control would be a kit addition.
- **Entering a list of times** for posting: Tags with a remove button and a time Input may be enough; a time-list
  control would be a kit addition.
- **A table grouped by day**, if the board is a Table: the kit's Table has no group header rows. Either one Table
  per day, or a group-row addition to Table.

## 10. For the C2 implementation: the files it touches

The handoff confirms this list, or amends it in `NOTES.md`. From the day the handoff lands until C2 merges, every
file on it is excluded from the shared-UI adoption pull requests. New files are listed so nobody else creates them.

New:
- `frontend/src/features/finalReviews/**`: the board, the team card, the posting form, their model and SCSS, and
  their tests.

Changed:
- `frontend/src/App.tsx`: `/app/final-reviews` for every role in the class, `/app/final-reviews/:projectId` for
  staff, and redirects from `/app/ta-review/final-reviews` and `/app/ta-review/final-reviews/:projectId`.
- `frontend/src/features/app/config/sidebar.ts` and `config/__tests__/sidebar.test.ts`: the student item and the
  staff items' new path.
- `frontend/src/features/app/config/routePermissions.ts` and `config/__tests__/routePermissions.test.ts`: the board
  is a shared class page; its detail page follows it.
- `frontend/src/features/app/components/RequireReviewAccess.tsx` and
  `components/__tests__/RequireReviewAccess.test.tsx`: guard the scoring workspace only.
- `frontend/src/features/app/pages/FinalReviews.tsx` and `FinalReviews.scss`: the page becomes the board.
- `frontend/src/features/app/pages/FinalReviewDetail.tsx` and `FinalReviewDetail.scss`: the header, the time rule,
  and the move onto the kit.
- `frontend/src/features/app/pages/finalReviewTemplate.ts`: its two time formatters give way to the zone-aware
  helpers.
- `frontend/src/features/app/utils/reviewDates.ts`: its header comment cites those formatters (a comment change).
- `frontend/src/features/app/pages/finalReviewsGrouping.ts` and `pages/__tests__/finalReviewsGrouping.test.ts`:
  replaced by the new model.
- `frontend/src/features/app/pages/__tests__/FinalReviews.readOnly.test.tsx`.
- `frontend/src/features/app/components/Project/ProjectView.tsx`: the team card in the aside, one element.
- `frontend/src/lib/api/tas.ts`, `frontend/src/lib/api/types.ts` and `lib/api/__tests__/tas.reviewSlots.test.ts`:
  `my_team.product_owner`.
- `frontend/public/.well-known/grepthink-actions.json`: the `list_review_slots` note.
- Any kit addition from this round: its `frontend/src/components/<Name>/**`, and the new keys in the Badge status
  map (`statusTones.ts`, which the badges kit pull request adds under `frontend/src/components/Badge/`).
- Only if this round changes the schedule layer: `frontend/src/features/schedule/components/ScheduleItem.tsx`,
  `features/schedule/schedule.scss` and `features/schedule/scheduleModel.ts`.
- `backend/app/tas/review_slots.py` and `backend/tests/test_tas_review_slots.py`: `my_team.product_owner`.
- `AGENTS.md`: the times rule loses its Final Reviews exception, and the Vocabulary says that Home TA is the
  final-review name for the Meeting TA.

Not touched, so nobody holds them for C2: the student home and its Today's Schedule card, the Edit Project modal,
`features/app/components/TAManagement/**` (the final-review pages stop importing `TAManagement.scss`; the file
itself does not change), and `features/app/utils/memberUtils.ts` (the pages stop using `getInitials`; its removal
belongs to the kit's cleanup).

## 11. Deliverables

1. The feature family, for example `components/finalreviews/` (name it): the board, its rows, "Your team's review"
   (page and card), the posting form, the instructor's slot actions, and a pure model (`FinalReviewsModel`: which
   actions each lens has on each slot and why the others are unavailable, grouping by day in a zone, the copy for
   each state). Each as `.jsx` + `.d.ts` + `.prompt.md`, one CSS file with BEM `.gt-*` classes and no raw hex, a
   `*.card.html` gallery of every state, and a sample-data module from `sample-data.json`.
2. Kit additions, if any, in their kit groups (§3.1 and §9).
3. `ui_kits/grepthink/final-reviews.html` with `FinalReviewsScreen.jsx`: the page in the app shell, the
   project-page card in its aside, the posting flow, every confirmation, and the scoring workspace header. A demo
   bar switches the lens (instructor, TA, Product Owner, member, no team, student preview), the clock (booking
   week, review day, after), the zone (PT, India), the data (ready, empty, loading, error, many slots), the
   sign-ups state, and the viewport (desktop, phone).
4. `design_handoff_final_review_signup/README.md` in the shape of the earlier handoffs (overview, decisions,
   requirements to design mapping, screens, component specs with exact values, interactions and keyboard, states,
   data contract, model, tokens, files), with the class names the port should keep. `NOTES.md` holds the decisions
   you made, your answers to §12, the kit additions, the new status keys, §10's file list (confirmed, or with your
   changes), and questions for the port.
5. A `PORTING.md` feature-layer row for the new family, `readme.md` Index and "Intentional additions" lines, and
   `_ds_manifest.json` updated as in earlier rounds. Leave `components/figma-reference/` untouched.

## 12. Questions we leave to you (answer in NOTES.md)

1. The board's form: a table, day sections of rows, or a grid of days and times? One component for every lens?
2. How the Product Owner books: a button on each free slot, or choose a time and then confirm? Does a first booking
   confirm?
3. The instructor's slot actions: inline in the row, a Menu per row, or a panel per slot?
4. The posting flow: a Modal or a Drawer, and how days and times are entered.
5. Deleting several free slots at once: needed, and how?
6. The sign-ups control: a Toggle, or a Button beside a status Badge? Does closing confirm?
7. Where the campus time sits beside the viewer's time.
8. The project-page card: the schedule layer's compact `ScheduleItem` (kind `final_review`, changed to show the
   campus time visibly, §3.1), or a card of its own?
9. Getting around a long board (40+ slots): day chips, sticky day headers, collapsed past days?
10. The status keys and their colours.
