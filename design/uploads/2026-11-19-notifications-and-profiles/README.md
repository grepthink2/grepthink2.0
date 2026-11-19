# Brief — header notifications and profile pages (2026-11-19)

Two things in one round, because they meet in the header: the notifications control and its panel, and a
dedicated page for a person. Decisions marked ⚑ are the brief's own and can be argued in `NOTES.md`; the others
are the maintainer's.

## 1. Why

**Notifications.** The bell does not belong to the header it sits in:

- It is a filled Mingcute glyph loaded as an image (`mingcute_notification-fill.svg`, 20px). Every other icon in
  the app is a lucide outline icon drawn in `currentColor`.
- Its button is a 40 × 40 square (`.app-header__icon-button`), beside a search trigger 37px tall and a profile
  button with 6px/12px padding around a 28px avatar. Three controls, three heights.
- Its unread badge is at least 24 × 24 on a 40px button, larger than the kit's CountBadge.
- The panel is hand-built (`.app-header__dropdown`): not the kit's Popover, its own click-outside handler, no
  arrow-key movement, no focus return.
- It lists **unread items only**. Opening one, or pressing its ×, marks it read and it is gone for good: there is
  no history and no way back to something dismissed by mistake.
- Every item looks the same: a title, a body, a relative time. Nothing says what kind it is or which class or
  team it is about.

**Profiles.** There is no page for a person. A name on the roster, in a team's member list, in a message or on a
document's "saved by" line leads nowhere; the only profile surface is the signed-in user's own Settings.

## 2. Decisions

1. The three header controls (notifications, search, profile) share one height, one radius, one surface and one
   icon size, on desktop and on a phone. ⚑ Use the search trigger's look as the reference, and the kit's
   IconButton for the bell.
2. The bell is lucide's `Bell`, outline, in `currentColor`. The Mingcute asset goes.
3. The unread count is the kit's CountBadge (or UnreadBadge), capped at "9+".
4. The panel is the kit's Popover holding a list. ⚑ It has two views switched by a SegmentedControl: **Unread**
   and **All** (the last 30 days). A read item stays in All.
5. Each item shows its kind (an icon, never colour alone), its title, one or two lines of body, where it is from
   (class, and team when there is one) and its time. ⚑ Items from the same conversation or the same team within
   a day may be grouped; say in `NOTES.md` whether you grouped them and how.
6. "Mark all read" stays. A single item can be marked read without opening it. Nothing is deleted.
7. No notification settings in the panel: email preferences already live in Settings. A "Notification settings"
   link to them at the panel's foot is enough.
8. A person has a page at `/app/people/:userId` ⚑ (the path is open). Names across the app link to it.
9. A profile page shows only what the viewer may already see elsewhere in the app. It adds no new exposure of
   student data: no grades, no TSR text, no attendance for a student viewing a classmate.
10. A person's own page has an "Edit profile" action that opens Settings; the page itself is read-only.
11. Light mode only, flat and calm, the kit only, tokens only.

## 3. Rules

- Built from the kit (`components/`): Button, IconButton, Popover, Menu, SegmentedControl, CountBadge,
  UnreadBadge, Badge, Tag, Avatar, AvatarGroup, Card, EmptyState, Skeleton, Tabs, Table. Anything missing is a
  kit addition first, with its gallery states.
- A status pill names its status, never a colour. New status keys are listed in `NOTES.md`.
- Times in the viewer's zone; relative ("2 h ago") under a day, a date after.
- WCAG 2.1 AA; every action by keyboard with its kit component's pattern; 44px touch targets on a phone;
  reduced motion honoured; the unread count is announced politely, not on every poll.
- No raw hex; new tokens go in `tokens/*.css`.

## 4. Who sees what

Roles are per class: instructor, TA, student. One account can hold a different role in each class.

| Viewer | On someone else's page |
| --- | --- |
| A student | name, avatar, school, the classes they share with their role in each, the team the person is on in a shared class with their project role, GitHub and LinkedIn links |
| A TA or instructor of a shared class | the same, plus the school email, and links to that person's team board, documents and (for staff views that exist) their TSRs and attendance |
| The person themself | everything above about themself, plus "Edit profile" |

Someone who shares no class with the viewer has no page: a calm "You can't see this person" state.

## 5. Screens

**Header.** The right-hand group at desktop width and at phone width, in every state: no unread, 1, 9, 12
("9+"), panel open, focus-visible on each control.

**Notifications panel.** Unread and All; an item of each kind (§8); read and unread; a long title and a long
body; grouped items if you group; loading (skeleton rows); empty Unread ("You're all caught up"); empty All;
a failed load with Try again; the panel on a phone (full-width sheet or popover: your call, explain it).

**Profile page.** Header block (avatar, name, role chips for the classes shared with the viewer, school, links);
"Teams" (a card per shared class: team name, project role, teammates as an AvatarGroup, a link to the team's
page); for staff, a "For staff" block of links; the own-page variant with "Edit profile"; a person with almost
nothing filled in; the not-visible state; loading. Desktop and phone.

**Entry points.** How a name becomes a link in: a roster row, a team's member list, a message header, a
document's "saved by" line. ⚑ Consider a small hover card (avatar, name, role, team, "View profile") built on
Popover; if you design it, it is a kit addition.

## 6. Interactions

- Opening the panel moves focus into it; Esc closes it and returns focus to the bell; arrow keys move between
  items; Enter opens one.
- Opening an item marks it read and navigates (§8 says where). The panel closes.
- "Mark read" on an item leaves the panel open and moves focus to the next item.
- Switching Unread / All keeps the scroll position of each.

## 7. Data the screens receive

Notification (`GET /api/notifications`):

```
{ id, type, title, body, entity_type, entity_id, read_at, created_at }
```

Today the list answers the newest items with their `read_at`; the client filters to unread. Marking read:
`POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`. There is no class or team name on an
item yet, no actor, no paging: list what the design needs added in `NOTES.md` and the port will size it.

Profile (`GET /api/profiles/{user_id}`) answers a profile row today: name, `image_url`, `linkedin`, `github`,
the account role and the emails. Who may read which field is the port's to settle against §4; shared classes,
per-class role and teams are not in that answer. The design may assume one answer of the shape below and say so:

```
{ person: { id, name, image_url, school, github, linkedin, school_email? },
  shared: [{ class_id, class_name, role, team: { project_id, name, project_role, members: [{id, name, image_url}] } | null }],
  is_self: bool, staff_links: bool }
```

## 8. Notification kinds

| `type` | What it says | Opens |
| --- | --- | --- |
| `message` | a new message or a mention | the conversation |
| `join_request` | someone asked to join the reader's team | Home, with its join requests open |
| `join_request_unreviewed` | a join request nobody on the team can review reached the instructor | the team's page |
| `join_rejected` | the reader's request was turned down | Home, with its join requests open |
| `project_created` | a student created a team in the reader's class | the team's page |
| `member_removed` | a teammate left the class or the team | the team's page |
| `document_finalized` | a team the reader is a TA of handed in a document | the document |
| `upload_roster` | a class has no roster yet | the Roster page |
| `email_undeliverable` | an invite email could not be delivered | the Roster page |
| `complete_profile` | the reader's profile is missing something | Settings |

## 9. Kit additions we expect

Possibly a `NotificationItem` (or a general list row with a leading icon and a trailing action), a person hover
card, and a `ProfileHeader`. Add only what the screens need.

## 10. Files the codebase will touch

`frontend/src/features/app/components/Layout/Header.tsx` and `Header.scss`, `ProfileMenu.tsx`,
`features/search/components/SearchTrigger.tsx`, `features/notifications/`, a new `features/people/` page with a
lazy route, and the places names appear (Roster, the project page's members, Messages, documents).

## 11. Deliver

As earlier rounds: the feature families as `.jsx` + `.d.ts` + `.prompt.md` with one CSS file each, a
`*.card.html` gallery of every state, a sample-data module, screen files under `ui_kits/grepthink/` with a demo
bar (role, unread count, data, viewport), and `design_handoff_notifications_and_profiles/README.md` with
`NOTES.md`.

## 12. Questions to answer in `NOTES.md`

1. Popover or full-width sheet for the panel on a phone, and why.
2. Did you group items? By what, and what does a group open?
3. What must the notifications answer gain (class name, team name, actor, paging) for your design to work?
4. Is the hover card worth its weight, or is a plain link to the page enough?
5. What should a profile page show for a person in several shared classes: one list, or a class switcher?
6. Anything on the profile page you left out because it would expose data a classmate should not see.
