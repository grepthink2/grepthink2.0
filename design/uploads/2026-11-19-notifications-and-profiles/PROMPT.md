# Prompt for Claude Design — header notifications and profile pages, 2026-11-19

Attach `README.md` from this folder and, if you can, a screenshot of the app's header with the notifications
panel open. Then send the text below to the "GrepThink Design System" project.

---

Redesign GrepThink's header notifications and design a dedicated profile page for a person. The attached
`README.md` (2026-11-19) is the brief:

- §1 says what is wrong today: the bell is a filled glyph from another icon set, its button and badge are out of
  proportion with the search trigger and the profile button beside it, the panel is hand-built, and it shows
  unread items only, so a notification is gone the moment it is read.
- §2's decisions are binding where they are not marked ⚑; argue the ⚑ ones in `NOTES.md` if you disagree.
- §3's rules decide acceptance: the kit only, tokens only, and the accessibility rules.
- §4 says who may see what on a profile page. It is a privacy rule, not a suggestion: the page adds no new
  exposure of student data.
- §5 lists the screens and their states, §6 the interactions, §7 the data, §8 every notification kind and where
  it leads.
- §9 lists the kit additions we expect, §10 the files the codebase will touch, §11 what to deliver, and §12 the
  questions to answer in `NOTES.md`.

Start with the header: make the notifications control, the search trigger and the profile button one family
(one height, one radius, one surface, one icon size and stroke), at desktop and phone widths. Then the panel,
then the profile page and the ways into it. The checkout you can read may be older than the brief; where they
disagree, follow the brief and note the disagreement in `NOTES.md`.

## Deliver

1. The header's right-hand group as a composition of the kit, with a gallery of its states (no unread, 1, 9,
   "9+", panel open, focus on each control, phone width).
2. The feature family `components/notifications/`: the panel and its item (`.jsx` + `.d.ts` + `.prompt.md`), one
   CSS file with BEM `.gt-*` classes and `var(--gt-*)` tokens only, a `notifications.card.html` gallery of every
   state in brief §5, and a sample-data module with one item of every kind in brief §8.
3. The feature family `components/people/`: the profile page's parts and, if you design it, the person hover
   card, with a `people.card.html` gallery covering each viewer in brief §4, the own-page variant, a sparse
   profile, the not-visible state and loading.
4. Any kit addition the screens need (brief §9), in its kit group first, with its gallery states.
5. `ui_kits/grepthink/notifications.html` and `ui_kits/grepthink/profile.html`: each in the app shell, with a
   demo bar that switches the viewer's role, the unread count, the data and the viewport.
6. `design_handoff_notifications_and_profiles/README.md` and `NOTES.md`. The README follows the earlier
   handoffs' shape: overview, decisions, screens, component specs with exact values, interactions and keyboard,
   states, data contract, tokens, files, and the class names the port should keep. `NOTES.md` holds your
   decisions, your answers to brief §12, the kit additions, any new status keys, and what the API must gain.
7. A `PORTING.md` feature-layer row for each new family, `readme.md` Index lines, and `_ds_manifest.json`
   updated as in earlier rounds. Leave `components/figma-reference/` untouched.

## Acceptance

- The three header controls measure the same height and share one radius, surface and icon treatment; the bell
  is a lucide outline icon in `currentColor`; the count is the kit's badge.
- Built from the kit: no kit block re-declared or copied into feature CSS, no hand-built button, popover, menu,
  badge, avatar, card or tab strip. Anything new is a kit addition first.
- A read notification is still reachable; nothing in the design deletes one.
- Every notification kind in brief §8 has an item in the gallery, told apart by more than colour.
- A profile page shows nothing brief §4 does not allow its viewer, and the gallery shows each viewer.
- Every state in brief §5 appears at desktop and phone width.
- No raw hex in any CSS; new tokens go in `tokens/*.css`. Light mode only, flat and calm, no marketing tokens.
- WCAG 2.1 AA, every action operable by keyboard with its kit component's pattern, touch targets of at least
  44px on phones, reduced motion honoured.
