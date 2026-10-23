# Brief for Claude Design — What's new (release notes), 2026-10-22

**From:** the grepthink2.0 codebase (beta at `4376d1dd`) · **To:** the "GrepThink Design System" Claude Design project
**Companion spec:** `docs/superpowers/specs/2026-10-22-whats-new-design.md` (the content files, the version, the
seen state, the loading rules)
**Builds on:** `design_handoff_ui_alignment/` (the kit: Popover, Menu, IconButton, Tag, Badge, UnreadBadge, EmptyState,
Skeleton, Markdown) and `components/marketing/LandingHeader` (the landing header)
**Answer with:** `design_handoff_whats_new/README.md` and `NOTES.md`, plus the components in §11. The codebase
builds the feature from that handoff.

## 1. What we are asking for

GrepThink starts numbering its releases at 0.91.0, and every release from then on comes with release notes. Design
where people read them:

- **The What's new panel:** the release notes, newest first, each entry marked by its date (§5.1).
- **The landing header's "What's new" tab,** which drops the panel down (§5.2).
- **The app header's profile menu,** rebuilt on the kit's `Menu`, with a "What's new" row that opens the panel in
  the same dropdown (§5.3).
- **The "new" dot** on the landing tab, the profile button and the menu row, while a release is unread (§5.4).

Not in scope: how the notes are written and stored (decided: one Markdown file per release, in the repo),
notifications or emails about a release, and a separate What's new page.

## 2. Decisions already made (binding)

From the maintainer, 2026-10-22, and the companion spec:

1. **Versions** are semantic versions (`0.91.0`), starting at 0.91.0. One entry per version.
2. **One feed for everyone:** visitors, students, TAs and instructors read the same notes. No filter and no tabs by
   role.
3. **Entries are marked by their date,** as in the Claude Code desktop app's What's new. **No timeline rail:** no
   dots and no line connecting the entries.
4. **An entry** has its date (the entry's heading), its version, and up to three groups, always in the order New,
   Improved, Fixed. Each group is a bullet list of short lines with inline Markdown only: bold, italics, `code` and
   links.
5. **One panel** in both places: the same component on the landing page and in the app.
6. **On the landing page,** a "What's new" tab in the header, between Features and Contact, drops the panel down.
   No separate page.
7. **In the app,** the profile menu moves onto the kit's `Menu`. Its "What's new" row swaps the menu for the panel
   in the same dropdown, anchored to the profile button.
8. **The dot** shows until this browser opens the panel after a release. Inside the panel, the entries newer than
   the version this browser last saw carry a "New" marker. On a first visit, only the newest entry carries it.
9. **The panel is not modal.** The page keeps scrolling. Esc, the ×, a click outside, or focus leaving the panel
   closes it, and focus moves to the panel's heading when it opens.
10. **The school switcher** in the profile menu becomes single-choice `radio` rows under "School", as the kit's
    Menu prompt already says. It no longer expands in place.

## 3. Rules for the whole round

- **The kit only.** Build from Popover, Menu, MenuItem, MenuSeparator, IconButton, Tag or Badge, EmptyState,
  Skeleton and the Markdown layer (`.gt-md`). No kit block re-declared or copied into feature CSS. Anything missing
  becomes a kit addition first, in its kit group, with its gallery states (§9).
- **Tokens only:** no raw hex in any CSS, and new tokens go in `tokens/*.css`. Light mode only. The landing tab
  follows `LandingHeader`'s own link styles and marketing tokens.
- **Accessibility:** WCAG 2.1 AA, every action operable by keyboard with the pattern in §6, touch targets of at
  least 44px on phones, and reduced motion honoured.
- **The reference** is the What's new in the Claude Code desktop app: plain entries, each headed by its date. If a
  screenshot of it is attached, follow its rhythm and density, not its brand.
- **The checkout you can read may be older than this brief.** Where they disagree, follow the brief and note the
  disagreement in `NOTES.md`.

## 4. Who sees it, and where

- **Visitors** on the landing page, signed in or not.
- **Everyone signed in,** on every `/app` page: the profile button sits at the right of the app header, after the
  notifications bell and the search trigger (⌘K).
- The seen state belongs to the browser, so opening the panel on the landing page also clears the dots in the app.

## 5. The screens

### 5.1 The panel

- **A head:** the title "What's new", the visitor's version ("Version 0.91.0"), and a × (`IconButton`, "Close").
- **The feed,** newest first, scrolling inside the panel. Reaching its end does not scroll the page.
- **Each entry:** its date written out ("October 23, 2026") as the heading, its version beside the date, the "New"
  marker when it applies, then its groups in order, each with its label and its list (§12 asks how they read).
- **Between entries,** space or a hairline. No rail.
- **Size:** about 400px wide and at most about 70% of the viewport tall on desktop, right-aligned to its trigger. On
  phones (below 768px), the full width less the page gutter, below the header.

### 5.2 The landing header

- **The tab** sits in the nav between Features and Contact, styled like the header's links, with the dot while
  unseen. It opens the panel below itself.
- **Both header states** have it: the dark bar and the floating pill. An open panel stays open through the switch
  and moves with the tab, so draw it open in both states.
- **Phones:**
  - **The code hides Features at 560px and below,** a rule your `LandingHeader` lacks: "Phones scroll into the
    bands anyway; the nav keeps its three essentials." Add it to `LandingHeader` so the export matches the code. The
    nav there holds Contact, Sign in and Get started, and the tab is the fourth item.
  - At 400px and below, those items shrink to 11px text. Decide how the tab shows at 560px and below. An icon-only
    tab that keeps "What's new" as its accessible name is the expected answer.
  - The header must fit at 320px with no horizontal scroll.
  - The tab's touch target is at least 44px; its hit area may reach past its visible edge. The other items are
    about 30px tall today. Leave them as they are, or restyle them and say so in `NOTES.md`.

### 5.3 The app header's profile menu

- **The trigger:** today's profile button (the avatar, or a user icon when there is none, and a chevron), with the
  dot while unseen.
- **The rows,** in order:
  1. for an account at two or more schools, a "School" group: one radio row per school, the current one checked;
  2. in a class the user teaches: "View class as student", or "Instructor view" while previewing;
  3. "Settings";
  4. "What's new", with the "New" marker while unseen;
  5. a separator, then "Log Out".
- **"What's new"** swaps the menu for the panel in the same dropdown.

### 5.4 The dot

- It means "something new to read", not "unread messages", so it must not look like the red `UnreadBadge`.
- It sits beside the landing tab's label, on the profile button, and on the menu row (there as the "New" marker, or
  a dot: your call).

## 6. Behaviour and keyboard

- **The landing tab** is a button with `aria-expanded`, `aria-haspopup="dialog"`, and `aria-controls` while open.
  Enter or Space toggles it.
- **The profile menu** follows the Menu pattern: the arrow keys, Home and End move, Enter picks, Esc closes. Esc or a
  pick returns focus to the profile button, and tabbing out closes the menu.
- **The panel** is `role="dialog"`, not modal, named by its title. Focus moves to its heading on open, and Tab moves
  through its links and the ×. Esc and the × return focus to the trigger.
- **Names never change:** the tab is "What's new" and the profile button "Profile menu". While the dot shows, the
  tab, the profile button and the "What's new" row are also described as "New release notes", from a visually
  hidden element (`aria-describedby`).

## 7. States to draw

- **The panel:**
  - loading (Skeleton rows);
  - failed (a one-line message and a "Reload" button, which reloads the page);
  - one release; several (five or more); a long entry; inline code and links;
  - "New" markers after an earlier visit, and on a first visit;
  - empty (the kit's EmptyState; it cannot ship, but it has a look).
- **The landing header:** the bar and the pill, each closed and open, with and without the dot, at 1280, 768, 560,
  400, 375 and 320px.
- **The app header:**
  - the profile button with and without the dot;
  - the menu for a student (Settings, What's new, Log Out), for an instructor in their own class (adds "View class as
    student"), in preview mode ("Instructor view"), and for an account at two schools (the School group);
  - the "What's new" row with and without its marker;
  - the panel opened from the menu;
  - phone width.

## 8. The data the panel receives

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

interface WhatsNewPanelProps {
  /** Newest first. */
  releases: Release[];
  /** Shown in the head: "Version 0.91.0". */
  currentVersion: string;
  /** Entries newer than this carry "New"; null (a first visit) marks only the newest. */
  lastSeen: string | null;
  status: 'loading' | 'ready' | 'failed';
  /** The failed state's "Reload" button. */
  onReload?: () => void;
  onClose?: () => void;
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

- **A group label for `Menu`** (for example `MenuLabel`), for "School".
- **A trailing slot on `MenuItem`** (for example `trailing`), for the "New" marker.
- **A "new" dot** that is not `UnreadBadge`'s red unread dot (for example a tone on that dot, or its own component).

## 10. Files the codebase will touch

- `frontend/src/features/releases/` (new): the panel, the feed, the entry and the seen store.
- `frontend/src/features/landing/components/Header.tsx` and `Header.scss`.
- `frontend/src/features/app/components/Layout/`: `ProfileMenu.tsx` (new), `Header.tsx`, `Header.scss`;
  `SchoolSwitcher.tsx` goes.
- `frontend/src/components/`: any kit addition.

## 11. What to deliver

1. **A feature family, `components/releases/`:** `WhatsNewPanel` and `ReleaseEntry`, each as `.jsx` + `.d.ts` +
   `.prompt.md`; one CSS file with BEM `.gt-*` classes and `var(--gt-*)` tokens only; a `releases.card.html` gallery
   of every panel state in §7; and a sample-data module built from §8.
2. **The landing tab** in `components/marketing/LandingHeader`, with its states in `marketing.card.html`.
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
   holds your decisions, your answers to §12, the kit additions, the final component names, and questions for the
   port.
7. **A `PORTING.md` feature-layer row** for the new family, `readme.md` Index and "Intentional additions" lines, and
   `_ds_manifest.json`, updated as in earlier rounds.

## 12. Questions to answer in `NOTES.md`

1. How the landing tab shows at 560px and below, where it is the fourth item, and at 400px and below.
2. Whether the panel on the landing page keeps the app's light surface or gets a variant for the dark header.
3. How the groups read (labels above lists, tags beside lines, or something else), and the form of the "New" marker.
   The marker and the New group must not read alike: an entry can carry both.
4. Where the dot sits on the profile button, and its colour.
5. Whether "Log Out" stays a destructive (red) row in the kit's Menu.
6. The icon for the "What's new" row.
7. Whether "School" needs a group label, and how it looks.
8. The final component names, if not `WhatsNewPanel` and `ReleaseEntry`.
