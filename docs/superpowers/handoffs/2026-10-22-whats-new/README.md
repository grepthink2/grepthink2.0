# Brief for Claude Design — What's new (release notes), 2026-10-22

**From:** the grepthink2.0 codebase (beta at `4376d1dd`) · **To:** the "GrepThink Design System" Claude Design project
**Revised:** 2026-10-23, with the maintainer's answers to the first draft's questions (§2)
**Companion spec:** `docs/superpowers/specs/2026-10-22-whats-new-design.md` (the content files, the version, the
seen state, the loading rules)
**Builds on:** `design_handoff_ui_alignment/` (the kit: Modal, Popover, Menu, IconButton, Tag, Badge, UnreadBadge,
EmptyState, Skeleton, Markdown) and `components/marketing/LandingHeader` (the landing header)
**Answer with:** `design_handoff_whats_new/README.md` and `NOTES.md`, plus the components in §11. The codebase
builds the feature from that handoff.

## 1. What we are asking for

GrepThink starts numbering its releases at 0.91.0, and every release from then on comes with release notes. Design
where people read them:

- **The What's new modal:** the release notes, newest first, each entry marked by its date. It comes in two looks:
  dark on the landing page, the kit's light look in the app (§5.1).
- **The landing header's "ⓘ What's new" tab,** which opens the modal (§5.2).
- **The app header's profile menu,** rebuilt on the kit's `Menu`, with an "ⓘ What's new" row that opens the modal
  (§5.3).
- **The "new" dot** on the landing tab and on the profile button's avatar, and the "New" marker on the menu row,
  while a release is unread (§5.4).

Not in scope: how the notes are written and stored (decided: one Markdown file per release, in the repo),
notifications or emails about a release, and a separate What's new page.

## 2. Decisions already made (binding)

From the maintainer, 2026-10-22 and 2026-10-23, and the companion spec:

1. **Versions** are semantic versions (`0.91.0`), starting at 0.91.0. One entry per version.
2. **One feed for everyone:** visitors, students, TAs and instructors, at all schools together, read the same
   notes. No filter and no tabs by role or by school.
3. **Entries are marked by their date,** as in the Claude Code desktop app's What's new. **No timeline rail:** no
   dots and no line connecting the entries.
4. **An entry** has its date (the entry's heading), its version, and up to three groups, always in the order New,
   Improved, Fixed. **Each group is a label above its list.** Each list is a bullet list of short lines with inline
   Markdown only: bold, italics, `code` and links.
5. **One modal in both places:** the kit's `Modal`, in a **dark variant on the landing page** and in the kit's light
   look in the app. The modal replaces the first draft's dropdown panel.
6. **On the landing page,** an "ⓘ What's new" tab (the lucide `Info` icon and the label) sits in the header between
   Features and Contact, and opens the modal. No separate page.
7. **On phones,** the landing tab stays in the nav, as its first item before Contact (Features is hidden there,
   §5.2). Where its label does not fit, it shows the icon alone.
8. **In the app,** the profile menu moves onto the kit's `Menu`. Its "ⓘ What's new" row opens the modal. **The
   avatar shows a small dot** while a release is unread. **"Log Out" stays a destructive (red) row.**
9. **The dot** shows until this browser opens the modal after a release. Inside the modal, the entries newer than
   the version this browser last saw carry a "New" marker. On a first visit, only the newest entry carries it.
10. **The school switcher** in the profile menu becomes single-choice `radio` rows under "School", as the kit's
    Menu prompt already says. It no longer expands in place.
11. **You name the components** ("pick as appropriate"). The names in this brief are placeholders.

## 3. Rules for the whole round

- **The kit only.** Build from Modal, Popover, Menu, MenuItem, MenuSeparator, IconButton, Tag or Badge, EmptyState,
  Skeleton and the Markdown layer (`.gt-md`). No kit block re-declared or copied into feature CSS. Anything missing
  becomes a kit addition first, in its kit group, with its gallery states (§9).
- **Tokens only:** no raw hex in any CSS, and new tokens go in `tokens/*.css`. The app stays light. The landing
  tab follows `LandingHeader`'s own link styles and marketing tokens, and the modal's dark variant draws on the
  landing page's palette.
- **Accessibility:** WCAG 2.1 AA in both looks, every action operable by keyboard with the pattern in §6, touch
  targets of at least 44px on phones, and reduced motion honoured.
- **The reference** is the What's new in the Claude Code desktop app: plain entries, each headed by its date. If a
  screenshot of it is attached, follow its rhythm and density, not its brand.
- **The checkout you can read may be older than this brief.** Where they disagree, follow the brief and note the
  disagreement in `NOTES.md`.

## 4. Who sees it, and where

- **Visitors** on the landing page, signed in or not.
- **Everyone signed in,** on every `/app` page: the profile button sits at the right of the app header, after the
  notifications bell and the search trigger (⌘K).
- The seen state belongs to the browser, so opening the modal on the landing page also clears the dots in the app.

## 5. The screens

### 5.1 The modal

- **The kit `Modal`'s head:** the title "What's new", the subtitle "Version 0.91.0" (the visitor's version), and the
  kit's × ("Close").
- **The body:** the feed, newest first, scrolling inside the modal. Reaching its end does not scroll the page. No
  footer.
- **Each entry:** its date written out ("October 23, 2026") as the heading, its version beside the date, the "New"
  marker when it applies, then its groups in order, each a label above its list.
- **Between entries,** space or a hairline. No rail.
- **Two looks:** dark on the landing page, light in the app. The dark look covers everything inside the modal: the
  head, the ×, the scrim, the entries, the "New" marker, the group labels and the Markdown layer (links, `code`,
  lists).
- **Size:** one of the kit's sizes (`md`, 560px, is its default), and the kit's phone layout. Your call.

### 5.2 The landing header

- **The tab** sits in the nav between Features and Contact: the `Info` icon and "What's new", styled like the
  header's links, with the dot while unseen.
- **Both header states** have it: the dark bar and the floating pill. The modal stops the page from scrolling, so
  the header never changes state under an open modal.
- **Phones:**
  - **The code hides Features at 560px and below,** a rule your `LandingHeader` lacks: "Phones scroll into the
    bands anyway; the nav keeps its three essentials." Add it to `LandingHeader` so the export matches the code.
  - There, the tab becomes the nav's first item, before Contact, Sign in and Get started (§2.7).
  - At 400px and below, those items shrink to 11px text. Where the tab's label does not fit, show the icon alone,
    keeping "What's new" as its accessible name. You pick the width.
  - The header must fit at 320px with no horizontal scroll.
  - The tab's touch target is at least 44px; its hit area may reach past its visible edge. The other items are
    about 30px tall today. Leave them as they are, or restyle them and say so in `NOTES.md`.

### 5.3 The app header's profile menu

- **The trigger:** today's profile button (the avatar, or a user icon when there is none, and a chevron), with a
  small dot on the avatar while unseen.
- **The rows,** in order:
  1. for an account at two or more schools, a "School" group: one radio row per school, the current one checked;
  2. in a class the user teaches: "View class as student", or "Instructor view" while previewing;
  3. "Settings";
  4. "ⓘ What's new", with the "New" marker while unseen;
  5. a separator, then "Log Out", a destructive (red) row.
- **"What's new"** closes the menu and opens the modal, in the light look.

### 5.4 The dot and the marker

- They mean "something new to read", not "unread messages", so neither may look like the red `UnreadBadge`.
- The dot sits on the landing tab and on the profile button's avatar. The menu row carries the "New" marker.
- The marker and the New group must not read alike: an entry can carry both.

## 6. Behaviour and keyboard

- **The landing tab** is a button with `aria-haspopup="dialog"`. Enter or Space opens the modal.
- **The profile menu** follows the Menu pattern: the arrow keys, Home and End move, Enter picks, Esc closes. Esc or a
  pick returns focus to the profile button, and tabbing out closes the menu.
- **The modal** follows the kit's Modal pattern:
  - focus moves in when it opens and stays trapped;
  - Esc, the scrim and the × close it;
  - focus returns to the landing tab, or in the app to the profile button.
- **Names never change:** the tab is "What's new" and the profile button "Profile menu". While the dot shows, the
  tab, the profile button and the "What's new" row are also described as "New release notes", from a visually
  hidden element (`aria-describedby`).

## 7. States to draw

- **The modal, in both looks:**
  - loading (Skeleton rows in the body);
  - failed (a one-line message and a "Reload" button, which reloads the page);
  - one release; several (five or more); a long entry; inline code and links;
  - "New" markers after an earlier visit, and on a first visit;
  - empty (the kit's EmptyState; it cannot ship, but it has a look);
  - desktop and phone width.
- **The landing header:** the bar and the pill, with and without the dot, at 1280, 768, 560, 400, 375 and 320px.
- **The app header:**
  - the profile button with and without the dot;
  - the menu for a student (Settings, What's new, Log Out), for an instructor in their own class (adds "View class as
    student"), in preview mode ("Instructor view"), and for an account at two schools (the School group);
  - the "What's new" row with and without its marker;
  - phone width.

## 8. The data the modal receives

A proposed contract. Change it in `NOTES.md` if the design needs something else.

```ts
interface Release {
  /** "0.91.0" */
  version: string;
  /** "2026-10-23": a calendar date, shown as "October 23, 2026" in every time zone. */
  date: string;
  /** In the order new, improved, fixed. Each markdown string is a bullet list. */
  sections: { kind: 'new' | 'improved' | 'fixed'; markdown: string }[];
}

interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  /** 'dark' on the landing page, 'light' in the app. */
  tone: 'dark' | 'light';
  /** Newest first. */
  releases: Release[];
  /** Shown as the subtitle: "Version 0.91.0". */
  currentVersion: string;
  /** Entries newer than this carry "New"; null (a first visit) marks only the newest. */
  lastSeen: string | null;
  status: 'loading' | 'ready' | 'failed';
  /** The failed state's "Reload" button. */
  onReload?: () => void;
}
```

### Sample notes (sample data for the galleries, not real release notes)

`0.92.0.md`:

```markdown
---
date: 2026-11-05
---

## New

- **Final review sign-up.** Product Owners book their team's final review slot, and TAs sign up to review the teams
  that hold one.
- Instructors post one-hour slots for the class and open or close sign-ups with one switch.

## Improved

- The scrum board's sprint picker shows each sprint's dates, status and progress.
- Final review times show in your time zone, with the campus time beside them when the two differ.
- The [help center](/app/help-center) walks you through booking a slot.

## Fixed

- A `?` no longer shows in place of a member's avatar before they add their name.
```

`0.91.1.md`:

```markdown
---
date: 2026-10-28
---

## Fixed

- Picking a school in the profile menu keeps you on the page you were on, when your role there allows it.
- On phones, the last line of a long dialog is no longer hidden behind its buttons.
```

`0.91.0.md`:

```markdown
---
date: 2026-10-23
---

## New

- **What's new.** Release notes for every version, on the landing page and in your profile menu.
- A meeting that is happening now shows a blue **Live** badge on your schedule.

## Improved

- Pages open faster: each page loads its own code the first time you visit it.
- Buttons, fields, dialogs, badges, cards and tabs share one look across the app.

## Fixed

- The date picker's weekday header lines up with its days again.
- Closing a dialog returns you to the button that opened it.
```

## 9. Kit additions we expect

Each goes in its kit group with `.jsx`, `.d.ts`, `.prompt.md` and gallery states, or `NOTES.md` says why it is not
needed:

- **A dark variant of `Modal`,** covering the scrim, the sheet, the head, the × and the `.gt-md` layer inside it.
- **A group label for `Menu`** (for "School").
- **A trailing slot on `MenuItem`,** for the "New" marker.
- **A "new" dot** that is not `UnreadBadge`'s red unread dot, for the landing tab and the avatar.

## 10. Files the codebase will touch

- `frontend/src/features/releases/` (new): the modal, the feed, the entry and the seen store.
- `frontend/src/features/landing/components/`: a new `WhatsNewTab.tsx`, plus `Header.tsx` and `Header.scss`.
- `frontend/src/features/app/components/Layout/`: `ProfileMenu.tsx` (new), `Header.tsx`, `Header.scss`;
  `SchoolSwitcher.tsx` goes.
- `frontend/src/components/`: the kit additions.

## 11. What to deliver

1. **A feature family, `components/releases/`:** the modal's content and the entry (named as you see fit), each as
   `.jsx` + `.d.ts` + `.prompt.md`; one CSS file with BEM `.gt-*` classes and `var(--gt-*)` tokens only; a
   `releases.card.html` gallery of every modal state in §7, in both looks; and a sample-data module built from §8.
2. **The landing tab** in `components/marketing/LandingHeader`, with the 560px rule and its states in
   `marketing.card.html`.
3. **The profile menu** as a composition of the kit, with its gallery states, in the family or the group you think
   fits.
4. **The kit additions** from §9.
5. **`ui_kits/grepthink/whats-new.html`,** with a demo bar that switches:
   - the context: the landing page or the app;
   - the header state: the bar or the pill;
   - the width: 1280, 768, 560, 375 or 320px;
   - the seen state: a first visit, seen up to 0.91.0, or all seen;
   - the persona: a student, an instructor, preview mode, or an account at two schools.
6. **`design_handoff_whats_new/README.md` and `NOTES.md`.** The README follows the earlier handoffs' shape. `NOTES.md`
   holds your decisions, your answers to §12, the kit additions, the component names, and questions for the port.
7. **A `PORTING.md` feature-layer row** for the new family, `readme.md` Index and "Intentional additions" lines, and
   `_ds_manifest.json`, updated as in earlier rounds.

## 12. Questions to answer in `NOTES.md`

The maintainer answered the first draft's questions (§2). These are yours:

1. The form of the "New" marker (§5.4), and how the group labels look above their lists.
2. Where the dot sits on the avatar, and its colour in both contexts: the dark landing bar and the light app header.
3. The width below which the landing tab shows its icon alone, and whether the other phone nav items grow to 44px.
4. How the "School" group label looks in the menu, or why the radio rows need none.
5. The modal's size, and how its phone layout handles a long feed.
6. The component names.
