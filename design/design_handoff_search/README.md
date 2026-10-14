# Handoff: GrepThink global search (⌘K)

**Brief:** maintainer chat, 2026-10-07 (12 points: ⌘K focus + Esc/outside close with transitions; ranked, paginated results; route jumps; entity context per row) · **Decisions, ranking rationale and open gaps:** `NOTES.md` (this folder).

## Overview
One global search over people, teams, projects, chats, classes, assignments and the signed-in user's own tasks and stories. Opens from the header trigger or ⌘K / Ctrl+K anywhere inside `/app`; closes on Esc, the `esc` keycap, a click on the scrim, or after a result is opened. Results are ranked (match quality first, then entity importance, then per-type tie-breaks), filterable by entity with scope chips, and paginated 8 per page. Every row carries a type disc, a mono key where one exists, a match-highlighted title, an entity-specific context line and a type label. Choosing a row navigates to the entity's route (`SearchModel.routeFor`).

## About the design files
Design references in HTML/JSX — intended look and behavior, not production code to copy. Recreate in grepthink2.0 (React 19 + TS + SCSS + Vite + Supabase) with its patterns: BEM SCSS, `--gt-*` custom properties, lucide-react icons, `react-router` `useNavigate`. `../components/search/*.jsx` are close to production shape (typed props in sibling `.d.ts`); `SearchModel.jsx` is pure logic and ports as `features/search/searchModel.ts`. `search.css` contains **no raw hex** (the `#7D3C98` story tint is `var(--gt-purple)`), so it passes `lint:design`.

## Fidelity
**High-fidelity** for chrome, states, motion, keyboard and copy. Throwaway: `components/search/searchData.js` (sample corpus), `ui_kits/grepthink/SearchScreen.jsx` (shell stub + Demo bar). Server-side search, the recents store and the routes marked *gap* are specified, not built.

## Requirements → design mapping
| # | Requirement | Design |
|---|---|---|
| 1 | ⌘K focuses search; Esc / outside click close; transitions | `usePaletteHotkey` toggles on ⌘K / Ctrl+K (`preventDefault`); panel enters with `gt-palette-in` (8px slide + fade, 0.2s ease-out) over a `gt-fade-in` scrim; `requestClose()` adds `--closing` (0.15s fade/slide-up) then unmounts; Esc, `esc` keycap, scrim `mousedown` outside the panel all call it. Focus → input on open, back to the trigger on close; body scroll locked while open. `prefers-reduced-motion` → 0.01ms animations. |
| 2 | Pagination; most → least important | `rankResults` → `paginate(ranked, page, 8)`; footer `SearchPagination` ("1–8 of 37 · ‹ 1 / 5 ›"); PageUp/PageDown and ←/→ at the text edge also page. Order: match quality dominates (exact key 100 → title 95 → key prefix 90 → title prefix 85 → word start 75 → substring 60 → keyword/subtitle 40); ties by entity weight **tasks → stories → people → chats → projects → teams → classes → assignments**; then per type: tasks/stories open before done, soonest due, smaller estimate; chats unread first then newest; people same team then same class; others non-archived then recently updated. `assignedToMe` +3, recently visited +2. |
| 3 | Jump to the right route | `routeFor(item, { role })` mirrors `App.tsx` — see **Routes** below; `onSelect(item, route)` → `navigate(route)`; `null` routes are the gaps listed in `NOTES.md`. |
| 4 | Entity context on every result | `EntityIcon` type disc (people = initials on green-50; team green, project blue, story purple, chat gray/blue glyph, class dark, assignment amber, task gray) + mono key + context line (`ResultRow` → `Context`) + uppercase type label on the right (becomes ↵ on the active row). Group labels at type boundaries in the All scope; scope chips show per-type counts. |

## Routes (`SearchModel.routeFor`)
| Entity | Route | Status |
|---|---|---|
| project | `/app/projects/:projectId` | exists |
| task | `/app/projects/:projectId/board?task=:taskId` | exists (`ScrumBoardPage` reads `task`) |
| story | `/app/projects/:projectId/board?view=backlog&story=:storyId` | **gap** — add a `story` param that opens the story modal |
| conversation | `/app/messages/:conversationId` | exists |
| person | `/app/messages/:conversationId` when a DM exists, else `/app/messages/compose?to=:userId` | exists (`MessageButton` idiom); no profile page — gap |
| team | `/app/projects/:projectId` (the team's project) | exists as fallback — no team route — gap |
| class | student `/app/my-classes`; staff `/app/dashboard?class=:classId` | **gap** — class selection is sidebar state, not a URL param |
| assignment | student `/app/assignments/:id`; staff `/app/modules/:kind/:id` | exists |
| action | `item.href` (e.g. "Leave class" → `/app/my-classes`) | replaces the header's `matchesLeaveClass` heuristic |

## Screens (`ui_kits/grepthink/search.html`)
- Palette open over the Home shell (256px green sidebar with a "Press ⌘K to search" tip, header with `SearchTrigger` in the old search bar's slot). Demo bar: **source** local (ranked client-side, pre-filled "roster") · async (900ms simulated RPC: loading skeleton → results; refetch keeps the previous frame with the input spinner) · error (quiet retry row); **width** desktop · phone (390px frame: icon-only trigger, full-width sheet 8px from the edges, key hints hidden, type labels hidden). The last chosen route prints in the demo bar.
- Gallery `components/search/search.card.html`: trigger + icon-only + `SearchField` md/sm/disabled; palette states (results, idle/Recent, empty, loading, error); one `ResultRow` per entity type; `ResultGroup`, `SearchPagination`, `Kbd`, `EntityIcon` set.

## Component specs (exact values from `search.css`)
- **`.gt-palette-backdrop`** — fixed inset 0, `z-index: var(--gt-z-modal)`, `padding: 12vh 16px 16px`, `background: var(--gt-scrim)`, `backdrop-filter: blur(4px)`, `gt-fade-in 0.2s`.
- **`.gt-palette`** — `max-width: 640px; max-height: min(560px, 76vh)`, white, `1px --gt-border`, radius 10, `--gt-shadow-modal`, column flex, `gt-palette-in 0.2s ease-out`; `--closing` → `gt-palette-out 0.15s ease-in forwards`.
- **`__input-row`** — 54px, padding 0 16, gap 12, 1px `--gt-border-subtle` bottom; `__search-icon` 18px tertiary; `__input` 15px primary, placeholder tertiary, `role=combobox aria-activedescendant`; `__spinner` 16px ring (2px subtle / top `--gt-primary`, 0.8s); `__esc` = `.gt-kbd` button.
- **`__scopes`** — padding 8/12, gap 6, horizontal scroll (scrollbar hidden), 1px rule; **`.gt-scope`** 26px, padding 0 10, pill, 1px subtle border, 11.5/500 secondary; hover `--gt-primary-soft` + green-200 border + green-700 text; `--active` solid `--gt-primary` + white; `__count` 10.5/600 at 75%; disabled 45%.
- **`__body`** — flex 1, min-height 120, `overflow-y: auto; overscroll-behavior: contain`, padding 4 0.
- **`.gt-result-group`** — padding 10/16/4, 10.5/600 uppercase 0.04em tertiary; `__count`; `__action` ("See all n") link-colored, `tabindex=-1`.
- **`.gt-result`** — `min-height: 44px; padding: 7px 16px 7px 12px; margin: 0 4px`, radius 7, gap 12; `[aria-selected=true]` → `--gt-info-soft` (one highlight for mouse + keyboard); `__key` mono 11/500 tertiary; `__title` 13.5/500 primary, ellipsis; `mark` = 600 + accent underline (no fill); `__context` 12px tertiary with `·` separators, scrum `.gt-tagbadge` at 16px/9.5px; `__status-dot` 7px (`--gt-gray-400` / accent / primary); `__type` 10.5/600 uppercase tertiary → hidden on the active row where `__enter` (`.gt-kbd` ↵) shows; `__badge` 18px green unread pill.
- **`.gt-entity`** — 28×28 radius 7 (`--sm` 22, radius 5), tints listed above; `--person` is a circle with 10.5/600 initials.
- **States** — `__skeleton` rows (28px disc + 10px line, 1.4s shimmer from `--gt-gray-100` → `--gt-gray-50`); `__state` centered, 32/24 padding, 13.5/600 title + 12px tertiary hint; `--error` title in secondary with an underlined "Try again" link (never a red panel).
- **`__footer`** — 40px, 1px rule, 11.5px tertiary; `__hints` (↑↓ navigate · ↵ open · esc close · ⌘K toggle); **`.gt-pagination-compact`** 24px bordered buttons, `__range`, `__page` 500 secondary.
- **`.gt-search-trigger`** — 250×37, white, `1px transparent` border, radius 7, `--gt-shadow-card`, 14/500 secondary, 18px icon, `⌘ K` keycaps right; hover `--gt-canvas`; focus-visible ring + card shadow (the header idiom); `--icon` 40×40.
- **`.gt-search-field`** — max-width 320 (`--full` none); `__input` 36px (`--sm` 32), radius 7, `1px --gt-border`, padding 0 32, 13px; hover `--gt-border-strong`; focus accent border + `--gt-focus-ring-tight`; `__icon` 15px tertiary at 10px; `__clear` 24px ghost ×.
- **`.gt-kbd`** — 20px min 20, padding 0 5, radius 4, `--gt-gray-100` + 1px subtle border, 11/500 secondary; `--on-dark` translucent white.
- Phone (≤ 640px): backdrop padding 8, panel `max-height: calc(100dvh - 16px)`, hints hidden, type labels hidden.

## Interactions & keyboard
⌘K / Ctrl+K toggle · Esc close · ↑ ↓ move (wrap) · Home / End · ↵ open active · PageUp / PageDown page · ← → page when the caret is at the text edge · Tab reaches the scope chips, pager and `esc` (no focus trap: `aria-modal` + the scrim is enough; focus returns to the trigger on close) · mouse move sets the active row; click opens · "See all n" on a group label narrows the scope · scope chips `aria-pressed`, disabled when their count is 0 · live region: the pager's "p / n" is `aria-live=polite`; the spinner is `role=status`.

## State management
`features/search/useGlobalSearch.ts`: `{ open, query, scope, page, status, results, recent }`. Debounce 250ms; one RPC per (query, scope); keep previous results while refetching; cancel stale responses (the design uses an `alive` flag — use `AbortController`). Recents: last 8 selected items in `localStorage` (`gt.search.recent.<userId>`), shown when the query is empty. Reset query/scope/page on open; keep the recents.

## Data contract
`SearchItem` (`components/search/SearchModel.d.ts`): `{ id, type, title, key?, subtitle?, email?, keywords?, projectId?, status?, dueAt?, points?, estimateHours?, tags?, assignedToMe?, sprint?, tasksDone?, tasksTotal?, unread?, lastMessageAt?, role?, sameTeam?, sameClass?, conversationId?, memberCount?, archived?, updatedAt?, term?, kind?, href? }`. Proposed RPC: `search_everything(query text, scope text, limit int)` returning that shape, scoped by RLS to the caller's classes/teams; tasks and stories limited to rows where the caller is reporter or assignee (brief: *user-scoped*). Ranking can stay client-side over the top ~100 server hits (the server orders by `similarity()`/`ts_rank`, the client re-ranks with `rankResults`).

## Tokens
No new tokens. Uses `--gt-scrim`, `--gt-z-modal`, `--gt-shadow-modal/card/pop`, `--gt-info-soft` (active row), `--gt-primary-soft/green-200/green-700` (chip hover), `--gt-purple` (story tint), `--gt-radius-sm/md/pill`, `--gt-transition-fast`, text/border tokens.

## Files
`components/search/` — `CommandPalette`, `SearchTrigger` (+`SearchField`), `ResultRow` (+`ResultGroup`), `SearchPagination`, `EntityIcon`, `MatchText`, `Kbd` (+`modKey`), `SearchModel` (+`SEARCH_ENTITIES`, `rankResults`, `countByType`, `paginate`, `routeFor`, `useDebounced`), `search.css`, `search.card.html`, `searchData.js` · `ui_kits/grepthink/search.html` + `SearchScreen.jsx` · `design_handoff_search/NOTES.md`.
