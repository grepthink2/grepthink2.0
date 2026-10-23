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
  React 19 + TypeScript + SCSS (Vite, Supabase). Token layer: `frontend/src/styles/tokens/`
  (`colors.css`, `typography.css`, `spacing.css` — runtime `--gt-*`, imported by `main.tsx`) with the
  SCSS bridge in `frontend/src/styles/` (`_colors.scss`, `_fonts.scss`, `_variables.scss`, `_mixins.scss`,
  `_skeleton.scss`, `_motion.scss`). Feature SCSS under `frontend/src/features/**` (BEM idiom).
  Explore the repo for deeper reference when building new views — reference copies of the token layer and
  key SCSS live in `frontend/` (last refreshed 2026-10-09; port status in `PORTING.md`).
- **Figma "Grepthink (Copy).fig"** — visual reference for the Student / TA / Instructor persona
  pages. Where Figma hardcodes hexes that disagree with the token files, **the tokens win**.
- Written token spec provided by the maintainer (ramps, semantic pairs, type scale).

### Known conflicts (tokens win)
- Error red converged 2026-10: `_colors.scss` now sets `$error-color: #DC2626` (the spec value). The raw
  `#ff3b30` survives only in the sidebar unread badge (kept verbatim) — design side: `--gt-error-icon`.
- Focus: the codebase now paints the **2px accent-blue focus ring** globally (`index.css`
  `:focus-visible` rule) — all `gt-*` components use the same ring; the old green glow is gone.
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
  1.2/1.4/1.5/1.7. Fira Code (400/500) for IDs/codes/join codes (`--gt-font-mono`, system mono fallback).
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
- No icon font. No emoji-as-icons. Unicode chars only for ‹ › calendar nav and ★ in gold badges.
- **Logo:** `assets/grepthink-logo.svg` — mascot + GREPTHINK wordmark, monochrome. Green on
  light surfaces; white via invert filter on the green sidebar. The source SVG shipped without
  fill definitions; fills were set to brand green (artwork untouched).

## Fonts
Poppins (300–700) and Fira Code (400/500, IDs & code) load from the Google Fonts CDN in `tokens/fonts.css` —
the app loads both the same way (index.html). `--gt-font-mono` falls back to
`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`.
**No font binaries ship with the repo**;
if you need self-hosted files, drop them in `assets/fonts/` and swap the `@import` for
`@font-face` rules.

## Index
- `styles.css` — global entry point (import this one file)
- `keyframes.css` — the four shared keyframes (`gt-pop-in`, `gt-rise-in`, `gt-spin`, `skeleton-shimmer`; mirrors `frontend/src/styles/keyframes.css`). Every other keyframe is named after its component and defined once.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `marketing.css` (`--gt-mkt-*`, public site only)
- `assets/` — `grepthink-logo.svg`, `google.svg` Brand and image assets keep their colours as delivered — never strip or tokenise an SVG's fills. This tool drops SVG `<style>` blocks on save, so colours live in `fill` attributes (PORTING.md → "Assets keep their colours").
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand) + `marketing-*.html`
  (scope, gradient & backdrops, card shell, band layout, badges, dark chrome, motion, responsive)
- `components/primitives/` — Button, IconButton, FieldShell, Input, Textarea, Select, SearchField, PasswordField, CodeInput,
  Combobox (+comboFilter), Checkbox, RadioGroup (list + card), Toggle, DatePickerField (+parseDateValue), FileUpload
  (+formatFileSize), MarkdownEditor (+renderMarkdownLite), Slider; galleries `primitives` (buttons), `fields`, `choice`, `upload`, `slider`
- `components/display/` — Badge (+BADGE_STATUS, BADGE_CATEGORY, PROJECT_ROLES), CountBadge, UnreadBadge, Tag, Avatar
  (+AvatarGroup, AVATAR_COLORS, hashColor, initialsOf), Card, Table (+SortableHeader, useTableSort), StatCard, ProgressBar, Tooltip, InfoPopover,
  Markdown (MarkdownText — moved from `scrum/` 2026-10-22); galleries `display`, `cards`
- `components/feedback/` — Modal (+useDialog), ConfirmDialog (+InlineConfirm), Drawer, Alert, Toast (+ToastStack), Popover,
  Menu (+MenuItem, MenuSeparator), Spinner, EmptyState (+NoClassSelected, Skeleton); galleries `feedback`, `dialogs`,
  `toast`, `popover`
- `components/navigation/` — Tabs (+TabPanel), SegmentedControl, FilterChip (+FilterChipGroup), Stepper, Pagination,
  SidebarNavItem (+SidebarSectionTitle)
- `components/gallery.css` — chrome for the component cards (forced hover / focus, phone frame); not ported
- `components/domain/` — RosterRow, ProjectCard, TeamMemberCard, JoinRequestCard,
  AssignmentCard, TSRForm, TSRSummaryCard, RankedProjectSlot, ConversationListItem
  (+MessageBubble, MessageComposer; UnreadBadge moved to `display/`), TypingIndicator, MeetingCard, PieChartCard (+BarChartCard,
  CHART_COLORS)
- `templates/grepthink-app/` — the app shell with the Student / TA / Instructor switcher (`GrepthinkApp.dc.html` → `app.html`,
  `Shell.jsx`, `Screens.jsx`, `App.jsx`) and `templates/scrum-board/` (sprint board with DnD + audit, burnup, backlog, story modal) —
  the two former starting points, moved 2026-10-21 (templates stay out of `_ds_bundle.js`, which also stops App.jsx rendering into every page)
- `ui_kits/grepthink/` — the feature screens: `analytics.html` (one dashboard per institution — filled / empty / loading / refetching / error)
- `components/analytics/` — analytics layer (2026-10 feature design, see `design_handoff_analytics/`):
  AnalyticsFilterRow (+RANGE_PRESETS), ChartCard, UnitToggle, LivePill,
  ChartLegend (+AnalyticsIcon), ChartTooltip (+ChartFormat helpers),
  WeeklyLine, SplitBar, StackedBars (+BOARD_STATUSES), TimelinessBars (+TIMELINESS_BUCKETS), OnTimeMeter,
  BarsBySprint, TrendLines, BreakdownTable (+BREAKDOWN_COLUMNS, TEAM_BREAKDOWN_COLUMNS, TIMELINESS_COLUMNS)
- `components/search/` — global ⌘K search layer (2026-10 feature design, see `design_handoff_search/`):
  CommandPalette (+usePaletteHotkey), SearchTrigger (SearchField moved to `primitives/`), ResultRow (+ResultGroup),
  SearchPagination, EntityIcon, MatchText, Kbd (+modKey), SearchModel (+SEARCH_ENTITIES, rankResults,
  paginate, routeFor, useDebounced)
- `ui_kits/grepthink/search.html` — the palette open over the app shell (states + phone)
- `components/schedule/` — schedule layer (2026-10 feature design, see `design_handoff_schedule/`):
  ScheduleList (compact Today's Schedule card body · agenda week), ScheduleItem (+ScheduleIcon), ScheduleDivider (sprint rule),
  ScheduleDayHeader, ScheduleModel (+SCHEDULE_KINDS, statusOf, isJoinable, groupByDay, findOverlaps, nowIndex, todayOrPeek,
  formatters, useNow); kind palette tokens `--gt-sched-*` in `tokens/colors.css`
- `ui_kits/grepthink/schedule.html` — Student Home with the Today's Schedule card, the /app/schedule agenda, every state, the
  three lenses, another time zone, phone
- `components/domain/TeamMeetings*` — team meetings (2026-10 feature design, see `design_handoff_team_meetings/`):
  TeamMeetingsList (`variant="manage"` = the Edit Project → Meetings tab · `variant="card"` = the project-page card body on
  ScheduleItem rows), TeamMeetingForm (inline add / edit on the viewer's clock), TeamMeetingsModel (+TEAM_MEETING_* constants:
  split, validation, zone conversion); styles at the end of `domain.css`, gallery `teammeetings.card.html`
- `ui_kits/grepthink/team-meetings.html` — project page with the Team meetings card, the Edit Project modal's Meetings tab,
  every state, another time zone, phone
- `components/finalreviews/` — final-review slot sign-up (C2, 2026-10-20, see `design_handoff_final_review_signup/`): SlotBoard (the
  `/app/final-reviews` board, every lens) + SlotRow + SlotTime (viewer's time with the campus time beside it), FinalReviewsHeader
  (+ZoomRoomField), TeamReview (Your team's review: page + project card), UnbookedTeams, SlotActionDialog (place / move / Review TA),
  PostSlotsDrawer, ReviewWorkspaceHeader, FinalReviewsIcon, FinalReviewsModel (+SLOT_MINUTES, SLOT_POST_MAX, FR_LENSES, FR_REASONS);
  galleries `finalreviews.card.html` (board), `teamreview.card.html`, `posting.card.html`
- `ui_kits/grepthink/final-reviews.html` — the board in the app shell for every lens, the project-page card, posting, every
  confirmation, the scoring workspace header and every §6 state (`FinalReviewsScreen.jsx`, `FinalReviewsStates.jsx`)
- `guidelines/motion-system.html` — proposed motion system (nine previews; tokens local to the card) · `assets/slug.svg` — the
  original banana-slug mark (gold fill, UCSC-blue line) used by panel 8
- `components/scrum/` — scrum-board layer (2026-08 feature design, not in fig/codebase yet):
  ScrumBoard, TaskCard, StoryCard, TagBadge (10 work tags), Chips (PointsChip, EstimateChip,
  PRLinkChip, UserPair), BurnupChart, ScalePicker (+PointPicker, ESTIMATE_SCALES), MentionListbox (async
  @mention autocomplete — Popover-family consumer),
  CommentThread (MarkdownText is `display/Markdown` now), AIDraftButton, BacklogRow
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
- `design_handoff_analytics/` — implementation handoff for the Analytics dashboard (component map,
  chart rules, §9 answers in `NOTES.md`, sample payloads)
- `design_handoff_search/` — implementation handoff for the ⌘K global search (ranking, routes, data
  contract, PR-link research pointer, open gaps in `NOTES.md`)
- `design_handoff_schedule/` — implementation handoff for the Schedule family (kind palette, component specs, time-zone
  rule, data contract + source tables, open questions in `NOTES.md`)
- `design_handoff_ui_alignment/` — the 2026-10-19 alignment round: shared-component specs, decisions, status colour map,
  answers and port questions in `NOTES.md`
- `design_handoff_team_meetings/` — implementation handoff for Team meetings (Meetings tab + project card: specs, validation,
  data contract, PO gating and table questions in `NOTES.md`)
- `design_handoff_final_review_signup/` — implementation handoff for the C2 slot sign-up (board, Your team's review, posting,
  instructor tools, workspace header; §12 answers, status keys, the §10 file list and port questions in `NOTES.md`)
- `frontend/` — reference copies from the real codebase (read-only): `src/styles/**` (token CSS + SCSS bridge),
  `src/index.css`, app-shell SCSS, the ported `features/analytics/analytics.scss` + `features/scrum/scrum.scss`
  (the `lint:design` script stays in the repo at `frontend/scripts/design-adherence.mjs`)
- `PORTING.md` — the design-here → codebase workflow + vocabulary map
- `SKILL.md` — agent skill entry point

### Intentional additions
Every component (185 exports) is an intentional addition —
confirmed, not a naming slip. The Figma file's own component sets were generic UI-kit library artifacts (Scrollbar, Monitor,
Thumb, Grid…) — materialized once in `components/figma-reference/`, unused by any screen, and removed 2026-10-20 — so the product component inventory comes from the maintainer's written spec and
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
- `Table` — intentional addition; StudentAssignmentsTable + SortableHeader idiom (`SortableHeader` and `useTableSort` exported from `Table.jsx`, as the codebase ships them in `components/Table/`)
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
- `ScrumBoard` (+`BOARD_COLUMNS`, the fixed TODO / In Progress / Done columns) — TODO / In Progress / Done drag & drop board with move auditing
- `TaskCard` / `StoryCard` — task & User Story units (points, estimates, reporter → assignee)
- `TagBadge` (+`TASK_TAGS`, the 10 tags in canonical order) — the 10 work-type tags (backend … docs), token-derived colors
- `PointsChip` / `EstimateChip` / `PRLinkChip` / `UserPair` — scrum metadata chips (`scrum/Chips.jsx`; `Chips` is the file's bundle namespace, design-only like `ModKey`)
- `BurnupChart` — sprint + cumulative burnup (SVG stand-in for recharts)
- `ScalePicker` / `PointPicker` — linear / exponential / fibonacci estimate scales
- `CommentThread` — markdown comments with @mentions (renders the kit's `MarkdownText`, `display/Markdown.jsx`)
- `AIDraftButton` — free-tier LLM drafting affordance (Cloudflare Workers AI via serverless proxy)
- `BacklogRow` — story archive / backlog row with restore

Analytics layer (`components/analytics/`, 2026-10 — designed from the maintainer's analytics brief;
all intentional additions; chart colors are the `--gt-chart-*` slots validated in the brief's §6):
- `AnalyticsFilterRow` — the one filter row (class select, range chips, custom-range popover)
- the tiles are `StatCard` with `compact` (StatTile left 2026-10-22)
- `ChartCard` — chart container owning loading / refetching / empty / error chrome; its header tools are the kit's `Button` (`pressed` / `outline`) and `Checkbox`
- `UnitToggle` — Tasks | Points segmented measure swap
- `LivePill` — marks the range-independent scrum snapshot
- `ChartLegend` / `AnalyticsIcon` — legend with line/rect swatches + status icons; lucide-shaped glyphs
- `ChartTooltip` / `ChartFormat` — tooltip surface + shared measure/format helpers
- the ⓘ is the kit's `InfoPopover` and the per-card empty state the kit's `EmptyState` with `variant="card"` (DefinitionPopover and ChartEmptyState left 2026-10-22)
- `WeeklyLine` — weekly two-series line (messages)
- `SplitBar` — team channels vs direct, with a mixed-scope fallback
- `StackedBars` — live task snapshot by sprint, board colors
- `TimelinessBars` / `OnTimeMeter` — submission buckets (status palette) + headline rate meter
- `BarsBySprint` — characters per task / story small multiples
- `TrendLines` — four small multiples with the previous range as gray context
- `BreakdownTable` — per class / per team table with meters and the folded privacy row

Search layer (`components/search/`, 2026-10 — designed from the maintainer's ⌘K brief; all intentional
additions; replaces the header's pseudo search input and standardizes every local filter input):
- `CommandPalette` / `usePaletteHotkey` — the ⌘K dialog (input, scope chips, ranked paginated results, states, exit animation)
- `SearchTrigger` / `SearchField` — header button that opens the palette (old `.app-header__search-bar` footprint); the one inline filter input
- `ResultRow` / `ResultGroup` — entity row with type disc, key, match highlight, context line; uppercase group label with "See all"
- `SearchPagination` — compact footer pager (1–8 of 37 · ‹ 1 / 5 ›)
- `EntityIcon` — 28px type disc (initials for people via Avatar's `initialsOf`)
- `MatchText` — match highlight (semibold + accent underline)
- `Kbd` / `modKey` (+`ModKey`, the namespace-visible alias) — keycap hint; ⌘ vs Ctrl
- `SearchModel` (+`SEARCH_ENTITIES`, `rankResults`, `countByType`, `paginate`, `routeFor`, `useDebounced`) — pure ranking / routing / paging model

Schedule layer (`components/schedule/`, 2026-10 — designed from the maintainer's Schedule brief; all intentional
additions; one component for the Student, TA and Instructor lenses):
- `ScheduleList` — `variant="compact"` (the Today's Schedule card body: today + Now line, or a peek at the next day) and `variant="agenda"` (the /app/schedule week: ‹ This week ›, class + kind filters, sticky day headers)
- `ScheduleItem` / `ScheduleIcon` — one row per event (time cell, kind tile, title / context / people, actions; expands into `MeetingCard`); the family's lucide-shaped glyph
- `ScheduleDivider` — sprint start/end rule with an inline muted label (never a row)
- `ScheduleDayHeader` — "Today · Tue, Oct 20" heading, sticky in the agenda
- `ScheduleModel` (+`SCHEDULE_KINDS`, `SCHOOL_ZONE`, `JOIN_WINDOW_MS`, `COUNTDOWN_DAYS`) — pure status / Join-window / grouping / overlap / formatting model

Team meetings (`components/domain/TeamMeetings*`, 2026-10 — designed from the maintainer's "Team meetings" brief; all intentional
additions; the project's own one-off meetings, kind `meeting` in the schedule layer):
- `TeamMeetingsList` — `variant="manage"` (Edit Project → Meetings tab, Product Owner only: upcoming / Past (n), inline add · edit · delete confirm) and `variant="card"` (project-page card body: compact `ScheduleItem` rows by day, Past meetings (n), quiet "Add one" for the PO)
- `TeamMeetingForm` — inline add / edit (title ≤ 80 · date · start · duration · room · Zoom · note ≤ 500) on the viewer's clock with the campus time under the time field
- `TeamMeetingsModel` (+`TEAM_MEETING_TITLE_MAX`, `TEAM_MEETING_NOTE_MAX`, `TEAM_MEETING_DEFAULT_DURATION`, `TEAM_MEETING_DURATIONS`) — pure split / validation / zone-conversion / ScheduleItem-conversion model

**Alignment round (2026-10-19)** — shared components the codebase ports once into `frontend/src/components/<Name>/`:
- `FieldShell` — intentional addition; the `.gt-field` shell (label / hideLabel / "(optional)", error, counter, describedby wiring) every field shares
- `SearchField` — intentional addition; promoted from the search layer: the app's inline filter input (roster, member manager, conversation list)
- `PasswordField` — intentional addition; the sign-in / sign-up / reset password inputs with the show / hide toggle
- `CodeInput` — intentional addition; class join code (8) and email verification code (6) boxes
- `Combobox` (+`comboFilter`) — intentional addition; replaces the TSR searchable dropdown, interest-form pickers, staffing search, people search, skills input, invite email chips
- `FileUpload` (+`formatFileSize`) — intentional addition; avatar / project-logo picker and the roster CSV drop area
- `MarkdownEditor` (+`renderMarkdownLite`) — intentional addition; project descriptions and the public issue form (Write / Preview)
- `Slider` — intentional addition (follow-up round, 2026-10-20); the labelled range for the TSR contributions step (`TSRS/ContributionsTab.tsx`), with value + unit or a paired number input
- `parseDateValue` — intentional addition; helper for the DatePickerField string contract
- `CountBadge` — intentional addition; the neutral count pill (tab counts, list totals)
- `UnreadBadge` — intentional addition; moved from `domain/ConversationListItem` to `display/` as the one red unread pill
- `InfoPopover` — intentional addition; promoted from analytics (its DefinitionPopover alias left 2026-10-22); replaces StatTooltip and GroupTooltip
- `Markdown` (`MarkdownText`) — intentional addition; the kit's Markdown renderer, `display/Markdown.jsx` ↔ `components/Markdown/`; `Markdown` is the file's bundle namespace (design-only, like `ModKey`)
- `BADGE_STATUS`, `BADGE_CATEGORY`, `PROJECT_ROLES` — intentional additions; the status colour rule and category / role presets behind Badge
- `ConfirmDialog` — intentional addition; replaces ConfirmModal, `window.confirm` and `alert()`
- `InlineConfirm` — intentional addition; the row-level delete inside a dialog (team meetings' confirm row)
- `Drawer` — intentional addition; the assignment editor's side sheet and the phone navigation
- `useDialog` — intentional addition; the shared dialog behaviour (stack, focus, scroll lock) for Modal / ConfirmDialog / Drawer
- `Spinner` — intentional addition; the one loading indicator (replaces 20 spinners on 9 keyframes)
- `NoClassSelected` — intentional addition; the one "No class selected" state for 14 pages
- `TabPanel` — intentional addition; the tab panel paired with Tabs (aria-controls / aria-labelledby)
- `FilterChip` (+`FilterChipGroup`) — intentional addition; promoted from the search scope chip, analytics range chip and schedule kind chip
- `Stepper` — intentional addition; the TSR form's steps

Final reviews (`components/finalreviews/`, 2026-10-20 — designed from the C2 brief, PR #258; all intentional additions; one
family for the student, Product Owner, TA and instructor lenses; the backend exists, no screen called it yet):
- `SlotBoard` — the `/app/final-reviews` board: every slot by day in the viewer's zone, day links, single-choice filter, sticky day headers, past days folded, every state
- `SlotRow` — one slot: time · team or Free · reviewers (staff / own team) · the lens's actions, the reason as text where one isn't offered
- `SlotTime` — the viewer's time with the campus time visible beside it when the zones differ (never a tooltip)
- `FinalReviewsHeader` / `ZoomRoomField` — sign-ups state, counts, the TA's review count, the shared Zoom room, Post slots and Open / Close sign-ups
- `TeamReview` — "Your team's review": every booking state, on the board (`page`) and as the project page's Final review card (`card`)
- `UnbookedTeams` — staff: teams without a slot, with Product Owner, Home TA and the instructor's Place on a slot
- `SlotActionDialog` — the instructor's choose-and-confirm: place a team, place on a slot, move, appoint / replace / remove the Review TA
- `PostSlotsDrawer` — posting slots on the campus clock: hourly fill, the list with already-posted / overlap / past flags, ≤ 200
- `ReviewWorkspaceHeader` — the scoring workspace header: role, time with campus time, reviewers, Join Zoom in the window
- `FinalReviewsIcon` — the family's lucide-shaped glyph
- `FinalReviewsModel` (+`SLOT_MINUTES`, `SLOT_POST_MAX`, `FR_LENSES`, `FR_REASONS`) — pure rules, grouping, states and copy (successes, refusals, confirmations)
- Badge status keys `signups.open` / `signups.closed` / `slot.free` / `slot.yours` / `slot.past` / `review.no_review_ta` / `review.no_product_owner` — kit addition to `BADGE_STATUS` (colours by the alignment round's rule)

#### Every export, by group — each one confirmed an intentional addition
The complete list (185 exports, re-confirmed 2026-10-22 against the compiled bundle). None of them is a renamed Figma component: the
.fig's own families (Arrow, Grid, Icons, Monitor, Navigation, Scrollbar, Thumb, 3D Avatars, Calendar) are generic UI-kit artifacts with no
product counterpart, so none is built. Every name below is an intentional addition, named after the codebase feature it mirrors.

**`components/primitives/`** (17)
- `Button` — intentional addition (`components/primitives/Button.jsx`)
- `Checkbox` — intentional addition (`components/primitives/Checkbox.jsx`)
- `CodeInput` — intentional addition (`components/primitives/CodeInput.jsx`)
- `Combobox` — intentional addition (`components/primitives/Combobox.jsx`)
- `DatePickerField` — intentional addition (`components/primitives/DatePickerField.jsx`)
- `FieldShell` — intentional addition (`components/primitives/FieldShell.jsx`)
- `FileUpload` — intentional addition (`components/primitives/FileUpload.jsx`)
- `IconButton` — intentional addition (`components/primitives/IconButton.jsx`)
- `Input` — intentional addition (`components/primitives/Input.jsx`)
- `MarkdownEditor` — intentional addition (`components/primitives/MarkdownEditor.jsx`)
- `PasswordField` — intentional addition (`components/primitives/PasswordField.jsx`)
- `RadioGroup` — intentional addition (`components/primitives/RadioGroup.jsx`)
- `SearchField` — intentional addition (`components/primitives/SearchField.jsx`)
- `Select` — intentional addition (`components/primitives/Select.jsx`)
- `Slider` — intentional addition (`components/primitives/Slider.jsx`)
- `Textarea` — intentional addition (`components/primitives/Textarea.jsx`)
- `Toggle` — intentional addition (`components/primitives/Toggle.jsx`)

**`components/display/`** (19)
- `AVATAR_COLORS` — intentional addition (`components/display/Avatar.jsx`)
- `Avatar` — intentional addition (`components/display/Avatar.jsx`)
- `AvatarGroup` — intentional addition (`components/display/Avatar.jsx`)
- `BADGE_CATEGORY` — intentional addition (`components/display/Badge.jsx`)
- `BADGE_STATUS` — intentional addition (`components/display/Badge.jsx`)
- `Badge` — intentional addition (`components/display/Badge.jsx`)
- `Card` — intentional addition (`components/display/Card.jsx`)
- `CountBadge` — intentional addition (`components/display/CountBadge.jsx`)
- `InfoPopover` — intentional addition (`components/display/InfoPopover.jsx`)
- `Markdown` — intentional addition (`components/display/Markdown.jsx`; the file's bundle namespace, design-only)
- `MarkdownText` — intentional addition (`components/display/Markdown.jsx`; moved from `scrum/CommentThread.jsx` 2026-10-22)
- `PROJECT_ROLES` — intentional addition (`components/display/Badge.jsx`)
- `ProgressBar` — intentional addition (`components/display/ProgressBar.jsx`)
- `StatCard` — intentional addition (`components/display/StatCard.jsx`)
- `SortableHeader` — intentional addition (`components/display/Table.jsx`; exported with `useTableSort` 2026-10-22)
- `Table` — intentional addition (`components/display/Table.jsx`)
- `Tag` — intentional addition (`components/display/Tag.jsx`)
- `Tooltip` — intentional addition (`components/display/Tooltip.jsx`)
- `UnreadBadge` — intentional addition (`components/display/UnreadBadge.jsx`)

**`components/feedback/`** (15)
- `Alert` — intentional addition (`components/feedback/Alert.jsx`)
- `ConfirmDialog` — intentional addition (`components/feedback/ConfirmDialog.jsx`)
- `Drawer` — intentional addition (`components/feedback/Drawer.jsx`)
- `EmptyState` — intentional addition (`components/feedback/EmptyState.jsx`)
- `InlineConfirm` — intentional addition (`components/feedback/ConfirmDialog.jsx`)
- `Menu` — intentional addition (`components/feedback/Menu.jsx`)
- `MenuItem` — intentional addition (`components/feedback/Menu.jsx`)
- `MenuSeparator` — intentional addition (`components/feedback/Menu.jsx`)
- `Modal` — intentional addition (`components/feedback/Modal.jsx`)
- `NoClassSelected` — intentional addition (`components/feedback/EmptyState.jsx`)
- `Popover` — intentional addition (`components/feedback/Popover.jsx`)
- `Skeleton` — intentional addition (`components/feedback/EmptyState.jsx`)
- `Spinner` — intentional addition (`components/feedback/Spinner.jsx`)
- `Toast` — intentional addition (`components/feedback/Toast.jsx`)
- `ToastStack` — intentional addition (`components/feedback/Toast.jsx`)

**`components/navigation/`** (9)
- `FilterChip` — intentional addition (`components/navigation/FilterChip.jsx`)
- `FilterChipGroup` — intentional addition (`components/navigation/FilterChip.jsx`)
- `Pagination` — intentional addition (`components/navigation/Pagination.jsx`)
- `SegmentedControl` — intentional addition (`components/navigation/SegmentedControl.jsx`)
- `SidebarNavItem` — intentional addition (`components/navigation/SidebarNavItem.jsx`)
- `SidebarSectionTitle` — intentional addition (`components/navigation/SidebarNavItem.jsx`)
- `Stepper` — intentional addition (`components/navigation/Stepper.jsx`)
- `TabPanel` — intentional addition (`components/navigation/Tabs.jsx`)
- `Tabs` — intentional addition (`components/navigation/Tabs.jsx`)

**`components/domain/`** (23)
- `AssignmentCard` — intentional addition (`components/domain/AssignmentCard.jsx`)
- `BarChartCard` — intentional addition (`components/domain/PieChartCard.jsx`)
- `CHART_COLORS` — intentional addition (`components/domain/PieChartCard.jsx`)
- `ConversationListItem` — intentional addition (`components/domain/ConversationListItem.jsx`)
- `JoinRequestCard` — intentional addition (`components/domain/JoinRequestCard.jsx`)
- `MeetingCard` — intentional addition (`components/domain/MeetingCard.jsx`)
- `MessageBubble` — intentional addition (`components/domain/ConversationListItem.jsx`)
- `MessageComposer` — intentional addition (`components/domain/ConversationListItem.jsx`)
- `PieChartCard` — intentional addition (`components/domain/PieChartCard.jsx`)
- `ProjectCard` — intentional addition (`components/domain/ProjectCard.jsx`)
- `RankedProjectSlot` — intentional addition (`components/domain/RankedProjectSlot.jsx`)
- `RosterRow` — intentional addition (`components/domain/RosterRow.jsx`)
- `TEAM_MEETING_DEFAULT_DURATION` — intentional addition (`components/domain/TeamMeetingsModel.jsx`)
- `TEAM_MEETING_DURATIONS` — intentional addition (`components/domain/TeamMeetingsModel.jsx`)
- `TEAM_MEETING_NOTE_MAX` — intentional addition (`components/domain/TeamMeetingsModel.jsx`)
- `TEAM_MEETING_TITLE_MAX` — intentional addition (`components/domain/TeamMeetingsModel.jsx`)
- `TSRForm` — intentional addition (`components/domain/TSRForm.jsx`)
- `TSRSummaryCard` — intentional addition (`components/domain/TSRSummaryCard.jsx`)
- `TeamMeetingForm` — intentional addition (`components/domain/TeamMeetingForm.jsx`)
- `TeamMeetingsList` — intentional addition (`components/domain/TeamMeetingsList.jsx`)
- `TeamMeetingsModel` — intentional addition (`components/domain/TeamMeetingsModel.jsx`)
- `TeamMemberCard` — intentional addition (`components/domain/TeamMemberCard.jsx`)
- `TypingIndicator` — intentional addition (`components/domain/TypingIndicator.jsx`)

**`components/scrum/`** (19)
- `AIDraftButton` — intentional addition (`components/scrum/AIDraftButton.jsx`)
- `BOARD_COLUMNS` — intentional addition (`components/scrum/ScrumBoard.jsx`)
- `BacklogRow` — intentional addition (`components/scrum/BacklogRow.jsx`)
- `BurnupChart` — intentional addition (`components/scrum/BurnupChart.jsx`)
- `CommentThread` — intentional addition (`components/scrum/CommentThread.jsx`)
- `ESTIMATE_SCALES` — intentional addition (`components/scrum/ScalePicker.jsx`)
- `Chips` — intentional addition (`components/scrum/Chips.jsx`; the file's bundle namespace)
- `EstimateChip` — intentional addition (`components/scrum/Chips.jsx`)
- `MentionListbox` — intentional addition (`components/scrum/MentionListbox.jsx`)
- `PRLinkChip` — intentional addition (`components/scrum/Chips.jsx`)
- `PointPicker` — intentional addition (`components/scrum/ScalePicker.jsx`)
- `PointsChip` — intentional addition (`components/scrum/Chips.jsx`)
- `ScalePicker` — intentional addition (`components/scrum/ScalePicker.jsx`)
- `ScrumBoard` — intentional addition (`components/scrum/ScrumBoard.jsx`)
- `StoryCard` — intentional addition (`components/scrum/StoryCard.jsx`)
- `TASK_TAGS` — intentional addition (`components/scrum/TagBadge.jsx`)
- `TagBadge` — intentional addition (`components/scrum/TagBadge.jsx`)
- `TaskCard` — intentional addition (`components/scrum/TaskCard.jsx`)
- `UserPair` — intentional addition (`components/scrum/Chips.jsx`)

**`components/assistant/`** (6)
- `AssistantIcon` — intentional addition (`components/assistant/AssistantIcon.jsx`)
- `AssistantMark` — intentional addition (`components/assistant/AssistantIcon.jsx`)
- `AssistantSuggestionCard` — intentional addition (`components/assistant/AssistantSuggestionCard.jsx`)
- `ReportCheckCard` — intentional addition (`components/assistant/ReportCheckCard.jsx`)
- `StalledFlag` — intentional addition (`components/assistant/StalledFlag.jsx`)
- `UnlinkedPRChip` — intentional addition (`components/assistant/UnlinkedPRChip.jsx`)

**`components/analytics/`** (22)
- `AnalyticsFilterRow` — intentional addition (`components/analytics/AnalyticsFilterRow.jsx`)
- `AnalyticsIcon` — intentional addition (`components/analytics/ChartLegend.jsx`)
- `BOARD_STATUSES` — intentional addition (`components/analytics/StackedBars.jsx`)
- `BREAKDOWN_COLUMNS` — intentional addition (`components/analytics/BreakdownTable.jsx`)
- `BarsBySprint` — intentional addition (`components/analytics/BarsBySprint.jsx`)
- `BreakdownTable` — intentional addition (`components/analytics/BreakdownTable.jsx`)
- `ChartCard` — intentional addition (`components/analytics/ChartCard.jsx`)
- `ChartFormat` — intentional addition (`components/analytics/ChartTooltip.jsx`)
- `ChartLegend` — intentional addition (`components/analytics/ChartLegend.jsx`)
- `ChartTooltip` — intentional addition (`components/analytics/ChartTooltip.jsx`)
- `LivePill` — intentional addition (`components/analytics/LivePill.jsx`)
- `OnTimeMeter` — intentional addition (`components/analytics/OnTimeMeter.jsx`)
- `RANGE_PRESETS` — intentional addition (`components/analytics/AnalyticsFilterRow.jsx`)
- `SplitBar` — intentional addition (`components/analytics/SplitBar.jsx`)
- `StackedBars` — intentional addition (`components/analytics/StackedBars.jsx`)
- `TEAM_BREAKDOWN_COLUMNS` — intentional addition (`components/analytics/BreakdownTable.jsx`)
- `TIMELINESS_BUCKETS` — intentional addition (`components/analytics/TimelinessBars.jsx`)
- `TIMELINESS_COLUMNS` — intentional addition (`components/analytics/BreakdownTable.jsx`)
- `TimelinessBars` — intentional addition (`components/analytics/TimelinessBars.jsx`)
- `TrendLines` — intentional addition (`components/analytics/TrendLines.jsx`)
- `UnitToggle` — intentional addition (`components/analytics/UnitToggle.jsx`)
- `WeeklyLine` — intentional addition (`components/analytics/WeeklyLine.jsx`)

**`components/search/`** (11)
- `CommandPalette` — intentional addition (`components/search/CommandPalette.jsx`)
- `EntityIcon` — intentional addition (`components/search/EntityIcon.jsx`)
- `Kbd` — intentional addition (`components/search/Kbd.jsx`)
- `MatchText` — intentional addition (`components/search/MatchText.jsx`)
- `ModKey` — intentional addition (`components/search/Kbd.jsx`)
- `ResultGroup` — intentional addition (`components/search/ResultRow.jsx`)
- `ResultRow` — intentional addition (`components/search/ResultRow.jsx`)
- `SEARCH_ENTITIES` — intentional addition (`components/search/SearchModel.jsx`)
- `SearchModel` — intentional addition (`components/search/SearchModel.jsx`)
- `SearchPagination` — intentional addition (`components/search/SearchPagination.jsx`)
- `SearchTrigger` — intentional addition (`components/search/SearchTrigger.jsx`)

**`components/schedule/`** (10)
- `COUNTDOWN_DAYS` — intentional addition (`components/schedule/ScheduleModel.jsx`)
- `JOIN_WINDOW_MS` — intentional addition (`components/schedule/ScheduleModel.jsx`)
- `SCHEDULE_KINDS` — intentional addition (`components/schedule/ScheduleModel.jsx`)
- `SCHOOL_ZONE` — intentional addition (`components/schedule/ScheduleModel.jsx`)
- `ScheduleDayHeader` — intentional addition (`components/schedule/ScheduleDayHeader.jsx`)
- `ScheduleDivider` — intentional addition (`components/schedule/ScheduleDivider.jsx`)
- `ScheduleIcon` — intentional addition (`components/schedule/ScheduleItem.jsx`)
- `ScheduleItem` — intentional addition (`components/schedule/ScheduleItem.jsx`)
- `ScheduleList` — intentional addition (`components/schedule/ScheduleList.jsx`)
- `ScheduleModel` — intentional addition (`components/schedule/ScheduleModel.jsx`)

**`components/marketing/`** (15)
- `AnnouncementPill` — intentional addition (`components/marketing/AnnouncementPill.jsx`)
- `ClosingBand` — intentional addition (`components/marketing/ClosingBand.jsx`)
- `ContactCard` — intentional addition (`components/marketing/ContactCard.jsx`)
- `Eyebrow` — intentional addition (`components/marketing/Eyebrow.jsx`)
- `FeatureColumn` — intentional addition (`components/marketing/FeatureColumn.jsx`)
- `FloatCard` — intentional addition (`components/marketing/FloatCard.jsx`)
- `FloatingCards` — intentional addition (`components/marketing/FloatCard.jsx`)
- `Hero` — intentional addition (`components/marketing/Hero.jsx`)
- `LandingFooter` — intentional addition (`components/marketing/LandingFooter.jsx`)
- `LandingHeader` — intentional addition (`components/marketing/LandingHeader.jsx`)
- `MarketingBadge` — intentional addition (`components/marketing/Eyebrow.jsx`)
- `PreviewWindow` — intentional addition (`components/marketing/FeatureColumn.jsx`)
- `Spotlight` — intentional addition (`components/marketing/Spotlight.jsx`)
- `Stage` — intentional addition (`components/marketing/StageCard.jsx`)
- `StageCard` — intentional addition (`components/marketing/StageCard.jsx`)

**`components/finalreviews/`** (16)
- `FR_LENSES` — intentional addition (`components/finalreviews/FinalReviewsModel.jsx`)
- `FR_REASONS` — intentional addition (`components/finalreviews/FinalReviewsModel.jsx`)
- `FinalReviewsHeader` — intentional addition (`components/finalreviews/FinalReviewsHeader.jsx`)
- `FinalReviewsIcon` — intentional addition (`components/finalreviews/FinalReviewsIcon.jsx`)
- `FinalReviewsModel` — intentional addition (`components/finalreviews/FinalReviewsModel.jsx`)
- `PostSlotsDrawer` — intentional addition (`components/finalreviews/PostSlotsDrawer.jsx`)
- `ReviewWorkspaceHeader` — intentional addition (`components/finalreviews/ReviewWorkspaceHeader.jsx`)
- `SLOT_MINUTES` — intentional addition (`components/finalreviews/FinalReviewsModel.jsx`)
- `SLOT_POST_MAX` — intentional addition (`components/finalreviews/FinalReviewsModel.jsx`)
- `SlotActionDialog` — intentional addition (`components/finalreviews/SlotActionDialog.jsx`)
- `SlotBoard` — intentional addition (`components/finalreviews/SlotBoard.jsx`)
- `SlotRow` — intentional addition (`components/finalreviews/SlotRow.jsx`)
- `SlotTime` — intentional addition (`components/finalreviews/SlotTime.jsx`)
- `TeamReview` — intentional addition (`components/finalreviews/TeamReview.jsx`)
- `UnbookedTeams` — intentional addition (`components/finalreviews/UnbookedTeams.jsx`)
- `ZoomRoomField` — intentional addition (`components/finalreviews/FinalReviewsHeader.jsx`)
