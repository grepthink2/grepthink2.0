# Handoff — What's new (release notes), 2026-10-23

## Overview
GrepThink numbers its releases from 0.91.0 and ships notes with each one. This round designs where people read them:
the **What's new modal** (the kit's `Modal`, dark on the landing page, light in the app), the landing header's
**"ⓘ What's new" tab**, the app header's **profile menu rebuilt on the kit's `Menu`** with an "ⓘ What's new" row, and the
**"new" dot** and **"New" marker** that show while a release is unread. No screen was redesigned; the kit grew four small
pieces (§4) and one feature family (§3). The codebase builds PR B from this folder.

Read with: the brief and the spec (`uploads/2026-10-22-whats-new/`), `NOTES.md` here (decisions, the §12 answers, the
kit additions, the names, port questions), each component's `.d.ts` (props) and `.prompt.md` (usage + ARIA pattern), the
galleries (`components/releases/releases.card.html`, `marketing.card.html`, `navigation.card.html`, `dialogs.card.html`,
`popover.card.html`, `display.card.html`) and the screen `ui_kits/grepthink/whats-new.html`.

## Decisions (binding, brief §2) and how they landed
1. **Semantic versions from 0.91.0, one entry per version** — `ReleasesModel.parseVersion / compareVersions`; entries sort newest first.
2. **One feed for everyone** — no filter, no tabs; the modal has a head and a body, nothing else.
3. **Entries marked by their date, no rail** — `ReleaseEntry`: the date is the heading, the version beside it; entries are separated by a hairline and 18px, no dots, no line.
4. **Date, version, up to three groups in the order New · Improved · Fixed, each a label above its list** — `RELEASE_GROUPS` fixes the order; a missing group leaves no gap; lists render through `MarkdownText` (inline Markdown only).
5. **One modal, the kit's `Modal`, dark on the landing / light in the app** — `WhatsNewModal tone="dark" | "light"` over the new `Modal tone` (§4).
6. **The landing tab between Features and Contact, opens the modal** — `WhatsNewTab` in `LandingHeader` (`onWhatsNew`); no page.
7. **On phones the tab stays, first before Contact; icon alone where the label does not fit** — Features hides at ≤ 560px (the code's rule, added), the label at ≤ 400px.
8. **The profile menu on the kit's `Menu`, "ⓘ What's new" row, a dot on the avatar, "Log Out" destructive** — `ProfileMenu` (`navigation/`).
9. **The dot until this browser opens the modal; "New" on entries newer than `lastSeen`; a first visit marks only the newest** — `isUnseen` / `isNewSince`; the modal keeps the `lastSeen` it opened with.
10. **The school switcher becomes radio rows under "School"** — `MenuGroup label="School"` + `MenuItem radio`; nothing expands in place.
11. **Names** — ours, in NOTES §6.

## Rules applied
- **The kit only.** Every surface is Modal, Popover, Menu, MenuItem, MenuSeparator, IconButton, Badge, EmptyState, Skeleton, Button, Avatar and the `.gt-md` layer. `releases.css` re-declares no kit block; it adjusts the kit only from `.gt-release*` / `.gt-whats-new` (`.gt-release__group .gt-md`, `.gt-whats-new .gt-modal__body`), and `navigation.css` from `.gt-profile-menu`. The only new buttons are the two the brief names: the landing tab (a link-styled `<button>`) and today's profile button.
- **Tokens only.** No raw hex in any CSS. New tokens in `tokens/colors.css`: the on-dark ramp `--gt-dark-*` (12) and `--gt-new-dot`, `--gt-new-dot-ring`. The app stays light: nothing in the app reads `--gt-dark-*`.
- **Accessibility.** WCAG 2.1 AA in both looks (the dark ramp's figures are in NOTES §2); the keyboard pattern of brief §6 (dialog, menu button + menu); 44px targets on phones (the tab's through its hit area, the profile button's and the rows' through `min-height`); reduced motion honoured (the Modal and Popover fades already fall back; the profile button's transition is dropped).
- **The reference** — the Claude Code desktop app's What's new: plain entries headed by their date, ~13.5px body, a hairline between entries, no decoration.

## 1. The modal — `components/releases/WhatsNewModal`
`Modal size="md"` (560px), `title="What's new"`, `subtitle="Version 0.92.0"` (the visitor's version), the kit's × ("Close"), no footer. The body is `ReleaseFeed`; it scrolls alone (the kit's `.gt-modal__body` now has `overscroll-behavior: contain`, so the page never scrolls when the feed ends). Dialog behaviour is `useDialog`'s: focus to the sheet (no field inside), Tab trapped, Esc / scrim / × close, focus back to the opener (the landing tab, or the profile button). Phones: the kit's 12px margins, `max-height: calc(100vh - 24px)`, the head pinned.

**`ReleaseFeed`** — `status` loading (two ghost entries of `Skeleton`, `aria-busy`, a hidden "Loading release notes" status) · ready (entries newest first, hairlines, `isNewSince` markers) · failed (card `EmptyState`, "The release notes didn't load.", a primary **Reload** `Button size="sm"` that reloads the page — a retry would ask for the same missing file; `role="status"`) · empty (card `EmptyState`, "No release notes yet"). `tone="dark"` adds `gt-release-feed--dark`.

**`ReleaseEntry`** — `<article>`: `<header>` with the date heading (`<time dateTime>`, 15/600, `--gt-tracking-tight`), the version (Fira Code 12, tertiary), the "New" marker (`Badge status="release.new" size="sm"`); then one `<section>` per present group: a caps label (11/600, `--gt-tracking-wide`, tertiary) over the `MarkdownText` list at 13.5px / 1.55 (14px on phones). Heading levels: h3 under the modal's h2, labels h4 (`titleAs`).

**`ReleasesModel`** — `RELEASE_GROUPS`, `parseVersion`, `compareVersions`, `sortReleases`, `isNewSince(release, lastSeen, index)`, `isUnseen(current, lastSeen)`, `formatReleaseDate` ("2026-10-23" → "October 23, 2026", UTC parts), `parseReleaseNotes(version, md)` and `releasesFromNotes(map)`; `releasesData.js` holds the brief's three sample files verbatim (`GT_RELEASE_NOTES_SAMPLE`) plus two invented ones for the five-entries and long-entry states (`GT_RELEASE_NOTES_MORE`).

Light look: the kit's. Dark look: Modal's `tone="dark"` (§4) — the sheet `--gt-dark-surface`, text `--gt-dark-text / -muted / -faint`, links `--gt-dark-link` (blue-300), code on `--gt-dark-fill`, the marker on `--gt-dark-accent-soft`, hairlines `--gt-dark-hairline`, the scrim `--gt-dark-scrim`.

## 2. The landing header — `components/marketing/LandingHeader` (+ `WhatsNewTab`)
- `onWhatsNew` renders the tab between the first link (Features) and the rest; `whatsNewUnseen` shows the dot. The tab is a `<button class="gt-landing-header__link gt-landing-header__tab">` with the lucide `Info` (16) and the label, `aria-label="What's new"` (the name never changes), `aria-haspopup="dialog"`; while unseen it is `aria-describedby` a visually hidden "New release notes" and the `NewDot ring` sits on the icon's corner (its ring re-coloured to `--gt-mkt-dark` from the header's own class). Hover and focus are the link's.
- **Phones:** `@media (max-width: 560px) .gt-landing-header__link--features { display: none }` (the code's rule, now in the design; `links[].hideOnPhone` sets the class). At ≤ 400px the nav text is 11px and `.gt-landing-header__tab-text` is hidden — the icon alone. At ≤ 400px the pill's margins thin (`10px 8px` / `6px 10px`) so the four items fit inside it at 375; at ≤ 360px the logo is 22px, the gaps 1px, the buttons `7px 5px` (primary 8px), the pill `10px 6px` / `6px 8px`. Measured: the bar and the pill fit at 320px with no horizontal scroll (every nav right edge ≤ the inner's content edge at 560, 400, 375, 360, 320).
- **Touch target:** a centred `::after` of `max(100%, 44px)` square on the tab; the visible tab keeps the links' ~30px height, and the other items keep their size (NOTES §3).
- **Layer:** the header moves from `--gt-z-tooltip` (1000) to `--gt-z-sidebar` (99, the chrome layer). At 1000 it sat on top of the modal (100). The code's `Header.scss` uses `$z-index-tooltip` — port the change with the tab (NOTES §5).
- Both header states carry the tab; the modal locks the page, so the state cannot change under it.

## 3. The profile menu — `components/navigation/ProfileMenu`
A composition: today's profile button (`.gt-profile-menu__button`: white, `--gt-shadow-card`, radius 7, `6px 12px`, the 28px `Avatar` or the user icon in a canvas disc, a 16px chevron; `aria-label="Profile menu"`, `aria-haspopup="menu"`, `aria-expanded`) + `Popover align="end" padded={false}` + `Menu ariaLabel="Profile" autoFocus`. Rows: `MenuGroup label="School"` of `radio` rows (two or more schools) then a separator · "View class as student" / "Instructor view" (`teaching`, `previewing`) · "Settings" · "What's new" with `trailing={<Badge status="release.new" size="sm" aria-hidden />}` while unseen · separator · "Log Out" `destructive`. While unseen the avatar carries `NewDot ring` (top -1 / right -1) and the button and the row share one hidden "New release notes" description. Keyboard: the Menu pattern; Esc or a pick closes with focus back on the button (only when focus would otherwise be lost — an outside click leaves focus where the user put it); tabbing out closes. "What's new" closes the menu first, so the modal's opener is the profile button. The menu is 228px wide min; phone rows and button 44px.

## 4. Kit additions (brief §9)
| Addition | Where | What |
| --- | --- | --- |
| **Modal `tone="dark"`** | `feedback/Modal` | `.gt-modal--dark` + `.gt-modal-backdrop--dark`: the scrim, sheet (`color-scheme: dark`, so the scrollbar follows), title, subtitle, the × (muted, translucent hover), footer rule, and the kit pieces a body holds — `.gt-md` (links, code), `.gt-skeleton`, the card `EmptyState`, `.gt-badge--info`. Gallery: `dialogs.card.html`. |
| **`MenuGroup`** | `feedback/Menu` | `role="group"` named by a caps label (10.5/600, `--gt-tracking-wide`, tertiary, `8px 10px 4px`); the arrow keys skip the label. Gallery: `popover.card.html`. |
| **`MenuItem trailing`** | `feedback/Menu` | a slot at the row's end (`.gt-menu__trailing`); the label's `flex: 1` keeps it right. |
| **`NewDot`** | `display/NewDot` | 8px, `--gt-new-dot` (= `--gt-info`), `aria-hidden`; `ring` = 2px `--gt-new-dot-ring` (default `--gt-surface`). Gallery: `display.card.html`. |
| **`Badge size="sm"` + `release.new`** | `display/Badge` | `2px 8px`, 11px — the marker size; `release.new` → blue "New". Beyond §9's list, so the marker is a kit Badge rather than a hand-built pill. |
| **`.gt-modal__body { overscroll-behavior: contain }`** | `feedback.css` | every modal: reaching the body's end never scrolls the page. |

## 5. Data contract
The brief's §8 `Release` and `WhatsNewModalProps`, unchanged (`WhatsNewModal.d.ts`); `portal` is a design-side extra for the galleries. `ReleaseFeed` takes the same minus `open / onClose / currentVersion` plus `tone`. The host passes the `lastSeen` it opened with.

## 6. Files (codebase, PR B)
- `frontend/src/components/`: `Modal` (tone), `Menu` (MenuGroup, trailing), `Badge` (size, release.new), `NewDot/` (new), with tests; `index.css` keeps `.gt-visually-hidden`.
- `frontend/src/features/releases/components/`: `WhatsNewModal`, `ReleaseFeed`, `ReleaseEntry` + `releases.scss` (1:1 from `releases.css`); `version.ts` / `releaseNotes.ts` / `releaseDate.ts` / `seenStore.ts` / `useWhatsNew.ts` as the spec says (`ReleasesModel` is their design-side mirror).
- `frontend/src/features/landing/components/`: `WhatsNewTab.tsx`, `Header.tsx` (+ the tab, `onWhatsNew`), `Header.scss` (the tab block, the ≤ 400 / ≤ 360 rules, `z-index`).
- `frontend/src/features/app/components/Layout/`: `ProfileMenu.tsx` (+ `ProfileMenu.scss` from the `.gt-profile-menu` block), `Header.tsx` / `Header.scss` lose the dropdown and `SchoolSwitcher`.
- `frontend/src/styles/tokens/colors.css`: `--gt-dark-*`, `--gt-new-dot`, `--gt-new-dot-ring`.
