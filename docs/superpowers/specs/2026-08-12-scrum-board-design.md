# Per-Project Scrum Board — Design Spec

**Date:** 2026-08-12
**Branch:** `claude/scrum-board-design-arch-59b8ce`
**Status:** DRAFT — written in an autonomous session; the **Decisions** table below is
recommendations, not maintainer-approved choices. Flagged rows (⚑) most need review.
**Design source:** `design/design_handoff_scrum_board/README.md` + `design/components/scrum/`
(partial mirror of the "GrepThink Design System" claude.ai project, synced 2026-08-12 —
see `design/README-PARTIAL-SYNC.md`).

## Goals

A per-project scrum board for CSE 115 teams. No epics — **sprints** contain **User
Stories**, stories contain **tasks**. Requirements 1–12 from the handoff:

1. Sprints → Stories → Tasks hierarchy
2. Burnup charts per sprint + cumulative
3. Points + time estimates on stories and tasks
4. Reporter + assignee on both
5. 10 fixed task tags
6. 3 fixed columns (TODO / In Progress / Done), drag & drop, per-move audit
7. Task → PR/MR linking (GitHub + git.ucsc.edu GitLab) with cached state
8. Markdown story/task descriptions
9. Markdown comments with @mentions
10. Minimal free-tier LLM drafting (never auto-creates)
11. Project-level estimate scale (linear 1–6 / exponential 1–32 / fibonacci 1–13)
12. Backlog that doubles as the story archive

## Decisions (recommended — ⚑ = review before implementing)

| # | Question | Recommendation | Why / alternative |
|---|---|---|---|
| D1 | Where does the board mount? | Nested lazy route `/app/projects/:projectId/board` + a small tab strip on `ProjectView` (Overview · Scrum Board) | Deep-linkable, matches the repo's lazy-route-for-chart-pages idiom (`App.tsx:38-65`). Alt: in-page tabs inside the 700-line `ProjectView` — rejected (no deep links, bloats the file) |
| D2 ⚑ | Who can do what? | Team members (`project_members`): full read/write. Class instructor, class TAs (`enrollment_role='ta'`), and the assigned meeting TA: **read + comment only**. Everyone else: 404 | Staff observe/coach; mutating student boards is odd. Alt: staff get full write — one-line change in the authz helper if wanted |
| D3 | Estimate-scale storage | `projects.estimate_scale` column (additive, default `'fibonacci'`) | Requirement 11 says project-level (the handoff's own schema sketch putting `scale` on `sprints` contradicts its req 11 — the ScalePicker `.d.ts` confirms project-level). A one-field settings table is YAGNI |
| D4 ⚑ | Who can change the scale / manage sprints? | Any team member (v1) | Matches the always-visible ScalePicker in the design. Alt: restrict to `scrum master` + `ELEVATED_ROLES` — the roles exist in `project_members.role`; tighten later if teams ask |
| D5 | Key generation (US-n, GT-n) | `scrum_counters(project_id, story_seq, task_seq)` + SQL function `scrum_next_key(project_id, kind)` called via `.rpc()` | Atomic under concurrency; supabase-py has no transactions and PostgREST can't do relative updates. RPC precedent: `messages_inbox` |
| D6 | Move atomicity + audit | `POST …/move {to_status}` inserts **one** `task_moves` row; a `BEFORE INSERT` trigger fills `from_status` from the task and updates `tasks.status/moved_by/moved_at` | Single INSERT = atomic without transactions; mirrors the `bump_conversation_last_message` trigger idiom. Same-status moves are a controller no-op (no audit row) |
| D7 ⚑ | Burnup computation | Lazy daily snapshots in `sprint_burnup_days`, upserted on board GET and on scrum mutations; "today" always recomputed exactly; gaps carry forward server-side. Day bucketing in `America/Los_Angeles` | Serverless-safe (no cron: Vercel Hobby crons are daily-only and the repo has none). Completed series is derived exactly from `task_moves`; scope (sum of story points in the sprint) is the lossy part that needs snapshotting. Units per handoff: **scope = story points, completed = done-task points** — the gap between them shows estimation error, which is honest; flagging since it can read as "chart doesn't add up" |
| D8 | PR/MR state refresh | **DECIDED 2026-08-21 (maintainer): per-project repo registry.** Teams register repo URL(s) in `scrum_repos` (migration `2026-08-21_scrum_repos.sql`) with an **optional write-only access token**; state fetches use matching-repo token → env token → anonymous; tokens are service-role-only, never returned (`has_token` only). Batch refresh unchanged: 10-min staleness, `query_pool` fan-out, 3 s timeouts, ≤ 20/invocation, 10/min limiter. git.ucsc.edu reachability is future maintainer work — degrades to stored state until then | Env-token-only was the original recommendation; it remains the fallback tier |
| D9 ⚑ | Mention encoding | Markdown-link token `[@Tony Wu](mention:<user_id>)`, inserted by a composer autocomplete popover; rendered as a chip via a `components` override in the shared markdown renderer; server extracts `mention:` UUIDs after saving. **Designed as a repo-wide capability — see `docs/superpowers/plans/2026-08-13-mentions-system.md`** (generic `mention` notification type, shared frontend components, per-surface allowed-sets) | Unambiguous across renames/duplicate names, needs no new parser (react-markdown already in deps), plain typed `@word` stays plain text. Alt (a): bare `@FirstLast` name-matching like the design demo — fragile, rejected. **Note: no mention/markdown pipeline exists anywhere in the codebase — the handoff's "reuse existing semantics" premise is false; this feature creates the first one** |
| D10 | Comment scope in v1 | Schema + API support story **and** task comments; **v1 UI ships task threads** (maintainer direction 2026-08-13: "mentions are only needed for comments on tasks") — the story modal's task section carries the thread. Story-thread UI is a follow-up; `StoryOut.comment_count` stays in the payload | Task comments are where mentions matter now; story comments share the same table/API/seam so nothing is redone later |
| D11 | Realtime | None in v1. Refetch after each mutation + on window focus. RLS **enabled with no policies** (service-role-only, the `final_review_scoring` precedent) | Board is a ≤ 6-person surface. The realtime upgrade path (REPLICA IDENTITY FULL + SELECT policies + dashboard publication toggle) is documented in the migration header as a checklist |
| D12 ⚑ | CSS class names | Keep the design's `.gt-*` BEM classes verbatim (`.gt-task`, `.gt-board__col`…) in `frontend/src/features/scrum/**.scss` | 1:1 diffable against `design/components/scrum/scrum.css` → pixel fidelity for free. Deviates from the codebase's no-`gt-`-prefix BEM habit (`.messages-bubble`), but matches PORTING.md's "same class names" rule. Alt: rename to `.scrum-*` — mechanical but invites drift |
| D13 | Burnup chart tech | Port the design's tiny hand-rolled SVG `BurnupChart` (~60 lines), not recharts | The reference JSX is explicitly production-shaped; SVG classes take colors from tokens (passes `lint:design` with no ledger comments). Recharts (pie-only in repo today) buys nothing here. The handoff's "recharts for charts" line is a general codebase note, not a requirement |
| D14 | LLM provider | OpenAI-compatible `httpx` call configured by `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` env; default docs show Cloudflare Workers AI (`llama-3.1-8b-instruct`) per the handoff's free-tier research; quota = 10 drafts/user/day in a DB table + slowapi 5/min | Provider-agnostic (Groq/Gemini/OpenRouter are drop-ins). Quota must be DB-backed — slowapi is in-memory **and per-IP**, both useless across serverless invocations |
| D15 | Story deletion | Stories: archive-only (`archived_at`). Tasks: hard DELETE allowed (cascades moves/comments) | Backlog-as-archive is requirement 12; task delete covers mistakes. Alt: soft-delete tasks too — skipped, YAGNI |

## Current-state constraints (verified in codebase, 2026-08-12)

- **Authorization is 100 % in Python** — `service_client` bypasses RLS (`AGENTS.md`
  §Gotchas). Every endpoint must gate. Reusable helpers: `_require_member_role`
  (`backend/app/projects/controller.py:33`), `_is_instructor` (`:92`, already imported
  cross-module by attendance/tas), `get_enrollment_role` (`backend/app/tas/controller.py:78`).
- **No markdown or mentions exist anywhere.** Frontend renders message bodies as plain
  text; the sole `react-markdown` call is the project description (`ProjectView.tsx:443`),
  unconfigured. Backend has no parser, no mentions table. Both sides are greenfield.
- **No shared UI primitives.** No `Modal`/`Select`/`Button`/`Badge`/`ProgressBar`
  components; features hand-roll BEM markup (`ConfirmModal` is the modal idiom).
  `InitialsAvatar` (messages) and `DatePickerField` (Fields) are reusable as-is.
- **DnD precedent** is hand-rolled HTML5 in the Assign board (`StudentDropSlot.tsx`):
  bare id string on `text/plain`, `--drag-over`/`--dragging` modifier classes, shared
  `useGlobalDragEnd` hook. No dnd library in deps; no touch/keyboard support — the
  design's own mitigation (status select in the detail view) is the a11y fallback.
- **Data layer** is `useState`+`useEffect` + hand-maintained `frontend/src/lib/api.ts`
  (must add methods; AGENTS.md warns it drifts). Optimistic updates: copy the messages
  pattern (`threadReducer.ts`, temp-id → confirm/drop, monotonic `requestSeq` ref).
  `previewGuard` auto-blocks writes in "View as student" — handle its thrown error.
- **Notifications pipeline** is reusable: `notifications` table, `_insert_notification`
  (silently drops unknown types — **must add the new type to `NOTIFICATION_TYPES`**),
  best-effort per-recipient fan-out with swallow-and-log (`messages/controller.py:122`).
- **No outbound HTTP exists** (SMTP only). `httpx` is installed (listed under a
  `# Test-only` comment in `backend/requirements.txt` — move it up when it becomes a
  runtime dep). `query_pool` (`ThreadPoolExecutor(max_workers=8)`) exists for fan-out.
- **supabase-py**: sync, no transactions; RPC is the atomicity escape hatch
  (`messages_inbox` precedent). `.maybe_single()` returns `None` when no row. Always
  `str()` UUIDs. New clients must go through `_force_http1`.
- **Schema conventions**: uuid PKs `gen_random_uuid()`, `timestamptz DEFAULT now()`,
  `text` + named CHECK (not enums), `<table>_<cols>_idx` index naming, `GRANT ALL … TO
  anon, authenticated, service_role`, idempotent migrations with banner headers + spec
  link. ⚠️ `supabase/schema.sql` has drifted from migrations (missing
  `conversation_participants` etc.) — update it for the new tables anyway, per AGENTS.md.
- **Deployment reality**: production runs on **Vercel serverless** (`backend/api/index.py`);
  the in-repo `DEPLOY.md`/VM2 material is stale leftovers. Consequences: no reliable
  in-process state (slowapi counters reset per instance), request-scoped time budgets,
  and the `main.py` lifespan poller doesn't run reliably — nothing here may depend on it.
- **Roles**: global `profiles.role ∈ {instructor, student}`; class TA =
  `class_enrollments.enrollment_role='ta'`; meeting TA = `projects.assigned_ta_id`;
  project roles in `project_members.role` (`owner | product owner | scrum master |
  admin | member` — string values are inconsistent in frontend code, `'product owner'`
  vs `'scrum_master'`; trust the backend constants in `projects/controller.py:22-30`).
- **Frontend gates**: `npm run build` (tsc strict) + `npx vitest run` +
  `npm run lint:design` (fails on bare hex without a ledger comment). Backend:
  `.venv/bin/python -m pytest` (TestClient + MagicMock pattern; `fake_supabase.py`
  lacks `.rpc()`/`.upsert()`/`.or_()` — use MagicMock for this module).
- New routes must also be added to `frontend/public/.well-known/grepthink-actions.json`.

---

## Part 1 — Data model

One additive, idempotent migration: `backend/database/migrations/2026-08-12_scrum_board.sql`
(+ mirror into `supabase/schema.sql`, + staged prod copy under `migrations/prod/` at ship
time). RLS enabled, **no policies** (service-role only). All tables get the standard GRANT.

```sql
-- Scrum board: sprints → user stories → tasks, move audit, comments,
-- per-project keys, burnup snapshots, AI-draft quota.
-- Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.
-- RLS on, no policies: service-role backend only (final_review_scoring precedent).
-- Realtime upgrade checklist (NOT done in v1): REPLICA IDENTITY FULL on tasks/scrum_comments,
-- participant-scoped SELECT policies, add tables to the realtime publication in the dashboard.

-- ============ 1) project setting ============
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimate_scale text NOT NULL DEFAULT 'fibonacci';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_estimate_scale_valid;
ALTER TABLE projects ADD CONSTRAINT projects_estimate_scale_valid
  CHECK (estimate_scale IN ('linear','exponential','fibonacci'));

-- ============ 2) sprints ============
CREATE TABLE IF NOT EXISTS sprints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  starts_at  date NOT NULL,
  ends_at    date NOT NULL,
  status     text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sprints_status_valid CHECK (status IN ('planned','active','completed')),
  CONSTRAINT sprints_dates_valid  CHECK (ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, starts_at);

-- ============ 3) user_stories ============
CREATE TABLE IF NOT EXISTS user_stories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id     uuid REFERENCES sprints(id) ON DELETE SET NULL,  -- NULL ⇒ backlog
  key           text NOT NULL,                                   -- "US-3"
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points        integer CHECK (points > 0),
  time_estimate text CHECK (char_length(time_estimate) <= 20),   -- freeform "2d"
  reporter_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at   timestamptz,                                     -- set ⇒ archive view
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_stories_key_uq UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS user_stories_project_sprint_idx ON user_stories (project_id, sprint_id);

-- ============ 4) tasks ============
CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,  -- denormalized for authz + board queries
  key           text NOT NULL,                                            -- "GT-12"
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points        integer CHECK (points > 0),
  time_estimate text CHECK (char_length(time_estimate) <= 20),
  status        text NOT NULL DEFAULT 'todo',
  reporter_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tags          text[] NOT NULL DEFAULT '{}',
  pr_url        text CHECK (char_length(pr_url) <= 500),
  pr_provider   text,
  pr_state      text,
  pr_checked_at timestamptz,
  moved_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,  -- latest move, denormalized
  moved_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_key_uq          UNIQUE (project_id, key),
  CONSTRAINT tasks_status_valid    CHECK (status IN ('todo','in_progress','done')),
  CONSTRAINT tasks_provider_valid  CHECK (pr_provider IS NULL OR pr_provider IN ('github','gitlab')),
  CONSTRAINT tasks_pr_state_valid  CHECK (pr_state IS NULL OR pr_state IN ('open','merged','closed','draft')),
  CONSTRAINT tasks_tags_valid      CHECK (tags <@ ARRAY['backend','frontend','ui/ux','infra','design','research','bug','chore','optimization','docs']::text[])
);
CREATE INDEX IF NOT EXISTS tasks_story_idx          ON tasks (story_id);
CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks (project_id, status);

-- ============ 5) task_moves + apply trigger ============
CREATE TABLE IF NOT EXISTS task_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status   text NOT NULL CHECK (to_status IN ('todo','in_progress','done')),
  moved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,   -- keep audit if profile goes
  moved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_moves_task_idx ON task_moves (task_id, moved_at DESC);

-- The controller inserts ONLY (task_id, to_status, moved_by); this trigger reads the
-- task's current status into from_status and applies the move — one INSERT is atomic,
-- which stands in for the transaction supabase-py can't give us.
CREATE OR REPLACE FUNCTION scrum_apply_task_move() RETURNS trigger AS $$
BEGIN
  SELECT status INTO NEW.from_status FROM tasks WHERE id = NEW.task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task % not found', NEW.task_id; END IF;
  UPDATE tasks SET status = NEW.to_status, moved_by = NEW.moved_by,
                   moved_at = NEW.moved_at, updated_at = NEW.moved_at
   WHERE id = NEW.task_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS task_moves_apply ON task_moves;
CREATE TRIGGER task_moves_apply BEFORE INSERT ON task_moves
  FOR EACH ROW EXECUTE FUNCTION scrum_apply_task_move();

-- ============ 6) comments (story XOR task) ============
CREATE TABLE IF NOT EXISTS scrum_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   uuid REFERENCES user_stories(id) ON DELETE CASCADE,
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body_md    text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrum_comments_parent_xor CHECK (num_nonnulls(story_id, task_id) = 1)
);
CREATE INDEX IF NOT EXISTS scrum_comments_story_idx ON scrum_comments (story_id, created_at);
CREATE INDEX IF NOT EXISTS scrum_comments_task_idx  ON scrum_comments (task_id, created_at);

-- ============ 7) per-project key counters ============
CREATE TABLE IF NOT EXISTS scrum_counters (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  story_seq  integer NOT NULL DEFAULT 0,
  task_seq   integer NOT NULL DEFAULT 0
);
-- Atomic next-key via RPC (PostgREST cannot do relative updates).
CREATE OR REPLACE FUNCTION scrum_next_key(p_project_id uuid, p_kind text) RETURNS integer AS $$
DECLARE v integer;
BEGIN
  IF p_kind NOT IN ('story','task') THEN RAISE EXCEPTION 'bad kind %', p_kind; END IF;
  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  IF p_kind = 'story' THEN
    UPDATE scrum_counters SET story_seq = story_seq + 1 WHERE project_id = p_project_id RETURNING story_seq INTO v;
  ELSE
    UPDATE scrum_counters SET task_seq = task_seq + 1 WHERE project_id = p_project_id RETURNING task_seq INTO v;
  END IF;
  RETURN v;
END; $$ LANGUAGE plpgsql;

-- ============ 8) burnup snapshots ============
CREATE TABLE IF NOT EXISTS sprint_burnup_days (
  sprint_id        uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  day              date NOT NULL,          -- America/Los_Angeles calendar day
  scope_points     integer NOT NULL,
  completed_points integer NOT NULL,
  PRIMARY KEY (sprint_id, day)
);

-- ============ 9) AI-draft quota ============
CREATE TABLE IF NOT EXISTS ai_draft_usage (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_on date NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, used_on)
);
```

Plus for each table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` and
`GRANT ALL ON TABLE … TO anon, authenticated, service_role;`.

**Derived, never stored:** story rollups (`tasksDone/tasksTotal/pointsDone`), column
point sums, PR chip labels ("PR #42" / "!17" parsed from `pr_url` client-side).

## Part 2 — Backend (`backend/app/scrum/`)

New module `{__init__,url,views,controller,models}.py` + `pr_links.py` (provider
parsing/fetch) + `ai_draft.py` (LLM call + prompt) to keep `controller.py` focused.
Register in `main.py` like every other router.

### Routes (`url.py`, `prefix="/api"`, tags `["scrum"]` — attendance-style full paths)

| Method + path | View | Auth gate | Notes |
|---|---|---|---|
| `GET  /projects/{project_id}/scrum/board` | `get_board` | member or staff | `?sprint_id=` optional (default: active sprint, else latest). One-shot payload below |
| `PATCH /projects/{project_id}/scrum/settings` | `update_settings` | member | `{estimate_scale}` |
| `POST /projects/{project_id}/scrum/sprints` | `create_sprint` | member | `{name, starts_at, ends_at}` |
| `PATCH /scrum/sprints/{sprint_id}` | `update_sprint` | member (via sprint→project) | name/dates/status |
| `POST /projects/{project_id}/scrum/stories` | `create_story` | member | reporter = caller; key = `US-{rpc}`; optional `sprint_id` |
| `PATCH /scrum/stories/{story_id}` | `update_story` | member | fields + `sprint_id` (move / `null` ⇒ backlog / restore) + `archived: bool` |
| `POST /scrum/stories/{story_id}/tasks` | `create_task` | member | key = `GT-{rpc}`; `project_id` denormalized from story |
| `PATCH /scrum/tasks/{task_id}` | `update_task` | member | fields incl. `pr_url` set/clear (server parses provider, fetches state once) |
| `DELETE /scrum/tasks/{task_id}` | `delete_task` | member | 204; cascades moves/comments |
| `POST /scrum/tasks/{task_id}/move` | `move_task` | member | `{to_status}`; no-op if unchanged; returns task + audit |
| `GET  /scrum/stories/{story_id}/comments` | `list_story_comments` | member or staff | ordered `created_at ASC` |
| `POST /scrum/stories/{story_id}/comments` | `create_story_comment` | member **or staff** | staff may comment (D2); mention fan-out |
| `GET  /scrum/tasks/{task_id}/comments` / `POST` | ditto | ditto | task threads (API-complete, UI later — D10) |
| `POST /projects/{project_id}/scrum/pr-refresh` | `refresh_pr_states` | member or staff | batch, throttled by `pr_checked_at` (10 min), ≤ 20 tasks, `query_pool` fan-out, 3 s/call timeout |
| `POST /projects/{project_id}/scrum/ai-draft` | `ai_draft` | member | `@limiter.limit("5/minute")` + DB quota 10/day; `{kind: 'story'\|'tasks', prompt, story_id?}`. **Feature-gated OFF** (maintainer 2026-08-21): `AI_*` envs stay unset ⇒ `ai_enabled:false`, endpoint 503s, no v1 UI |
| `GET /projects/{project_id}/scrum/repos` | `list_repos` | member or staff | D8: registry rows as `{id, repo_url, provider, has_token}` — tokens never returned |
| `POST /projects/{project_id}/scrum/repos` | `add_repo` | member | `{repo_url, access_token?}`; host-allowlisted + normalized; re-adding a repo rotates its token |
| `DELETE /scrum/repos/{repo_id}` | `delete_repo` | member | 204 |

**Board payload** (`BoardResponse`): `{project: {id, name, estimate_scale}, ai_enabled,
sprints: [...], sprint_id, stories: [...with nested tasks...], backlog: [stories where
sprint_id is null or archived_at set], burnup: {sprint: {labels, scope, completed,
subtitle}, cumulative: {labels, scope, completed}}, members: [{user_id, name, image_url,
project_role}]}`. Default sprint = the `active` one (most recent `starts_at` if several),
else the latest by `starts_at`. Stories and tasks each carry `comment_count`
(one grouped count query), and tasks carry `moved_by_name` resolved server-side —
`moved_by` may no longer be a team member, so the `members` map can't be relied on.
Members ride along for assignee pickers + mention autocomplete (one round-trip).

### Authorization (`controller.py`)

```python
from app.projects.controller import _is_instructor, ELEVATED_ROLES  # sanctioned reuse
def _board_access(project_id, user_id) -> str:   # 'member' | 'staff'
    # member: project_members row → 'member'
    # staff:  class instructor OR enrollment_role=='ta' OR projects.assigned_ta_id → 'staff'
    # else:   404 "Project not found"  (don't leak existence — staffing precedent)
def _require_writer(project_id, user_id):        # member only (D2)
```
Every mutation resolves its entity → `project_id` first, then gates. Follow the
attendance module's docstring style: state the whole permission model at the top.

### Move + audit + burnup

`move_task`: read task (404/gate), validate `to_status`, no-op fast-path, insert
`task_moves(task_id, to_status, moved_by=caller)` — trigger does the rest — then
`_upsert_burnup_today(sprint_id)` best-effort. Audit line data comes back as
`{to, by: display_name, at}`; timestamps are ISO — the frontend renders relative time
with `date-fns` (already a dep).

`_upsert_burnup_today(sprint_id)`: scope = `SUM(points)` of non-archived stories in the
sprint; completed = `SUM(points)` of that sprint's tasks whose current status is `done`
(today's truth). Upsert `(sprint_id, today_LA)`. Called from board GET + every scrum
mutation — for **each affected sprint** (a story moved between sprints touches both its
old and new sprint) — wrapped in try/except (snapshot failure never fails the write).

`_burnup_series(sprint)`: read snapshots, exact-recompute today, carry forward gaps
across `starts_at..min(today, ends_at)`, labels = short weekday/dates. For **completed**
on past days with no snapshot, reconstruct from `task_moves` (status-as-of-day = last
move ≤ end-of-day); scope carries forward the last snapshot. Cumulative series: one
point per sprint (ordered by `starts_at`) using each sprint's final snapshot (or live
values for the current one), labels `S1…Sn`.

### PR links (`pr_links.py`)

- `parse_pr_url(url) -> (provider, ref) | None`: accepts only
  `https://github.com/{owner}/{repo}/pull/{n}` and
  `https://git.ucsc.edu/{path...}/-/merge_requests/{iid}`. Anything else → 422.
- `fetch_pr_state(provider, ref) -> state | None`: GitHub
  `GET /repos/{o}/{r}/pulls/{n}` (optional `GITHUB_TOKEN` bearer; `merged`→merged,
  `draft`→draft, else state); GitLab `GET /api/v4/projects/{urlencoded}/merge_requests/{iid}`
  (`GITLAB_UCSC_TOKEN` as `PRIVATE-TOKEN`; `state` opened→open + `draft` flag).
  `httpx.Client(timeout=3.0)`, any failure → `None` (keep stored state; if never
  fetched, store `draft` per handoff's degrade rule).
- Config additions (`config.py`, soft like SMTP — never in `validate()`):
  `GITHUB_TOKEN`, `GITLAB_UCSC_TOKEN`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- Move `httpx` above the `# Test-only` comment in `requirements.txt`.

### AI draft (`ai_draft.py`)

- Quota: read `ai_draft_usage(user, today)`; ≥ 10 → 429 with reset hint; upsert +1 after
  a successful call (benign read-modify race is acceptable for a courtesy quota — comment it).
- Call: `POST {AI_BASE_URL}/chat/completions` (OpenAI shape), `httpx` timeout 15 s,
  `response_format` JSON if supported, temperature 0.3. System prompt pins the contract:
  `{title, description_md, points, time_estimate, tasks: [{title, tags, points, time_estimate}]}`,
  tags restricted to the 10 presets, points restricted to the project's active scale
  (server re-snaps invalid values to the nearest allowed; strips unknown tags).
- Parse → pydantic `AiDraftResponse`; unparseable → 502 "Draft failed, try again".
  Unconfigured (`AI_API_KEY` empty) → 503, and the board payload carries
  `ai_enabled: false` so the UI hides the buttons.
- Vercel note: worst case ~15 s LLM call needs `maxDuration` ≥ 30 in `backend/vercel.json`
  function config (Hobby allows up to 60 s) — ship-time checklist item.

### Mentions + notifications

Owned by the standalone mentions plan (`docs/superpowers/plans/2026-08-13-mentions-system.md`):
`app/utils/mentions.py::extract_mention_ids` → intersect with project members ∪ staff
seats → drop self → per recipient, the **generic** `notify_mention(...)` wrapper (type
`mention` in `NOTIFICATION_TYPES`; `entity_type='scrum_task'|'scrum_story'`,
`entity_id=f"{project_id}:{parent_id}"` so `notificationPath()` can deep-link to
`/app/projects/{pid}/board?task={tid}`; body = 120-char preview). Best-effort loop,
messages-style. The scrum controller ships comment CRUD with a no-op `_fanout_mentions`
seam (Part 1 Task B10); mentions Tasks M1–M3 activate it.

### Models + tests

`models.py` messages-style: banner-sectioned Request/Subobject/Response classes,
`Literal` enums (`Literal['todo','in_progress','done']`), authoritative validation in
controller. Tests (`backend/tests/test_scrum_*.py`, MagicMock pattern): authz matrix
(member/staff/stranger × read/write/comment), key RPC called with right args, move
no-op vs insert, comment mention fan-out filters non-members, pr_url parser accept/
reject table, ai-draft quota 429 + snap-to-scale, burnup series carry-forward math
(pure function — factor it for testability).

## Part 3 — Frontend (`frontend/src/features/scrum/`)

```
features/scrum/
  pages/ScrumBoardPage.tsx (+ .scss, default export, lazy)   ← route target + skeleton
  components/
    ScrumBoard.tsx  TaskCard.tsx  StoryCard.tsx  TagBadge.tsx
    Chips.tsx        (PointsChip / EstimateChip / PRLinkChip / UserPair)
    BurnupChart.tsx  ScalePicker.tsx (+ PointPicker)  BacklogPanel.tsx
    StoryModal.tsx   (story detail / edit / create; task mini-rows w/ status <select>)
    CommentThread.tsx  ScrumMarkdown.tsx  MentionTextarea.tsx  AIDraftButton.tsx
    scrum.scss       (port of design/components/scrum/scrum.css — .gt-* names kept, D12)
  hooks/useScrumBoard.ts     (fetch + optimistic move/rollback + refetch-on-focus)
  utils/{rollups.ts, prLabel.ts, relativeTime.ts}   ← pure, unit-tested
  config/scrumTags.ts        (TASK_TAGS, ESTIMATE_SCALES, BOARD_COLUMNS)
  scrumTypes.ts
  __tests__/
```

Porting rules (from the design refs in `design/components/scrum/`):
- JSX ports to typed TSX with props per the sibling `.d.ts`; inline SVGs → lucide-react
  (`Clock`, `GitPullRequest`, `MessageSquare`, `Sparkles`, `RotateCcw`, `ArrowRight`,
  `Repeat` for the audit glyph), same sizes; `Avatar` → existing `InitialsAvatar`
  (size prop mapped xs→18/sm→24; pass `image_url` when we have it — reporter/assignee
  render from `members` map by `user_id`, not name strings).
- `reporter`/`assignee` props become `{user_id, name, image_url}` objects resolved from
  the board payload's `members`; `title` tooltips keep the names.
- `MarkdownText` (demo) is **replaced** by `ScrumMarkdown`: `react-markdown` +
  `components` overrides — `a` intercepts `mention:` hrefs → `.gt-mention` chip (and
  external links get `target="_blank" rel="noreferrer"`), `code` → `.gt-md__code`.
  CommonMark semantics (single newlines don't hard-break; document in the composer hint).
- `MentionTextarea` and the markdown renderer are **shared components**
  (`frontend/src/components/Mentions/`, `frontend/src/components/Markdown/`), built by
  mentions-plan Tasks M4–M5 so messages and other surfaces can adopt them later without
  refactor; the scrum CommentThread consumes them. Popover autocomplete on `@` (no
  debounce — the member list is local; `useClickOutside`), inserts `[@Name](mention:uuid)`;
  ⌘/Ctrl+Enter submits.
- DnD stays HTML5 per the reference + Assign precedent (`text/plain` id payload,
  `useGlobalDragEnd`); keyboard fallback = the status `<select>` on task rows in the modal.
- Optimistic move: apply locally, POST, reconcile with server task on success, roll back
  + surface error on failure (incl. `ReadOnlyPreviewError` → toast "read-only preview").
  Guard with a monotonic `requestSeq` like `useConversationMessages`.
- The page renders inside the existing `/app` shell (sidebar/header already exist —
  the design's own shell mock is ignored). Layout: `minmax(0,1fr) 300px` grid, gap 20.
  Right rail: sprint burnup, cumulative burnup, backlog panel. Full-height pages include
  the `bottom-clearance-for-message-widget` mixin.
- Buttons/selects/modal: scrum-local BEM per `ConfirmModal` idiom; sprint switcher is a
  styled native `<select>`; the story modal follows `ConfirmModal`'s backdrop/Esc
  behavior at 640 px with the design's paddings. "New Story" opens the same modal in
  create mode (with AIDraftButton prefill); story modal footer gets an "Archive story"
  action (design gap — needed for requirement 12; flag in review).
- `lint:design`: scrum.css is token-based except the purple accent `#7D3C98` (ui/ux tag,
  merged PR chip), which has **no repo token yet** — add `--gt-purple: #7D3C98;` to
  `frontend/src/styles/tokens/colors.css` (it's part of the design system's palette per
  the handoff) instead of scattering ledger comments. The `rgba(...)` soft fills aren't
  hex and pass the lint as-is.

Routing/integration: lazy `<Route path="projects/:projectId/board">` in `App.tsx`;
breadcrumb case in `Header.tsx` (project name via `location.state` like ProjectDetails);
tab strip on `ProjectView` (Overview | Scrum Board) — not in `routePermissions` lists;
`api.ts` gains typed `api.getScrumBoard`, `api.createSprint`, … (one method per route)
+ `ApiScrum*` types; `grepthink-actions.json` gains the new actions.

Tests: `rollups.ts` (story rollups, column sums), `prLabel.ts` ("PR #42"/"!17"),
burnup label building, `ScrumBoard` render + drop callback (fireEvent drag events),
`ScrumMarkdown` mention chip vs plain `@word`, `MentionTextarea` insert behavior.

## Part 4 — Non-functional

- **Authz matrix** (enforced in controller, tested): member = everything except nothing;
  staff = read board + read/write comments; stranger/other-class student = 404.
- **Input limits**: title 200, description 20k, comment 4k, estimate 20 chars, pr_url 500,
  tags ⊆ presets (DB CHECK + pydantic).
- **Serverless budgets**: board GET ≈ 4–6 supabase round-trips (fine); pr-refresh ≤ ~6 s;
  ai-draft ≤ 15 s + `maxDuration` bump. No in-memory state anywhere.
- **Failure isolation**: burnup snapshot, notification fan-out, and PR-state fetch are
  best-effort — they never fail the triggering write (house rule from messages).
- **Security**: no client input reaches `.or_()` filters; pr_url host-allowlisted, https
  only; markdown rendered without raw HTML (react-markdown default); mention UUIDs
  validated by regex + membership intersection; all IDs gated per request (IDOR rule).

## Part 5 — Rollout

1. Land code on a feature branch → PR onto `beta` (repo flow; direct pushes to main are
   blocked).
2. Apply `2026-08-12_scrum_board.sql` to the **dev** Supabase project via MCP on
   maintainer go-ahead; verify with the board UI against dev.
3. Stage `migrations/prod/2026-08-12_scrum_board_expand.sql` (identical; purely additive,
   safe before deploy). ⚠️ Per repo history: merging ≠ applied — prod SQL is a manual,
   verified step at merge-to-main time.
4. Provision env (Vercel project settings + `.env`): `GITHUB_TOKEN` (optional but
   recommended), `GITLAB_UCSC_TOKEN` (optional), `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`
   (feature-gated off when empty); bump `maxDuration` for the ai-draft function.
5. Update `supabase/schema.sql`, `frontend/public/.well-known/grepthink-actions.json`,
   `AGENTS.md` (module list + `/api` surface line).

## Out of scope (v1)

GitHub webhook auto-linking (`GT-12` in branch names); realtime board sync; task-level
comment **UI** (API ships); touch/dnd-kit DnD; manual card ordering (columns order by
key); assignment notifications (mentions only); per-sprint scale overrides; instructor
analytics across teams.
