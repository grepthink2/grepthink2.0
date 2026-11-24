**GrepThink 2.0** is a team & project management web app built for UCSC's software-engineering
capstone sequence (CSE 115A/B/C). Students form teams around projects, submit **TSRs**
(Team Status Reports — peer evals with percent contribution + positive/constructive feedback),
fill **interest/staffing forms** (ranked project preferences), message teammates, and track
assignments. Instructors run classes, rosters, staffing and grading; TAs manage team meetings
and attendance. **One app, three permission lenses** — Student, TA, and Instructor share a single
design language; only content and permissions differ. Never design three separate looks.

## Using this system

The components here are the app's own, built from its code: a design made with them maps one to
one onto components that ship.

**Load, in this order:** `tokens.css`, `components/bundle.css`, React and React DOM 18
(`components/lib/react.production.min.js`, then `components/lib/react-dom.production.min.js`), then
`components/bundle.js`. The bundle reads `window.React` and `window.ReactDOM` and puts every export
on `window.GrepThinkDesignSystem_36e7e3`:

```jsx
const { Button, Card, Badge, Icon } = window.GrepThinkDesignSystem_36e7e3;
```

**Fonts:** Poppins and Fira Code come from Google Fonts. Every preview links them; add the same
stylesheet to your page (on a canvas, in its `<helmet>`):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Poppins:wght@400;500;600;700&display=swap">
```

- **Read a component's guide before you use it.** `components/<Name>/README.md` says when to use it,
  the props that matter, what you supply and what to avoid; `components/index.d.ts` has its props
  (usually `<Name>Props`). Companions (`MenuItem`, `TabPanel`, `AvatarGroup` and the like), hooks
  (`useDialog`, `useTableSort`) and helpers (`BADGE_STATUS`, `hashColor`) are on the namespace too,
  each described in the guide of the component it belongs to.
- **Lay out your own markup with the tokens.** `tokens.css` declares the `--gt-*` custom properties
  that `tokens.json` lists with their usage; `components/bundle.css` declares the few it cannot hold
  (the focus rings, the transitions, the font stacks, one modal shadow). Use them as in
  `background: var(--gt-surface)`, `gap: var(--gt-space-md)`, `border-radius: var(--gt-radius-md)`.
  Never write a hex value or a size that a token already names.
- **Don't restyle the components.** Their classes start with `gt-` (DatePickerField's calendar uses
  `dpf`): put your own class on a wrapper and place the components from there.
- **Links:** Button and Card take `to`, and a Table row `rowTo`, for an in-app route. There is no
  router on a canvas, so each renders a plain `<a href>`.
- **Icons:** `<Icon name="Trash2" size={16} />` places any icon the app uses (Iconography, below).

## CONTENT FUNDAMENTALS
- **Voice:** plain, task-first, friendly-but-not-cute. Verb-led labels: "Join a Class",
  "Create Project", "Browse Projects", "Mark attendance", "See All".
- **Casing:** Title Case for page titles, nav items and buttons ("Upcoming Deadlines",
  "Edit Submission"); sentence case for helper text and descriptions. Sidebar section titles
  are ALL-CAPS 10–11px ("MAIN", "ACTIVITY", "SETTINGS").
- **Person:** second person ("your team", "Welcome Back, Josh"). The app addresses the student;
  it never says "I".
- **Numbers & dates:** "Jan 18, 2026" date format; counts as "4 members", "8" unread. IDs,
  join codes and emails render in the system monospace stack.
- **Emoji:** none in UI chrome. Emoji may appear in user-generated message content only.
- **Statuses** are short pills: "Active", "Due Soon", "Not Started", "Completed", "Submitted",
  "In Progress".
- **Domain nouns:** classes & enrollments, rosters, projects, teams, project members with roles
  (Owner, Product Owner, Scrum Master, Admin, Member), join requests & invites, assignments,
  TSRs, staffing/interest forms, direct messages, TA meetings, edu-email verification.

## VISUAL FOUNDATIONS
- **Vibe: flat and calm.** Students stare at this for hours — clarity and density over decoration.
  No gradients. No glassmorphism. Minimal illustration.
- **Color:** brand green `#018156` for the sidebar, CTAs and success; hover darkens to `#016547`.
  Accent blue `#2771FF` (`--gt-blue-500`) strictly for selection, focus and info marks: it is too
  light for text, so link text is `--gt-text-link` (blue-600 `#1B57D6`) and other blue text
  `--gt-info-text`. App canvas is grey `#EEEEEE`; everything readable sits on white cards. Gold
  `#FDC700` only for achievements/stars/"team set".
- **Type:** Poppins everywhere (400/500/600/700); UI labels default to Medium 500. Scale:
  caption 12 · body 14 · body-lg 16 · h3 20 · h2 24 · h1 32 · display 40; line-heights
  1.2/1.4/1.5/1.7. Fira Code (400/500) for IDs/codes/join codes (`--gt-font-mono`, system mono fallback).
- **Surfaces & cards:** white, radius **10px** (7px for small controls, 20px for pills/large),
  the signature shadow `0 0 2.61px rgba(0,0,0,.25)` or 1px `#DADADA` border + `0 0 4px rgba(0,0,0,.08)`.
  Card headers/footers divide with 1px `#DADADA`.
- **Borders:** 1px `#DADADA`; inputs sharpen to accent blue on focus.
- **Shadows:** whisper-soft only (the `--gt-shadow-*` tokens). Modals get `0 20px 60px rgba(0,0,0,.3)`
  over a `rgba(0,0,0,.5)` scrim with `backdrop-filter: blur(4px)`.
- **Hover states:** background tint shifts (grey `#FAFAFA` rows, `rgba(255,255,255,.1)` on green,
  darker green on primary buttons) — never scale/transform except a 0.5px press nudge.
- **Press:** slight translateY(0.5px); no shrink effects.
- **Motion:** 0.2s ease (fast) / 0.3s ease (medium). Popovers slide 6px + fade in 0.15s.
  Skeleton shimmer 1.4s linear; respects `prefers-reduced-motion`.
- **Focus:** always-visible 2px accent-blue ring (`--gt-focus-ring`), tight variant for fields.
- **Layout:** fixed green sidebar 256px (64px collapsed; off-canvas drawer < 768px), grey canvas
  content column, floating messages tab bottom-right (48px clearance). Tables collapse into
  2-col grid cards on mobile.
- **Imagery:** essentially none — no photography, no full-bleed images. The mascot logo is the
  only illustration. Backgrounds are flat token colors (one legacy noise texture png exists in
  the codebase but is unused in the current UI).
- **Transparency/blur:** only the modal scrim (blur 4px) and white-alpha hovers on green.
- **Corner radii:** 7 / 10 / 20 — note the deliberately odd 7px; never snap it to 8.

## MARKETING SURFACE (grepthink2.com) — deliberate exceptions
The public landing and contact pages are the one place the flat rules bend. Everything below is
the `--gt-mkt-*` tokens and **never crosses into the signed-in app**.
- **Where:** `/` and `/contact` only. Header, hero, solutions, three spotlight bands, closing band, footer.
- **Color:** the accent gradient `#018156 → #02a06b` is for heading words only (clip-text), never fills.
  Hero: radial green wash + masked halftone dots. Bands alternate white / `#f8faf9`. Live stages are
  `#f5f8f7`/`#eef5f2` with a green tint + 22px dot grid; coming-soon stages are flat `#fbfbfc` with a
  1.5px `#d3d8dd` outline and a dashed PREVIEW tag. Dark chrome `#0c1f18` (header, footer);
  closing band `#0f2a20` with a green radial and white dots.
- **Eyebrows & badges:** eyebrow text `#016547` on the green tint (6.3:1 — the old `#018156` was ~4.3:1);
  NEW = white on `#018156`; SOON = white on `#8A5200` (never `#B26A00`); amber eyebrow `#8A5200` on `#FEF3C7`.
- **Floating card shell:** white, 20px radius (hero cards keep 22px), shadow `0 2px 6px rgba(33,43,54,.04),
  0 24px 48px -12px rgba(33,43,54,.18)`, tilt −3…+3° via `rotate`, float ±8–10px over 8–10s via `translate`.
- **Band layout:** 1100px max, `1fr 1.08fr` (stage wider), 48px gap, `clamp(72px, 9vw, 112px)` vertical,
  `scroll-margin-top` 88px under the fixed header; stages alternate sides; heading `clamp(2rem, 4vw, 2.5rem)`
  700 −0.02em; lead 16.5px `#637381`; bullets 14.5px with 34px green-50 tiles; band link `#016547`;
  stage-card meta `#8A8A8A`. Band 3 desktop: suggestion card 288px wide at 25% from the top, stalled flag
  and report card 3% from the right edge.
- **Motion:** reveal once (text up 16px, cards in 24px from their side, 80ms stagger); float loops pause
  off-screen; one "moment" per band plays once at 50% visible, 0.4s after the reveal settles — on
  ≥768px only. Reduced motion renders the final frame. Only transform/translate/opacity (+ max-height,
  stroke-dashoffset).
- **Hover:** lift −1px (header/contact buttons) or −2px (hero CTA) — the only place transforms are allowed.
- **Mobile (<768px):** text first, then one untilted, still card per band and no moment — the stage has no
  fixed height there, so a card that changes size would push the page around; Band 3 shows the pending
  suggestion (evidence + Approve/Dismiss), never the approved line. Hero cards hide below 768px.
- **Assistant surfaces:** the Project assistant is told apart from people without a new hue — spark mark
  in a green-50 tile, "Project assistant" label in green-700, dashed green hairline in-app.

## ICONOGRAPHY
- **Icon system: lucide** (lucide-react in the app): 18px default in nav, 16px inline, stroke-width 2.
  Place one with the bundle's `Icon` by its lucide name, `<Icon name="Trash2" size={16} aria-hidden="true" />`
  (its guide: `components/Icon/README.md`). The names it takes, the icons the app imports:
  <!-- icons -->
- On the green sidebar, icons render white via `filter: brightness(0) invert(1)` (codebase idiom).
- No icon font. No emoji-as-icons. Unicode chars only for ‹ › calendar nav and ★ in gold badges.
- **Logo:** `assets/grepthink-logo.svg` — mascot + GREPTHINK wordmark, monochrome. Green on
  light surfaces; white via invert filter on the green sidebar. The source SVG shipped without
  fill definitions; fills were set to brand green (artwork untouched).

## Fonts
Poppins (400–700) for everything and Fira Code (400/500) for IDs, codes and join codes, both from
Google Fonts, as the app loads them (the stylesheet link is under "Using this system").
`--gt-font-sans` and `--gt-font-mono` name the stacks; the mono stack falls back to
`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`. No font files ship with the system.
