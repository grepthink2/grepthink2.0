# Handoff: GrepThink Schedule (Today's Schedule card + /app/schedule agenda)

**Brief:** maintainer prompt, 2026-10-17 (Schedule component family: compact card on Student Home, full-width agenda, one component for Student / TA / Instructor, six event kinds + sprint rules, states, time zones, a11y, phone) · **Decisions and open questions:** `NOTES.md` (this folder).

## Overview
One list component, two variants. **Compact** is the body of the "Today's Schedule" card in Student Home's right column (the page grid is `2fr / 1fr`, stacking under 900px; the card sits above "Your team"): today's items with a live **Now** line, or — when today is empty — "Nothing scheduled today", a peek at the next day that has something and an "Add to your calendar" link. **Agenda** is the `/app/schedule` week: a `‹ This week ›` switcher, a class select and kind chips, sticky day headers, sprint rules at the top of their day, the Now line on today, and TA-meeting rows that expand into the existing `MeetingCard`. Student, TA and Instructor render the same component; only the items and the actions differ (`lens`).

## About the design files
Design references in HTML/JSX — intended look and behavior, not production code to copy. Recreate in grepthink2.0 (React 19 + TS + SCSS + Vite + Supabase) with its patterns: BEM SCSS, `--gt-*` custom properties, lucide-react icons (`Video`, `ClipboardCheck`, `Users`, `BookOpen`, `DoorOpen`, `Flag`, `Clock`, `CalendarDays`, `CalendarPlus`, `ChevronLeft/Right/Down`, `MapPin`, `CircleAlert`, `Globe`, `ArrowRight`). `../components/schedule/*.jsx` are close to production shape (typed props in sibling `.d.ts`); `ScheduleModel.jsx` is pure logic and ports as `features/schedule/scheduleModel.ts`. `schedule.css` contains **no raw hex** (the purple tint is the registered `--gt-sched-review-soft`), so it passes `lint:design`.

## Fidelity
**High-fidelity** for layout, states, copy, keyboard and the kind palette. Throwaway: `components/schedule/scheduleData.js` (sample items, campus-time authored), `scheduleSrcLoader.js` (kit-only dev fallback), `ui_kits/grepthink/ScheduleScreen.jsx` (shell stub + demo bar; the clock is pinned per demo "now"). The data layer (which events a lens sees, the ICS feed, recurrence expansion) is specified in **Data contract** and `NOTES.md`, not built.

## Requirements → design mapping
| # | Requirement | Design |
|---|---|---|
| Compact card | today + live Now line; peek when empty | `ScheduleList variant="compact"`: `todayOrPeek()` → today's sorted items (sprint rules first, then rows, `maxItems` 5 then "+n more today"), `NowLine` before the first timed item that hasn't ended (trailing when everything is over); peek = quiet "Nothing scheduled today" + `ScheduleDayHeader title="Next"` + up to 3 rows of the next day + footer "Add to your calendar · See week" |
| Agenda | week view, sticky day headers, `‹ This week ›`, filters by class and kind | `ScheduleList variant="agenda"`: toolbar (week group + range + zone note + filters), one white surface with `.gt-sched__day` sections; headers `position: sticky; top: 0`; days shown = days with items + today (`showEmptyDays` renders all seven); week label is "This week / Next week / Last week" or the range; kind chips are multi-select `aria-pressed`; class select appears with 2+ classes |
| One component, three lenses | content differs, not the look | `lens` only gates actions: staff get **Mark attendance** (live/past TA meetings) and **Set time** (Time TBD); students get their own attendance pill. Hosts the viewer *is* render as "You" (`person.you`) |
| Kind 1 — weekly TA meeting | team, range, TA avatar, Join Zoom window, "Weekly · Tue", "Meeting 2 of 2 this week", past attendance, TA "Mark attendance", expands into MeetingCard | row context = `teamName · classLabel · recurrenceLabel · Meeting i of n this week`; people = host (TA) with 20px avatar; `isJoinable()` → primary **Join Zoom** from 10 min before start until the end, quiet outlined **Zoom** before that (agenda only); past: student `attendance` pill Present / Late / Absent / Not marked, staff "3/4 present"; agenda rows have a 36px chevron toggle (`aria-expanded`/`aria-controls`) that mounts `MeetingCard` (team, "Tue, Oct 20 · 3:00 – 3:45 PM", Zoom, attendees, tally, status completed/missed/upcoming) |
| Kind 2 — final review | slot, both reviewers, shared Zoom room, countdown | people = `reviewers[]` labelled Home TA / Review TA; context "Shared Zoom room"; `countdown()` → "in 3 days" / "tomorrow" / "today" once < 7 days away, rendered next to the title in the kind color |
| Kind 3 — one-off meeting | title, organizer, Zoom or room, note, team or class | title as given; kind label **MEETING** in the context line (the title doesn't carry it); `scope: 'class'` → "Whole class"; `note` as a third line (agenda) |
| Kind 4 — lectures & office hours | course, room or Zoom; OH show host | lecture = gray tile, quiet; office hours = white tile with a dashed `--gt-border-strong` outline (optional drop-in) + host avatar/name; context `classLabel · room / Zoom · recurrence` |
| Kind 5 — sprint start/end | a rule with a muted label, no card | `ScheduleDivider`: 10.5/600 uppercase tertiary label + dashed hairline, rendered between the day header and the day's list (never an `<li>`); "Sprint 2 ends today" on today |
| Kind 6 — deadlines | light marker | `.gt-sched-item--marker`: one line, no tile fill, amber `Flag` glyph, 13/500 title, "Due" under the time; `href` makes the title a link |
| States | loading, nothing today, error, live, past, cancelled, TBD, overlapping | see **States** |
| Time zones | viewer's zone; one label when it differs; durations; `<time datetime>` | see **Time zones** |
| A11y / responsive | ordered lists by day, keyboard, 44px, reduced motion, phone | `<ol class="gt-sched__days">` → `<li class="gt-sched__day">` (heading + `<ol class="gt-sched__items" aria-labelledby>`); every action is a `<button>`/`<a>`; rows ≥ 44px; phone rules at < 768px (controls ≥ 44px); `prefers-reduced-motion` stops the live pulse and transitions |

## Kind palette (`tokens/colors.css`, `--gt-sched-*`)
Icon + text label always accompany the color — never color alone. Gold stays for achievements, red for errors.

| kind | tile | text | icon (lucide) | label shown |
|---|---|---|---|---|
| `ta_meeting` | `--gt-sched-ta-soft` = `--gt-primary-soft` | `--gt-sched-ta-text` = `--gt-green-700` | `video` | title "TA meeting" |
| `final_review` | `--gt-sched-review-soft` = `rgba(125,60,152,.12)` | `--gt-sched-review-text` = `--gt-purple` | `clipboard-check` (the Final Reviews nav icon) | title "Final review" |
| `meeting` | `--gt-sched-meeting-soft` = `--gt-info-soft` | `--gt-sched-meeting-text` = `--gt-info-text` | `users` | **MEETING** eyebrow in the context line |
| `lecture` | `--gt-sched-lecture-soft` = `--gt-gray-100` | `--gt-sched-lecture-text` = `--gt-gray-700` | `book-open` | title "Lecture" |
| `office_hours` | `--gt-sched-oh-soft` = white + 1px dashed `--gt-sched-oh-border` (`--gt-border-strong`) | `--gt-sched-oh-text` = `--gt-gray-700` | `door-open` | title "Office hours" |
| `deadline` | none (marker) | `--gt-sched-deadline-text` = `--gt-warning-text` | `flag` | **DEADLINE** eyebrow |
| `sprint` | — | tertiary text on a dashed rule | — | "Sprint 3 starts" |

The kind eyebrow (`.gt-sched-item__kind`, 10.5/600 uppercase 0.04em, kind text color) renders only when the title doesn't already contain the kind's label. `--gt-sched-now` (= `--gt-primary`) paints the Now line.

## Component specs (exact values from `schedule.css`)
- **Row `.gt-sched-item`** — agenda grid `112px 28px minmax(0,1fr) auto`, column-gap 12, padding `10px 16px`, min-height 44, `align-items: start`; hairline `--gt-border-subtle` between rows (agenda only). Compact: `60px 24px minmax(0,1fr)`, gap 10, padding `8px 0`, no hairlines (rhythm by spacing).
- **Time cell** — `__range` 13/500 primary tabular ("3:00 – 3:45 PM", period once when shared) + `__dur` 11.5 tertiary ("45 min", `<time datetime="PT45M">`); `__start` ("3:00 PM") replaces the range in compact and on phone; "All day" 12.5/500 secondary; "Time TBD" 12.5/500 secondary with a 13px clock; deadlines show "Due" under the time.
- **Tile `.gt-sched-item__tile`** — 28×28 (compact/phone 24), radius 7, kind tint, 16px glyph (14 compact); office hours add the dashed border; markers have no fill.
- **Title** 14/600 primary, 1.35 (compact 13); **context** 12px tertiary with `·` separators in `--gt-gray-400`; the first token (team / "Whole class") is `__meta-primary` 500 secondary; places carry a 12px `map-pin` / `video` glyph; **people** 12px secondary, 20px avatars, role after the name in tertiary ("· TA", "· Home TA", "· Organizer"); compact collapses people to avatars at the end of the context line (names in `title`); **note** 12.5 secondary; **cancel reason** 12 tertiary.
- **Pills in the head** — Live: the shared `<Badge status="live" />` (blue, in progress; the green pill with its pulsing dot left in the 2026-10-22 fold-back); countdown 12/600 in the kind color; attendance / Cancelled / Overlaps are `Badge`s at 10.5px (`success` Present · `warning` Late · `error` Absent · `neutral` Not marked / Cancelled · `warning` Overlaps with a `title` listing the other items and visually-hidden text).
- **Actions `.gt-sched-item__action`** — 36px, padding 0 14, radius 7, 1px `--gt-border`, white, 13/500 secondary; `--primary` = `--gt-primary` fill, white 600, hover `--gt-primary-hover`; press `translateY(0.5px)`; focus `--gt-focus-ring`. Compact: 32px, 12.5px, placed under the context line. Toggle `__toggle` 36×36 ghost chevron, rotates 180° when open. Expanded `__panel` spans the grid; the embedded `MeetingCard` loses its shadow and sits on `--gt-surface-muted`.
- **Past** rows dim time, tile, title, context, people and note to 0.55 — pills and actions stay full. **Cancelled**: title struck through in tertiary, gray tile, time/context dimmed, Cancelled pill, reason line. **TBD** rows sort last in their day.
- **Now line `.gt-sched__now`** — agenda grid `112px 1fr` so the 2px `--gt-sched-now` line starts at the tile column with an 8px dot; label "NOW · 3:12 PM" 11/600 uppercase `--gt-green-700`; compact = flex (label, then the line). `aria-label="Now, 3:12 PM"`.
- **Day header `.gt-sched-day`** — 13/600 title ("Today" in `--gt-green-700`, "Tomorrow", "Yesterday", else the weekday) + 12px tertiary date; agenda: sticky top 0, white, `1px --gt-border-subtle` bottom, padding `10px 16px`, z-index 2; days divide with `1px --gt-border`; "Nothing scheduled" 12.5 tertiary on an empty today.
- **Sprint rule `.gt-sched-divider`** — padding `8px 16px 2px`, label 10.5/600 uppercase 0.04em tertiary, `1px dashed --gt-border-strong` hairline filling the rest.
- **Toolbar** — `.gt-sched__week` bordered group (radius 7, 2px padding) with 32px icon buttons and a 32px/13/600 center button ("This week" disabled; otherwise "Next week" / "Last week" / the range, `title` "Back to this week"); `__range` 12.5 tertiary; `__select` 32px radius 7 (class); `__chip` = the search layer's `.gt-scope` spec (26px pill, 11.5/500, hover green-50 + green-200 border, pressed solid `--gt-primary`).
- **States** — skeleton rows (time block, tile, two lines; `Skeleton` shimmer, `role=status aria-busy`); `.gt-sched__state` centered 28/16 padding, 40px `--gt-surface-sunken` icon well, 13.5/600 title, 12px tertiary hint; `--error` title in secondary with an underlined "try again" button (never a red panel); `--quiet` (compact empty) left-aligned without the well; links `.gt-sched__link` 12/500 `--gt-text-link`.
- **Footer (compact)** — hairline top, zone note left, "Add to your calendar · See week →" right.
- **Phone (< 768px)** — agenda rows `64px 24px 1fr`, start time only, actions drop under the row and stretch (`min-height` 44), toggle 44×44, week group full width with 44px buttons, chips scroll horizontally, day headers/dividers 12px side padding; compact actions 44px tall.

## Time zones
Times render in the **viewer's** zone (`zone`, default `Intl.DateTimeFormat().resolvedOptions().timeZone`) — the codebase's final-review formatters already do this (`finalReviewTemplate.ts`), because a meeting must read on the viewer's clock. When `zoneDiffers(zone, schoolZone)` (compared by UTC offset at `now`, so PDT vs PST never counts), the list says it **once** — "Times in GMT+5:30 · campus is PT" (compact footer; agenda toolbar) — and every timed row's `<time>` carries the campus time in its `title` ("3:00 – 3:45 PM PT"). The expanded `MeetingCard` repeats the viewer time. Why once, not inline on every row: the compact column is ~300px and already holds a range, a duration and a context line; inline "3:00 PM PT · 1:00 AM your time" doubles every time string and buries the one the viewer acts on. Day grouping also follows the viewer's zone, so a 1:20 PM PT Monday lecture lists under Tuesday 1:50 AM for a viewer in IST. Timed vs all-day: all-day items say "All day" and never get a Now line or a Join window; durations show under every range; every time is `<time datetime="<ISO instant>">`, every duration `<time datetime="PT45M">`.

## States
loading (3 skeleton rows compact / 5 agenda) · nothing today (compact: quiet title + Next peek + calendar link; agenda: "Nothing scheduled this week", "Next up: Final review · Team 1 · Friday, Oct 23 · 2:40 PM", calendar link; with filters on: "Nothing matches these filters" + Clear filters) · error (quiet, retry) · live (Now line, Live badge, primary Join Zoom, `aria-current`) · past (dimmed, attendance) · cancelled (struck, reason) · Time TBD (time cell, sorts last, staff Set time) · overlapping (`findOverlaps()` on timed, non-cancelled, non-TBD, non-deadline items; Overlaps pill on each) · all-day · another zone.

## Interactions & keyboard
Tab reaches, in order: week buttons, class select, kind chips, then each row's Zoom / Join Zoom (link), Mark attendance / Set time (buttons), the expand toggle, deadline title links, footer links. Enter/Space activate; the toggle announces `aria-expanded`. Join Zoom opens in a new tab (`rel=noreferrer`) and calls `onJoin(item)` for analytics. The Now line, Live badge and Join window move on a 30-second tick (`useNow`). No drag, no hover-only affordances; `title` tooltips only add the campus time and overlap partners.

## Lenses (what the data layer sends)
- **Student**: own class lectures / office hours, own team's TA meetings (with `attendance` = own status once past), own team's one-off meetings, own final review, assignment deadlines, own project's sprint edges.
- **TA**: every assigned team's TA meeting (`attendance` = `{present,total}`), own office hours (`host.you`), final reviews where they are Home or Review TA (`reviewers[].you`), staff meetings, TSR deadlines; items from every class they TA (the class select filters).
- **Instructor**: lectures and office hours they give, all final reviews, class-wide and team one-off meetings they organize, TA meetings (optionally — see `NOTES.md`), deadlines.

## Data contract (`components/schedule/ScheduleModel.d.ts` → `ScheduleItemData`)
```
{ id, kind: ta_meeting | final_review | meeting | lecture | office_hours | deadline | sprint,
  title, startsAt (ISO instant), endsAt (ISO | null), allDay,
  classLabel, classId, teamName, projectId, location, zoomUrl,
  host: { id, name, avatarUrl?, role?, you? },
  reviewers: [{ id, name, avatarUrl?, slot: home | review, you? }],
  recurrenceLabel ("Weekly · Tue"), meetingIndex, meetingsPerWeek,
  attendance: present | late | absent | unmarked  (student)  |  { present, total }  (staff),
  attendees: string[], note, scope: team | class, cancelReason, href,
  status: upcoming | live | past | cancelled | tbd,   // only cancelled / tbd are stored; the rest is derived from the clock
  sprint: { name, edge: start | end } }                // kind 'sprint' only
```
Sources in grepthink2.0: TA meetings from `ApiTAMeetingSchedule` (`meeting_day`, `meeting_time`, `meeting_duration_minutes`, `meetings_per_week`, `zoom_url`, `assigned_ta`, `viewer_status` / `attendance_present|total`) expanded into dated occurrences per week; final reviews from `ApiFinalReviewSchedule` (`final_review_at`, `home_ta`, `review_ta`, `review_zoom_url`); deadlines from `ApiAssignment.due_at` (`dateUtils.assignmentDeadline`); sprint edges from `ApiScrumSprint.starts_at / ends_at` (per project); lectures, office hours and one-off meetings are new per-class tables (see `NOTES.md`). Proposed endpoint: `GET /api/schedule?from=&to=` returning this shape for the caller's lens, plus `GET /api/schedule/calendar.ics` (token URL) for "Add to your calendar".

## Model (`ScheduleModel`, pure)
`statusOf(item, now, zone)` · `isJoinable(item, now)` (`JOIN_WINDOW_MS` = 10 min) · `countdown(item, now, zone)` (`COUNTDOWN_DAYS` = 7) · `sortItems` (day → sprint → all-day → timed → TBD) · `groupByDay` → `{ key, isToday, dividers, items }` · `findOverlaps` → `Map<id, item[]>` · `nowIndex(dayItems, now)` · `nextUp` · `todayOrPeek` · `dayKey / shiftKey / weekKeys` (calendar math on `YYYY-MM-DD` keys in a zone — DST-safe) · `fmtTime / fmtTimeRange / fmtDuration / isoDuration / fmtDayLabel / fmtWeekLabel / zoneLabel / zoneDiffers / viewerZone` · `useNow(ms, fixed)`.

## Tokens
New (design-only, add to `frontend/src/styles/tokens/colors.css` on first use): `--gt-sched-ta-soft/-text`, `--gt-sched-review-soft/-text`, `--gt-sched-meeting-soft/-text`, `--gt-sched-lecture-soft/-text`, `--gt-sched-oh-soft/-text/-border`, `--gt-sched-deadline-text`, `--gt-sched-now` — all aliases of existing tokens except the purple tint (`rgba(125, 60, 152, 0.12)`, the same value the search story disc uses). Everything else reads `--gt-surface*`, `--gt-text-*`, `--gt-border*`, `--gt-primary*`, `--gt-success*`, `--gt-warning-*`, `--gt-radius-sm/md/pill`, `--gt-shadow-card`, `--gt-focus-ring(-tight)`, `--gt-transition-fast`.

## Files
`components/schedule/` — `ScheduleList`, `ScheduleItem` (+`ScheduleIcon`), `ScheduleDivider`, `ScheduleDayHeader`, `ScheduleModel` (+`SCHEDULE_KINDS`, `SCHOOL_ZONE`, `JOIN_WINDOW_MS`, `COUNTDOWN_DAYS` and the functions above), `schedule.css`, `schedule.card.html`, `scheduleData.js`, `scheduleSrcLoader.js` · `ui_kits/grepthink/schedule.html` + `ScheduleScreen.jsx` (demo bar: view home / agenda / states / phone · lens · now · zone PT / IST · data ready / loading / error) · `design_handoff_schedule/NOTES.md`.
