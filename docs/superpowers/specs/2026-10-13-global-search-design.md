# Global Search (⌘K) — Design Spec

**Date:** 2026-10-13
**Branch:** `claude/grepthink-search-bar-6d9b0c` (onto `beta`)
**Status:** Implemented on this branch; updated 2026-10-14 to match the code as built.
**Design source:** `design/design_handoff_search/{README,NOTES}.md` and
`design/components/search/*` from the "GrepThink Design System" export dated 2026-10-09
(handoff dated 2026-10-07). The export is committed as its own commit on this branch.

## Goal

Replace the header search box, which is not wired to anything (its only behavior is an
Enter-key heuristic that sends "leave class" to My Classes), with the design system's ⌘K
command palette: one search over the people, projects, tasks, stories, chats, classes and
assignments the signed-in user can already reach, ranked, paginated and keyboard-driven.

Success means:

1. ⌘K (Ctrl+K elsewhere) opens the palette on every `/app` page, including while typing in
   another field; Esc, the backdrop, or choosing a result closes it.
2. Results update on every keystroke.
3. Search never shows anything the user could not already open through the sidebar.
4. The roster invite editor keeps its own ⌘K (link panel); the palette never appears there.
5. Nothing to run on PROD: no migration, no new extension, no new database index.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Load the user's whole index once, rank in the browser** (option A) rather than a server query per keystroke or a browser→Supabase RPC. | Per-user data is tiny at course scale (~150 items for a student, ~300 for an instructor; 10–20 KB compressed). One request per palette open beats a database query per pause in typing on the free tier, and access checks stay in Python like every other endpoint. |
| 2 | **No "leave class" / "drop class" / "unenroll" handling**, so no `action` result type. | Maintainer, 2026-10-13. |
| 3 | **No team results.** | There is no teams table; a project *is* the team. Maintainer, 2026-10-13. |
| 4 | **The invite editor keeps ⌘K.** The palette hotkey ignores a chord that something else already handled. | Maintainer, 2026-10-13. The handoff's "⌘K is free" was wrong: `Roster/InviteModal.tsx` binds it on `document` for its link panel. |
| 5 | **Do not add RLS policies first.** | RLS is enabled everywhere, but policies are deliberately absent: the browser cannot read tables directly (2026-09-21 lockdown), and the backend's service role bypasses RLS. Policies would not protect this endpoint; scoping in the controller does. |
| 6 | **The backend emits each item's route (`href`).** | It knows the caller's role in each class, which decides the assignment and class routes. Precedent: the analytics attention list already emits `/app/...` links. |
| 7 | **Stories show sprint · points, not "n/m tasks done".** | Counting every story's tasks costs a third read wave; the index only loads the caller's own tasks. |
| 8 | Left for later: standardizing per-page filter inputs on the design's `SearchField`; removing `NewConversationSearch`; search analytics events; full-text search over message bodies. | Out of the brief. The handoff lists them as follow-ups. |
| 9 | **Tokens:** one new token, `--gt-z-palette: 2100`, last in the z-index block of `src/styles/tokens/spacing.css` (after `--gt-z-tooltip`). | Six legacy modals use `z-index: 2000` and the preview banner 1100; the palette must open above them. The design export lacks it; note it on the next design sync. |

## Section 1 — What the index contains

Every item is something the user can already open. The backend builds the list; the rules
below are the controller's rules.

| Type | Included (scope) | Title · context line | `href` |
|---|---|---|---|
| `person` | Everyone the caller may message: owners, TAs and students of the caller's classes, minus self — the `list_contacts` rule (`has_shared_class`). | Full name (email as fallback) · "Instructor" / "TA" / "Student" — their role in the most recently created class you share, when you share several · up to two shared class names | The existing DM `/app/messages/<conversation_id>` when the inbox has one, else `/app/messages/compose?to=<id>&name=<encoded name>` (the `MessageButton` idiom) |
| `project` | Every project in every class the caller owns or is enrolled in (what Browse Projects shows). | Name · class name · *n* members | `/app/projects/<id>` |
| `task` | Tasks where the caller is the assignee or the reporter and whose board the caller can open (member of the project, or owner/TA of its class) — nothing clears assignee/reporter when someone changes team, and the board answers 403 to non-members. Tasks of an archived story are excluded (the board lists archived stories only under Backlog). | `GT-12` + title · status · project name · tags | `/app/projects/<project_id>/board?sprint=<sprint_id>&task=<id>` when the story is in a sprint, else `/app/projects/<project_id>/board?view=backlog&task=<id>` |
| `story` | Stories where the caller is the assignee or reporter, plus the stories of the caller's tasks, and whose board the caller can open (member of the project, or owner/TA of its class) — nothing clears assignee/reporter when someone changes team, and the board answers 403 to non-members. Archived stories excluded. | `US-4` + title · sprint name · points · project name | `…/board?sprint=<sprint_id>&story=<id>`, or `…/board?view=backlog&story=<id>` for backlog stories |
| `conversation` | The caller's inbox (`messages.controller.list_inbox`): DMs and team channels, same hide rules as the Messages page. | DM: the other person's name · "Direct message". Channel: team name · "Team channel" / "TA channel" / "Instructor channel" (types `team_members` / `team_ta` / `team_instructor`) · unread badge | `/app/messages/<id>` |
| `class` | Classes the caller owns or is enrolled in (the sidebar's list). | Class name · term + year, else description | Owner: `/app/dashboard`; TA or student: `/app/home`. The client also selects the class in `ClassContext` first (see Section 3). |
| `assignment` | In classes the caller owns: every assignment, any status. In classes the caller is enrolled in (student or TA): `status = 'publish'` only — the `get_assignments_for_class` rule. | Title · "TSR" / "Feedback" / "Interest form" · "due <close_date>" · "Draft" when unpublished (owners only) | Owner: `/app/modules/tsr/<id>`, `/app/modules/feedback/<id>`, or `/app/modules` for interest forms. TA: `/app/ta-review/<id>` for TSRs, `/app/ta-review` otherwise. Student: `/app/assignments` (the class's list; the detail page needs router state — follow-up issue) |

**Role per class** (decides routes and assignment visibility): owner = `classes.created_by`
is the caller; TA = `class_enrollments.enrollment_role = 'ta'`; student = `'student'`.

**"View class as student" preview** (`usePreview().isPreviewing`): the palette hides
`assignment` and `class` items. The other types are the same for both roles. The preview is a
frontend simulation and the index is the staff member's own, so nothing else changes.

### Data contract

`GET /api/search/index` → `{ "items": SearchItem[], "generated_at": ISO-8601 }`.
Snake_case keys, like the rest of the API. Only `id`, `type`, `title`, `href` are always set.

```ts
type SearchItemType = 'person' | 'project' | 'task' | 'story' | 'conversation' | 'class' | 'assignment';

interface ApiSearchItem {
  id: string;                 // the entity's id (profile id for people, conversation id for chats)
  type: SearchItemType;
  title: string;
  href: string;               // route, computed server-side (table above)
  key?: string;               // 'GT-12' / 'US-4'; an exact key match ranks first
  subtitle?: string;          // the context line, already assembled
  keywords?: string[];        // extra match terms: a person's email; a conversation's kind
  project_id?: string;        // task, story, project, team-channel conversation
  class_id?: string;          // class (what the client selects), project, assignment
  status?: 'todo' | 'in_progress' | 'done';   // task
  tags?: string[];            // task
  points?: number;            // task, story
  sprint?: string;            // story: sprint name
  due_at?: string;            // assignment: close_date
  unread?: number;            // conversation
  last_message_at?: string;   // conversation
  same_project?: boolean;     // person: shares a project with the caller
  updated_at?: string;        // tie-break for everything else (created_at for projects and classes)
}
```

Items carry no images: the row's type disc shows initials for people and a glyph otherwise.

## Section 2 — The endpoint

New backend module `app/search/` with the usual four files; `url.py` registers
`router.get("/index")` under `/api/search`; `views.py` depends on `require_user`; the
controller holds every scoping rule above. Registered in `app/main.py`'s router loop. The
route is registered with `response_model_exclude_none=True`, so unset optional fields are
omitted rather than sent as `null`.

**Reads: two `fan_out` waves, at most 8 PostgREST calls.**

- Wave 1 (needs only the caller id):
  1. classes the caller owns, with the owner profile and every enrollment's profile embedded
     (the messages controller's `_CLASS_PEOPLE` select, extended with the class's `name,
     term, year, description` and each enrollment's `enrollment_role`);
  2. the caller's enrollments with their classes embedded the same way (`_ENROLLED_CLASS_PEOPLE`);
  3. the inbox: `list_inbox(caller_id=…)` (one RPC);
  4. the caller's tasks: `id, key, title, status, points, tags, project_id, story_id,
     updated_at` where `assignee_id = caller or reporter_id = caller`;
  5. the caller's stories: `id, key, title, points, project_id, sprint_id, updated_at,
     archived_at, sprints(name)` with the same `or` filter.
- Wave 2 (needs the class ids and story ids from wave 1):
  6. projects in those classes: `id, name, class_id, created_at, project_members(user_id)`;
  7. assignments in those classes: `id, Title, assignment_type, status, close_date, class_id`;
  8. stories of the caller's tasks that wave 1 did not return (`in_("id", missing)`), skipped
     when there are none.

Derived in Python: the caller's project memberships (from read 6's embed) give
`same_project` for people and the member counts for projects; read 6 gives task and story
project names; wave 1's class rows give every person's role and class names, and each
class's role for routing.

**Cost.** With the backend function now in `sfo1` beside the `us-west-1` database (changed
2026-10-13), a wave is one round trip of a few milliseconds per call; the whole index takes
roughly 50–100 ms. Like the other heavy reads, the route is rate-limited:
`@limiter.limit("60/minute", key_func=_search_rate_key)`, 60 requests a minute per signed-in
user. The key is the user id, which the route's `_caller` dependency stores on the request: on
Vercel every request arrives from the proxy's address, and a limit keyed by address would be one
bucket for everybody (slowapi still counts per instance there; DEPLOY.md). The client requests
the index at most once per 30 s (a forced "Try again" aside).

**Errors.** Any database failure is a 500 through the existing error handling. The client
keeps the last good index and shows the quiet error row (Section 3).

**No schema change.** Everything reads columns that exist on both Supabase projects today.

## Section 3 — The UI

### Files

```
frontend/src/features/search/
  components/CommandPalette.tsx     # dialog: input, scope chips, list, footer
  components/SearchTrigger.tsx      # header button (250 px; icon-only on phones)
  components/ResultRow.tsx          # row + ResultGroup label
  components/EntityIcon.tsx         # 28 px type disc (initials for people)
  components/Kbd.tsx                # keycap
  components/SearchPagination.tsx   # "1–8 of 37 · ‹ 1 / 5 ›"
  components/MatchText.tsx          # <mark> highlighting
  hooks/useSearchIndex.ts           # per-user index cache: items, status, refresh(force?)
  hooks/usePaletteHotkey.ts         # the ⌘K / Ctrl+K listener
  recents.ts                        # localStorage recents (read / push)
  format.ts                         # modKey, initialsOf, shortDate
  searchModel.ts                    # SEARCH_ENTITIES, rankResults, countByType, paginate (pure)
  search.scss                       # port of design/components/search/search.css
  __tests__/searchModel.test.ts
  __tests__/commandPalette.test.tsx
  __tests__/searchComponents.test.tsx   # format, MatchText, ResultRow/ResultGroup, SearchPagination, SearchTrigger
  __tests__/searchHooks.test.tsx        # usePaletteHotkey, useSearchIndex, recents
frontend/src/lib/api/search.ts      # getSearchIndex(); types in lib/api/types.ts
```

Changed: `Layout/Header.tsx` + `Header.scss`, `app/AppView.tsx`, `Roster/InviteModal.tsx` (its
two ⌘K checks compare `key.toLowerCase()`, matching the palette's, so a capital `K` is still the
invite editor's chord), `scrum/pages/ScrumBoardPage.tsx`, `lib/api.ts`, `lib/api/types.ts`,
`styles/tokens/spacing.css` (`--gt-z-palette`), `public/.well-known/grepthink-actions.json`,
`backend/app/main.py` (router loop), and one docstring line in
`backend/app/messages/controller.py` (`list_contacts` names the search people as a mirror of its
rule). Tests: `Layout/__tests__/Header.test.tsx`, `Layout/__tests__/layoutNavigation.test.tsx`
(the two new Header props), `scrum/__tests__/ScrumBoardPage.test.tsx`,
`lib/__tests__/apiFacade.test.ts` (`getSearchIndex` in the method list).

The port follows the handoff's "About the design files": BEM `.gt-*` classes, `--gt-*` tokens
only (`lint:design` stays green), `lucide-react` icons in place of the inline SVGs, typed props
from the sibling `.d.ts` files minus the dropped `team` and `action` types and the `onSearch`
async source (the index is local, so the design's `items` path is the only one). One new token,
`--gt-z-palette` (Decisions, row 9); everything else uses existing `--gt-*` tokens.

### Header and mount point

`.app-header__search-bar` (the `<input>`, `searchQuery`, `matchesLeaveClass`,
`handleSearchKeyDown`, and the SCSS block) is replaced by `<SearchTrigger onOpen={…} />` in
the same slot: a 250 × 37 px white button, card shadow, "Search" and a `⌘ K` keycap (`Ctrl K`
off Apple platforms, via `modKey()`). At ≤ 768 px, where the bar is hidden
today, it renders as the 40 px icon-only form instead. `<CommandPalette />` mounts once in
`AppView`, next to `<Settings>`, so it exists on every `/app` route; `AppView` owns the
open state and the index (`useSearchIndex`) and passes `onOpenSearch` / `onPrefetchSearch` to
the header.

### Opening and closing

- `usePaletteHotkey`: a `keydown` listener on `window`. It acts on `(metaKey || ctrlKey)
  && key.toLowerCase() === 'k'` without Shift or Alt, and only when `!event.repeat` and
  `!event.defaultPrevented`. Then it calls `preventDefault()` (Firefox would otherwise focus
  the address bar on Ctrl+K) and toggles the palette. `InviteModal`'s `document` listener runs
  first and calls `preventDefault()`, which is why the chord never reaches the palette there;
  its full-screen overlay also covers the header button. The chord works while focus is in a
  text field, as in Slack or Linear.
- Closing: Esc, handled by a capture-phase `document` listener while the dialog is mounted so
  it works wherever focus has gone (ignoring an Esc that cancels an IME composition), and
  stops the event, so a modal underneath does not close with it; the `esc` keycap; `mousedown`
  on the backdrop outside the panel; or selecting a result. Closing plays the 150 ms
  `--closing` animation, then unmounts; focus returns to the element that had it when the
  palette opened (the trigger, normally), but only if focus has fallen to `<body>`: a page a
  result opened that focused its own field keeps it. The dialog renders through a portal to
  `document.body` with `z-index: var(--gt-z-palette)` (2100), above every app layer including
  the legacy 2000 modals. Body scroll is locked while open.
- Opening resets query, scope and page; recents persist. The design's enter/exit animations
  and `prefers-reduced-motion` fallback are kept as written.

### Searching

`searchModel.ts` is the design's `SearchModel.jsx` ported except for the entity list, the
tie-breaks, a blank query scoring 0 (the design returned 50), recents keyed by `type:id`, and
no `assignedToMe` boost (every indexed task is the caller's):

- `SEARCH_ENTITIES`, in weight order: task 8, story 7, person 6, conversation 5, project 4,
  class 2, assignment 1 (`team` and `action` removed).
- Match quality (0–100): exact key 100 → exact title 95 → key prefix 90 → title prefix 85 →
  word start 75 → substring 60 → subtitle/keyword substring 40. Score = quality + weight × 0.5
  (+2 when the item is in recents). Quality leads; weight and the recents boost (≤ 5.5
  together) only reorder near-equal matches.
- Tie-breaks within a type: tasks — open before done, then newest `updated_at`; stories —
  newest `updated_at`; chats — unread first, then newest `last_message_at`; people —
  `same_project` first; everything else — newest `updated_at`.
- Scope chips (All + one per type, with counts; a chip with 0 is disabled) appear only once
  there is a query. In the All scope, group labels mark each type boundary and offer "See all
  *n*", which narrows the scope. Pages are 8 rows.
- Keyboard: ↑ ↓ wrap through the page; Home / End; PageUp / PageDown; ← → page when the caret
  is at the text's edge; Enter opens the active row; mouse movement sets the active row and a
  click opens it. One highlight serves mouse and keyboard.
- Empty query: the "Recent" group (last 8 opened items, `localStorage` key
  `gt.search.recent.<userId>`), or the "Search GrepThink" hint when there are none. Each row
  is the index's current copy of the stored item, and an item the index no longer has is left
  out, so an unread badge, a task's status or a compose link is never a stale snapshot; until
  the index has loaded (the first load, or offline), the stored copies are shown.
- No results: "No results for “q”" with the hint "Try a name, a task key like GT-12, or a
  project."
- Accessibility as designed: `role="dialog" aria-modal="true"`, the input is a `combobox`
  with `aria-activedescendant` over a `listbox` of `option`s, the pager's "p / n" is
  `aria-live="polite"`, the spinner is `role="status"`. No focus trap (Tab reaches the chips,
  pager and `esc`).

### Index cache (`useSearchIndex`)

- A module-level cache per `userId`: `{ items, fetchedAt }`. Opening the palette renders the
  cached items immediately and refetches when `fetchedAt` is older than 30 s or absent,
  keeping the old list visible while the refresh is in flight (`refetching` state: the input
  spinner). Hovering or focusing the trigger triggers the same refresh, so the first ⌘K is
  usually already loaded.
- The skeleton rows show only when there is no cached list yet. A failed fetch with a cached
  list is silent (the list stays searchable); a failed first fetch shows the error state
  "Search isn't available right now" with "Try again".
- Entries are keyed by `userId` and kept for the life of the tab. An account switch reads its
  own key, so no list carries across accounts, and with no `userId` the hook is inert.
- In-flight requests are cancelled with `AbortController` on unmount; a stale response never
  overwrites a newer one.

The dialog's own state (query, scope, page, active row) lives in the palette, which mounts per
open, so every open starts clean.

### Selecting

`onSelect(item)`: push the item to recents, then select the item's class and navigate. The
class is the item itself for `type === 'class'` and its `class_id` for an assignment (the
assignment pages read the selected class), looked up in `useClass().visibleClasses`: every
class the user has not hidden, across schools, completed ones included (a class the user hid
is only navigated to). `setSelectedClass(cls)` and `navigate(item.href)` run in one
`startTransition`, as the sidebar's class switch does: the router navigates in a transition,
so a class committed on its own would first render the current page in the new class, whose
class route guard could redirect away from the target. Then request close.

### Scrum board deep links (`ScrumBoardPage.tsx`)

- New `?story=<id>` search param, handled like `?task=`: once the board has loaded, the story
  from `allStories` (sprint stories + backlog) opens in `StoryModal`; closing the story clears
  the param. `?task=` keeps its current meaning; both set means the task wins, as today.
- Every handler that changes `task`/`story` makes one navigation through a `setParams(patch)`
  helper: React Router 7's functional `setSearchParams` updaters each receive the render's
  params, so two calls in one event would overwrite each other.
- New `?sprint=<id>`: once the default board has loaded, when the id is in `board.sprints`
  and differs from `board.sprint_id`, call `selectSprint(id)` once; then, valid or not, remove
  `?sprint=` from the URL (a `replace` navigation), so the sprint select is free to move on and
  the param cannot pull the board back. An id that is not in the list is ignored, so the
  default board stays (asking the API for it would 404, which the hook renders as a board
  error).

### Phone

The trigger is icon-only at ≤ 768 px; at ≤ 640 px the dialog becomes a sheet (the backdrop
padding is 8 px, so the panel has 8 px margins and `max-height: calc(100dvh - 16px)`), footer
hints and the per-row type labels are hidden (the disc still tells the type), and rows stay
44 px.

## Section 4 — Testing

**Backend** — `tests/test_search_index.py` on `FakeSupabase` (`relations=` for the embeds:
classes→profiles, class_enrollments→profiles/classes, projects→project_members,
user_stories→sprints). One test per scenario, asserting the returned items and the round-trip
budget together (`fake.executes <= 8`):

- a student: own tasks and stories, classmates and staff as people, class projects,
  published assignments at `/app/assignments` (the class's list), the DM `href` for a
  classmate with a conversation and the compose `href` for one without;
- a TA: assignments at `/app/ta-review/<id>` (TSR) / `/app/ta-review`, class at `/app/home`;
- an instructor: draft assignments included with "Draft", module routes, class at
  `/app/dashboard`;
- isolation: two classes, the caller in one — no person, project or assignment from the other
  appears (the inbox is the caller's own conversations, straight from the RPC); a task
  assigned to someone else never appears; an archived story is absent. A conversation the
  caller hid (with no newer message) is excluded by the inbox RPC's SQL
  (`conversation_deletes`), which `list_inbox` passes through unchanged; that is not
  re-tested against the RPC stub (backend/README.md: do not test a mock).
- the openable-board rule: a student's own task on a team they are not on, or in another
  class, is absent (t6, t7); a TA's and an instructor's own task on a team they are not on
  appears (t8, t10), one in a class they are not in does not (t9);
- the route is limited to 60 per minute per signed-in user (the registered slowapi rule and
  its key; one user's 61st request in a minute is refused while another user's still
  succeeds); it returns `generated_at` and omits null fields; a caller in no class keeps only
  their conversations, after one wave (`executes <= 5`); a class without a term shows its
  description; a class name two shared classes carry appears once in a person's subtitle.
- `tests/test_api_surface.py` already asserts that the new route needs a signed-in user.

**Frontend** (vitest + testing-library):

- `searchModel.test.ts`: exact key beats title prefix; entity weight orders equal matches;
  scope filtering and counts; pagination inserts group labels and clamps the page; recents
  boost.
- `commandPalette.test.tsx`: ⌘K opens, warms the index and a second press closes; a `keydown`
  whose `defaultPrevented` is set is ignored (the invite-editor case, modelled as in
  `designSystemPorts.test.tsx`); Esc closes from the input and from a chip; ↓ + Enter
  navigates to the row's `href`; choosing a class calls `setSelectedClass` then navigates, and
  an assignment row selects its class too; with `isPreviewing`, no assignment or class rows;
  the skeleton, the refetch spinner and the error row follow the index `status`;
  `localStorage` recents survive a close and reopen, show the index's current copy of each
  item (no stale unread badge) and leave out what it no longer has, the stored copies standing
  in until it loads; focus stays in the dialog after "See all"/"Try again", and Esc closes
  from `<body>` too; IME composition guard; no navigation during the exit animation; class
  rows select only a visible class.
- `searchComponents.test.tsx`: `modKey` falls back to Ctrl off Apple platforms; `initialsOf` /
  `shortDate`; `MatchText` marks every case-insensitive hit in one inline box; `ResultRow`
  shows a task's key, status, subtitle and at most two tags, a chat's unread badge and date,
  and a person's initials, and sets the active row on mouse move; `ResultGroup` offers "See
  all n" only for a group of more than one; `SearchPagination` disables ‹ on page 1 and
  renders nothing for an empty list; `SearchTrigger` is labelled with the platform chord,
  opens on click and prefetches on hover.
- `searchHooks.test.tsx`: `usePaletteHotkey` toggles on ⌘K and Ctrl+K and ignores a handled
  chord, key repeats, Shift/Alt and a plain `k`; `useSearchIndex` loads once on refresh,
  serves a fresh cache without a request, refetches a stale one while keeping the old list,
  runs one request at a time, reports an error only when nothing is cached, is per user, and
  aborts on unmount and restarts afterwards; it also renders an answer that settles in the
  same batch as its loading state (the two pending-state updates cancel out); recents keep the
  newest 8 per user, drop a stored entry without a type or title, and read corrupt or
  throwing storage as empty.
- `Header.test.tsx`: the trigger renders with its `⌘ K` label and no `<input>` remains;
  hovering it prefetches, clicking it opens search.
- `ScrumBoardPage.test.tsx`: `?story=` opens the story modal; `?sprint=` selects that sprint;
  closing a story clears `?story=` and leaves the view; `?sprint=` is consumed once (one board
  fetch, then the param leaves the URL); an unknown `?sprint=` is ignored; handlers that
  change both `task` and `story` make one navigation. Also: a `?sprint=` naming the sprint
  already shown, and an unknown one, leave the URL without a second fetch; closing a story
  drops a stale `?task=` too; going back from a new task to its story, and from the new-story
  editor to the created story, never commits a screen with no modal.

**Visual check:** a git-excluded `frontend/search-mock.html` + `search-mock/main.tsx` harness
renders the palette's states (results, recent, empty, loading, error, phone width) on sample
data for screenshots (see the local-UI-harness convention). The signed-in walk-through on
dev is the maintainer's.

**Gates before the PR:** `.venv/bin/ruff format --check . && .venv/bin/ruff check .`,
`.venv/bin/python -m pytest`, `npm run build`, `npx vitest run`, `npm run lint`,
`npm run lint:design`.

## Delivery

One PR onto `beta`, carrying:

1. `design/`: the 2026-10-09 design-system export (search + analytics handoffs, token sync).
2. Backend: `app/search/` + tests + `grepthink-actions.json` entry (`search_index`, GET,
   `/api/search/index`, role: any signed-in user, no params, `"rateLimit": "60/min"`).
3. Frontend: the feature folder, header and `AppView` changes, scrum deep links, `api.ts`.

No migration, no new environment variable, nothing to apply on PROD.

## Open follow-ups (not in this PR)

- Port the design's `SearchField` and move the per-page filter inputs onto it (handoff
  decision 2); then drop `NewConversationSearch` (the People scope covers it).
- Search analytics (`events.record('search_select', …)` with type, rank, query length — never
  the query text) to tune `SEARCH_ENTITIES` weights.
- Full-text search over message bodies, as a server-side query, if ever wanted.
- A profile page, so a person row has somewhere to go besides the DM.
- Open a student's assignment row on the assignment itself: `AssignmentDetail` reads the type,
  project and dates from router state, so for now the row opens the class's list
  (`/app/assignments`).
