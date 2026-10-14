# Global Search (⌘K) — Design Spec

**Date:** 2026-10-13
**Branch:** `claude/grepthink-search-bar-6d9b0c` (onto `beta`)
**Status:** APPROVED in chat by the maintainer on 2026-10-13 (sections 1–4); this file is the
written form for review before planning.
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

## Section 1 — What the index contains

Every item is something the user can already open. The backend builds the list; the rules
below are the controller's rules.

| Type | Included (scope) | Title · context line | `href` |
|---|---|---|---|
| `person` | Everyone the caller may message: owners, TAs and students of the caller's classes, minus self — the `list_contacts` rule (`has_shared_class`). | Full name (email as fallback) · "Instructor" / "TA" / "Student" — their role in the most recently created class you share, when you share several · up to two shared class names | The existing DM `/app/messages/<conversation_id>` when the inbox has one, else `/app/messages/compose?to=<id>&name=<encoded name>` (the `MessageButton` idiom) |
| `project` | Every project in every class the caller owns or is enrolled in (what Browse Projects shows). | Name · class name · *n* members | `/app/projects/<id>` |
| `task` | Tasks where the caller is the assignee or the reporter. | `GT-12` + title · status · project name · tags | `/app/projects/<project_id>/board?sprint=<sprint_id>&task=<id>` when the story is in a sprint, else `/app/projects/<project_id>/board?view=backlog&task=<id>` |
| `story` | Stories where the caller is the assignee or reporter, plus the stories of the caller's tasks; archived stories excluded. | `US-4` + title · sprint name · points · project name | `…/board?sprint=<sprint_id>&story=<id>`, or `…/board?view=backlog&story=<id>` for backlog stories |
| `conversation` | The caller's inbox (`messages.controller.list_inbox`): DMs and team channels, same hide rules as the Messages page. | DM: the other person's name · "Direct message". Channel: team name · "Team channel" / "TA channel" / "Instructor channel" (types `team_members` / `team_ta` / `team_instructor`) · unread badge | `/app/messages/<id>` |
| `class` | Classes the caller owns or is enrolled in (the sidebar's list). | Class name · term + year, else description | Owner: `/app/dashboard`; TA or student: `/app/home`. The client also selects the class in `ClassContext` first (see Section 3). |
| `assignment` | In classes the caller owns: every assignment, any status. In classes the caller is enrolled in (student or TA): `status = 'publish'` only — the `get_assignments_for_class` rule. | Title · "TSR" / "Feedback" / "Interest form" · "due <close_date>" · "Draft" when unpublished (owners only) | Owner: `/app/modules/tsr/<id>`, `/app/modules/feedback/<id>`, or `/app/modules` for interest forms. TA: `/app/ta-review/<id>` for TSRs, `/app/ta-review` otherwise. Student: `/app/assignments/<id>` |

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
  keywords?: string[];        // extra match terms: a person's email; a channel's kind
  project_id?: string;        // task, story, project
  class_id?: string;          // class (what the client selects), project, assignment
  status?: 'todo' | 'in_progress' | 'done';   // task
  tags?: string[];            // task
  points?: number;            // task, story
  sprint?: string;            // story: sprint name
  due_at?: string;            // assignment: close_date
  unread?: number;            // conversation
  last_message_at?: string;   // conversation
  same_project?: boolean;     // person: shares a project with the caller
  updated_at?: string;        // tie-break for everything else (created_at for projects)
}
```

Items carry no images: the row's type disc shows initials for people and a glyph otherwise.

## Section 2 — The endpoint

New backend module `app/search/` with the usual four files; `url.py` registers
`router.get("/index")` under `/api/search`; `views.py` depends on `require_user`; the
controller holds every scoping rule above. Registered in `app/main.py`'s router loop.

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
roughly 50–100 ms. No slowapi limit: the client requests it at most once per 30 s, and
slowapi's in-memory counters do not work on serverless anyway.

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
  components/Kbd.tsx                # keycap + modKey()
  components/SearchPagination.tsx   # "1–8 of 37 · ‹ 1 / 5 ›"
  components/MatchText.tsx          # <mark> highlighting
  hooks/useGlobalSearch.ts          # open/close state, query, scope, page, index cache, recents
  hooks/usePaletteHotkey.ts         # the ⌘K / Ctrl+K listener
  searchModel.ts                    # SEARCH_ENTITIES, rankResults, countByType, paginate (pure)
  searchTypes.ts
  search.scss                       # port of design/components/search/search.css
  __tests__/searchModel.test.ts
  __tests__/commandPalette.test.tsx
frontend/src/lib/api/search.ts      # getSearchIndex(); types in lib/api/types.ts
```

Changed: `Layout/Header.tsx` + `Header.scss`, `app/AppView.tsx`, `scrum/pages/ScrumBoardPage.tsx`,
`lib/api.ts`, `public/.well-known/grepthink-actions.json`, `Layout/__tests__/Header.test.tsx`.

The port follows the handoff's "About the design files": BEM `.gt-*` classes, `--gt-*` tokens
only (every token the CSS uses already exists in `src/styles`; `lint:design` stays green),
`lucide-react` icons in place of the inline SVGs, typed props from the sibling `.d.ts` files
minus the dropped `team` and `action` types and the `onSearch` async source (the index is
local, so the design's `items` path is the only one).

### Header and mount point

`.app-header__search-bar` (the `<input>`, `searchQuery`, `matchesLeaveClass`,
`handleSearchKeyDown`, and the SCSS block) is replaced by `<SearchTrigger onOpen={…} />` in
the same slot: a 250 × 37 px white button, card shadow, "Search" and a `⌘ K` keycap (`Ctrl K`
off Apple platforms, via `modKey()`). Below the phone breakpoint, where the bar is hidden
today, it renders as the 40 px icon-only form instead. `<CommandPalette />` mounts once in
`AppView`, next to `<Header>`, so it exists on every `/app` route; `AppView` owns the
open state through `useGlobalSearch` and passes `onOpen` to the header.

### Opening and closing

- `usePaletteHotkey`: a `keydown` listener on `window`. It acts on `(metaKey || ctrlKey)
  && key.toLowerCase() === 'k'` without Shift or Alt, and only when `!event.repeat` and
  `!event.defaultPrevented`. Then it calls `preventDefault()` (Firefox would otherwise focus
  the address bar on Ctrl+K) and toggles the palette. `InviteModal`'s `document` listener runs
  first and calls `preventDefault()`, which is why the chord never reaches the palette there;
  its full-screen overlay also covers the header button. The chord works while focus is in a
  text field, as in Slack or Linear.
- Closing: Esc (handled on the dialog element, so it works from the chips and pager too), the
  `esc` keycap, `mousedown` on the backdrop outside the panel, or selecting a result. Closing
  plays the 150 ms `--closing` animation, then unmounts; focus returns to the element that
  had it (the trigger, normally). Body scroll is locked while open.
- Opening resets query, scope and page; recents persist. The design's enter/exit animations
  and `prefers-reduced-motion` fallback are kept as written.

### Searching

`searchModel.ts` is the design's `SearchModel.jsx` ported verbatim except for the entity list
and the tie-breaks:

- `SEARCH_ENTITIES`, in weight order: task 8, story 7, person 6, conversation 5, project 4,
  class 2, assignment 1 (`team` and `action` removed).
- Match quality (0–100): exact key 100 → exact title 95 → key prefix 90 → title prefix 85 →
  word start 75 → substring 60 → subtitle/keyword substring 40. Score = quality + weight × 0.5
  (+2 when the item is in recents). Quality dominates; weight only orders equal matches.
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
  `gt.search.recent.<userId>`), or the "Search GrepThink" hint when there are none.
- No results: "No results for “q”" with the hint "Try a name, a task key like GT-12, or a
  project."
- Accessibility as designed: `role="dialog" aria-modal="true"`, the input is a `combobox`
  with `aria-activedescendant` over a `listbox` of `option`s, the pager's "p / n" is
  `aria-live="polite"`, the spinner is `role="status"`. No focus trap (Tab reaches the chips,
  pager and `esc`).

### Index cache (`useGlobalSearch`)

- A module-level cache per `userId`: `{ items, fetchedAt }`. Opening the palette renders the
  cached items immediately and refetches when `fetchedAt` is older than 30 s or absent,
  keeping the old list visible while the refresh is in flight (`refetching` state: the input
  spinner). Hovering or focusing the trigger triggers the same refresh, so the first ⌘K is
  usually already loaded.
- The skeleton rows show only when there is no cached list yet. A failed fetch with a cached
  list is silent (the list stays searchable); a failed first fetch shows the error state
  "Search isn't available right now" with "Try again".
- The cache is dropped when `userId` changes (sign-out, account switch).
- In-flight requests are cancelled with `AbortController` on unmount; a stale response never
  overwrites a newer one.

### Selecting

`onSelect(item)`: push the item to recents, then `navigate(item.href)`. For `type ===
'class'`, first `setSelectedClass(cls)` with the matching entry from `useClass().classes`
(skip the select, keep the navigate, when it is not in the list — a hidden class). Then
request close.

### Scrum board deep links (`ScrumBoardPage.tsx`)

- New `?story=<id>` search param, handled like `?task=`: once the board has loaded, the story
  from `allStories` (sprint stories + backlog) opens in `StoryModal`; closing the story clears
  the param. `?task=` keeps its current meaning; both set means the task wins, as today.
- New `?sprint=<id>`: once the default board has loaded, when the id is in `board.sprints`
  and differs from `board.sprint_id`, call `selectSprint(id)` once. The board already fetches
  by sprint id; this only lets a URL pick it. An id that is not in the list is ignored, so the
  default board stays (asking the API for it would 404, which the hook renders as a board
  error).

### Phone (≤ 640 px)

Icon-only trigger; the backdrop padding is 8 px so the panel is a sheet with 8 px margins and
`max-height: calc(100dvh - 16px)`; footer hints and the per-row type labels are hidden
(the disc still tells the type); rows stay 44 px.

## Section 4 — Testing

**Backend** — `tests/test_search_index.py` on `FakeSupabase` (`relations=` for the embeds:
classes→profiles, class_enrollments→profiles/classes, projects→project_members,
user_stories→sprints). One test per scenario, asserting the returned items and the round-trip
budget together (`fake.executes <= 8`):

- a student: own tasks and stories, classmates and staff as people, class projects,
  published assignments at `/app/assignments/<id>`, the DM `href` for a classmate with a
  conversation and the compose `href` for one without;
- a TA: assignments at `/app/ta-review/<id>` (TSR) / `/app/ta-review`, class at `/app/home`;
- an instructor: draft assignments included with "Draft", module routes, class at
  `/app/dashboard`, no tasks (none assigned);
- isolation: two classes, the caller in one — no person, project, assignment or channel from
  the other appears; a task assigned to someone else never appears; an archived story is
  absent; a conversation the caller hid (with no newer message) is absent, which the inbox
  RPC already guarantees and the fake's RPC stub must mirror.
- `tests/test_api_surface.py` already asserts that the new route needs a signed-in user.

**Frontend** (vitest + testing-library):

- `searchModel.test.ts`: exact key beats title prefix; entity weight orders equal matches;
  scope filtering and counts; pagination inserts group labels and clamps the page; recents
  boost.
- `commandPalette.test.tsx`: ⌘K and Ctrl+K open, a second press closes; a `keydown` whose
  `defaultPrevented` is set is ignored (the invite-editor case, modelled as in
  `designSystemPorts.test.tsx`); Esc closes from the input and from a chip; ↓ + Enter
  navigates to the row's `href`; choosing a class calls `setSelectedClass` then navigates;
  with `isPreviewing`, no assignment or class rows; the cached list renders before the fetch
  resolves and the error row appears when the first fetch rejects; `localStorage` recents
  survive a close and reopen.
- `Header.test.tsx`: the trigger renders with its `⌘ K` label and no `<input>` remains.
- `ScrumBoard.test.tsx`: `?story=` opens the story modal; `?sprint=` selects that sprint.

**Visual check:** a git-excluded `frontend/search-mock.html` + `search-mock/main.tsx` harness
renders the palette's states (results, recent, empty, loading, error, phone width) on sample
data for screenshots (see the local-UI-harness convention). The signed-in walk-through on
dev is the maintainer's.

**Gates before the PR:** `.venv/bin/python -m pytest`, `npm run build`, `npx vitest run`,
`npm run lint`, `npm run lint:design`.

## Delivery

One PR onto `beta`, three commits so each reviews alone:

1. `design/`: the 2026-10-09 design-system export (search + analytics handoffs, token sync).
2. Backend: `app/search/` + tests + `grepthink-actions.json` entry (`search_index`, GET,
   `/api/search/index`, role: any signed-in user, no params).
3. Frontend: the feature folder, header and `AppView` changes, scrum deep links, `api.ts`.

No migration, no new environment variable, nothing to apply on PROD.

## Open follow-ups (not in this PR)

- Port the design's `SearchField` and move the per-page filter inputs onto it (handoff
  decision 2); then drop `NewConversationSearch` (the People scope covers it).
- Search analytics (`events.record('search_select', …)` with type, rank, query length — never
  the query text) to tune `SEARCH_ENTITIES` weights.
- Full-text search over message bodies, as a server-side query, if ever wanted.
- A profile page, so a person row has somewhere to go besides the DM.
