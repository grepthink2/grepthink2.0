# Handoff: GrepThink Scrum Board

## Overview
A simplistic scrum board for GrepThink 2.0 project teams (CSE 115A/B/C). No epics — **sprints** contain **User Stories**, stories contain **tasks**. Three fixed columns (TODO / In Progress / Done) with drag & drop and per-move auditing; burnup charts per sprint and cumulative; points + time estimates on stories and tasks with a project-level choice of estimate scale; markdown descriptions and markdown comments with @mentions; task→PR/MR linking (GitHub + git.ucsc.edu); a minimal free-tier LLM assist for drafting stories/tasks; and a backlog that doubles as the story archive.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the grepthink2.0 codebase** (React 19 + TypeScript + SCSS + Vite + Supabase, hosted on Vercel free tier) using its established patterns: BEM-style SCSS classes, `--gt-*` CSS custom properties, lucide-react icons, recharts for charts. The JSX in `../components/scrum/` is intentionally close to production shape (typed props in the sibling `.d.ts` files) — port it, don't import it.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and states are final and token-exact (see Design Tokens). Recreate pixel-perfectly with the codebase's SCSS token layer (`frontend/src/styles/`). The only demo-fidelity piece is the mini markdown renderer (`MarkdownText`) — production must reuse the codebase's existing markdown + mention semantics instead.

## Requirements → design mapping
1. **Sprints → Stories → Tasks, no epics** — sprint `Select` in the header; `StoryCard` strip; `TaskCard`s on the board carry a `storyKey` chip.
2. **Burnup per sprint + cumulative** — `BurnupChart` twice in the right rail (labels = days vs sprints).
3. **Points + time estimates on stories and tasks** — `PointsChip` (green rounded square, mono numeral) + `EstimateChip` (clock + "4h").
4. **Reporters and assignees on both** — `UserPair` (reporter avatar → arrow → assignee avatar, `title` tooltips).
5. **Task tags** — `TagBadge`, 10 fixed presets: backend, frontend, ui/ux, infra, design, research, bug, chore, optimization, docs.
6. **3 columns + DnD + move audit** — `ScrumBoard` (HTML5 drag & drop); every drop records `{to, by, at}` rendered as the dashed-top audit line on the card ("⇄ Done · Tony Wu · 2h ago").
7. **PR/MR linking** — `PRLinkChip` with state colors; integration notes below.
8. **Markdown descriptions** — story modal renders `description_md` via `MarkdownText`.
9. **Markdown comments + @mentions** — `CommentThread` with mention chips; composer hints `**bold** · \`code\` · @mention`; ⌘/Ctrl+Enter submits.
10. **Minimal LLM drafting** — `AIDraftButton` (sparkle, dashed green outline); backend notes below.
11. **Estimate scales** — `ScalePicker` (linear 1–6 · exponential 1–32 · fibonacci 1–13) + `PointPicker` chips driven by the active scale.
12. **Backlog = story archive** — `BacklogRow` list with "Move to sprint" restore.

## Screens / Views

### Scrum Board (one screen + one modal)
- **Layout:** app shell (256px green `#018156` sidebar, white 1px-bordered header) → content `padding: 20px 24px` on the `#EEEEEE` canvas. Content grid: `minmax(0,1fr) 300px`, gap 20px.
  - Left: estimate-scale row → 3-across `StoryCard` strip (gap 10) → `ScrumBoard`.
  - Right rail (300px): sprint burnup panel, cumulative burnup panel, backlog panel (white, `border 1px #DADADA`, radius 10, hairline shadow, padding 14).
- **Header:** page title 20/600, neutral badge "Grepthink 2.0 · Team 1"; right side: sprint `Select`, `AIDraftButton` ("Draft story with AI"), primary `Button` "New Story".
- **Story modal** (opens from StoryCard or TaskCard): 640px `Modal`; meta row (PointsChip, EstimateChip, UserPair, PointPicker); markdown description; child-task mini-rows (key · title · 2 tags · status Badge); "Suggest tasks" AIDraftButton; `CommentThread`.

### Component specs (exact values in `scrum.css`; highlights)
- **TaskCard** `.gt-task`: white, `border 1px #DADADA`, radius 7px, shadow `0 0 2.61px rgba(0,0,0,.25)`, padding 10×12. Key row: mono 10.5px `#424242` key + parent-story chip (mono 9.5px `#018156` on `#E6F4EF`, radius 4). Title 12.5/500 `#303030`, lh 1.4. Audit line: `border-top 1px dashed #E0E0E0`, 9.5px `#616161`.
- **StoryCard** `.gt-story`: white, border `#DADADA`, radius 10, padding 12 14 10; key mono 10.5px green; title 13/500; rollup "2/5 tasks · 3/8 pts" 10px `#616161`; 3px progress bar (`#EEEEEE` track, `#018156` fill). Active: 1px+ring `#018156`.
- **ScrumBoard** `.gt-board`: 3 equal columns, gap 16; column = `#EEEEEE`, radius 10, padding 10, min-height 220. Header: 8px status dot (`#BDBDBD` / `#2771FF` / `#018156`), 11px/600 uppercase label, white count pill, right-aligned "n pts". Drag-over: border + bg → `#2771FF` / `#EAF1FF`. Dragged card at 40% opacity; empty column shows a 1.5px-dashed drop target.
- **TagBadge** `.gt-tagbadge`: 10px/600, padding 2×8, radius 7. Pairs (bg/text): backend `#E6F4EF/#016547` · frontend `#EAF1FF/#1543A8` · ui/ux `rgba(125,60,152,.12)/#7D3C98` · infra `#303030/#FFF` · design `rgba(253,199,0,.18)/#8A6D00` · research `rgba(0,60,108,.10)/#003C6C` · bug `#FDECEA/#B91C1C` · chore `#EEEEEE/#616161` · optimization `#FEF3C7/#8A5200` · docs `#C2E5D8/#013525`.
- **PRLinkChip** `.gt-prchip`: pill, mono 10px, git-branch glyph. open `#E6F4EF/#016547` · merged `rgba(125,60,152,.12)/#7D3C98` · closed `#FDECEA/#B91C1C` · draft `#EEEEEE/#616161`.
- **BurnupChart** `.gt-burnup`: SVG, 3 horizontal gridlines `#E0E0E0`; scope = dashed 1.5px `#BDBDBD`; completed = 2px `#018156` line over `rgba(1,129,86,.10)` area; header stat "13/18 pts" with green 15px numeral; legend swatches 14×3.
- **ScalePicker / PointPicker**: option cards (name 11.5/600 capitalize + mono preview "1 · 2 · 3 · 5 · 8 · 13"); active = `#018156` border on `#E6F4EF`. Point chips 34×30, mono 12; active solid green.
- **CommentThread / MarkdownText**: 12.5px body; inline code mono 11px on `#EEEEEE`; links `#2771FF`; mention chip `#EAF1FF/#1543A8` radius 4. Composer textarea radius 7 with the standard 2px accent-blue focus ring; mono 10px hint; green "Comment" button (disabled at 45% when empty).
- **AIDraftButton** `.gt-aidraft`: ghost, **dashed** 1px `#54B999` border, green text + sparkle; hover fills `rgba(1,129,86,.08)`; loading = spinner + "Drafting…".
- **BacklogRow** `.gt-backlog-row`: dense row (padding 9×14, 1px bottom border), mono key, italic "archived Jun 12", meta chips right, outlined "Move to sprint" restore button (hover → green).

## Interactions & Behavior
- **Drag & drop:** cards are `draggable`; columns highlight on dragover; drop calls `onMove(taskId, toStatus)`. The mover's identity + timestamp become the card's audit line and a `task_moves` row (see below). Keyboard fallback: task detail should offer a status select (DnD-only is not accessible).
- **Story modal:** click StoryCard or TaskCard → modal; Esc/backdrop/× closes (`Modal` primitive).
- **Comments:** ⌘/Ctrl+Enter or button submits; empty drafts disabled. @mentions resolve against project-team members (existing codebase semantics).
- **AI draft:** click → loading state (spinner, disabled) → returned draft prefills the story/task form for human edit — never auto-creates.
- **Scale change:** switching scale only changes *offered* values (PointPicker); existing point values are untouched.
- **Transitions:** all 0.2s ease; focus-visible = 2px accent-blue ring everywhere.

## State Management
- `tasks[]` (id, keys, title, tags, points, estimate, reporter, assignee, status, pr, moved, commentCount), `stories[]`, `sprint`, `scale`, `openStory`, comment drafts. Story rollups derive from tasks — don't store them.
- **Suggested Supabase schema:**
  - `sprints(id, project_id, name, starts_at, ends_at, scale enum linear|exponential|fibonacci, status)`
  - `user_stories(id, project_id, sprint_id nullable, key, title, description_md, points, time_estimate, reporter_id, assignee_id, archived_at)` — `sprint_id IS NULL` ⇒ backlog; `archived_at` set ⇒ archive view
  - `tasks(id, story_id, key, title, description_md, points, time_estimate, status enum todo|in_progress|done, reporter_id, assignee_id, tags text[], pr_url, pr_provider, pr_state, moved_by, moved_at)`
  - `task_moves(id, task_id, from_status, to_status, moved_by, moved_at)` — full audit; latest denormalized onto `tasks`
  - `comments(id, parent_type story|task, parent_id, author_id, body_md, created_at)` — reuse existing mention pipeline
  - Burnup: completed = sum of points of `task_moves` into `done` per day (recompute on move-out); scope = sum of story points in sprint, snapshotted daily or reconstructed from story insert/update timestamps.

## Integration research (requirements 7 & 10)

### 7 — Linking tasks to PRs (GitHub + git.ucsc.edu)
- Store `pr_url` + `pr_provider` on the task; parse refs from the URL.
- **GitHub:** `GET /repos/{owner}/{repo}/pulls/{number}` → `state` + `merged`. Unauthenticated is fine at team scale (60 req/h/IP); a repo-scoped fine-grained token lifts it to 5,000/h. Optional: a webhook (pull_request events) that matches task keys like `GT-12` in branch/PR titles to auto-link and auto-update `pr_state`.
- **git.ucsc.edu (GitLab CE):** MR URLs are `/{group}/{project}/-/merge_requests/{iid}`; `GET /api/v4/projects/{url-encoded path}/merge_requests/{iid}` → `state` (opened/merged/closed) + `draft`. Needs a personal access token with `read_api`; the campus instance may sit behind SSO/VPN — **degrade gracefully**: if the API is unreachable, render the chip from the stored URL with state `draft` (gray) and keep it a plain link.
- Cache `pr_state` on the task and refresh lazily (on board load, throttled) — don't poll per card.

### 10 — Minimal LLM drafting on a free tier
- **Recommended: Cloudflare Workers AI.** Free allocation of 10,000 Neurons/day (resets 00:00 UTC) with a hard cap — usage past it is blocked, never billed, so a class project can't run up cost. Small instruct models (e.g. `@cf/meta/llama-3.1-8b-instruct` or the cheaper `llama-3.2-3b-instruct`) comfortably cover dozens–hundreds of drafts/day. REST: `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}` with a bearer token; an OpenAI-compatible `/v1/chat/completions` endpoint also exists, so the Vercel AI SDK works as a drop-in client.
- **Since the app is on Vercel free tier:** call Workers AI from a Vercel serverless route (`/api/ai/draft`) so the CF token stays server-side; no CF Worker needs to be deployed. Rate-limit per user in the route (e.g. 10 drafts/day) to protect the shared quota.
- **Drop-in alternates** (same OpenAI-shaped client, swap base URL + key): Groq free tier, Google AI Studio (Gemini Flash free tier), OpenRouter `:free` models.
- **Prompt shape:** system prompt fixes the output contract — JSON `{title, description_md, tasks: [{title, tags, points, estimate}]}` with points restricted to the project's active scale values; UI always lands the draft in an editable form.

## Design Tokens
From `../tokens/` (source of truth: `frontend/src/styles/` in the repo): brand green 500 `#018156` / hover 700 `#016547` / soft 50 `#E6F4EF`; accent blue `#2771FF`; canvas `#EEEEEE`; border `#DADADA`; text `#616161`/`#424242`/`#303030`; semantic pairs success `#018156/#E6F4EF/#016547`, warning `#B26A00/#FEF3C7/#8A5200`, error `#DC2626/#FDECEA/#B91C1C`, info `#2771FF/#EAF1FF/#1543A8`; purple accent (charts/ui-ux/merged) `#7D3C98`; gold `#FDC700` (reserved). Poppins 400–700, mono = system monospace stack, matching the codebase $mono-font (keys, previews, hints). Spacing 4/8/16/24/32/60; radii 7/10/20 + pill; shadows: card `0 0 2.61px rgba(0,0,0,.25)`, hairline `0 0 4px rgba(0,0,0,.08)`, hover `0 2px 12px rgba(0,0,0,.10)`; transitions 0.2s/0.3s ease.

## Assets
- `../assets/grepthink-logo.svg` (white via `filter: brightness(0) invert(1)` on green). Icons are inline 2px-stroke SVGs in the references — use **lucide-react** equivalents in production (clock, git-pull-request, message-square, sparkles, rotate-ccw, arrow-right).

## Files
- `scrum-board.reference.html` — the full screen (interactive DnD, modal, comments). Paths assume this folder sits at the design-system root; the always-working original is `../ui_kits/grepthink/scrum-board.html`.
- `scrum.css` — exact CSS for every scrum class (copy of `../components/scrum/scrum.css`).
- Component references (JSX + typed props + usage notes): `../components/scrum/` — TagBadge, PointsChip (+EstimateChip/PRLinkChip/UserPair), StoryCard, TaskCard, ScrumBoard, BurnupChart, ScalePicker (+PointPicker/ESTIMATE_SCALES), CommentThread (+MarkdownText), AIDraftButton, BacklogRow — each `<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md`.
- Component gallery: `../components/scrum/scrum.card.html`.
