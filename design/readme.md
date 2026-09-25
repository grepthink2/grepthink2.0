# GrepThink Design System

**GrepThink 2.0** is a team & project management web app built for UCSC's software-engineering
capstone sequence (CSE 115A/B/C). Students form teams around projects, submit **TSRs**
(Team Status Reports — peer evals with percent contribution + positive/constructive feedback),
fill **interest/staffing forms** (ranked project preferences), message teammates, and track
assignments. Instructors run classes, rosters, staffing and grading; TAs manage team meetings
and attendance. **One app, three permission lenses** — Student, TA, and Instructor share a single
design language; only content and permissions differ. Never design three separate looks.

## Sources
- **Codebase (source of truth for all tokens & naming):** github.com/grepthink2/grepthink2.0 —
  React 19 + TypeScript + SCSS (Vite, Supabase). Token layer: `frontend/src/styles/`
  (`_colors.scss`, `_fonts.scss`, `_variables.scss`, `_mixins.scss`, `_skeleton.scss`).
  Feature SCSS under `frontend/src/features/app/components/` (BEM idiom). Explore the repo
  for deeper reference when building new views — imported copies of key SCSS live in `frontend/`.
- **Figma "Grepthink (Copy).fig"** — visual reference for the Student / TA / Instructor persona
  pages. Where Figma hardcodes hexes that disagree with the token files, **the tokens win**.
- Written token spec provided by the maintainer (ramps, semantic pairs, type scale).

### Known conflicts (tokens win)
- Legacy `$error-color: #ff3b30` in `_colors.scss` vs. spec error `#DC2626` → system uses **#DC2626**
  (the raw `#ff3b30` survives only in the sidebar unread badge, copied verbatim).
- Codebase focus styles are inconsistent (green glow / webkit default); spec standardizes on the
  **2px accent-blue focus ring** — all `gt-*` components use it.
- Figma home dashboards show colorful gradient tiles ("Join a Course", etc.) — treat as exploration;
  production surfaces are flat token colors.

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
  Accent blue `#2771FF` strictly for links/selection/focus/info. App canvas is grey `#EEEEEE`;
  everything readable sits on white cards. Gold `#FDC700` only for achievements/stars/"team set".
- **Type:** Poppins everywhere (400/500/600/700); UI labels default to Medium 500. Scale:
  caption 12 · body 14 · body-lg 16 · h3 20 · h2 24 · h1 32 · display 40; line-heights
  1.2/1.4/1.5/1.7. System monospace for IDs/codes (codebase $mono-font).
- **Surfaces & cards:** white, radius **10px** (7px for small controls, 20px for pills/large),
  the signature shadow `0 0 2.61px rgba(0,0,0,.25)` or 1px `#DADADA` border + `0 0 4px rgba(0,0,0,.08)`.
  Card headers/footers divide with 1px `#DADADA`.
- **Borders:** 1px `#DADADA`; inputs sharpen to accent blue on focus.
- **Shadows:** whisper-soft only (see Elevation card). Modals get `0 20px 60px rgba(0,0,0,.3)`
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
`--gt-mkt-*` (tokens/marketing.css) and **never crosses into the signed-in app**.
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
- **Icon system: lucide-react** in production (18px default in nav, 16px inline, stroke-width 2).
  The Project assistant's mark (`AssistantIcon`) is a custom spark drawn in the same idiom (24 viewBox,
  2px stroke, round caps); `AIDraftButton` renders it, so there is one assistant mark.
  The codebase also keeps one-off SVG assets named after their source sets
  (`fluent_*`, `material-symbols_*`, `octicon_*`, `mingcute_*`, `solar_*`) in `frontend/src/assets/`.
- In this design system, components embed minimal inline SVGs matching Lucide's 24-viewBox,
  stroke-2, round-cap style; for anything richer, load Lucide from CDN
  (`https://unpkg.com/lucide@latest`) — same stroke style, no substitution needed.
- On the green sidebar, icons render white via `filter: brightness(0) invert(1)` (codebase idiom).
- The Figma file's own icon components (8 glyphs: arrows, calendar chrome) are materialized in
  `components/figma-reference/Icons.jsx`.
- No icon font. No emoji-as-icons. Unicode chars only for ‹ › calendar nav and ★ in gold badges.
- **Logo:** `assets/grepthink-logo.svg` — mascot + GREPTHINK wordmark, monochrome. Green on
  light surfaces; white via invert filter on the green sidebar. The source SVG shipped without
  fill definitions; fills were set to brand green (artwork untouched).

## Fonts
Poppins (300–700) loads from the Google Fonts CDN in `tokens/fonts.css` —
the app itself loads Poppins the same way (index.html). IDs/code use the system monospace
stack (`ui-monospace, SFMono-Regular, Consolas…`), matching `$mono-font` — no mono webfont.
**No font binaries ship with the repo**;
if you need self-hosted files, drop them in `assets/fonts/` and swap the `@import` for
`@font-face` rules.

## Index
- `styles.css` — global entry point (import this one file)
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `marketing.css` (`--gt-mkt-*`, public site only)
- `assets/` — `grepthink-logo.svg`, `google.svg`
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand) + `marketing-*.html`
  (scope, gradient & backdrops, card shell, band layout, badges, dark chrome, motion, responsive)
- `components/primitives/` — Button, IconButton, Input, Textarea, Select, Checkbox, RadioGroup,
  Toggle, DatePickerField
- `components/display/` — Badge, Tag, Avatar (+AvatarGroup), Card, Table, StatCard, ProgressBar,
  Tooltip
- `components/feedback/` — Modal, Alert, Toast (+ToastStack), Popover, Menu (+MenuItem,
  MenuSeparator), EmptyState (+Skeleton)
- `components/navigation/` — Tabs, Pagination, SegmentedControl, SidebarNavItem
  (+SidebarSectionTitle)
- `components/domain/` — RosterRow, ProjectCard, TeamMemberCard (+RoleSelect), JoinRequestCard,
  AssignmentCard, TSRForm, TSRSummaryCard, RankedProjectSlot, ConversationListItem
  (+MessageBubble, MessageComposer, UnreadBadge), TypingIndicator, MeetingCard, PieChartCard (+BarChartCard,
  CHART_COLORS)
- `components/figma-reference/` — raw materialized Figma-file components (library artifacts kept
  for fidelity, **not** part of the product API): Arrow, ButtonContentArea, Grid, Icons, Monitor,
  Navigation, Scrollbar, Thumb, ToggleSwitch, Calendar, DateActive, DateInactive, Month, Favorite,
  DAvatars63, DAvatars223 (+ fig-tokens.css with the file's 30 library variables, all modes)
- `ui_kits/grepthink/` — interactive recreation of the app (Student/TA/Instructor lenses)
  plus `scrum-board.html` (sprint board with DnD + audit, burnup, backlog, story modal)
- `components/scrum/` — scrum-board layer (2026-08 feature design, not in fig/codebase yet):
  ScrumBoard, TaskCard, StoryCard, TagBadge (10 work tags), PointsChip (+EstimateChip,
  PRLinkChip, UserPair), BurnupChart, ScalePicker (+PointPicker, ESTIMATE_SCALES), MentionListbox (async
  @mention autocomplete — Popover-family consumer),
  CommentThread (+MarkdownText), AIDraftButton, BacklogRow
- `components/assistant/` — Project assistant layer (2026-09): AssistantIcon (+AssistantMark),
  AssistantSuggestionCard, StalledFlag, ReportCheckCard, UnlinkedPRChip — each in `surface="app"`
  (flat) and `surface="landing"` (floating shell)
- `components/marketing/` — grepthink2.com landing family: LandingHeader, Eyebrow (+MarketingBadge),
  AnnouncementPill, Hero, FloatCard (+FloatingCards), Spotlight, Stage (+StageCard), ClosingBand,
  FeatureColumn (+PreviewWindow), LandingFooter, ContactCard
- `ui_kits/grepthink-landing/` — the public site: `index.html` (landing with three spotlight bands +
  moments), `contact.html`, `preview-frame.html` / `og-image.html` (asset sources)
- `assets/landing/` — `landing-preview.{png,webp}` (+@2x), `og-image.png` (+@2x)
- `design_handoff_landing/NOTES.md` — return notes for the 2026-09-24 landing handoff
- `design_handoff_scrum_board/` — implementation handoff for the scrum board (spec, schema,
  PR-linking + free-tier LLM research) for Claude Code / developers
- `frontend/` — imported reference SCSS/assets from the real codebase (read-only reference)
- `PORTING.md` — the design-here → codebase workflow + vocabulary map
- `SKILL.md` — agent skill entry point

### Intentional additions
The Figma file's own component sets are generic UI-kit library artifacts (Scrollbar, Monitor,
Thumb, Grid…), so the product component inventory comes from the maintainer's written spec and
the codebase's screens instead. Every `gt-*` component below is an **intentional addition**
relative to the .fig's vocabulary, named after the codebase feature it mirrors:

- `Button` — intentional addition; unifies the per-screen `.tsrs-btn`/`.feedback-form__btn` button styles
- `IconButton` — intentional addition; icon-only actions (close ×, overflow) from modal/header idiom
- `Input` — intentional addition; the field style from FeedbackForm/CreateClassModal SCSS
- `Textarea` — intentional addition; `.feedback-form__textarea` idiom
- `Select` — intentional addition; styled native select used across role/term pickers
- `Checkbox` — intentional addition; form control per the written spec
- `RadioGroup` — intentional addition; form control per the written spec
- `Toggle` — intentional addition; the sidebar Dark Mode switch (kit's Toggle-Switch equivalent)
- `DatePickerField` — intentional addition; mirrors the app's `.dpf` component
- `Badge` — intentional addition; the `.status-badge` pill idiom
- `Tag` — intentional addition; skill/filter chips from CreateProject
- `Avatar` — intentional addition; initials avatars per the written spec
- `AvatarGroup` — intentional addition; overlapping avatar row with +n overflow
- `Card` — intentional addition; the 2.61px-shadow white surface
- `Table` — intentional addition; StudentAssignmentsTable + SortableHeader idiom
- `StatCard` — intentional addition; mirrors DashboardMetricCard
- `ProgressBar` — intentional addition; contribution/completion meters
- `Tooltip` — intentional addition; per the written spec
- `Modal` — intentional addition; JoinClassModal shell
- `Alert` — intentional addition; semantic soft-pair inline messages
- `Toast` — intentional addition; floating variant of Alert
- `ToastStack` — intentional addition; fixed bottom-right toast container
- `EmptyState` — intentional addition; mirrors the `__submitted` screens
- `Skeleton` — intentional addition; the `_skeleton.scss` shimmer block
- `Tabs` — intentional addition; Details/Team underline tabs
- `Pagination` — intentional addition; roster/list pager
- `SegmentedControl` — intentional addition; small view switches
- `SidebarNavItem` — intentional addition; `.sidebar-item` with half-pill active indicator
- `SidebarSectionTitle` — intentional addition; `.section-title` caps label
- `RosterRow` — intentional addition; class roster row composite
- `ProjectCard` — intentional addition; the Figma "Project 6" card recreated parametrically
- `TeamMemberCard` — intentional addition; project Team tab member card
- `RoleSelect` — intentional addition; native-select role dropdown
- `JoinRequestCard` — intentional addition; join request / invite row
- `AssignmentCard` — intentional addition; assignment row with status action
- `TSRForm` — intentional addition; Team Status Report peer-eval form
- `TSRSummaryCard` — intentional addition; instructor/TA read view of a TSR
- `RankedProjectSlot` — intentional addition; interest-form ranked preference slot
- `ConversationListItem` — intentional addition; DM conversation row
- `MessageBubble` — intentional addition; DM thread bubble
- `MessageComposer` — intentional addition; DM input + send
- `UnreadBadge` — intentional addition; red unread-count pill
- `TypingIndicator` — intentional addition; three-dot received bubble for live threads (2026-09 confirmation)
- `AVATAR_COLORS` — intentional addition; the shared initials palette, every color ≥ 4.5:1 with white
- `MeetingCard` — intentional addition; TA meeting w/ attendance & Zoom
- `PieChartCard` — intentional addition; token-themed SVG stand-in for recharts pie
- `BarChartCard` — intentional addition; token-themed SVG stand-in for recharts bar
- `CHART_COLORS` — intentional addition; shared chart palette for recharts fills in production

Popover/Menu family + Toast (2026-08, `components/feedback/`) — intentional additions filling
the scrum Part 2 gaps flagged ⚑1/⚑2 (maintainer prompt): Popover is the anchored floating-surface
primitive; Menu/MenuItem compose action lists on it; the rebuilt Toast (left accent bar, action,
stacking rules) supersedes the earlier Alert-derived toast. MentionListbox (`components/scrum/`)
is the family's first consumer — async-first for Supabase member lookups; repo-wide, messages
adopt it later. The slim story rail (M3) was dropped by maintainer decision.

Project assistant layer (`components/assistant/`, 2026-09 — designed from the landing handoff; the
feature is COMING SOON, nothing exists in the codebase yet; all intentional additions):
- `AssistantIcon` / `AssistantMark` — the spark mark (chosen over a merge-check glyph) and its green-50 tile
- `AssistantSuggestionCard` — a board change proposed from a merged PR; pending → approved / dismissed
- `StalledFlag` — task with no repository activity; nudge action
- `ReportCheckCard` — staff-only weekly status reports vs closed work; flags, never accuses
- `UnlinkedPRChip` — PR with no task on the board

Marketing family (`components/marketing/`, grepthink2.com — mirrors `frontend/src/features/landing/**`
class-for-class plus the 2026-09-24 spotlight-band update; all intentional additions):
- `LandingHeader` — dark bar → translucent pill morph (`.landing-header`)
- `Eyebrow` / `MarketingBadge` — uppercase pill label with NEW / SOON badge
- `AnnouncementPill` — hero launch link (replaces the eyebrow while on)
- `Hero` — display title with gradient accent, CTA, decor layer (`.hero`)
- `FloatCard` / `FloatingCards` — the hero's four decorative product mocks (`.float-card`)
- `Spotlight` — full-width feature band shell (`Spotlight.tsx`)
- `Stage` / `StageCard` — live/preview stage backdrop and the floating widget shell (`StageCard.tsx`)
- `ClosingBand` — dark green CTA band before the footer (`ClosingBand.tsx`)
- `FeatureColumn` / `PreviewWindow` — Solutions columns and the browser-chrome screenshot frame
- `LandingFooter` — dark footer with Product anchors (`.landing-footer`)
- `ContactCard` — the `/contact` form card (`.contact-page__card`)

Scrum layer (all intentional additions — a new feature designed 2026-08 from the maintainer's
requirements; no counterpart in the Figma file or codebase yet; see
`design_handoff_scrum_board/README.md` for the implementation spec):
- `ScrumBoard` — TODO / In Progress / Done drag & drop board with move auditing
- `TaskCard` / `StoryCard` — task & User Story units (points, estimates, reporter → assignee)
- `TagBadge` — the 10 work-type tags (backend … docs), token-derived colors
- `PointsChip` / `EstimateChip` / `PRLinkChip` / `UserPair` — scrum metadata chips
- `BurnupChart` — sprint + cumulative burnup (SVG stand-in for recharts)
- `ScalePicker` / `PointPicker` — linear / exponential / fibonacci estimate scales
- `CommentThread` / `MarkdownText` — markdown comments with @mentions (demo renderer;
  production reuses the codebase's markdown + mention semantics)
- `AIDraftButton` — free-tier LLM drafting affordance (Cloudflare Workers AI via serverless proxy)
- `BacklogRow` — story archive / backlog row with restore
