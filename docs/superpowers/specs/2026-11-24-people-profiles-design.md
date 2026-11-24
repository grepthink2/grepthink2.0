# Profile pages: a page for a person, and names that link to it

**Date:** 2026-11-24 · **Status:** approved by the maintainer, 2026-11-24

## 1. Why

There is no page for a person. A name on the roster, in a team's member list, in a message header or
on a document's "saved by" line leads nowhere, and the only profile surface is the signed-in user's
own Settings.

The 2026-11-19 design round covered this together with the header's notifications. Its brief is
`design/uploads/2026-11-19-notifications-and-profiles/README.md`. Its handoff
(`design_handoff_notifications_and_profiles/README.md` and `NOTES.md`) and its design components
(`archived/components/people/`, `archived/components/display/PersonLink.*`,
`archived/ui_kits/grepthink/profile.html`) are in the GrepThink Design System artifact
(`https://claude.ai/code/artifact/96b68559-7d84-4da1-b9bd-dbeed3238b0d`). None of it was built.

This spec is the profile half. Notifications are the next pull request, with their own spec (section 13).

## 2. What we are building

1. **An endpoint** that answers one person as the viewer may see them: `GET /api/profiles/{user_id}`,
   changed in place.
2. **A page** at `/app/people/:userId`: who the person is, the classes the viewer shares with them,
   their team in each, and for staff two links to the team's work. Read-only.
3. **Two kit components**, `PersonLink` and `PersonHoverCard`, and the four places where a name
   becomes a link.

### Goals

- A name leads to a person. The page answers "who is this, and what do we have in common?"
- The page shows only what the viewer can already see elsewhere in the app.
- `PersonLink` is a kit component with a guide and a preview, so the next design sync shows it.

### Non-goals

- No editing on the page. "Edit profile" opens Settings.
- No grades, TSR text or attendance on the page, for anyone.
- No new profile fields, no migration, no change to `/api/profiles/me`.
- No product event for a profile view.
- The notifications bell, its panel and the header's control family (section 13).
- Names in other places (the scrum board, TA pages, staffing, search results, the message widget).

### Anti-goals

- The page must never confirm that an account exists to someone who shares no class with it.
- A person's login email and account role must never reach another person through this endpoint.
- A link built from what a person typed (GitHub, LinkedIn) must never carry a URL they chose.

## 3. What exists today (beta at `3b382f28`)

- `GET /api/profiles/{user_id}?class_id=` answers `{"profile": <row>}` to anyone in that class: the
  whole row, with `email`, `edu_email` and `role`. Nothing in the web client calls it, and the agent
  catalog does not list it.
- `profiles` holds `first_name`, `last_name`, `image_url`, `github`, `linkedin`, `email`, `edu_email`,
  `role`. There is no school on a profile. A class has `institution_id`.
- Two people may message each other when they share a class (`has_shared_class` in
  `app/messages/controller.py`): each is the class's instructor or enrolled in it. The search index's
  people follow the same rule.
- A team's members are already shown to everyone in its class (the project page).
- **Classmates already see each other's login email.** The project page's members panel shows each
  member's as a `mailto:` link and offers "Copy all emails"; `GET /api/messages/contacts` and a
  conversation's `other_user` carry it; `GET /api/classes/{class_id}/students` answers it, with the
  account role, to anyone enrolled; the search index uses it as a keyword. The profile page adds no
  email for a classmate, but it is not the only place one is kept from.
- `GET /api/projects/{project_id}/members` has **no access check**: any signed-in user who has a
  project's id gets each member's `email`, `edu_email` and account role. Found while writing this, and
  fixed in a pull request of its own, not here.
- A class is `active` or `complete`. A student is on at most one team in a class.
- Settings is a lazy modal with three sections (`profile`, `email`, `apps`), opened by `AppView`
  through `onOpenSettings()`. It cannot be opened on a section, and `/app/settings` redirects to Home.
- `MessageButton` opens the conversation with a person, or the compose page for a new one.

## 4. Who sees what

The viewer and the person must share at least one class, by the messaging rule above. Everyone sees
their own page.

| On the page | A classmate | Staff of a shared class where the person is a student | The person |
| --- | --- | --- | --- |
| Name, avatar, GitHub, LinkedIn | yes | yes | yes |
| The classes shared with the viewer, with the person's role in each | yes | yes | all their classes |
| The school of each shared class | yes | yes | yes |
| Their team in a shared class: its name, their project role, their teammates | yes | yes | yes |
| School email (`edu_email`) | no | yes | yes |
| "For staff" links, for that class | no | yes | no |
| Login email, account role | no | no | no |

Staff means the class's instructor or a TA of it. The school email follows the roster, which already
shows a class's staff each student's email: a TA does not get the instructor's or another TA's school
email here.

Someone who shares no class with the viewer has no page. The answer is the same as for an id that
does not exist.

## 5. The endpoint

`GET /api/profiles/{user_id}`, for any signed-in user. The `class_id` parameter goes.

```
{
  "person": { "id", "name", "image_url", "github", "linkedin", "school_email" },
  "shared": [{
    "class_id", "class_name", "course_code", "term", "year", "status",
    "institution": { "id", "name" } | null,
    "role": "student" | "ta" | "instructor",
    "viewer_role": "student" | "ta" | "instructor",
    "team": { "project_id", "name", "project_role",
              "members": [{ "id", "name", "image_url" }] } | null
  }],
  "is_self": bool
}
```

- The answer is the object itself, with no `{"profile": …}` wrapper (`backend/STYLE_GUIDE.md`,
  "Response Format").
- `school_email` is **absent**, not null, when the viewer may not see it (section 4). It is
  `edu_email`, never the login email.
- `name` is the first and last name. The app's usual label (`profile_display_name`) falls back to the
  login email for someone with no name; this endpoint does not, and never reads `email`. Such a
  person's `name` is empty, here and in `team.members`, and the page reads "No name yet".
- `shared` holds the classes both people are in; for the person's own page, all of theirs. Completed
  classes are included, with their `status`.
- `team.members` are the person's teammates, without the person.
- **Refusal.** No class in common, an unknown id and a malformed id all answer
  `404 {"detail": "Profile not found"}`, the same body. A person's own id always answers, with an
  empty `shared` when they are in no class.
- **Authorization** is in the controller, on every field. The row's `email` and `role` are never
  selected for another person.
- **Round trips.** Two waves through `fan_out`, five requests at most, pinned by a test with
  `FakeSupabase.executes`. No per-class loop.
- **Rate limit:** per signed-in user, as the search index's is, since the endpoint answers about
  other people.
- **Logs** carry ids only.
- The web client gets `lib/api/profiles.ts` with `getPersonProfile(userId)`, and the agent catalog an
  entry (`role: any`, `uiRoute: /app/people/{user_id}`).
- No SQL changes. The embedded selects are new PostgREST requests, which the test double does not
  check, so they are run once, read-only, against DEV.

## 6. The page

`features/people/`: `pages/PersonPage.tsx` as a `lazy()` route `people/:userId` in `App.tsx`,
`components/ProfileHeader.tsx`, `ProfileTeams.tsx`, `ProfileStaffLinks.tsx`, `peopleModel.ts` and
`people.scss`. The app header's title is "Profile". Layout, sizes, copy and class names follow the
handoff's section 4 and the design's `people.css`, built from the kit: Card, Avatar, AvatarGroup, Tag,
Badge, Button, EmptyState, Skeleton.

- **Header card.** Avatar, name, the schools (the distinct institution names of the shared classes),
  a neutral Tag for each shared class ("CSE 115A · Student"), GitHub and LinkedIn, and the school
  email when the answer carries it. One action: **Edit profile** on your own page, **Message** on
  someone else's.
- **Teams.** A card for each shared class, the selected class first, then active classes, then
  completed ones: the class and its term, the person's role, then their team (a link to its page),
  their project role, their teammates as an AvatarGroup, and "Open team page". Without a team: "Not on
  a team in this class yet." For a TA or the instructor: "Teaching assistant in this class." /
  "Teaches this class."
- **For staff.** Shown for each shared class where the viewer is staff and the person is a student on
  a team: **Team board** and **Documents**, under "Only TAs and instructors of CSE 115A see this."
- **Your own page.** A nudge when nothing is filled in, and one line on who sees the page.
- **States.** Loading (skeleton, `aria-busy`); not visible (a 404: "You can't see this person", with
  **Go to Home**); failed (any other error, with **Try again**); in no class yet (your own page).
- **Links a person typed.** GitHub and LinkedIn are shown only when the value is a handle or a URL on
  that site. The link is rebuilt from the handle (`https://github.com/<handle>`,
  `https://www.linkedin.com/in/<handle>`) and opens with `rel="noopener noreferrer"`.
- **Preview.** While "View class as student" is on, the page shows what a classmate sees: no school
  email and no "For staff".
- Times do not appear on the page. Desktop and phone, as the design draws them.

## 7. `PersonLink` and `PersonHoverCard` (kit)

`frontend/src/components/PersonLink/`: `PersonLink.tsx`, `PersonHoverCard.tsx`, `README.md`,
`PersonLink.preview.tsx` and tests. `PersonHoverCard` is a companion in `PersonLink`'s folder, named in
its guide.

- **`PersonLink`**: a person's name as a react-router link to `/app/people/<id>`, in the text's own
  colour. `variant="plain"` (a cell, a row, a heading) underlines on hover and focus;
  `variant="inline"` (inside a sentence) keeps a quiet underline at rest. It takes
  `person: { id, name, image_url? }` and an optional `card`.
- **`PersonHoverCard`**: opens when a mouse pointer rests on a `PersonLink` that was given `card`
  (`{ roleLine?, teamLine? }`). The kit's Popover, small: avatar, name, "Student · CSE 115A",
  "Trailhead · Product Owner", and "View profile". 150 ms to open, 300 ms of grace to close (the
  members panel's timings); Esc closes it; it stays open while the pointer is on it. Never on touch,
  never on keyboard focus: it adds nothing the link's row does not already show.
- **No fetch.** The card shows data its row already holds. A list without that data renders the plain
  link.
- **Kit rules.** A guide and a preview (`lint:design`); a `NAMES_ALLOWLIST` entry, because the frozen
  design manifest does not name these two; root classes `gt-person-link` and `gt-person-card`. In the
  design bundle the link is a plain `<a href>`, as Button's is.
- A project role is worded with Badge's `PROJECT_ROLES`; there is no second label helper.

## 8. Where a name becomes a link

| Place | File | Link | Card |
| --- | --- | --- | --- |
| The roster | `Roster/RosterList.tsx`, table and phone cards | `plain`, for registered rows only (their `id` is the profile id) | yes: role and team from the row |
| A team's member list | `Project/ProjectMembersPopover.tsx` | `plain`, on each person's name | no |
| A message header | `messages/components/ConversationThread.tsx`, direct messages, while `can_send` | `plain`, on the heading | no |
| A document's "saved by" and "finalized by" | `documents/components/DocumentShell.tsx`, `RevisionsDrawer.tsx`, `DocumentsTab.tsx` | `inline` | no |

- A roster row for someone who has not registered stays plain text.
- A conversation with someone the viewer no longer shares a class with (`can_send` false) keeps a plain
  heading: the link would lead to the not-visible page.
- Documents need the person's id beside the name. A revision carries `saved_by` and a document
  `finalized_by`; the documents list gains `saved_by` beside `saved_by_name`, from a column its query
  already reads.

## 9. Settings and Message

- **Settings on a section.** `lib/openSettings.ts` exports `openSettings(section?)`, an event the shell
  listens for, as `lib/openClassSelector.ts` does. `Settings` takes the section to open on. "Edit
  profile" calls `openSettings('profile')`. The notifications work will use `openSettings('email')`.
- **Message** is `MessageButton`: the existing conversation, or the compose page.

## 10. Where this departs from the design handoff

- **School.** The design shows one school from the profile. A profile has none, and a person may be in
  classes at two schools, so the page lists the institutions of the shared classes.
- **Staff links.** The design has four. Two ship now. TSRs and Attendance wait until TA Review and TA
  Meetings can open on one team (section 13).
- **The hover card has one host, the roster.** The design also puts it on the member list and the
  message header. The member list is already a hover panel, and a card inside it would be a hover
  inside a hover. The message header holds no role or team, and the card does not fetch. The message
  header gets its card in the next iteration (section 13).
- **School email.** The design shows it to a TA or instructor of any shared class. Here it also needs
  the person to be a student in that class.
- **No `staff_links` flag.** Each shared class carries `viewer_role`, which says the same.
- **The own-page line.** The design says people see the page "without your school email". Staff do
  see it, so the line reads: "People who share a class with you see this page. Only your TAs and
  instructors see your school email."
- **Completed classes** count as shared, as they do for messaging.

## 11. Decisions

The maintainer's, 2026-11-24:

1. Profiles and notifications are two pull requests, profiles first.
2. `GET /api/profiles/{user_id}` changes in place and loses `class_id`.
3. School is the institution of each shared class.
4. Staff of a shared class see a student's school email.
5. Team board and Documents now; TSRs and Attendance when their pages can filter.
6. `PersonHoverCard` is built now.
7. All four entry points are in this pull request.

Made while writing this, and confirmed by the maintainer the same day:

8. The hover card is on the roster only in this pull request, and comes to the message header in the
   next iteration (sections 10 and 13).
9. School email only where the person is a student (section 10).
10. A person with no name is "No name yet" to others, never their email (section 5).
11. Completed classes are included.
12. The preview rule (section 6).
13. The path stays `/app/people/:userId`.
14. The next iteration's hover card in Messages loads the profile endpoint when it opens, picks its
    class by the rule in section 13, and covers the thread header and a team channel's senders.

## 12. Tests and checks

- **Backend.** The access table of section 4, one case per cell: a classmate, a TA, the instructor, the
  person, a stranger, an unknown id, a malformed id. The three refusals have identical bodies.
  `school_email` is absent for a classmate. `email` and `role` are in no answer, and a person with no
  name is not named by their email. Only shared classes
  are listed. The round-trip budget. The endpoint's authorization gets a review of its own (AGENTS.md).
- **Kit.** `PersonLink` in both variants; the card opens for a mouse after its delay and never for
  touch or focus, closes on Esc and after its grace; fake timers.
- **Page.** Each state; the staff block for staff only; the school email only when carried; a typed
  link that is not a handle renders nothing; the preview rule.
- **Entry points.** A registered roster row links, an unregistered one does not; a read-only
  conversation's heading does not.
- **Gates.** Backend and frontend gates with coverage, then `design:build`, `design:test` and
  `design:check`. The entry chunk does not grow: the page is a lazy route and the shell imports
  neither it nor `PersonLink`.
- **By eye.** The page, the roster and the card at desktop and phone widths, against the design's
  `profile.html`.

## 13. Order of work

One pull request into `beta`, branch `feat/people-profiles`:

1. The endpoint, its tests, its client method and catalog entry.
2. `PersonLink` and `PersonHoverCard` with their guide, preview and tests.
3. The page, its route and `openSettings`.
4. The four entry points.
5. Docs (`docs/agents/frontend.md`'s kit list, `AGENTS.md`'s directory map), the gates, one
   whole-branch review.

Afterwards:

- **Design sync**, when the maintainer says: the artifact gains a `PersonLink` card
  (`docs/agents/frontend.md`, "Publishing to the artifact").
- **Notifications**, the next pull request: the header's control family, `IconButton variant="raised"`,
  the bell and its panel, and what `GET /api/notifications` must gain (the handoff's `NOTES.md`,
  section 3).
- **TSRs and Attendance** staff links, once TA Review and TA Meetings can open on one team.
- **The hover card in Messages**, the next iteration. Decided 2026-11-24:
  - *Where the lines come from.* A conversation's `other_user` holds an id, a name, an email and an
    avatar: no class, role or team. The card loads `GET /api/profiles/{user_id}` when it opens, which
    needs no SQL. This lifts the "no fetch" rule of section 7 for a card given a loader: it gains a
    loading look and a failed look, which the design does not draw, and a cache, so resting on a name
    twice asks once.
  - *Which class.* A conversation belongs to no class, and two people may share several. The card has
    one role line and one team line: the selected class when both are in it, else the first active
    class they share.
  - *Which names.* The Messages page's thread header for a direct message, while `can_send`, and the
    senders' names inside a team channel. Not the floating message widget.
  - *A team channel's header* names a team, not a person: no card.

## 14. Left to the builder

- The queries, within section 5's budget.
- The rate limit's numbers.
- Whether `people.scss` keeps the design's class names as they are, if `lint:design` objects to one.
- How the By-eye check is run (a local harness page or the dev server against DEV).
