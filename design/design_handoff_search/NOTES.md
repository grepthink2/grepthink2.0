# NOTES — global search (⌘K), 2026-10-07

Decisions that go beyond or depart from the chat brief, with reasons, plus the open gaps the port has to close.

## Decisions

1. **One palette, not a header dropdown.** The header's current `.app-header__search-bar` is an `<input>` whose only behavior is the "leave class" heuristic. It becomes `SearchTrigger` — a *button* with the exact same footprint (250px, white, 2.61px shadow, radius 7, 14/500) plus a `⌘ K` keycap — so the header's visual weight doesn't change, and search gets room (640px, 8 rows, scope chips) it can never have as a 250px dropdown.
2. **Local filter inputs stay; they standardize on `SearchField`.** Roster `ControlBar`, `MemberManagerModal`, `ProjectSearchBar`, `StudentsPanel`, `NonSubmittersList`, `ConversationList`, interest-form `if-slot__search` and TSRView's searchable dropdown each hand-roll an icon + input today (15/16/18/20px icons, varying radii). They filter *the list in front of the user*, which the global palette should not replace. Port them to one `SearchField` (36px, radius 7, 15px icon, 13px type, 32px/`--sm` where space is tight). `NewConversationSearch` (pencil → classmate search) is the one candidate for removal: the palette's People scope does the same job and opens the DM — keep it until the palette ships, then drop it.
3. **Ranking: match quality first, entity order second.** The brief lists entity importance (tasks by completion/estimate, then people and chats, then projects, then teams). Applying that order *before* match quality would bury an exact project-name hit under weak task matches, so entity weight only decides among equal matches; within tasks/stories: open before done, soonest `dueAt`, then smaller `estimateHours` (quick wins first — flip the sign if you prefer large work first). Weights live in `SEARCH_ENTITIES`; tune without touching the UI.
4. **Pagination over a flat ranked list (8 per page), with group labels at type boundaries.** Per-group "top 3 + See all" was considered; it hides the global order the brief asks for. The group label keeps the entity context and offers "See all n" to narrow the scope, where paging continues.
5. **Scope chips only appear once there is a query.** The idle state shows Recent (last 8 opened) — no chips, no counts to show yet.
6. **Esc always closes** (brief), even with text in the input. Alternative (first Esc clears, second closes) rejected as surprising; ⌘K re-opens with a cleared query.
7. **No focus trap.** `aria-modal` + the scrim + focus return to the trigger is the Modal family's existing behavior; trapping would break Tab to the scope chips and pager.
8. **Actions as a result type.** The header's `matchesLeaveClass` heuristic ("leave class", "drop class", "unenroll" → `/app/my-classes`) becomes an `action` item with those `keywords` — same outcome, visible as a row with an arrow disc, and extensible (Create project, Join class…).
9. **People open the DM.** There is no profile page; the person row routes to the existing conversation or `/app/messages/compose?to=` (the `MessageButton` pattern). TAs/instructors show their role in the context line so the row doesn't read as a classmate.
10. **Stories carry the user scope too** (brief: *user-scoped tasks/stories*). Only stories where the caller is reporter or an assignee of a child task are indexed; the row shows "n/m tasks done".
11. **No "Jump to page" commands** (Home, Messages…). The sidebar already does this; adding commands would double the result space. Easy to add later as more `action` items.
12. **Phone:** icon-only trigger (40px), sheet 8px from the edges, key hints hidden, type labels hidden (the disc still tells the type). Rows stay 44px.

## Open gaps (for Claude Code)

- **Search backend.** Nothing server-side exists. Proposed Postgres RPC `search_everything(query, scope, limit)` with `pg_trgm` indexes on `profiles(full_name, email)`, `projects(name)`, `teams(name)`, `tasks(key, title)`, `stories(key, title)`, `conversations(title)`, `classes(name)`, `assignments(title)`; RLS-scoped; returns the `SearchItem` shape. Supabase free tier allows `pg_trgm`; `tsvector` + `ts_rank` is the upgrade path. Return top 100, re-rank client-side with `rankResults` (keeps ranking tunable without migrations).
- **Story deep link.** `ScrumBoardPage` reads `?task=` but not `?story=`. Add `story` (opens the story modal in the backlog view).
- **Team route.** No `/app/teams/:id`; the design routes a team to its project. Decide whether a team page is wanted.
- **Class route.** Class selection is sidebar state (`selectedClass`), not URL state. The design emits `/app/dashboard?class=:id` for staff; the dashboard must read it and set the selection. Students get `/app/my-classes`.
- **Recents store.** `localStorage` per user is proposed; a `search_recents` table would sync across devices.
- **Hotkey conflicts.** ⌘K is free in the app today; check the markdown editors (scrum descriptions/comments) don't bind ⌘K for links. Only `preventDefault` when the chord is handled.
- **Student preview mode.** The palette must respect "View class as student": index as the previewed role, hide staff-only entities (assignments in `/app/modules`).
- **Analytics for search.** Log query length, chosen type and rank position (not the query text) to tune `SEARCH_ENTITIES` weights.
- **Keyboard on Windows/Linux.** `modKey()` shows Ctrl; the hotkey accepts both ⌘ and Ctrl. Verify the browser doesn't swallow Ctrl+K (Firefox focuses the address bar unless `preventDefault` runs during `keydown` — it does here).
- **Message search.** Chats are indexed by conversation title only. Full-text over message bodies is a separate feature (volume, privacy of staff ↔ student channels).
- **Empty corpus.** A brand-new student has no team/project yet: the idle hint reads "Search GrepThink …" and People still works (classmates). Verify the empty state wording with the content fundamentals before shipping.
