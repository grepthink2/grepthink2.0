# Brief for Claude Design — GrepThink Analytics (one dashboard per institution)

**Date:** 2026-10-05 · **From:** the grepthink2.0 codebase · **To:** the "GrepThink Design System" Claude Design project
**Companion spec (data, API, authorization):** `docs/superpowers/specs/2026-10-05-analytics-dashboard-design.md`
**Sample data for the mockups:** `sample-data.json` and `sample-data.empty.json` in this folder

## 1. What we are asking for

GrepThink is adding an **Analytics** page: one dashboard per institution (UC Santa Cruz, İstinye, …) for the
people who run courses there. The codebase will build the data layer and port the UI. We need the design system
to deliver the **visualization components** in the GrepThink design language, the same way the scrum board was
delivered (`design/design_handoff_scrum_board/README.md`, `design/components/scrum/`):

- `components/analytics/<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md`, one `analytics.css` (BEM `.gt-*`
  classes), and an `analytics.card.html` gallery.
- `ui_kits/grepthink/analytics.html`: the full screen rendered from `sample-data.json`, plus the empty, loading,
  refetching and per-card error states (render `sample-data.empty.json` too).
- `design_handoff_analytics/README.md` in the shape of the scrum board handoff, and a `NOTES.md` listing every
  decision that changes this brief (the landing round's convention).

Not in scope: the data pipeline, authorization, the backend. Those are decided in the companion spec.

## 2. Where it lives, and what already exists

- **Route** `/app/analytics`, signed in, inside the app shell (256px green `#018156` sidebar, white 1px-bordered
  header, content `padding: 20px 24px` on the `#EEEEEE` canvas, `max-width: 1400px` like the class Dashboard).
  Sidebar entry "Analytics" in the **Main** section (Home · Messages · My Classes · Create Class · Analytics),
  shown to instructors and maintainers only.
- **Not class-scoped.** Unlike `/app/dashboard`, the institution is the frame; the filter row narrows to a term
  or a class. The page ignores the sidebar's selected class.
- **Reuse, don't fork:**
  - `DashboardMetricCard` (`frontend/src/features/app/components/Dashboard/`): the KPI tile. It needs two new
    optional slots, `delta` and `trend` (sparkline). Extend it; the class Dashboard keeps rendering unchanged.
  - `BurnupChart` (`frontend/src/features/scrum/components/BurnupChart.tsx`): the codebase's chart idiom. A
    hand-rolled SVG whose colors come from CSS classes (`.gt-burnup__line`, `__area`, `__grid`) bound to
    `--gt-*` tokens, no inline hex. The analytics charts should follow this approach; it is what passes the
    repo's `lint:design` check (any raw `#hex` outside the token files fails the build gate).
  - `useTableSort` and the Roster/Final Reviews table idiom for the breakdown table; `Skeleton` for first loads;
    `StatTooltip` for definition hints; lucide-react for icons.
  - `recharts` is a dependency (pie charts only). The port may use recharts primitives under the hood where
    cheaper, but the visual spec must stand on its own: your SVG/CSS is the contract, not recharts defaults.
- **Light mode only.** The app has no dark theme. Do not design one; if it arrives, chart colors are re-stepped
  and re-validated then (section 6).

## 3. The dashboard

Six questions the page answers for an institution, in the order a reader asks them:

1. How much is happening here right now (classes, teams, students)?
2. Are teams talking to each other (messages in student channels, excluding staff channels)?
3. Are teams turning in their reports on time (TSRs and the other assignments)?
4. Are teams using the scrum board, and how is work distributed across sprints (live)?
5. How much do they write per task and per story (a proxy for how seriously the board is used)?
6. Which classes or teams stand out (breakdown table, CSV export)?

### 3.1 Wireframe (desktop ≥ 1200px)

```
┌ Analytics                                   [UC Santa Cruz ▾]            [Export CSV] ┐
│                                                                                       │
│ Term [Fall 2026 ▾]  Class [All classes ▾]  Window [7d] [30d] [90d] [Term] [All]        │
│                                                                                       │
│ ┌StatTile─┐ ┌StatTile─┐ ┌StatTile─┐ ┌StatTile─┐ ┌StatTile───┐ ┌StatTile─────┐          │
│ │Classes 4│ │Teams 23 │ │Students │ │Messages │ │Stories 61 │ │On time 82%  │          │
│ │         │ │         │ │  118    │ │ 1,284 ↑ │ │Tasks 302  │ │ ▁▂▃▅▆▇ trend│          │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────────┘ └─────────────┘          │
│ ┌ Conversations ──────────────── ⓘ [Table] ┐ ┌ Timeliness ────────────────── ⓘ [Table] ┐│
│ │ 1,284 messages · last 30 days             │ │ ████████████████░░░░░  82% on time       ││
│ │  ╭─╮        weekly, single green line     │ │ CSE 115A  ▓▓▓▓▓▓▓▓▓▒▒▒▒░░░░ ▪▪           ││
│ │ ╭╯ ╰─╮  ╭─╮                               │ │ CSE 115B  ▓▓▓▓▓▓▓▓▓▓▓▒▒▒░░ ▪             ││
│ │╯     ╰──╯ ╰───                            │ │ CSE 115C  ▓▓▓▓▓▓▓▓▒▒▒▒▒░░░░ ▪▪▪          ││
│ │ Direct 712 ▓▓▓▓▓▓▓▓▓ Team 572 ▓▓▓▓▓▓▓     │ │ ■ Early ■ On time ■ Late ■ Missing       ││
│ └───────────────────────────────────────────┘ └──────────────────────────────────────────┘│
│ ┌ Scrum board · LIVE ────────────────────────────────────────────────────── ⓘ [Table] ┐  │
│ │ 61 stories · 302 tasks created in window     Backlog   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓            │  │
│ │                                              Sprint 1  ▓▓▓▒▒▒▒▒████████████        │  │
│ │ Characters per task · median 29 · mean 41    Sprint 2  ▓▓▓▓▒▒▒▒▒▒▒██████           │  │
│ │ ▂▃▃▂  (columns by sprint)                    Sprint 3  ▓▓▓▓▓▓▓▒▒▒▒██               │  │
│ │ Characters per story · median 96 · mean 107  ■ To do ■ In progress ■ Done           │  │
│ │ ▃▅▆▇  (columns by sprint)                                                           │  │
│ └─────────────────────────────────────────────────────────────────────────────────────┘  │
│ ┌ By class ─────────────────────────────────────────────────────────── [Export CSV] ┐    │
│ │ Class ▾     Teams  Students  Messages  Stories  Tasks  Done %  On time %  Missing     │    │
│ │ CSE 115A       8       41       512       24     118    61 %      88 %        3  View │    │
│ │ …                                                                                  │    │
│ └────────────────────────────────────────────────────────────────────────────────────┘    │
│ Aggregates only. No individual student is identified on this page.                        │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Two columns at ≥ 1000px, one column below; phones stack everything, tables scroll horizontally inside their card.

### 3.2 Page chrome

- **Header:** page title "Analytics" (20/600), the institution name as a neutral badge (or a `Select` when the
  viewer may see several institutions), a secondary "Export CSV" button. Title Case for titles and buttons.
- **Filter row:** one left-aligned row above everything it scopes; never a filter inside a card. Window chips
  (7d · 30d · 90d · Term · All) with the active one solid green; Term and Class as `Select`s. Every card
  re-renders against the same slice. State lives in the URL (`?term=&class=&window=`), so views are shareable.
- **Refetch holds the frame:** while new data loads, cards keep their previous render at reduced opacity (no
  skeleton, no layout jump). Skeletons appear only on the very first load (match `Dashboard.tsx`).
- **"LIVE" pill** on the scrum snapshot card: that card ignores the window (it is the board as it is now); the
  "created in window" stats inside it do not. Make the distinction visible.
- **Privacy footnote** at the bottom: "Aggregates only. No individual student is identified on this page."

### 3.3 Metric definitions (copy for subtitles and the ⓘ popover)

Readers trust a number only when they can see how it is counted. Each card gets a one-line subtitle and a
"How this is counted" popover with the definition below (plain language, sentence case).

| Card | Subtitle | Definition (popover) |
|---|---|---|
| Messages | "Direct and team-member messages." | Messages sent in direct conversations and in team-member channels, in the selected window. Messages in team ↔ TA and team ↔ instructor channels are excluded. A team channel belongs to its team's class; a direct conversation belongs to the school of the most recent class both people share. Weeks start on Monday in the school's time zone. |
| Timeliness | "First submission vs. the due date." | For each assignment, every expected submitter (team members for a TSR; enrolled students for feedback and interest forms) is placed in one bucket by their first submission: early (more than 24 h before the deadline), on time (within the last 24 h), late (after the deadline), or missing (deadline passed, nothing submitted). The deadline is the end of the due date in the school's time zone. "Not due yet" rows are shown but excluded from the on-time rate. |
| Scrum board (live) | "Tasks on every team's board right now, by sprint." | Every task in scope, by its current column and by the sprint of its story. Sprints are aligned by order within each team (Sprint 1 is each team's first sprint), not by date. Tasks whose story is in the backlog are "Backlog". Tasks of archived stories are not shown. |
| Stories / tasks created | "Created in the selected window." | User stories and tasks created in the window on the boards of teams in scope. Archived stories still count. |
| Characters per task / story | "Title plus description, as typed." | The number of characters in a task's (or story's) title and description, including markdown. Median and mean are shown; the bars show the median because one long description skews the mean. |

## 4. Components to design

Build each as plain JSX + CSS with typed props in the sibling `.d.ts`; the codebase ports them to TSX. Colors
only through `var(--gt-*)` custom properties (section 6). Class names `.gt-<component>` and `__element`
modifiers, as in `scrum.css`.

| # | Component | Purpose | Props (shape) | States & notes |
|---|---|---|---|---|
| 1 | `AnalyticsFilterRow` | The one filter row | `institutions[]`, `institutionId`, `terms[]`, `term`, `classes[]`, `classId`, `window: '7d'∣'30d'∣'90d'∣'term'∣'all'`, `onChange` | Institution `Select` only when `institutions.length > 1`. Chips: 32px tall, radius 20, active = solid green, hover = `--gt-primary-soft`. Disabled while first load. |
| 2 | `StatTile` (extends `DashboardMetricCard`) | KPI tile | `label`, `value` (auto-compact 1,284 / 12.9K), `icon`, `accent`, `delta?: {value, vsLabel, goodWhenUp}`, `trend?: number[]`, `hint?`, `loading?`, `onClick?` | Proportional figures (no `tabular-nums`). Delta: signed, "vs previous 30 days", color = direction × goodWhenUp (success-text / error-text), never the series color. Sparkline: 12 points, de-emphasis gray line, last point green dot with 2px white ring. |
| 3 | `ChartCard` | Container for every chart | `title`, `subtitle?`, `definition?` (popover body), `live?`, `actions?` (Table toggle, Export), `state: 'loading'∣'refetching'∣'ready'∣'empty'∣'error'`, `emptyMessage?`, `errorMessage?`, `footnote?`, `children` | White, 1px `--gt-border`, radius 10, hairline shadow, padding 16. Header divides with 1px `--gt-border`. Any fixed height includes the x-axis band (no nested scroll). Refetching = content at 60% opacity. Error = inline error-soft strip inside the card; the rest of the page is unaffected. |
| 4 | `WeeklyLine` | Messages per week | `points: {weekStart: string; value: number}[]`, `height?`, `ariaLabel` | Single series: 2px `--gt-primary` line, round joins, area wash at 10%, no legend (the title names it). Hairline solid gridlines `--gt-gray-200` (never dashed), axis `--gt-gray-400`, labels `--gt-text-tertiary`. Crosshair snaps to the nearest week; tooltip = value strong + "Week of Oct 6". End-label the last point only. ≥ 8px end marker with 2px white ring. |
| 5 | `SplitBar` | Direct vs team-member share | `segments: {key, label, value}[]` (2–3) | One horizontal bar, 2px white gaps, segments in categorical slots 1–2 (green, blue); legend with counts below. Not a pie. |
| 6 | `StackedBars` | Live task snapshot by sprint | `rows: {key, label, teams?: number, segments: {status: 'todo'∣'in_progress'∣'done', value}[]}[]`, `orientation: 'horizontal'`, `onRowClick?` | Horizontal, one row per sprint ordinal (Backlog first), bar ≤ 24px thick, 4px rounded data end, square at baseline, 2px white gaps between segments. Colors follow the board: To do `--gt-gray-400`, In progress `--gt-accent`, Done `--gt-primary`. Gray fails 3:1 on white, so direct count labels are mandatory (inside a segment only when they fit with padding, else in the tooltip) and the table twin exists. Legend always. Row meta "8 teams" in `--gt-text-tertiary`. |
| 7 | `TimelinessBars` | Submission buckets | `rows: {key, label, dueAt?, expected, buckets: {key, label, value}[], notDueYet?: boolean, href?}[]`, `bucketOrder: string[]` | 100% stacked horizontal bars, one row per class (default) or per assignment (when a class is selected; ordered by due date). Buckets use the **status** palette with an icon in the legend: early `--gt-green-300` + `check-circle`, on time `--gt-success` + `check-circle-2`, late `--gt-warning` + `clock`, missing `--gt-error` + `x-circle`. Not-due-yet rows: gray track, italic "Due Oct 12". Click → the assignment. Tooltip: count and % per bucket, expected total, due date. |
| 8 | `OnTimeMeter` | The headline rate | `rate: number∣null`, `late`, `missing`, `expected` | Meter: green fill on a `--gt-green-50` track (same ramp), 8px tall, radius 4; label "82% on time · 14 late · 6 missing". `null` ⇒ "No deadlines yet". |
| 9 | `BarsBySprint` | Characters per task / per story | `panels: {key, title, overall: {median, mean, n}, columns: {label, median, mean, n}[]}[]` | Two small multiples side by side (Tasks, Stories), **one series** each (slot 1 green), columns ≤ 24px, value on the cap for the median only. Mean lives in the panel head ("median 29 · mean 41") and in the tooltip. Shared y-axis scale across the two panels so they compare. |
| 10 | `BreakdownTable` | Per class / per team | `columns[]`, `rows[]`, `sort`, `onSort`, `onExport`, `getRowHref?` | Sticky header, right-aligned `tabular-nums` figures, 12.5px rows, percentage cells with a 3px inline meter, "View" link. Phones: horizontal scroll inside the card. |
| 11 | `ChartLegend`, `ChartTooltip` | Primitives | legend: `items: {key, label, swatch: 'rect'∣'line', color, icon?}[]`, `onToggle?`; tooltip: `title`, `rows: {label, value, color?}[]` | Legend swatches 14×3 for lines (BurnupChart idiom), 10×10 radius 2 rects for bars; toggling a legend item isolates its series. Tooltip: white, 1px border, radius 7, shadow hover; value strong (`--gt-text-primary`), label `--gt-text-tertiary`; series keyed by a short colored line, not a box. Text content only. |
| 12 | `DefinitionPopover` | "How this is counted" | `title`, `body`, `learnMoreHref?` | Opens from the ⓘ in the card header (`StatTooltip` exists for one-liners; this is the multi-sentence version). 320px, sentence case. |
| 13 | `EmptyState` | Per card | `icon`, `title`, `hint` | E.g. "No sprints yet" / "Boards fill in once teams create their first sprint." No illustration. |
| 14 | `LivePill` | Marks live cards | — | 10px/600 uppercase "LIVE", 6px dot `--gt-primary`, soft background. No pulsing animation. |

Also include the keyboard story: marks are focusable (`tabindex`, 2px accent-blue focus ring), focus shows the
same tooltip as hover; the Table toggle is a real button with `aria-pressed`; every chart has `role="img"` and an
`aria-label` summary (as `BurnupChart` does).

## 5. Data contracts

The page loads **one payload** (one request per filter change). Components consume slices of it. These types
are the contract the codebase will implement; `.d.ts` props should be derivable from them.

```ts
export type Window = '7d' | '30d' | '90d' | 'term' | 'all';
export type BoardStatus = 'todo' | 'in_progress' | 'done';
export type TimelinessBucket = 'early' | 'on_time' | 'late' | 'missing' | 'not_due';

export interface AnalyticsDashboard {
  meta: {
    institution: { id: string; name: string; slug: string; timezone: string };
    term: { term: string; year: number; label: string } | null;   // e.g. Fall 2026; null = all terms
    class_id: string | null;      // null = all classes in the term
    window: Window;
    from: string; to: string;     // ISO dates, inclusive, in the institution's zone
    generated_at: string;         // ISO timestamp
    cached: boolean;              // served from the 60 s server cache
  };
  overview: {
    active_classes: number; teams: number; students: number;
    messages: number; stories_created: number; tasks_created: number;
    on_time_rate: number | null;  // 0–1; null when no deadline has passed yet
    deltas: Partial<Record<'messages' | 'stories_created' | 'tasks_created' | 'on_time_rate', number | null>>;
    trends: Partial<Record<'messages' | 'tasks_created', number[]>>;   // 12 points, oldest first
  };
  conversations: {
    total: number;
    by_type: { dm: number; team_members: number };
    weekly: { week_start: string; value: number }[];                  // Monday, ISO date
    excluded_types: string[];                                           // ['team_ta', 'team_instructor']
    unattributed: number;                                               // DMs with no shared class; not in total
  };
  scrum: {
    live_as_of: string;
    stories_created: number; tasks_created: number;
    by_sprint: { ordinal: number; label: string; teams: number;
                 todo: number; in_progress: number; done: number }[];  // ordinal 0 = Backlog
    chars: { entity: 'task' | 'story'; ordinal: number | null; label: string;
             n: number; median: number; mean: number }[];              // ordinal null = overall
  };
  timeliness: {
    on_time_rate: number | null; expected: number; late: number; missing: number;
    bucket_order: TimelinessBucket[];
    rows: { key: string; label: string; kind: 'class' | 'assignment';
            assignment_type?: 'tsr' | 'feedback' | 'interest_form';
            class_id: string; class_name: string; due_at?: string;
            expected: number; buckets: Record<TimelinessBucket, number>; href?: string }[];
  };
  breakdown: {
    kind: 'class' | 'team';
    rows: { id: string; name: string; teams?: number; students?: number; members?: number;
            messages: number; stories: number; tasks: number; done_rate: number | null;
            on_time_rate: number | null; missing: number; href: string }[];
  };
  failures: ('overview' | 'conversations' | 'scrum' | 'timeliness' | 'breakdown')[];  // cards to show in error state
}
```

`sample-data.json` is a filled instance (UC Santa Cruz, Fall 2026, 30 days). `sample-data.empty.json` is a brand-new
term: zero everything, `on_time_rate: null`, empty arrays, so every empty state is exercised.

## 6. Chart rules (the data-viz method, applied to GrepThink's tokens)

These were derived with the data-viz skill's procedure and its palette validator, run against the token colors
on the white card surface and on the `#EEEEEE` canvas. Keep to them; if a color must change, re-run the validator
and paste its report into `NOTES.md`.

**Forms.** A single current value is a stat tile, never a one-bar chart. Part-to-whole with two or three parts is a
stacked bar, never a pie or donut. One series needs no legend box; two or more always get a legend. No dual axes.
No number on every point: label the endpoint, the extreme, or the one series the story is about.

**Categorical slots (identity), fixed order, never cycled:**

| Slot | Token | Hex | Use |
|---|---|---|---|
| 1 | `--gt-primary` (green-500) | `#018156` | the default single series; Direct messages; Done |
| 2 | `--gt-accent` (blue-500) | `#2771FF` | second series; Team-member messages; In progress |
| 3 | `--gt-purple` | `#7D3C98` | third series (per-class comparisons) |
| 4 | `--gt-warning` | `#B26A00` | fourth series, only with direct labels |

Validator: all four pass every check on white and on `#EEEEEE` (worst adjacent CVD ΔE 16.3, worst normal-vision
ΔE 21.0, all ≥ 3:1). Slots 1–3 also pass the all-pairs check, so they may appear in forms where any two marks can
touch (small multiples, dots). Slot 4 beside slot 1 drops to CVD ΔE 6.5 under all-pairs: legal only with direct
labels. The UCSC blue `#003C6C` fails (too dark, reads gray): not a series color. A fifth series folds into "Other"
(`--gt-gray-500`) or becomes a table.

**De-emphasis gray.** "To do" and "Other" use `--gt-gray-400 #BDBDBD`. It is 1.88:1 on white by design (it is the
not-started state), so those segments always carry a visible count or the table twin.

**Ordinal (one hue, ordered steps):** green-300 `#54B999` → green-500 `#018156` → green-800 `#014A34` passes the
ramp check (light end 2.39:1). Use it only where the order means something (early → on time is the one case).

**Status (fixed meaning, always icon + label, never a series):** good `--gt-success #018156` (4.91:1), warning
`--gt-warning #B26A00` (4.24:1), critical `--gt-error #DC2626` (4.83:1), neutral/pending `--gt-gray-400`.
Early uses green-300 `#54B999`, the lighter step of the same ramp as on-time, so the two "good" buckets read as a
pair. Text next to a status swatch is `--gt-success-text / --gt-warning-text / --gt-error-text` (≥ 6:1).

**Sequential (magnitude, heat cells, if ever needed):** the green ramp 100 → 900, light end allowed to recede.

**Marks.** Bars ≤ 24px thick, 4px rounded data end, square at the baseline; lines 2px round-joined; markers ≥ 8px
with a 2px white ring; area wash 10%; 2px surface gap between touching fills; gridlines hairline, solid,
`--gt-gray-200`; axis `--gt-gray-400`. Never a stroke around a mark to separate it.

**Text.** Labels, values, legends and axis ticks wear text tokens (`--gt-text-primary / secondary / tertiary`),
never the series color; identity comes from a swatch beside the text. Hero and tile values use proportional
figures; `tabular-nums` only in table columns and axis ticks. Poppins everywhere; system mono for keys.

**Interaction.** Bars and cells: the mark is the hit target (≥ 24px incl. its gap), hovered mark lightens 8%;
lines: a crosshair snaps to the nearest x and the tooltip lists every series at that x. Tooltips enhance, never
gate: every value is also in the table view. Keyboard focus shows the same tooltip. All transitions 0.2s ease;
under `prefers-reduced-motion` nothing animates (no bars growing in).

## 7. Tokens and chrome

From `tokens/colors.css` (`--gt-*`), `tokens/typography.css`, `tokens/spacing.css`. Card: white, 1px `--gt-border`
`#DADADA`, radius 10, `0 0 4px rgba(0,0,0,.08)`; header/footer dividers 1px `--gt-border`; card padding 16; grid
gap 20 (two columns `minmax(0,1fr) minmax(0,1fr)`; the scrum card and the table span both). Type: card title
14/600, subtitle 12 `--gt-text-tertiary`, hero figure 32/600 (one per page: messages in window), tile value
24/600, axis labels 11, legend 11.5. Icons: lucide 2px stroke (`bar-chart-3`, `message-square`, `clock`,
`check-circle-2`, `x-circle`, `table`, `download`, `info`).

## 8. Constraints

- Colors only via `var(--gt-*)`. If a value you need has no token (e.g. the 60% refetch opacity, the 10% area
  wash), express it as opacity on a token color, or propose the token in `NOTES.md`. Raw hex in `analytics.css`
  will fail the codebase's `lint:design`.
- Flat and calm: no gradients, no glassmorphism, no illustration. The data is the only loud thing.
- Light mode only (section 2). No marketing (`--gt-mkt-*`) tokens inside the app.
- Responsive: two columns ≥ 1000px, one below; tables scroll inside their card on phones; touch targets ≥ 44px
  for chips, legend items, and bars' hit areas.
- Read-only surface: it must render identically in the "View class as student" preview mode (no writes).
- Density: a term has ~10 TSR assignments per class and the dev database already has 134 TSR assignments across
  36 classes. Default to one row per class; show one row per assignment only when a class is selected. Design the
  many-rows case (≥ 20 rows: compact 20px rows, sticky header, or a "Show all" expander), not just the sample.

## 9. Questions we are leaving to you (answer in NOTES.md)

1. Single scroll (as wireframed) or tabs (Overview · Conversations · Timeliness · Scrum)? We lean single scroll:
   the readers compare across sections.
2. Where does the breakdown table sit: last (as drawn) or beside the KPI row?
3. Direct vs team-member split: the `SplitBar` or two lines of text under the hero figure?
4. Median vs mean for characters: bars show the median (our pick); is the mean better as a thin tick on the bar,
   or kept to the head and tooltip?
5. How should "not due yet" assignments look so they are visibly excluded from the rate?
6. Institution switcher: header badge/select (as drawn) or inside the filter row?
7. Is a sparkline on three tiles (messages, tasks, on-time) worth the visual weight, or should only the hero card
   get the weekly line?
