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
  join codes and emails render in Fira Code.
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
  1.2/1.4/1.5/1.7. Fira Code for IDs/codes.
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

## ICONOGRAPHY
- **Icon system: lucide-react** in production (18px default in nav, 16px inline, stroke-width 2).
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
Poppins (300–700) + Fira Code (400/500) load from the Google Fonts CDN in `tokens/fonts.css` —
the app itself loads Poppins the same way (index.html). **No font binaries ship with the repo**;
if you need self-hosted files, drop them in `assets/fonts/` and swap the `@import` for
`@font-face` rules.

## Index
- `styles.css` — global entry point (import this one file)
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`
- `assets/` — `grepthink-logo.svg`, `google.svg`
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand)
- `components/primitives/` — Button, IconButton, Input, Textarea, Select, Checkbox, RadioGroup,
  Toggle, DatePickerField
- `components/display/` — Badge, Tag, Avatar (+AvatarGroup), Card, Table, StatCard, ProgressBar,
  Tooltip
- `components/feedback/` — Modal, Alert (+Toast, ToastStack), EmptyState (+Skeleton)
- `components/navigation/` — Tabs, Pagination, SegmentedControl, SidebarNavItem
  (+SidebarSectionTitle)
- `components/domain/` — RosterRow, ProjectCard, TeamMemberCard (+RoleSelect), JoinRequestCard,
  AssignmentCard, TSRForm, TSRSummaryCard, RankedProjectSlot, ConversationListItem
  (+MessageBubble, MessageComposer, UnreadBadge), MeetingCard, PieChartCard (+BarChartCard,
  CHART_COLORS)
- `components/figma-reference/` — raw materialized Figma-file components (library artifacts kept
  for fidelity, **not** part of the product API): Arrow, ButtonContentArea, Grid, Icons, Monitor,
  Navigation, Scrollbar, Thumb, ToggleSwitch, Calendar, DateActive, DateInactive, Month, Favorite,
  DAvatars63, DAvatars223 (+ fig-tokens.css with the file's 30 library variables, all modes)
- `ui_kits/grepthink/` — interactive recreation of the app (Student/TA/Instructor lenses)
- `frontend/` — imported reference SCSS/assets from the real codebase (read-only reference)
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
- `MeetingCard` — intentional addition; TA meeting w/ attendance & Zoom
- `PieChartCard` — intentional addition; token-themed SVG stand-in for recharts pie
- `BarChartCard` — intentional addition; token-themed SVG stand-in for recharts bar
- `CHART_COLORS` — intentional addition; shared chart palette for recharts fills in production
