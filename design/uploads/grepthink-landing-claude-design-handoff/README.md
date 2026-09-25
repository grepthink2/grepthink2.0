# Claude Design handoff: grepthink2.com landing update (2026-09-24)

Paste everything below the line into Claude Design, in the **GrepThink Design System** project,
and attach the five files in `mockups/` (plus `spec.md` if you want the full detail). Claude Code
is building the page in parallel with placeholders, so each deliverable can land independently.

---

You are designing assets for an update to **grepthink2.com**, the public landing page of
GrepThink 2.0, a team-project platform for UCSC's CSE 115 capstone courses. Work in this design
system project. The page's structure, copy and widget designs are **already decided and
approved**; the five attached mockups show them. Don't redesign those. Your job is the pieces
the design system doesn't have yet.

## What the update is

Three new sections ("spotlight bands") go under the existing hero and overview:

1. **Scrum board** (NEW): sprints, stories and tasks on a drag-and-drop board, with points,
   estimates, PR links and burnup charts. It uses this project's `components/scrum/` layer.
2. **Messaging** (NEW): every project gets Team, TA and Instructor channels, plus direct messages
   and live notifications. It uses `ConversationListItem`, `MessageBubble` and the app's channel
   pill colors (Team green, TA blue, Instructor amber).
3. **Project assistant** (COMING SOON): it reads a team's pull requests and commits, then
   suggests board updates ("PR #41 merged, move GT-12 to Done?"), flags stalled tasks and PRs
   with no task, and for TAs and instructors compares weekly status reports with the work each
   student actually closed. It proposes; a person always approves.

Each band has text on one side and a cluster of 2–4 floating widget cards on the other. The cards
use the landing hero's shell: white, 20px radius, a soft two-layer shadow, a tilt between −3° and
+3°, and a slow 8–10s float. The hero also gains a "NEW · Scrum boards and team channels →"
pill, and the page ends with a dark green closing band.

## The mockups (attached)

| File | Shows | Status |
|---|---|---|
| `01-page-structure.html` | Three layout options | A, spotlight bands, chosen |
| `02-band-scrum.html` | Band 1: board, task card, burnup; a task slides to Done | Approved |
| `03-band-messaging.html` | Band 2: inbox and live thread; typing dots become a message | Approved |
| `04-band-assistant.html` | Band 3: suggestion, stalled flag, report check, unlinked-PR chip, on an outlined "Preview" backdrop | Approved as a placeholder, for you to replace (deliverable 2) |
| `05-hero-announcement-closing-band-nav.html` | Hero pill options, closing band, footer anchors | A chosen; closing band and navigation approved |

## Deliverables, in priority order

### 1. A new product screenshot for the overview section

The landing's "Everything your class needs" section shows the app in a browser-chrome frame. The
current image is a 622 KB SVG wrapping a raster screenshot of the old app, from before scrum and
channels.

- Compose a 1512×797 canvas of the app: the green sidebar shell and grey canvas, with the
  **scrum board page** (Sprint 3, columns, task cards) as the hero content. `ui_kits/grepthink/scrum-board.html`
  is a good base.
- The frame crops from the top: desktop shows the top 1512×560, tablet 1512×640 and mobile
  1512×760. Keep what matters in the **top 560px**.
- Use fictional data consistent with the mockups: project ShoeShopper; tasks GT-7 to GT-16 (GT-12
  "Connect the class roster API"); people Priya Shah, Jordan L., Sam, Alex. **Never use real
  student names or data.**
- Export `landing-preview.webp` (1512w), `landing-preview@2x.webp` (3024w), matching `.avif`
  files and a `landing-preview.png` fallback. Aim for under 250 KB for the 1× WebP.

### 2. Project assistant: identity and components

The assistant widgets in `04-band-assistant.html` are Claude Code's placeholders. They'll also
become real product UI on the scrum board later, so design them as components.

- **Mark:** an icon for the assistant that fits Lucide's style (24 viewBox, 2px stroke, round
  caps). Today it borrows the "Draft with AI" sparkle from `AIDraftButton`, which is fine to
  evolve. Propose two directions, pick one, and say why.
- **Color:** stay in the brand family unless you have a reason. Show how an assistant surface
  differs from a person's message or action without a new hue.
- **Components** (`components/assistant/`, with JSX, CSS and a `.d.ts` each, like the scrum layer):
  - `AssistantSuggestionCard`, with states pending (Approve / Dismiss), approved (a collapsed
    confirmation line) and dismissed. The card names the evidence (the PR) and the change (the
    task and target column).
  - `StalledFlag`: task key, title, "In Progress for 6 days · no commits", and a nudge action.
  - `ReportCheckCard` (staff only): a week's status reports against closed work, with rows that
    match and rows that need review. It flags, never accuses; wording matters here.
  - `UnlinkedPRChip`: "PR #44 isn't on the board · Add task".
- Give each two sizes: **in-app** (flat, 10px radius, the whisper shadow, per this system) and
  **landing** (the floating shell above).
- Include a "Preview / Coming soon" treatment for the landing band: confirm or replace the
  outlined backdrop with the "PREVIEW" tag and the amber SOON badge.

### 3. Social share image

The site has no Open Graph image, so shared links show a bare title.

- 1200×630 PNG (plus 2400×1260 if you like), under 300 KB, file `og-image.png`.
- Announce "Scrum boards and team channels" for class projects. Use the brand green and the
  mascot logo (`assets/grepthink-logo.svg`), and at most one product card, echoing the floating
  widgets. Keep text large enough to read as a small card: 44px or bigger. Leave a 60px safe
  margin.

### 4. Guidelines for marketing surfaces

This system documents the flat app. The landing page deliberately differs, but none of that is
written down. It lives only in SCSS comments. Add guideline cards (`guidelines/marketing-*.html`)
and a `tokens/marketing.css` covering:

- when marketing surfaces apply (the public site only) and what never crosses into the app;
- the accent gradient (`#018156` to `#02a06b`, heading accents only), the hero's radial tint,
  the masked dot grid and the band backgrounds (white / `#f8faf9`);
- the floating-card shell: radius, shadow, tilt range and float motion;
- band layout: width 1100px, two columns with alternating sides, spacing, and the stage
  backdrop (green-tinted for live features, outlined for previews);
- eyebrows and badges: NEW (white on `#018156`) and SOON (white on `#8A5200`), with eyebrow text
  `#016547` on the green tint. The hero's current eyebrow uses `#018156` on that tint, which is
  only about 4.3:1, so correct it here;
- the dark closing band;
- motion: reveal (fade up 16px, cards drift in 24px, 80ms stagger), float (±8–10px, 8–10s), one
  "moment" per band played once, and reduced motion showing the final frame;
- mobile: text first, then one untilted card.

Name the tokens so they can be mirrored into SCSS (for example, `--gt-mkt-*`).

### 5. Small confirmations and fixes

- `AnnouncementPill` (a NEW badge, text and an arrow, as a link). Confirm or adjust it.
- A `TypingIndicator` for the messaging components: three dots in a received-bubble shape.
- **Avatar palette contrast:** `AVATAR_COLORS` includes `#2771FF` (white initials 4.3:1) and
  `#B26A00` (4.2:1), both below 4.5:1. Suggest `#1B57D6` (6.2:1) and `#8A5200` (6.4:1). Also
  unify the palette: the landing hero uses its own set (`#018156`, `#2771FF`, `#d9822b`,
  `#9b51e0`).

## Rules that still apply

- The token files are the source of truth. Poppins everywhere; the system monospace stack for keys
  and IDs.
- Voice: plain, task-first, second person, and sentence case in body text. No emoji in UI chrome.
- Text contrast is at least 4.5:1 (3:1 for large text). The focus ring is the 2px accent blue.
- No photography and no full-bleed imagery. The mascot logo is the only illustration.
- Everything animated must have a reduced-motion equivalent.

## How to return the work

Send the changed and new files (or a project export). They'll go to:

- guidelines, tokens and components → the repo's `design/` mirror of this project;
- `landing-preview.*` → `frontend/src/assets/landing/`;
- `og-image.png` → `frontend/public/`.

For each deliverable, add a short note on any decision that changes the approved mockups.
