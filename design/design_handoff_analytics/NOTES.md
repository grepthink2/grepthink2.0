# Analytics (2026-10-07, revised 2026-10-08) — Claude Design return notes

Deliverables for `docs/superpowers/handoffs/2026-10-05-analytics-claude-design/`: `components/analytics/*` (16 components, `analytics.css`, gallery), `ui_kits/grepthink/analytics.html`, this folder. Everything below answers brief §9, records a departure from the brief/revision with its reason, or is the palette report.

## Answers to §9 (decisions made even where the wireframe stands)

1. **Single scroll.** Readers compare across sections (board activity against messages, trends against the tiles); tabs would hide the comparison. Cards follow the brief's seven questions. If the page grows past ~7 cards, add in-page anchors, not tabs.
2. **Trends and the breakdown last**, as drawn. The tiles answer "how much is happening"; trends re-read the same measures over time and belong after the cards that define them; the table is the export surface and closes the page.
3. **`SplitBar` under "All classes"; two stat lines when a class is selected.** With a class filter the counts no longer share a denominator (team channels narrow, direct stays school-wide), so a part-to-whole bar would mislead. `SplitBar.mixedScope` renders the two-line form; the card footnote states the scope either way.
4. **Unit toggle in the scrum card header.** It changes only that card's measure; the filter row is page scope. Colors never change with it; the two units never share an axis.
5. **Not due yet:** gray `--gt-surface-sunken` track, italic label, italic "Due Oct 12" at the row's end, a calendar entry in the legend; excluded from the rate. **Folded row:** italic `--gt-text-tertiary` "Smaller groups (n)", ⓘ "Fewer than 3 people", no link, dashed rule above, always last — same in `TimelinessBars` and `BreakdownTable`.
6. **Institution in the header** (neutral `Badge`; a `Select` only when the viewer has several). It is the frame, not a filter.
7. **Custom range as a popover from the chip.** Keeps the row to one line; the applied chip reads "Custom: Sep 1 – Sep 30". From / To / Apply; Apply disabled while From > To. Production uses two `DatePickerField`s inside the `Popover` primitive.

## Departures from the brief / revision (with reasons)

- **Direct bar labels moved out of the bars** into `.gt-stack__value` (text tokens, swatch-keyed, right of each row). White on slot 2 `#2771FF` is **4.29:1** — below 4.5:1 for 10.5px labels — and dark text on it is 3.1:1; the brief's "inside a segment when it fits" cannot pass on the In-progress segment. The value column satisfies "gray needs a direct label" and "text wears text tokens" at once; the tooltip and table twin remain. The column hides below a 560px container (phones), where the table twin and tooltip carry the numbers.
- **`EmptyState` → `ChartEmptyState`** (class `.gt-empty.gt-empty--card`). The design system already exports the page-level `EmptyState` (`.gt-empty`); the per-card one is a compact modifier of it. The port may name it `EmptyState` inside the analytics feature.
- **`.gt-table--breakdown` / `.gt-plot` scoping.** The design system's generic `Table` already owns `.gt-table`, and its hover `Tooltip` owns `.gt-tooltip`; the analytics rules are scoped under the `--breakdown` modifier and under `.gt-plot` so the two coexist here. The codebase has neither collision — its SCSS can drop the modifier and the `.gt-plot` prefix.
- **Hero figure kept** on the Conversations card (brief §7: one 32/600 hero per page) in addition to the revision's footnote "1,284 messages · Sep 8 – Oct 7 · direct messages are school-wide". Hero = the headline; footnote = the scope statement. Remove the hero if the duplication reads as noise.
- **Trend panel headline.** Each small multiple shows its latest non-null value (20/600) with a short unit (`/team/wk`, `/team`, `latest week`); the brief had none and the panels read as decoration without it.
- **Hover lightening** is `filter: brightness(1.08)` on the mark — one rule, no new colors, survives the unit toggle.
- **Markers** r=4 (8px) with a 2px white ring, r=5 under the crosshair; the `WeeklyLine` hit target is the whole week column (keyboard-focusable), not the dot.
- **Container queries** (`.gt-analytics`, `.gt-stack`, `.gt-timeliness`) instead of viewport media queries: the content column is the viewport minus a 256px sidebar, and the same card lives in half- and full-width slots. Supported in every browser the app targets (2023+).
- **Timeliness colors kept as briefed, with a flag for sub-project C** (see the report): late `#B26A00` and missing `#DC2626` are ΔE00 **2.0** apart under deuteranopia when adjacent. Mitigations already in place: fixed order (late always left of missing), 2px gaps, icon + label legend, tooltip, table twin. Options when timeliness ships: a hatched missing segment, or missing → `--gt-error-text #B91C1C` after re-running the validator.
- **Tokens added** instead of hard-coding: `--gt-purple`, `--gt-chart-1..4`, `--gt-chart-context`, `--gt-chart-grid`, `--gt-chart-axis`, `--gt-chart-early`, `--gt-chart-wash`, `--gt-chart-hover`, `--gt-opacity-refetch`.
- **Series identity** is a class per slot/status (`.gt-series--1…4`, `--gray`, `.gt-status--todo/in_progress/done` **plus** `.gt-status--early/on_time/late/missing/not_due`). In this design system the class sets `color` from a registered `:root` token (`--gt-series-1…4`, `--gt-series-gray`, `--gt-status-*`, added to `tokens/colors.css`) and marks paint with `currentColor` — the compiler only registers custom properties under `:root`/`[data-*]`, so it could not carry a class-scoped `--series`. The codebase SCSS may use the revision's form verbatim (`.gt-series--1 { --series: var(--gt-chart-1) }`, marks `fill: var(--series)`); vocabulary and tokens are identical.
- **Forbidden page** gets a second line ("Your class dashboard shows your own team's progress. Ask your instructor if you need an institution-wide view.") under the verbatim title. Drop it if the copy must be the single sentence.
- **Sample derivations** (`analyticsData.js → ANALYTICS_CLASS_VIEW`) fabricate per-assignment and per-team rows from the class totals so the class-selected view can be exercised; demo fixtures only.

## Palette validator report (2026-10-07)

Method: WCAG 2.x contrast; CIEDE2000 on sRGB→Lab; CVD simulated with the Machado 2009 severity-1.0 matrices (protanopia, deuteranopia, tritanopia) in linear RGB. Ground colors: white `#FFFFFF` (cards) and `#EEEEEE` (canvas).

### Fills (non-text, ≥ 3:1)

| Colour | vs white | vs #EEEEEE | Verdict |
|---|---|---|---|
| slot 1 · `--gt-chart-1` #018156 | 4.91:1 | 4.23:1 | pass |
| slot 2 · `--gt-chart-2` #2771FF | 4.29:1 | 3.70:1 | pass |
| slot 3 · `--gt-chart-3` #7D3C98 | 7.07:1 | 6.09:1 | pass |
| slot 4 · `--gt-chart-4` #B26A00 | 4.24:1 | 3.65:1 | pass |
| context · `--gt-chart-context` #BDBDBD | 1.88:1 | 1.62:1 | by design — never alone: counts in `__value`, table twin, green counterpart |
| early · `--gt-chart-early` #54B999 | 2.39:1 | 2.06:1 | ordinal light end — always beside on-time green, icon + label |
| error · `--gt-error` #DC2626 | 4.83:1 | 4.16:1 | pass |

### Text (≥ 4.5:1)

| Colour | vs white | vs #EEEEEE | Verdict |
|---|---|---|---|
| `--gt-text-primary` #303030 | 13.20:1 | 11.38:1 | pass |
| `--gt-text-secondary` #424242 | 10.05:1 | 8.66:1 | pass |
| `--gt-text-tertiary` #616161 | 6.19:1 | 5.34:1 | pass |
| `--gt-success-text` #016547 (good delta) | 7.11:1 | 6.13:1 | pass |
| `--gt-error-text` #B91C1C (bad delta, error strip) | 6.47:1 | 5.58:1 | pass |
| `--gt-warning-text` #8A5200 | 6.39:1 | 5.51:1 | pass |
| `--gt-info-text` #1543A8 | 8.75:1 | 7.54:1 | pass |
| white on slot 1 #018156 | 4.91:1 | — | would pass |
| white on slot 2 #2771FF | **4.29:1** | — | **fails** → no in-bar labels (see departures) |

### Categorical slots, pairwise ΔE00 (normal · protan · deutan · tritan · worst)

| Pair | normal | protan | deutan | tritan | worst |
|---|---|---|---|---|---|
| 1 ↔ 2 | 46.0 | 46.2 | 42.2 | 16.1 | 16.1 |
| 1 ↔ 3 | 45.9 | 41.7 | 32.9 | 46.6 | 32.9 |
| 1 ↔ 4 | 42.7 | 12.6 | 19.8 | 53.0 | 12.6 |
| 2 ↔ 3 | 26.0 | 20.0 | 14.0 | 50.9 | 14.0 |
| 2 ↔ 4 | 55.4 | 59.7 | 64.1 | 58.4 | 58.4 |
| 3 ↔ 4 | 52.3 | 53.2 | 53.2 | 20.2 | 20.2 |

Worst adjacent CVD ΔE 14.0 (2 ↔ 3) · worst all-pairs CVD ΔE 12.6 (1 ↔ 4, protan) · worst normal ΔE 26.0. Slots 1–3 are safe in any form; slot 4 beside slot 1 only with direct labels — matches the brief's rule. No slot is used in this round beyond 1 and 2 (plus gray).

### Adjacent fills actually drawn

| Pair | normal | protan | deutan | tritan |
|---|---|---|---|---|
| early #54B999 ↔ on time #018156 | 19.6 | 19.3 | 20.3 | 18.6 |
| early #54B999 ↔ context #BDBDBD (not-due remainder) | 24.3 | 10.7 | 8.4 | 24.7 |
| **late #B26A00 ↔ missing #DC2626** | 25.4 | 11.7 | **2.0** | 11.7 |
| on time #018156 ↔ late #B26A00 | 42.7 | 12.6 | 19.8 | 53.0 |
| slot 1 #018156 ↔ context #BDBDBD (Done ↔ To do) | 34.7 | 26.7 | 28.2 | 33.1 |
| slot 2 #2771FF ↔ context #BDBDBD (In progress ↔ To do) | 35.8 | 32.2 | 36.2 | 26.7 |

Conclusion: no color was changed for this round. The one finding that needs a decision is late ↔ missing under deuteranopia, which belongs to sub-project C (above).

## Revision 2026-10-08 (second revision block) — what changed in this round

Applied on top of the 2026-10-07 delivery; every item below maps to the maintainer's second revision block.

- **Tiles.** "Active users (7d)" → **"Signed in (7d)"** with the explicit-sign-in hint; Classes / Teams / Students carry the "on record" hints (class-selected variants included); with a class selected the Messages tile becomes **Team messages** (hint "Direct messages are school-wide: 712") and the Conversations footnote leads with "572 team messages". `StatTile` gains `failed` ("—" + "Could not load", no delta/sparkline).
- **`.gt-tooltip` → `.gt-chart-tip`.** The scoping workaround from the first round is gone; the chart tooltip now owns its own block and the design system's hover `Tooltip` keeps `.gt-tooltip`. `ChartTooltip` is unchanged otherwise.
- **New classes from the revision block:** `.gt-analytics__toggle` / `__check` / `__scrum` / `__error`, `.gt-filter__foot` (replaces `__pop-actions`) / `__reason`, `.gt-cols--stacked`, `.gt-trend__end-label`, `.gt-table__caption`. The kit's `.an-scrum` scaffolding class is replaced by `.gt-analytics__scrum` (in `analytics.css`, container-queried to one column ≤ 1000px).
- **Trends.** Only complete weeks are drawn (`completeWeeks`, exported); markers only on weeks no line reaches and on the latest week, which `__end-label` labels. The first-round **panel headline (`__latest`) is removed** — the end-label carries the latest value, so the headline duplicated it; the unit now sits beside the panel title. Three empty states (derived from `asOf` + data, or forced with `emptyReason`). Table twin: one row per complete week, one column per panel with its unit, "—" for a missing value, `this / previous` when compare is on, visually hidden `<caption>`.
- **Definition panel** follows the placement rules verbatim (below the ⓘ, aligned; 16px padding around a ≤ 320px text column or viewport − 48px; 8px edge guard; centred when the viewport is < panel + 16px) — measured in a layout effect, re-run on resize. Trends definition copy replaced with the revision's text (02:00 Pacific / 12:00 Istanbul rollup, classes in session, complete weeks).
- **Custom range panel** validates with the three verbatim reasons beside Apply (`__foot` › `__reason`); native `min`/`max` on the date inputs were dropped so the reasons are reachable.
- **Page failure strip** `.gt-analytics__error` (`role="alert"`): HTTP n / refused (4xx) + reason / unreachable, each + " Showing the previous figures." while the previous payload stays. The kit's Demo bar has a new **failed** state (HTTP 502, Teams tile `failed`, alternate breakdown rows with `team_messages: null` → "—").
- **BarsBySprint `--stacked`** — one column when a side-by-side panel would give < 36px per column (automatic, or `stacked` prop); gallery shows it with Backlog + 7 sprints at 300px.
- **Conversations card** stays `--wide` in the first release (unchanged); the Scrum card already had its Table toggle (Sprint · Teams · To do · In progress · Done in the active unit).
- **Not changed:** chart colours (validator report above still stands), the §9 answers, the forbidden page, the privacy footnote on every state.

## Not delivered / caveats

- Charts are SVG stand-ins; recharts primitives may be used under the hood where cheaper, but the classes/tokens in `analytics.css` are the contract.
- `analyticsSrcLoader.js` and the Demo bar are design-system scaffolding, not part of the port.
- Light mode only, as briefed.
