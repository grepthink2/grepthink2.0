# Prompt for Claude Design — GrepThink Analytics round (2026-10-07)

Attach `README.md`, `sample-data.json` and `sample-data.empty.json` from this folder, then send the text below to
the "GrepThink Design System" project.

---

Design the Analytics round for GrepThink. The attached `README.md` (2026-10-05, revised 2026-10-06) is the brief
and the contract: its §4 component table, §5 data types and §6 chart rules are binding. `sample-data.json` is a
filled UC Santa Cruz instance for the mockups; `sample-data.empty.json` is a brand-new school and must render every
empty state. The codebase has since built the data layer and interim components from the brief, so this round is
the visual spec that the port replaces them with, file by file. Read the revision block at the end before you start:
it records what changed after the brief.

## Deliver (the shape of `design_handoff_scrum_board/`)

1. `components/analytics/<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md` for every component in brief §4
   (AnalyticsFilterRow, StatTile, ChartCard, UnitToggle, WeeklyLine, SplitBar, StackedBars, TimelinessBars,
   OnTimeMeter, BarsBySprint, TrendLines, BreakdownTable, ChartLegend, ChartTooltip, DefinitionPopover, EmptyState,
   LivePill), one `analytics.css` with BEM `.gt-*` classes, and an `analytics.card.html` gallery showing each
   component in every state (ready, loading, refetching, empty, error, folded row, not-due row, one series vs two).
2. `ui_kits/grepthink/analytics.html`: the full `/app/analytics` screen inside the app shell, rendered from
   `sample-data.json`, plus the first-load (skeleton), refetching (previous frame at 60 % opacity), per-card error
   and empty-school (`sample-data.empty.json`) states, at ≥ 1200 px, at 1000 px (two columns) and at phone width
   (one column, tables scrolling inside their card).
3. `design_handoff_analytics/README.md` in the scrum handoff's shape (Overview, About the design files, Fidelity,
   Requirements → design mapping, Screens, Component specs with the exact values from `analytics.css`,
   Interactions, State management, Tokens, Files) and a `NOTES.md` that answers the brief's §9 questions one by one
   and lists every decision that departs from the brief, with the reason.
4. The palette validator report for every colour you use on white and on `#EEEEEE` (brief §6), pasted into
   `NOTES.md`. If a colour must change, re-run the validator first.
5. `readme.md` → "Intentional additions": one line per new analytics component (the checker will flag them as
   "named after nothing in the kit"; that flag is informational and the names must stay as the codebase uses them).
   Leave `components/figma-reference/` untouched. Update `_ds_manifest.json` as the other rounds did.

## Rules that decide acceptance

- Colours only through `var(--gt-*)`; the four categorical slots in the fixed order of brief §6, never cycled;
  de-emphasis gray for To do, the previous range and sparkline history; status colours always with an icon and a
  label, never as a series. Raw hex in `analytics.css` fails the codebase's `lint:design` gate.
- Forms per brief §6: a single value is a tile, two or three parts are a stacked bar (never a pie), one series has
  no legend, two or more always do, no dual axes (the unit toggle swaps the measure and never recolours), the
  comparison range is gray context, endpoints labelled rather than every point.
- Marks per brief §6: bars ≤ 24 px with a 4 px rounded data end and a square baseline, lines 2 px round-joined,
  markers ≥ 8 px with a 2 px white ring, 10 % area wash, 2 px gaps between touching fills, hairline solid gridlines
  in `--gt-gray-200`, axis in `--gt-gray-400`, text in text tokens only.
- Keyboard and screen readers: marks focusable with a 2 px accent focus ring and the same tooltip as hover, every
  chart `role="img"` with an `aria-label` summary, the Table toggle a real button with `aria-pressed`, legend items
  toggle with `aria-pressed`. `prefers-reduced-motion` disables every transition.
- Light mode only. No marketing tokens inside the app. No illustration, gradients or glass.
- Privacy copy: the footnote "Aggregates only. No individual student is identified on this page. Groups of fewer
  than 3 are combined." is on every state of the screen.

## Revision block (what changed after the 2026-10-06 brief)

Design against these; they override the brief where they differ.

- **Class labels.** A class is shown as its name plus its term when it has one ("CSE 115A · Fall 2026", else
  "CSE 115B"). `course_code` is the 8-character join code and never appears anywhere on this page.
- **Timeliness ships later (sub-project C).** Design TimelinessBars, OnTimeMeter, the On time tile, the On time %
  and Missing table columns and the on-time Trends panel as the brief says, but the first release of the page
  renders none of them: the payload's `timeliness` arrives empty (`on_time_rate: null`, `rows: []`) and the Trends
  card shows three panels (messages per team per week, tasks created per team per week, points done per team as of
  the week's end). Show in the screen file how the page looks with and without the timeliness pieces.
- **Tiles in the first release:** Classes, Teams, Students, Active users (7d), Messages. Messages carries the delta
  ("+18% vs previous Sep 8 – Oct 7" style: the previous range's dates, not a generic label; no delta at all for the
  All preset, which has no previous range) and the sparkline. Active users reads "—" with the hint "Appears once
  sign-ins are recorded" until sign-in events exist, and its delta compares with the 7 days before.
- **Sparklines may be short.** The nightly rollup has as many weeks as it has run; design 2–3-point and 12-point
  sparklines, and a tile with no sparkline at all (before the first rollup).
- **Header.** "Analytics" title with the `bar-chart-3` icon, the institution name as a badge (a select only when
  the viewer has several institutions), and a secondary "Refresh" button that forces a fresh fetch. Export CSV lives
  in the breakdown card's header, not the page header.
- **Filter row.** Class select with "All classes" first; chips 7d · 30d · 90d · Class to date · All · Custom. The
  active chip is solid green; "Class to date" is disabled without a class; "Custom" opens a popover with two date
  fields (From, To) and an Apply button and, once applied, the chip reads "Custom: Sep 1 – Sep 30". Every control
  is disabled during the very first load.
- **Conversations card** has a "Table" toggle in its header that swaps the chart for a three-column week table
  (Week · Team channels · Direct). Its footnote reads "1,284 messages · Sep 8 – Oct 7 · direct messages are
  school-wide".
- **Scrum card** footnote reads "61 stories (188 pts) · 302 tasks (611 pts) created in range"; the LIVE pill and the
  Tasks | Points toggle sit in its header; the characters-per-task and per-story small multiples share one y scale
  and show the median on each column cap; sprint columns are labelled "Backlog", "S1", "S2" … in the small
  multiples and "Backlog", "Sprint 1" … in the stacked bars, with "8 teams" meta under each row label.
- **Trends card** has a "Compare with previous range" checkbox in its header and a footer "This range · Previous
  range" legend plus "as of Oct 6, 2026". Its empty state copy: "Trends appear after the first nightly rollup."
- **Breakdown table** is per class without a class filter (Class · Teams · Students · Team msgs · Stories · Tasks ·
  Pts done % · View) and per team with one (Team · Members · Team msgs · Stories · Tasks · Pts done % · View). The
  folded row is last, italic, labelled "Smaller groups (n)" with a ⓘ "Fewer than 3 people", and has no View link.
  "View" on a class row drills into analytics for that class; on a team row it opens the team's scrum board.
- **Copy to use verbatim.** Forbidden page: "Analytics is available to instructors and maintainers." Card error
  strip: "This card could not load." Empty states: "No messages yet" / "Team channels fill in as teams start
  talking."; "No sprints yet" / "Boards fill in once teams create their first sprint."; "Nothing to list" / "Rows
  appear once the school has classes and teams." Date labels: "Sep 7" for a week, "Sep 8 – Oct 7" for a range in
  one year, "Dec 25, 2025 – Jan 5, 2026" across years; compact figures "1,284", "12.9K", "1.3M".
- **Class names the port expects** (use these so the CSS drops in): `.gt-analytics` (page grid, `__header`,
  `__title`, `__badge`, `__refresh`, `__toggle`, `__check`, `__tiles`, `__grid`, `__scrum`, `__footnote`, `__error`,
  `__forbidden`), `.gt-chart-card` (`__head`, `__titles`, `__title-row`, `__title`, `__subtitle`, `__actions`,
  `__body`, `__foot`, `__error`, `--wide`, `data-state`), `.gt-legend` (`__item`, `__item--off`, `__button`,
  `__swatch`, `__swatch--rect`, `__swatch--line`, `__label`, `__value`), `.gt-chart-tip` (`__title`, `__row`,
  `__key`, `__label`, `__value`), `.gt-empty` (`__icon`, `__title`, `__hint`), `.gt-live-pill` (`__dot`),
  `.gt-unit-toggle` (`__option`, `__option--active`), `.gt-definition` (`__trigger`, `__title`, `__body`),
  `.gt-filter` (`__field`, `__label`, `__select`, `__chips`, `__chip`, `__chip--active`, `__custom`, `__apply`),
  `.gt-line` (`__svg`, `__grid`, `__axis`, `__tick`, `__path`, `__area`, `__marker`, `__marker--hot`,
  `__end-label`, `__crosshair`), `.gt-split` (`__bar`, `__segment`, `--empty`), `.gt-stack` (`__row`, `__meta`,
  `__label`, `__teams`, `__bar`, `__segment`, `__value`, `__button`), `.gt-cols` (`__panel`, `__head`, `__title`,
  `__meta`, `__svg`, `__axis`, `__bar`, `__cap`, `__tick`, `--stacked`), `.gt-trend` (`__panels`, `__panel`,
  `__title`, `__unit`, `__svg`, `__axis`, `__current`, `__previous`, `__marker`, `__end-label`, `__foot`, `__asof`,
  `__empty`), `.gt-table` (`__bar`, `__export`, `__scroll`, `__table`, `__caption`, `__num`, `__sort`,
  `__sort-icon`, `__row--folded`, `__info`, `__meter`, `__meter-fill`). The card head's `__titles` holds
  `__title-row` (the `<h2>`, the LIVE pill and the ⓘ; the heading itself holds only the title) and the subtitle.
  `.gt-trend__marker` dots each week no line reaches and this range's latest week, which `__end-label` labels;
  `.gt-cols--stacked` is the one-column layout used when a side-by-side panel cannot hold every median cap;
  `.gt-table__sort-icon` is the chevron on the sorted column and `__caption` the table's visually hidden caption;
  `.gt-analytics__toggle` is a card's Table toggle, `__check` the Trends card's compare checkbox, `__scrum` the
  Scrum card's two-part body and `__error` the page's failure strip.
  Series identity is a class that sets a custom property the marks read: `.gt-series--1 … --4`, `.gt-series--gray`,
  `.gt-status--todo`, `.gt-status--in_progress`, `.gt-status--done`, each `{ --series: var(--gt-…) }`, with marks
  using `fill: var(--series)` / `stroke: var(--series)`. The metric tile extends the existing `.metric-card` with
  `__delta` (`--good`, `--bad`, `--flat`), `__delta-value`, `__delta-vs`, `__spark`, `__spark-line`, `__spark-dot`.
- **Density.** The dev database has 134 TSR assignments across 36 classes; design the ≥ 20-row table (compact
  20 px rows, sticky header, or a "Show all" expander) and a stacked-bar card with 8+ sprint rows.
- **Null counts.** Any count can arrive `null` when its source could not load; the card is then listed in
  `failures`. A tile or table cell with a null count reads "—", and the tile's hint says "Could not load".

Answer the brief's §9 questions in `NOTES.md` even where you keep the wireframe's choice, so the port knows the
decision was made.
