# Landing page: scrum board, messaging and project assistant

**Date:** 2026-09-24 · **Status:** approved in brainstorming (visual companion session) ·
**Ships with:** the scrum board release (PR #177), not before.

## Goal

Announce three features on grepthink2.com in the landing page's existing marketing language:

1. **Scrum board** — sprints, stories and tasks on a drag-and-drop board. New; goes live with #177.
2. **Messaging** — Team, TA and Instructor channels for every project, direct messages, and live
   notifications. New to users in the 2026-09-24 release.
3. **Project assistant** — reconciles the board with the repository and with weekly status
   reports. Coming soon; nothing is built yet.

The page has to stay one story with the hero: same card shell, same motion vocabulary, same
green. Everything the page shows must be true on launch day.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | How to present an unshipped scrum board | Ship this page together with the scrum release; scrum carries a NEW badge. Revised 2026-09-25: ship ahead of the board (see Release) |
| D2 | What "task reconciliation" means | Board ↔ repo is the headline; board ↔ weekly status reports is a second beat for TAs and instructors |
| D3 | Page structure | Spotlight bands: one full-width band per feature, alternating sides |
| D4 | Widget look | The hero's floating-card shell (white, 20px radius, soft two-layer shadow, small tilt, slow float) around the design system's real anatomy |
| D5 | Messaging stage | Inbox and live thread only; no floating Messages tab; notifications live in the copy |
| D6 | Hero announcement | A clickable pill replaces the eyebrow; "For instructors and student teams" moves into the subtitle |
| D7 | Closing band and navigation | Dark green closing band before the footer; header gains "Features"; footer Product column gains three anchors |
| D8 | Names and labels | "Project assistant"; the report-check example names a fictional "Alex"; messaging carries NEW |

## Page order

Header (+ Features) → Hero (announcement pill) → Solutions (unchanged) →
**Band 1 · Scrum board** `#scrum-board` (text left, stage right, NEW) →
**Band 2 · Messaging** `#messaging` (stage left, text right, NEW) →
**Band 3 · Project assistant** `#project-assistant` (text left, preview stage right, SOON) →
Closing band → Footer (+ anchors).

Band backgrounds alternate: band 1 white, band 2 `#f8faf9`, band 3 white. The Solutions section
above is white, so band 1 opens with a top hairline instead of a color change.

## Copy

### Hero
- Pill (replaces the eyebrow while the announcement is on): **NEW** · "Scrum boards and team
  channels →", links to `#scrum-board`.
- Subtitle: "grepthink helps instructors and student teams form balanced teams, track weekly
  progress, and keep everyone accountable without the spreadsheet chaos."
- With the announcement off, the eyebrow ("For instructors and student teams") and the current
  subtitle return unchanged.

### Band 1 · Scrum board
- Eyebrow: **NEW** · Scrum board
- Heading: "Run every sprint from *one board*" (accent on "one board")
- Paragraph: "Break your project into sprints, user stories and tasks. Drag work across the
  board, estimate it in points, and link each task to its pull request. Every move is logged, so
  your TA sees progress as it happens."
- Bullets: "Drag-and-drop board with a history of every move" · "Story points and time
  estimates, on your team's own scale" · "Tasks linked to GitHub and git.ucsc.edu pull requests"
  · "Burnup charts for each sprint and the whole project"

### Band 2 · Messaging
- Eyebrow: **NEW** · Messaging
- Heading: "One inbox for your team and *course staff*"
- Paragraph: "Every project gets three channels: one for the team, one with your TA and one with
  your instructor. Direct messages cover everything else. Messages and notifications arrive live,
  with unread counts wherever you are in the app."
- Bullets: "Team, TA and Instructor channels for every project" · "Direct messages with
  classmates and course staff" · "Channels follow the roster: join a team and you're in" · "Live
  notifications for messages, join requests and team changes"

### Band 3 · Project assistant
- Eyebrow: **SOON** · Project assistant (amber)
- Heading: "A board that keeps up with *your code*"
- Paragraph: "The assistant will read your pull requests and commits and suggest the board
  updates they imply: move a task to Done when its PR merges, flag work that has stalled, link PRs
  that aren't on the board. Nothing changes until someone on the team approves it."
- Bullets: "Suggests board moves from merged PRs and commits" · "Flags stalled tasks and PRs
  with no task" · "Proposes changes, never makes them on its own"
- Staff note, titled "For TAs and instructors": "Each week it compares status reports with the
  tasks and PRs each student actually closed, and points out where they don't line up, so
  reviews start from evidence."
- Link: "Want early access? Get in touch →" to `/contact`.

### Closing band
- Heading: "Ready to run your class on grepthink?"
- Text: "Create a class and import your roster. Every team gets a scrum board and its own
  channels from day one."
- Buttons: **Get started** (`/select`), **Talk to us** (`/contact`).

### Navigation
- Header: "Features" link before "Contact", scrolling to `#scrum-board`.
- Footer Product column: Get started · Solutions · **Scrum board** · **Messaging** ·
  **Project assistant**.

## Stages (decorative widgets)

All widgets are static, fictional and hidden from assistive tech. Bands 1 and 2 mirror the
design system's anatomy (`components/scrum/*`, `components/domain/ConversationListItem`,
`MessageBubble`, `TypingIndicator`) and the app's channel colors without importing app
components. Band 3 renders the app's Project assistant components
(`features/app/components/Assistant/`, ported from the design system) on their `landing` surface.
Avatars use the design system's `AVATAR_COLORS`, all 4.5:1 behind white initials.

**Band 1** — backdrop: soft green radial tint over `#f5f8f7` with a masked dot grid.
1. *Board* (360px, −2°): "Sprint 3 · 4 days left"; TODO / In Progress / Done columns with the
   design system's dots (gray-400 / accent blue / primary green), counts and mini task rows
   (mono key, title, points).
2. *Task card* (262px, +3°): `GT-12`, story `GT-4`, estimate 6h, 3 points, "Connect the class
   roster API", tags backend + frontend, reporter → assignee avatars, 4 comments, PR chip
   "#41 merged" (merged purple), audit line "Moved to Done · Jordan · just now".
3. *Burnup* (250px, −3°): "Sprint burnup · 18/24 pts", completed line and area, dashed scope.
- Moment: GT-12 slides from In Progress to Done, the Done count goes 3 → 4, the burnup line draws.

**Band 2** — backdrop `#eef5f2` (a shade darker, since the band itself is tinted) with the tint
mirrored toward the text.
1. *Inbox* (318px, −2°): "Messages · 3 unread"; ShoeShopper with Team (green), TA (blue) and
   Instructor (amber) pills, previews and times; one direct message (Priya Shah).
2. *Thread* (300px, +2.5°): "ShoeShopper · Team · 5 members"; Priya's question, your reply
   (green bubble), then Jordan's row; composer "Message the team…".
- Moment: Jordan's row appears with typing dots; the dots give way to "Merged, thanks!" in the
  same row (one avatar); the Team row's preview and unread badge update (2 → 3).

**Band 3** — preview backdrop: flat `#fbfbfc`, 1.5px `#d3d8dd` outline, "PREVIEW" tag top-left
(`#616161` on a dashed `#c3c9cf` border).
1. *Suggestion* (`AssistantSuggestionCard`, 288px, −2°): the spark mark in a green-50 tile +
   "Project assistant" in green-700 · just now; "PR #41 was merged into main. Move this task to
   Done?"; task chip `GT-12` → Done; Approve / Dismiss.
2. *Stalled flag* (`StalledFlag`, 226px, +3°): amber "Stalled"; `GT-9` Attendance tab; "In
   Progress for 6 days · no commits"; "Nudge Sam →".
3. *Report check* (`ReportCheckCard`, 272px, −2.5°): "Week 5 status reports · ShoeShopper";
   "4 reports match closed work" (green check); "Alex: reports 35%, closed 1 of 6 tasks" + Review
   (amber).
4. *Unlinked PR chip* (`UnlinkedPRChip`, bare, in a pill card, +2°): "PR #44 isn't on the
   board · Add task".
- Moment: Approve presses, then the card folds to its approved state, "GT-12 moved to Done ·
  approved by you". Both states share one grid cell with identical heads, so the head holds
  still while the body changes.

## Motion

- **Reveal:** when a band first enters the upper 80% of the viewport (a root margin, not a
  visibility ratio, so bands taller than the screen still trigger), its text fades up 16px and
  its cards drift 24px in from their side, 80ms apart. Once per page view.
- **Float:** cards float ±8–10px on 8–10s ease-in-out loops, tilt preserved (the CSS `translate`
  property composes with `rotate`).
- **Moment:** loops while the band is on screen, on the approved mockups' cycles: 6s for band 1,
  7s for bands 2 and 3. Each cycle holds the starting frame, makes its change at about the
  halfway mark, holds the result, then resets. The maintainer chose looping on 2026-09-25; until
  then each moment played once. Claude Design's motion guideline still says "plays once", so sync
  that back next round.
- **Off screen:** floats and moments pause while their band is off screen.
- **Reduced motion:** no reveal, no float, no moment; the band renders its final frame.
- **Phones:** no moments either (see Responsive).
- Only `transform`, `translate` and `opacity` animate (plus `max-height` in the thread and
  suggestion moments and `stroke-dashoffset` in the burnup). No animation library.

## Responsive

| Width | Layout |
|---|---|
| ≥ 1080px | Two columns, alternating; all cards |
| 768–1079px | Text above the stage; two cards (band 1 drops the burnup; band 3 drops the stalled flag and the chip) |
| < 768px | Text, then one card untilted and still (task card, thread, suggestion), its moment off: the stage has no fixed height here, so a card that changed size mid-scroll would shift the page (measured CLS 0.089 before, 0 after). The thread rests on its final frame; the suggestion rests on its pending state, the one that shows the evidence |

Anchors get `scroll-margin-top` to clear the fixed header; smooth scrolling only without reduced
motion. The hero's own cards keep today's behavior.

## Accessibility

- Stages are `aria-hidden="true"`, `inert` (band 3's cards contain real buttons) and
  `pointer-events: none`; the band text is real content:
  `<section aria-labelledby>`, one `<h2>` per band, bullets as a `<ul>`.
- The eyebrow, with its badge, comes right before the heading in reading order ("New · Scrum board").
- The announcement pill is a link with an accessible name ("New: scrum boards and team
  channels. Jump to the scrum board section").
- Contrast (small text needs 4.5:1): eyebrow text is `--gt-success-text` `#016547` on the green
  tint (6.3:1; the hero's current `$primary-color` on that tint is only ~4.3:1); the NEW badge is
  white on `#018156` (4.9:1); the SOON badge is white on `--gt-warning-text` `#8A5200` (6.4:1),
  not `#B26A00` (4.2:1); amber eyebrow text `#8A5200` on `#FEF3C7` is 5.7:1.

## Architecture

```
frontend/src/features/landing/
  landing.config.ts                     launch settings: announcement on/off, band badges
  hooks/useInView.ts                    IntersectionObserver: `seen` latches true once (reveal,
                                        moment); `visible` tracks live (pauses floats)
  sectionScroll.ts                      scrollToSection(): smooth unless reduced motion
  components/SectionLink.tsx            Link to a section from any page; scrolls itself when the
                                        page is already at it (BrowserRouter ignores that click)
  components/spotlights/
    Spotlight.tsx (+ .scss)             band shell: eyebrow, heading with accent, paragraph,
                                        bullets, optional staff note and link, side, variant, stage;
                                        the .scss also holds the card shell and shared parts
    StageCard.tsx                       floating-card shell (tilt, float, reveal order)
    StageSwap.tsx                       two stacked values that trade places mid-moment
    ScrumSpotlight.tsx (+ .scss)        band 1: copy, board, task card, burnup
    MessagingSpotlight.tsx (+ .scss)    band 2: copy, inbox, thread
    AssistantSpotlight.tsx (+ .scss)    band 3: copy, suggestion, stalled flag, report check, chip
  components/ClosingBand.tsx (+ .scss)
  _landing-tokens.scss                  $mkt-* mirror of design/tokens/marketing.css
  (edited) LandingPage.tsx (composition, hash scroll), Hero.tsx, Header.tsx, Footer.tsx,
           Solutions.tsx (product screenshot), FloatingCards.tsx (avatar palette)
frontend/src/features/app/components/Assistant/   the assistant's mark and cards (app + landing)
frontend/src/lib/avatarColors.ts        the design system's AVATAR_COLORS
frontend/src/assets/landing/            landing-preview.png, .webp, @2x.webp
frontend/public/og-image.png            1200×630 share image
frontend/index.html                     description + Open Graph / Twitter meta, og:image
```

- `Spotlight` gets its text as props and its stage as a child, so bands differ only in data
  and stage.
- `landing.config.ts` is the single place to flip scrum from NEW to plain, the assistant from
  SOON to NEW, or the announcement off.
- The landing route stays eagerly loaded; the new code is static markup and CSS. Measured: the
  entry JS grew 253.10 → 277.61 kB (68.84 → 75.29 kB gzip) and the CSS 146.36 → 169.01 kB
  (22.64 → 26.76 kB gzip). The product screenshot replaced a 622 kB `preview.svg`; it loads lazily
  as a 78.5 kB (1×) or 162 kB (2×) WebP.

## Styling

- Tokens (`$primary-color`, `--gt-*`) wherever a token exists. Marketing values (accent
  gradient, backdrops, card shell, badges, PR purple, the closing band) come from
  `_landing-tokens.scss`, a verbatim `$mkt-*` mirror of `design/tokens/marketing.css`, so a change
  on the design side maps to one line here. They never cross into the app.
- Card radius 20px and the hero's shadow; eyebrow and heading type as in the mockups (heading
  `clamp(2rem, 4vw, 2.5rem)`, 700, −0.02em).

## Testing and verification

Vitest + Testing Library:
- the three bands render with their ids, headings and badges from the config;
- the announcement pill links to `#scrum-board`, and switching it off restores the eyebrow and the
  original subtitle;
- every stage is `aria-hidden` and `inert`;
- the assistant components: each state of the suggestion card, the stalled flag's wording and
  nudge, the report rows, the chip's surfaces and actions;
- `useInView` latches `seen` at the reveal threshold and keeps reporting live `visible`; with
  reduced motion `seen` is true immediately;
- header and footer links point at the right anchors.

Gates: `npm run build`, `npm run lint`, `npm run lint:design`, `npx vitest run`.
In the browser: desktop, 900px and 390px widths, reduced motion on, each anchor link, and a
screenshot of each band.

## Release

Branch `feat/landing-new-features` from `beta`; PR onto `beta` opened as a draft. The plan was to
merge it only after #177 had landed and the scrum migrations were on PROD. On 2026-09-25 the
maintainer chose to ship it first, accepting that the page advertises the scrum board before
the board is live. When #177 is rebased onto `beta` afterwards, keep `beta`'s `design/` wherever
it conflicts: it is the newer copy. After launch, `landing.config.ts` can retire the
announcement.

## Assets from Claude Design

Handoff: `docs/superpowers/handoffs/2026-09-24-landing-claude-design/`. Delivered 2026-09-24,
followed by a round of fixes the same day, and imported as `design/` (`git show` on each import
commit is its changelog; the return notes, with a "Round 2" section, are
`design/design_handoff_landing/NOTES.md`).

| Asset | Where it went |
|---|---|
| Marketing-surface guidelines + `--gt-mkt-*` tokens | `design/guidelines/marketing-*.html`; tokens mirrored in `_landing-tokens.scss` |
| Project assistant identity and components | `features/app/components/Assistant/` (typed ports), used by band 3 |
| Product screenshot (PNG + WebP, 1× and 2×) | `assets/landing/`; Solutions serves WebP with a 1× PNG fallback. AVIF was not delivered |
| Social share image, 1200×630 | `public/og-image.png`, with `og:image` and `twitter:card` `summary_large_image` |
| Confirmations: preview/SOON treatment, announcement pill, typing indicator, avatar palette | Applied: preview tag `#616161`, received bubble and typing `#f1f3f4`, `AVATAR_COLORS` |

Round 2 fixed the share image (its headline now clears the tilted card), added the missing 1×
WebP, gave `AIDraftButton` the assistant's spark mark and synced the build's values back into
the design side. The new `--gt-mkt-*` tokens that came with it (band padding, band link, card
meta, anchor offset) now style the build. The screenshot keeps "Draft story with AI" and the
Project assistant card: the maintainer's decision.

One difference remains, too small to chase: the kit's phone cards rest on their pre-moment
frame, while the build rests band 2's thread on its final frame, with the reply landed. Band 3
rests on the pending suggestion in both.

## Out of scope

Real data in widgets, a waitlist backend (the assistant links to `/contact`), dark mode for the
landing page, changes to the Solutions columns, analytics.
