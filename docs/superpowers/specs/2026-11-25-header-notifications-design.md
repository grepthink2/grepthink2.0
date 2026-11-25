# Header notifications: one header family, and a panel that keeps what you have read

**Date:** 2026-11-25 · **Status:** approved by the maintainer, 2026-11-25 · amended 2026-11-25 (section 12)

## 1. Why

The bell does not belong to the header it sits in, and its panel loses things:

- The bell is a filled Mingcute glyph loaded as an image on a 40px square, beside a 37px search
  trigger and a 40px profile button. Three controls, three heights.
- The panel is hand-built in `Header.tsx`: its own click-outside handler, no arrow keys, no focus
  return.
- It lists **unread items only**. Opening one, or pressing its ×, marks it read and it is gone.
- Every item looks the same: a title, a body, a time. Nothing says what kind it is, or which class
  or team it is about.
- A mention opens nothing: `notificationPath` has no case for it.

The 2026-11-19 design round covered this with profile pages. Its brief is
`design/uploads/2026-11-19-notifications-and-profiles/README.md`; its handoff
(`design_handoff_notifications_and_profiles/README.md`, `NOTES.md`) and components
(`archived/components/notifications/`, `archived/components/navigation/HeaderActions.*` and
`ProfileMenu.*`, `archived/components/primitives/IconButton.*`,
`archived/ui_kits/grepthink/notifications.html`) are in the GrepThink Design System artifact
(`https://claude.ai/artifact/KcRL4bj8xX1S9GkWYHfHtp`). The profile half shipped on 2026-11-24
(`2026-11-24-people-profiles-design.md`). This spec is the notifications half.

## 2. What

1. Each notification says its kind, where it is from and who caused it.
2. The panel has two views, **Unread** and **All** (the last 30 days). A read notification stays in
   All. Nothing is deleted.
3. A conversation's unread messages are one row that says how many there are.
4. The bell, the search trigger and the profile button are one family: one height, radius, surface
   and icon size, on desktop and on a phone.
5. A mention opens its card on the team's board.
6. Titles say what happened ("Sam Okafor asked to join Trailhead").
7. The profile menu gains **View profile**.

Not in this spec: notification settings in the panel (a link to Settings is enough), push or
browser notifications, new notification types, and the hover card in Messages.

## 3. What exists

- `notifications` holds `user_id`, `type`, `title`, `body`, `entity_type`, `entity_id` (text),
  `read_at`, `created_at`. Indexed on `(user_id, created_at desc)` and on unread rows. The browser
  reads it over Realtime under a `SELECT` policy scoped to `auth.uid()`.
- `GET /api/notifications` answers the newest 50 rows and `unread_count`. On each call it also
  writes the two reminders (`complete_profile`, `upload_roster`). `POST /{id}/read` and
  `POST /read-all` answer 204.
- Twelve types (`NOTIFICATION_TYPES`). Fourteen call sites create them, through
  `_insert_notification`, `_insert_notifications` and `_upsert_unread_notification`, all
  best-effort: a failed insert is logged and never raised.
- A new message does not add a row: it rewrites the one unread `message` row of its conversation
  with the latest sender and text. So the bell counts conversations, not messages, and a busy
  channel cannot flood it. Nothing records how many messages the row stands for.
- "Member left your project" is filed as `join_request`, so it opens Home's join requests.
- A mention's `entity_id` is `<project id>:<story or task id>`, and the board already opens a card
  from `?task=` or `?story=`.
- Conversations are `dm`, `team_members`, `team_ta` or `team_instructor`; a team channel has a
  `project_id`.
- `useNotifications` loads once, then refetches on any Realtime change to the user's rows.
  `markRead` updates state only after the request answers.
- The kit has `IconButton` (`ghost`, `solid`, `danger`), `Popover`, `SegmentedControl`,
  `UnreadBadge`, `NewDot`, `Tooltip`, `Button`, `EmptyState`, `Skeleton`. `lib/openSettings.ts`
  opens Settings on a section.

## 4. Two pull requests

**Pull request 1, data.** The migration, the backend, the client method and types, the catalog. The
existing dropdown keeps working: it asks for the unread view and ignores the new fields.

**Pull request 2, the header and the panel.** The kit's `raised` icon button, the header family,
the bell, the panel, the profile menu.

The migration is additive (four nullable columns, and data fixes to existing rows). **It is applied to DEV and then to
PROD before pull request 1 merges**, so the code never runs against a schema without the columns.
Old code ignores columns it does not select. The maintainer is asked before the PROD step.

## 5. Data (pull request 1)

### 5.1 Columns

```sql
ALTER TABLE notifications
  ADD COLUMN class_id   uuid REFERENCES classes(id)  ON DELETE SET NULL,
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN actor_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN message_count integer;
```

- `message_count` is for `message` rows: how many messages the row stands for. A new message to a
  conversation whose row is still unread adds one and rewrites the title, body and actor with the
  latest; once the row is read, the next message starts a new row at 1. Null (every row written
  before this change, and every other type) reads as 1.
- The count is read and written back by the same request that rewrites the row. Two messages
  landing at the same instant can count as one; the row still shows the latest message.

- Ids are stored; names are joined on read, so a renamed team shows its new name.
- A deleted class, team or account leaves the notification, without that part of its line.
- No new policy or grant: the browser's `SELECT` policy already covers the row.

### 5.2 What each type stores

| Type | `class_id` | `project_id` | `actor_id` |
| --- | --- | --- | --- |
| `message` | the team's class; none for a direct message | the channel's team; none for a direct message | the sender |
| `mention` | the team's class | the team | the author |
| `join_request`, `join_request_unreviewed` | the team's class | the team | the requester |
| `join_rejected` | the team's class | the team | none (who declined is not said today) |
| `project_created` | the team's class | the team | the student |
| `member_removed` | the team's class | the team | the person who left, when they have an account |
| `document_finalized` | the team's class | the team | who handed it in |
| `late_window_opened` | the class | none | none (the body does not name who) |
| `upload_roster`, `email_undeliverable` | the class | none | none |
| `complete_profile` | none | none | none |

Every call site already has these ids in hand or one hop away. Where a call site would need an
extra read to learn the class, it takes it from the project row it already loads.

### 5.3 Backfill and one correction

In the same migration, as data fixes:

- `class_id` and `project_id` for existing rows whose entity makes them certain: a project, a class,
  a document, a conversation with a team, a mention (`entity_id` holds the project). `entity_id` is
  text, so each update casts only values shaped like a UUID.
- `actor_id` is not backfilled: it was never recorded.
- Rows titled "Member left your project" move from `join_request` to `member_removed`, and
  `notify_member_departure` files new ones there. They open the team's page.

### 5.4 The list

`GET /api/notifications?view=unread|all&cursor=<opaque>&limit=30`

```jsonc
{
  "notifications": [{
    "id", "type", "title", "body", "entity_type", "entity_id", "read_at", "created_at",
    "class": { "id", "name" } | null,
    "team": { "id", "name" } | null,
    "actor": { "id", "name", "image_url" } | null,
    "conversation": { "id", "kind": "direct" | "team", "name" } | null,  // messages only
    "message_count": 3                                                    // messages only; 1 otherwise
  }],
  "unread_count": 12,
  "next_cursor": "…" | null
}
```

- **`unread`**: every unread row, whatever its age. Nothing unread is ever hidden by the window.
- **`all`** (the default): the last 30 days, read and unread.
- **`unread_count`** counts every unread row, so the badge and the Unread view agree.
- **Paging.** Newest first, 30 a page (100 at most). The cursor is the last row's `created_at` and
  `id`, so rows that share an instant are neither repeated nor skipped. A malformed cursor is a 422.
- **Names.** `class`, `team` and `actor` are embedded in the same request over the new foreign
  keys (`actor` with its foreign-key hint, since the table has two keys to `profiles`).
  `conversation` is one more read, only when the page holds messages. `kind` is `direct` for a
  `dm` and `team` otherwise; `name` is the team's name, with "TAs" or "Instructor" for those
  channels.
- **A name is never an email.** An actor with no name is `""`, as on a profile.
- **Authorization.** Every read and write is filtered by the caller's `user_id`. The joined names
  are of things the notification was already about; the list adds no lookup by a caller-supplied id.
- **Round trips**, pinned by a test: the two reminders as today, then the page and the count
  together, then the conversations when there are messages.

### 5.5 Marking read

- `POST /api/notifications/read` with `{ "ids": [..] }` (1 to 100 UUIDs) marks those of the
  caller's rows read in one update and answers 204. Ids that are not the caller's are ignored, so
  the answer does not say whether they exist.
- `POST /{id}/read` and `POST /read-all` stay as they are.

### 5.6 Titles

The title says what happened; the body keeps the detail. Names are the display name, or "Someone".

| Type | Today | New title |
| --- | --- | --- |
| `join_request` | "New join request" | "Sam Okafor asked to join Trailhead" |
| `join_request_unreviewed` | "Join request needs your review" | "Sam Okafor's request to join Trailhead needs your review" |
| `join_rejected` | "Join request denied" | "Trailhead declined your request to join" |
| `project_created` | "New student project" | "Sam Okafor created Trailhead" |
| `member_removed` (left for another team) | "Member left your project" | "Diego Ramos left Trailhead" |
| `member_removed` (dropped the course) | "Team member removed" | "Diego Ramos was removed from Trailhead" |
| `document_finalized` | "Document finalized" | "Night Owls handed in its Sprint 2 report" |

`message`, `mention`, `late_window_opened`, `upload_roster`, `email_undeliverable` and
`complete_profile` keep their titles: they already say it. Existing rows keep the title they were
written with.

### 5.7 Client and catalog

`getNotifications({ view, cursor, limit })`, `markNotificationsRead(ids)`, the new fields on
`ApiNotification`, and the catalog entries. In this pull request the existing dropdown changes one
line: it asks for `view: 'unread'`.

## 6. The header and the panel (pull request 2)

Layout, sizes, copy and class names follow the handoff's sections 1 to 3 and the design's
`notifications.css` and `navigation.css`, built from the kit.

### 6.1 Kit

`IconButton variant="raised"`: white, the card shadow, the canvas grey on hover and while
`aria-expanded`, the focus ring over the shadow. With its test, guide and preview.

### 6.2 The family

`.gt-header-actions` lays out the bell, the search trigger and the profile button: **36px** tall,
the small radius, white with the card shadow, 18px lucide outline icons. At the header's 768px
breakpoint all three are **44 × 44**: the search trigger drops its label and keycaps, the profile
button its chevron. `mingcute_notification-fill.svg` is deleted.

### 6.3 The bell

- lucide `Bell` on the raised icon button, `UnreadBadge max={9}`.
- Named "Notifications" or "Notifications, 12 unread" (the real number); tooltip "Notifications";
  `aria-haspopup="dialog"`, `aria-expanded`.
- A polite live region says "1 new notification" or "3 new notifications" when the count rises
  between two reads. Not on the first read, not when it falls.
- Opening the panel refetches, as the search trigger warms its index.

### 6.4 The panel

The kit's `Popover`, end-aligned, holding a non-modal dialog labelled by its heading.

- **Head.** "Notifications", and **Mark all read** while anything is unread.
- **Views.** A `SegmentedControl`: **Unread** with its count, **All**.
- **List.** Sticky day labels (Today, Yesterday, Earlier), then rows. It asks for the next page as
  the list nears its end.
- **Foot.** **Notification settings**, which opens Settings on Email; in All, "Last 30 days".
- **States.** Loading (skeleton rows), empty ("You're all caught up" in Unread, "Nothing in the
  last 30 days" in All), failed (with Try again).
- **A row.** The kind's tile (a 32px icon, with the kind as words for a screen reader), the title,
  up to two lines of body, the where-line and the time. Unread rows carry a dot and **Mark read**.
  Read rows are quieter and have no button.
- **Where.** "CSE 115A · Trailhead"; "Direct message" for a `dm`; "Your account" for
  `complete_profile`. A row written before this change has none.
- **When.** In the viewer's zone: "Just now", "12 min ago", "3 h ago" under a day, then a date. The
  full time is the `<time>` element's title.
- **Messages.** A row with one message keeps its title ("New message from Ravi Patel"). With more,
  the client words it from the count and the conversation: "3 new messages in Trailhead" for a team
  channel, "3 new messages from Ravi Patel" for a direct message, with the latest message and its
  sender as the body.
- **A day of one conversation is one row.** In All, the rows of one conversation on one local day
  (the unread one and those already read) fold into one, their counts added; its button says "Mark
  read" while any of them is unread. Opening it opens the conversation and marks all of them read.
  Nothing else is folded. Folding is the client's.
- **On a phone** the same panel is a sheet pinned under the header, 8px from each side, with 44px
  rows and controls.

### 6.5 Where a row opens

| Type | Opens |
| --- | --- |
| `message` | the conversation |
| `mention` | the card on its team's board (`?task=` or `?story=`, from `entity_id`) |
| `join_request`, `join_rejected` | Home, with its join requests open |
| `join_request_unreviewed`, `project_created`, `member_removed` | the team's page |
| `document_finalized` | the document |
| `upload_roster`, `email_undeliverable` | that class's Roster |
| `late_window_opened` | that class's Assignments |
| `complete_profile` | Settings, on Profile |

### 6.6 Keyboard and focus

As the handoff's section 3: opening moves focus to the first row; ↑ ↓ Home End move among rows as
one tab stop; Enter or Space opens; Tab reaches Mark read and then the foot; Esc closes and returns
focus to the bell; a click outside or tabbing out closes. Marking a row read keeps the panel open
and moves focus to the next row. Each view keeps its own scroll position.

### 6.7 Marking read is immediate

The row changes at once and the request follows. If it fails, the row comes back unread and a toast
says "Couldn't mark it read".

### 6.8 The profile menu

Its button joins the family (36px, the open grey, a square on phones). It gains **View profile**,
above Settings, which opens `/app/people/<your id>`.

### 6.9 The entry chunk

The header loads with the app shell. The bell and its badge load with it; **the panel loads the
first time it opens**, and starts loading on hover or focus of the bell. The `index-*.js` line of
the build is checked before and after.

## 7. Where this departs from the design handoff

- **Messages are counted, not listed.** The design assumes a row for each message and names every
  sender ("3 messages from Ravi Patel and Ashton Liu"). The app keeps one unread row a conversation,
  so the row counts its messages and names the latest sender.
- **Conversation kinds.** The design has `team`, `direct` and `class`. There is no class channel,
  so the answer has `direct` and `team`.
- **The Unread view has no 30-day floor.** The design windows both views; then an unread row older
  than 30 days would be counted on the bell and shown nowhere.
- **An opaque cursor**, not `before=<created_at>`: two rows can share an instant.
- **Mentions need no `team` to open.** The design waits on the new field; the project is already in
  the mention's `entity_id`, so old mentions open too.
- **Titles change** (section 5.6). The design kept today's copy and suggested these.
- **The panel is lazy** (section 6.9), which the design does not address.
- **"View profile"** in the profile menu is new: the profile page had no link from the header.

## 8. Decisions

1. Two pull requests: data, then the header and the panel.
2. The where-line and the actor are stored as ids on the row and joined on read (option A), with a
   backfill of class and team for existing rows.
3. A conversation's unread messages stay one row, which counts them (`message_count`); the client
   folds a conversation's rows of one day.
4. Titles are rewritten.
5. "View profile" goes in the profile menu.

## 9. Tests and checks

- **Backend.** Each type writes the ids of section 5.2. The list: both views, the 30-day floor of
  All and its absence in Unread, the cursor across rows that share an instant, a malformed cursor,
  the joined names, a deleted class or team, a nameless actor, another user's rows never returned,
  the round-trip budget. Marking several read: only the caller's, ids of others ignored, the size
  limits. The departure notice's type. Each new title.
- **The migration** is run on DEV first: the columns, the backfill's counts, and one list request
  through the real embeds (the test double cannot prove an embed). Read-only checks; never PROD.
- **Frontend.** The model (kinds, where, when, day buckets, grouping, routes, the announcement),
  the hook (views, paging, a Realtime refetch, optimistic mark read and its rollback), the bell
  (name, badge cap, live region), the panel (every state, both views, grouping, the keyboard
  pattern and focus after each action), the phone rules, the raised icon button, the profile menu.
- **By eye**, beside `notifications.html`: desktop and phone, each kind, a long title, a group.
- Every gate in AGENTS.md, and the design-system build (the raised variant changes a card).

## 10. Order of work

1. **Pull request 1.** The migration file; DEV; the maintainer's go for PROD; the writers; the
   list; mark-several-read; titles; the client method, types and catalog. One review of the SQL and
   of the endpoint's authorization on their own, then a whole-branch review.
2. **Pull request 2.** The raised icon button; the model; the hook; the bell and the panel; the
   header family; the profile menu; the docs. A whole-branch review.
3. **Afterwards:** a design sync, so the artifact shows the raised icon button and `PersonLink`.

## 11. Left to the builder

- Which lucide icon each kind uses, from the design's `NotificationIcon`.
- Whether the panel's rows are one component file or two.
- The exact names of the foreign-key constraints and the index, if one is needed for the cursor.

## 12. Amendments

**2026-11-25, before any code.** The approved text said the API keeps one row a message and the
client groups a day of them. It does not: a new message rewrites its conversation's one unread row
(section 3). That is kept, because it is what stops a busy channel flooding the bell. The row gains
`message_count` (section 5.1), the answer carries it (section 5.4), and the panel words a row from
it (section 6.4). Sections 2, 3, 5.1, 5.4, 6.4, 7 and 8 are changed in place.
