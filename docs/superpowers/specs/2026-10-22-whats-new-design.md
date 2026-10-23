# What's new: release notes by version — Design Spec

**Date:** 2026-10-22, revised 2026-10-23 with the maintainer's answers to the brief's questions
**Branch:** `docs/whats-new` (onto `beta`)
**Status:** Proposed. Nothing is built. The UI waits for a Claude Design round.
**Design brief:** `docs/superpowers/handoffs/2026-10-22-whats-new/` (`README.md` and `PROMPT.md`), in the same
pull request as this spec.

## Goal

Show what changed in each `beta` → `main` release, by version and newest first, on the public landing page and
inside the app. The notes come from one Markdown file per release, which the release's pull request adds.

Success means:

1. A release adds one file, `frontend/src/features/releases/notes/<version>.md`, and raises the version in
   `frontend/package.json`. Once `main` deploys, both surfaces show it with no other step. A test fails the pull
   request when a notes file breaks the format or when the two versions disagree.
2. On the landing page, an "ⓘ What's new" tab in the header opens the release notes in a modal, in a dark variant.
   The tab works in both header states (the bar and the pill) and at every width down to 320px. On phones it stays
   in the nav, before Contact.
3. In the app, the profile menu is built on the kit's `Menu`, and its "ⓘ What's new" row opens the same modal, in
   the kit's light look.
4. A dot marks the landing tab, the profile button and the menu row until this browser opens the modal after a
   release. Opening the modal clears every dot on the site, in other open tabs too.
5. The entry chunk gains only the triggers, the dot and its seen store, the modal's frame, and the kit's `Popover`,
   `Menu` and `Modal`. The notes and the Markdown renderer load when the modal first opens.
6. Each release that adds notes gets a `v<version>` tag on `main` and a GitHub release with the same notes, created
   by a workflow.
7. No backend change, no database change, nothing to run on PROD.

## Decisions

The maintainer's:

| # | Decision | Source |
|---|---|---|
| 1 | **Semantic versions, starting at 0.91.0.** `MAJOR.MINOR.PATCH`, digits only, no pre-release suffix. A release with anything new or improved raises the minor number. A release with fixes only raises the patch. Going to 1.0.0 is the maintainer's call. | The scheme and the start: maintainer, 2026-10-22. The bump rule is a call made with this spec. |
| 2 | **One Markdown file per release, in the repo.** The release pull request writes it, and the build bundles it. The landing page and the app read the same files. | Maintainer, 2026-10-22. No table, no endpoint, no editor in the app. |
| 3 | **One feed for everyone, for all schools together.** No filter by role or by school. A line that concerns one role names it ("Instructors can now …"). | Maintainer, 2026-10-22 and 2026-10-23. |
| 4 | **The seen state is kept per browser, in `localStorage`.** The landing page and the app share it, because they are one origin. | Maintainer, 2026-10-22. No profile field, no API. |
| 5 | **One modal in both places: the kit's `Modal`,** in a dark variant on the landing page and in the kit's light look in the app. | Maintainer, 2026-10-23. It replaces the first draft's dropdown panel. |
| 6 | **The landing header gets an "ⓘ What's new" tab** (lucide `Info` and the label) that opens the modal. No `/whats-new` route. On phones the tab stays in the nav, before Contact, and shows the icon alone where its label does not fit. | Maintainer, 2026-10-22 and 2026-10-23. |
| 7 | **The profile menu moves onto the kit's `Menu`.** Its "ⓘ What's new" row opens the modal, and the avatar shows a small dot while a release is unread. "Log Out" stays a destructive (red) row. | Maintainer, 2026-10-22 and 2026-10-23. |
| 8 | **A Claude Design round comes first.** Entries are marked by their date, as in the Claude Code desktop app's What's new, with no timeline rail. Each group is a label above its list. | Maintainer, 2026-10-22 and 2026-10-23. |
| 9 | **The design round names the components.** The names in this spec are provisional. | Maintainer, 2026-10-23 ("pick as appropriate"). |

Calls made with this spec (the pull request lists them for the maintainer to check):

| # | Decision | Why |
|---|---|---|
| 10 | **The version lives in `frontend/package.json`.** The build passes it to the app as a constant, and a test holds it equal to the newest notes file. | The dot needs the newest version in the entry chunk without loading the notes. `npm version` keeps the lockfile in step. |
| 11 | **Each release has up to three groups: New, Improved and Fixed,** each optional, always in that order. | The session that proposed the feature suggested these groups. |
| 12 | **A first visit shows the dot.** In the modal, the entries newer than the version this browser last saw are marked new. On a first visit only the newest entry is marked. | A first visit with no dot would hide the feature from new visitors, and marking every entry new would tell them nothing. |
| 13 | **The school switcher becomes radio rows in the menu:** a "School" group with the current school checked, instead of a row that expands in place. | The kit's Menu prompt says the class and school switchers stay Menus with single-choice `radio` rows. A disclosure inside `role="menu"` is not part of the menu pattern. |
| 14 | **A workflow tags each release and publishes its GitHub release** from the same notes file. A pull request from `beta` into `main` gets a warning when its version is already tagged. | Tags are part of the scheme the maintainer chose, and a manual step after each release is easy to forget. |
| 15 | **A version marks a release with something for users to read.** A deploy with nothing to read keeps the current version, with no notes and no tag: a Dependabot security update merged straight into `main`, or a `beta` release of internal work only. | `main` takes Dependabot security updates directly (#232, #233 and #234, October 16–17), and a release of internal work has no line the writing guide allows. A notes entry that says nothing would still light the dot. |
| 16 | **The triggers' names never change.** While a release is unread, the tab, the profile button and the menu row are described as "New release notes" instead. | A name that changes breaks voice control ("click Profile menu") and every test that finds the button by its name. |
| 17 | **The modal's frame loads with the page; only the feed loads on first open.** | The feed's chunk can fail to load: a tab that stayed open across a deploy asks for a file the deploy removed, and a release is exactly when people open What's new. A frame that is already there can show the failure and a way out. A modal loaded on demand, as Settings is, has no surface for that, and the failure would reach the app's top-level error boundary, which replaces the whole app. The cost is the kit's `Modal` in the entry chunk (section 7). |
| 18 | **The failed state offers "Reload", not a retry.** | After a deploy, a retry asks for the same missing file again. The app's `ErrorBoundary` offers the same way out. |
| 19 | **Two implementation pull requests.** PR A holds the notes, the version and the workflow, with no UI, and can start once this spec is approved. PR B holds the design import and the UI, and starts when the export arrives. | PR A needs no design, so the next release can already be 0.91.0, with a tag and notes. |

## 1. The release notes

### Where they live

`frontend/src/features/releases/notes/`, one file per release, named by its version: `0.91.0.md`. The folder is
inside `frontend/` because Vercel and the Dockerfile both build from that folder.

### File format

```markdown
---
date: 2026-10-23
---

## New

- **What's new.** Release notes for every version, on the landing page and in your profile menu.

## Improved

- Pages open faster: each page loads its own code the first time you visit it.

## Fixed

- A team meeting in progress shows a blue Live badge on the project page.
```

- **Front matter** holds one key, `date`: the day the release reaches `main`, on the campus calendar. If the
  release merges later than planned, fix the date in the release pull request.
- **Sections** are `## New`, `## Improved` and `## Fixed`. Each is optional and appears at most once, in that order.
  A file has at least one.
- **Each section is a bullet list** (`- `), one item per change, with at least one item. Only inline Markdown:
  bold, italics, `code` and links. No headings, images, tables, block quotes or HTML.
- **The `##` lines are markers.** The component draws the group labels itself and hands only each section's list to
  `MarkdownText`, so the file's heading levels never clash with the modal's headings.

### Rules a test enforces

`releaseNotes.test.ts` checks every file in the folder:

1. The name is `X.Y.Z.md`, each part a whole number with no leading zero (a single `0` is allowed).
2. The file starts with `---`, holds `date: YYYY-MM-DD` with a real calendar date and no other key, and closes the
   front matter with `---`.
3. The sections follow the format above, with only blank lines between the front matter and the first section. Any
   other line fails, and the message names the file and the line.
4. Versions are unique, and sorting by version gives the same order as sorting by date: a higher version never has
   an earlier date.
5. The newest version equals the `version` in `frontend/package.json`. This also means the folder is never empty.

### Writing them

Write for students, TAs and instructors at every school: what they can do now, in plain words. Leave out pull
request numbers, file paths, component names and internal work (lint, CI, refactors), unless users notice it
("Pages open faster"). One line per change, with an optional bold lead-in. Links are allowed but rare; they open
in a new tab. PR A puts this guide and the template in the README's "Branches, releases and the database" section.

## 2. The version

### `package.json` and the build

- `frontend/package.json`'s `version` is the current release. Raise it with
  `npm --prefix frontend version <version> --no-git-tag-version`, which updates `package-lock.json` as well.
- `vite.config.ts` reads it and defines `__APP_VERSION__`. Vitest uses the same config, so tests see the same
  value. `src/vite-env.d.ts` declares the constant.
- `features/releases/version.ts` exports `APP_VERSION`, `parseVersion` and `compareVersions`.

### Tags and GitHub releases

A new workflow, `.github/workflows/release.yml`:

- **On a push to `main`**, it reads the version from `frontend/package.json`. If there is no `v<version>` tag yet,
  it publishes the GitHub release `v<version>` at the pushed commit, which creates the tag. The title is the
  version, and the body is the notes file without its front matter.
  - If the tag exists already, it does nothing. That is the case for every deploy with no new version (decision
    15).
  - If the notes file is missing, it fails and names the file.
- **On a pull request from `beta` into `main`**, it adds a warning annotation (not a failure) when `v<version>`
  already exists: the release adds no notes. That is right for a release of internal work only, and a reminder
  otherwise. Pull requests from other branches, such as Dependabot's, get no warning.
- Only the tagging job gets `permissions: contents: write`. It uses the workflow's own `GITHUB_TOKEN`, with no
  other secret.
- No release before 0.91.0 is tagged.

### The release, step by step

PR A adds this to the README's "Branches, releases and the database" section:

1. On a branch from `beta` (`release/<version>`), add `notes/<version>.md` and raise the version. Open a pull
   request into `beta` and merge it.
2. Open the release pull request from `beta` into `main` as today, and merge it with a merge commit.
3. The workflow tags `main` and publishes the GitHub release. Once Vercel deploys, both surfaces show the new entry,
   and the dot appears in every browser that has not opened it.

A release with nothing for users to read skips step 1 and keeps the version (decision 15). PR A also corrects the
README's "Nothing lands on `main` except a pull request from `beta`": Dependabot security updates merge into
`main` directly, and they deploy without a new version.

## 3. The seen state

- `localStorage['gt:whats-new:seen']` holds the newest version this browser has opened the modal on. The `gt:`
  prefix follows `gt:instructor:dismissed-alerts`.
- The modal counts as unseen when the stored value is missing, is not a valid version, or is lower than
  `APP_VERSION`. A higher stored value, which a rollback can leave, counts as seen.
- `features/releases/seenStore.ts` holds `readSeen()`, `openWhatsNew()` and `subscribe()`. The hook `useWhatsNew()`
  reads them through `useSyncExternalStore` and returns `{ unseen, lastSeen }`.
  - Every dot reads the one store, so marking the version seen clears all of them at once.
  - A `storage` event listener carries the change to the site's other open tabs.
- Opening the modal marks the current version seen. The modal keeps the `lastSeen` it opened with, so its "New"
  markers stay put while it is open.
- Storage can throw: blocked storage, private browsing, a full quota.
  - A read that throws counts as nothing stored, and a write that throws is dropped.
  - The page then remembers the opening in memory, so the dot stays cleared until the next page load, when it comes
    back. Nothing else breaks.
  - Wrap every access in `try`/`catch`, as `Roster/InviteModal.tsx` does.
- Signing in or out never touches the key. It belongs to the browser, not the account (decision 4).

## 4. The modal

One component, `WhatsNewModal` in `features/releases/components/`, rendered by both hosts. It wraps the kit's
`Modal`; the design round names it and may change its parts (decision 9).

### Contents

- **The kit `Modal`'s head:** the title "What's new", which names the dialog; the subtitle "Version 0.91.0", the
  version the visitor is on; and the kit's × ("Close").
- **Its look:** the dark variant on the landing page, the kit's light look in the app (decision 5). The kit's
  `Modal` has no dark look yet, so the design round adds one (section 6, "Kit additions").
- **The body:** every release in the folder, newest first, scrolling inside the modal. No footer.
- **Each entry (`ReleaseEntry`):**
  - its date as the entry's heading, written out like "October 23, 2026";
  - its version beside the date;
  - a "New" marker when the release is newer than `lastSeen` (decision 12);
  - its groups in the order New, Improved, Fixed, each a label above its list (decision 8). The lists render
    through `MarkdownText` (`variant="compact"`).
- **Between entries,** space or a hairline. No rail, no dots and no connecting line (decision 8).

The date is a calendar date, not an instant, so it shows exactly as written in every time zone: build it from its
parts and format it in UTC. The repo's time rule, which shows instants in the viewer's zone, does not apply to it.

### States

The design round draws each of these, in both looks:

- **Loading:** the feed's code is still loading. Skeleton rows in the body; usually only a blink.
- **Failed:** the feed's code did not load, because the network dropped or because a deploy removed the file the
  page asked for. A one-line message and a "Reload" button that reloads the page (decision 18).
- **Content:** one release; several; a long entry; inline code and links.
- **Empty:** no release at all. It cannot ship, because the test requires a file, but the component still renders
  the kit's `EmptyState` rather than nothing.

### Behaviour

The kit's `Modal` brings it, through `useDialog`:

- `aria-modal`, named by its title and described by its subtitle;
- focus moves in on open (to the sheet: the modal has no field), stays trapped, and returns to the opener on close;
- Esc, the scrim and the × close it;
- the page behind it does not scroll.

Two things are this feature's:

- **Opening marks the version seen** (section 3).
- **The body scrolls inside the modal,** and reaching its end does not scroll the page.

### Size

The design round sets it: one of the kit's sizes (`md`, 560px, is the kit's default), and the kit's phone layout.

## 5. The landing header

- **The tab.** `features/landing/components/Header.tsx` gets an "ⓘ What's new" button in its nav, between Features
  and Contact: the lucide `Info` icon (`aria-hidden`) and the label, styled like the header's links
  (`landing-header__link`), with the dot while unseen. It opens the modal in its dark variant. The contact page
  renders the same header, so the tab works there too.
- **Its name** is always "What's new". While the dot shows, the button is also described as "New release notes"
  (`aria-describedby` on a visually hidden element). It carries `aria-haspopup="dialog"`.
- **Both header states** have it. The modal stops the page from scrolling, so the header cannot switch between the
  bar and the pill while the modal is open.
- **Phones:**
  - At 560px and below, Features hides (`Header.scss`: "the nav keeps its three essentials"). The tab stays and
    becomes the nav's first item, before Contact, Sign in and Get started (decision 6).
  - Where its label does not fit, it shows the icon alone and keeps "What's new" as its accessible name. The design
    round picks the width; 400px and below is the expected answer, where the other items already shrink to 11px
    text.
  - The header must fit at 320px with no horizontal scroll.
  - The tab's touch target is at least 44px; its hit area may reach past its visible edge. The other items keep
    their size, unless the design round restyles them, in which case its `NOTES.md` says so and PR B ports it.
  - The design's own `LandingHeader` lacks the 560px rule, so the brief tells the round about it. The port keeps
    the rule either way.
- **The look.** The tab follows the header's own link styles. The modal is the dark variant (decision 5).
- **Unchanged:** the hero's announcement pill.

## 6. The profile menu on the kit's Menu

A new component, `features/app/components/Layout/ProfileMenu.tsx`, takes the profile dropdown out of `Header.tsx`.

- **The trigger** is today's profile button (the avatar or the user icon, and the chevron), now with
  `aria-haspopup="menu"` and `aria-expanded`. While unseen, a small dot sits on the avatar. Its name stays "Profile
  menu"; while the dot shows, it is described as "New release notes", like the landing tab.
- **One `Popover`** (`align="end"`, `padded={false}`) holds the `Menu` (`ariaLabel="Profile"`, `autoFocus`). Its
  rows, in order:
  1. For an account at two or more schools: a "School" group with one `MenuItem` `radio` row per school, the
     current one checked. Picking a school does what `SchoolSwitcher`'s pick does today: it selects the class last
     used at that school and lands on the page your role there calls for. `SchoolSwitcher.tsx` and its styles go.
  2. In a class you teach: "View class as student", or "Instructor view" while previewing (the `Eye` icon).
  3. "Settings" (`Settings`).
  4. "What's new" (`Info`), with the "New" marker while unseen, when it is also described as "New release notes".
  5. A separator, then "Log Out" (`LogOut`), a `destructive` row (decision 7).

  The labels stay as they are today unless the design round changes them.
- **"What's new"** closes the menu with focus on the profile button and then opens the modal, as "Settings" does
  today. The modal's opener is then the profile button, and focus returns there when it closes.
- **Keyboard and focus** follow the sprint picker (`features/scrum/components/SprintPicker.tsx`): the arrow keys,
  Home and End move, Enter picks, and Esc or a pick closes the menu with focus back on the profile button. Tabbing
  out of the menu closes it.
- **Kit additions** the design round brings or turns down:
  - a group label for `Menu` (for "School");
  - a trailing marker slot on `MenuItem`;
  - a dot that means "new" rather than the red unread count;
  - the dark variant of `Modal`.

  Each lands in `frontend/src/components/` first, under the name the design manifest gives it.
- **Unchanged:** the notifications dropdown (it moves to the kit in its own adoption pull request), the search
  trigger, and preview mode. The outside-click effect in `Header.tsx` keeps only its notifications half; the
  profile half goes with the `Popover`.

## 7. Loading and the entry chunk

- **The entry chunk** carries both the landing page and the app shell. It gains:
  - `APP_VERSION` and the seen store;
  - the two triggers and the dot;
  - `WhatsNewModal`'s frame;
  - the kit's `Popover`, `Menu` and `Modal` (with `useDialog` and `IconButton`), none of which is in it today.

  Target: the `index-*.js` line of `npm run build` grows by at most about 12 kB minified (4 kB gzipped), from
  beta's 180 kB (51 kB gzipped). PR B reports the measured figure.
- **The feed is one `lazy()` chunk,** loaded on the first open: `ReleaseFeed`, `ReleaseEntry`, the parsed notes and
  `MarkdownText`. react-markdown stays in the shared chunk it is in today. `releaseNotes.ts` reads the files with
  `import.meta.glob('./notes/*.md', { eager: true, query: '?raw', import: 'default' })`, and only that chunk imports
  it.
- **Prefetch** the feed when someone is about to open it, as the search trigger warms its index: on hover or focus
  of the landing tab, and when the profile menu opens (not on every hover of the profile button).
- AGENTS.md's rule still holds: the shell imports no Markdown renderer statically.

## 8. Files

The names are provisional; PR B checks them against the export.

**PR A (notes and version):**
- `frontend/package.json` and `frontend/package-lock.json`: version 0.91.0.
- `frontend/vite.config.ts`: the `define`. `frontend/src/vite-env.d.ts`: `declare const __APP_VERSION__: string`.
- `frontend/src/features/releases/`: `version.ts`, `releaseNotes.ts`, `notes/0.91.0.md`, and
  `__tests__/version.test.ts` and `__tests__/releaseNotes.test.ts`.
- `.github/workflows/release.yml`.
- `README.md` (the release steps, the writing guide, and the corrected sentence about what reaches `main`),
  `AGENTS.md` (the directory structure, and a gotcha: the newest notes file equals `package.json`'s version), and
  `.github/PULL_REQUEST_TEMPLATE.md` (a line for release pull requests).

**PR B (the UI):**
- `design/`: the export, as its own commit, per `design/PORTING.md`.
- `frontend/src/components/`: the kit additions from the export, with their tests.
- `frontend/src/features/releases/`: `seenStore.ts`, `useWhatsNew.ts`, `releaseDate.ts`, `loadReleaseFeed.ts`, and
  `components/WhatsNewModal`, `ReleaseFeed` and `ReleaseEntry`, with their styles and tests.
- `frontend/src/features/landing/components/`: a new `WhatsNewTab.tsx`, plus `Header.tsx` and `Header.scss`, and the
  landing tests.
- `frontend/src/features/app/components/Layout/`: the new `ProfileMenu.tsx`, plus `Header.tsx` and `Header.scss`;
  `SchoolSwitcher.tsx` and its test go; `Header.test.tsx` and `layoutNavigation.test.tsx` change.
- `AGENTS.md`'s kit list.

## 9. Testing and verification

**Unit and component tests:**
- `version.test.ts`: parsing and ordering (0.9.0 < 0.10.0 < 0.91.0 < 1.0.0), and invalid strings.
- `releaseNotes.test.ts`: a valid file parses; each rule break fails with the file and the line; the real folder
  passes rules 1–5.
- The seen store and `useWhatsNew`:
  - unseen with nothing stored, with an invalid value and with a lower one; seen with an equal or a higher one;
  - opening updates every subscriber;
  - a `storage` event from another tab updates them too;
  - a `localStorage` that throws neither crashes nor hides the dot, and an opening still clears it until the page
    reloads.
- The modal and the feed:
  - entries newest first, each with its date and version, and groups in order;
  - the "New" markers, after an earlier visit and on a first visit;
  - the date unchanged under fixed-offset zones on both sides of UTC (`Etc/GMT+12`, `Etc/GMT-14`);
  - loading, then content; a rejected import shows the failed state, and its "Reload" button reloads the page;
  - the dark variant's class when asked for, and the light look otherwise.
- The landing tab:
  - it opens the modal, a dialog named "What's new" in the dark variant;
  - the "New release notes" description and the dot clear after opening;
  - Esc and the × close the modal with focus back on the tab.
- `ProfileMenu`:
  - rows and roles in order, for each case: a student, an instructor in their own class, an account at two schools,
    and preview mode;
  - the arrow keys; Esc and picks return focus to the profile button;
  - picking a school (today's `layoutNavigation` case);
  - "What's new" opens the modal, and closing it returns focus to the profile button;
  - the dots and descriptions on the button and the row, before and after.

**Gates:** `npm run lint && npm run lint:design && npm run build && npm run test:coverage`. Compare the build's
`index-*.js` line with beta's (section 7), and check that a sentence from `0.91.0.md` does not appear in the entry
chunk. Coverage thresholds never go down, and `src/components/**` keeps its 90/90/85/85 floor for the kit
additions.

**In the browser (PR B):**
- The landing page needs no sign-in, so the dev server shows it directly:
  - 1280, 768, 560, 400, 375 and 320px wide, in the bar and in the pill;
  - the modal open, in the dark variant, at desktop and phone widths;
  - with and without the dot;
  - a keyboard walk and reduced motion.
- The app header, through a git-excluded harness page (`frontend/<name>-mock.html`), as for earlier shell work:
  each persona, two schools, preview mode, and phone width.
- Both compared with the export's galleries.

## 10. Delivery

1. **This pull request:** the spec and the design brief. Documentation only.
2. **PR A, "Release notes and the app version":** sections 1 and 2 with their tests. It can start once this spec is
   approved. If it merges before the next `beta` → `main` release, that release is 0.91.0. Its notes are drafted
   from the pull requests the release merges, for the maintainer to edit.
3. **The design round:** the maintainer sends the brief to Claude Design.
4. **PR B, "What's new":** the export as its own commit, the kit additions, and sections 3 to 7 with their tests.

Each implementation pull request has one implementer and one whole-branch review before it opens onto `beta`. No
migration and no PROD step.

## Out of scope, and follow-ups

- Notes filtered by role or by school (decision 3), and a seen state kept per account (decision 4).
- A public `/whats-new` page, a `#whats-new` link that opens the modal, or pointing the hero's announcement pill at
  the modal.
- Emails or notifications about a release.
- Notes for the releases before 0.91.0.
- Moving the notifications dropdown onto the kit (its own adoption pull request).
- Settings' own load failure: it is a modal loaded on demand outside the page's error boundary, so a failed chunk
  reaches the top-level boundary. It is not this feature's to fix.
