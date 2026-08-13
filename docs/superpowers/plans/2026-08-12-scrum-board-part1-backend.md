# Scrum Board (Part 1 of 2 — Backend + API Contract) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete server side of the per-project scrum board — schema, `app/scrum` module (sprints/stories/tasks CRUD, move audit, burnup series, comments with @mention notifications, PR/MR state caching, AI drafting), plus the typed `api.ts` contract methods.

**Architecture:** One additive idempotent migration (8 tables + trigger + RPC + a `projects` column). A new `backend/app/scrum/` module in the house `{url,views,controller,models}` shape, with `pr_links.py` and `ai_draft.py` satellites for the two outbound-HTTP integrations. All authorization in Python (service role bypasses RLS): members write, class staff read+comment, everyone else 404. Atomicity without transactions via a `BEFORE INSERT` trigger on `task_moves` and a `scrum_next_key` RPC.

**Tech Stack:** FastAPI + supabase-py (service role), Postgres/Supabase, httpx (GitHub/GitLab/LLM calls), slowapi, pytest (TestClient + MagicMock).

**Spec:** `docs/superpowers/specs/2026-08-12-scrum-board-design.md` — decisions D1–D15 there govern; ⚑-flagged rows await maintainer sign-off.
**Design refs:** `design/design_handoff_scrum_board/README.md`, `design/components/scrum/`.
**Part 2** (frontend `features/scrum/`) is written after this plan executes, so its tasks reference the real response shapes; its roadmap is at the bottom of this file.

**Conventions for every task below:**
- Backend commands run from `backend/`: `.venv/bin/python -m pytest tests/<file> -v` (venv per AGENTS.md; if missing: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).
- The migration is **NOT applied by tests** (no local DB). It is applied to the **dev** Supabase project via MCP **only on maintainer go-ahead** (Task B12).
- Commit after each task. All commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Follow the newer module style throughout: typed Pydantic view returns, keyword-only controller args, `logger.exception("verb: context | key=%s", v)`, no exception text in `detail`.

---

## Task B1: Migration SQL + `supabase/schema.sql` mirror

**Files:**
- Create: `backend/database/migrations/2026-08-12_scrum_board.sql`
- Modify: `supabase/schema.sql` (append new objects)

- [ ] **Step 1: Write the migration file** with exactly the DDL from the spec Part 1 — the full file:

```sql
-- Scrum board: sprints → user stories → tasks, move audit, comments,
-- per-project keys, burnup snapshots, AI-draft quota.
-- Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.
-- RLS on, no policies: service-role backend only (final_review_scoring precedent).
-- Realtime upgrade checklist (NOT done in v1): REPLICA IDENTITY FULL on
-- tasks/scrum_comments, participant-scoped SELECT policies, add tables to the
-- realtime publication in the dashboard.

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
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sprints TO anon, authenticated, service_role;

-- ============ 3) user_stories ============
CREATE TABLE IF NOT EXISTS user_stories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id      uuid REFERENCES sprints(id) ON DELETE SET NULL,  -- NULL ⇒ backlog
  key            text NOT NULL,                                   -- "US-3"
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points         integer CHECK (points > 0),
  time_estimate  text CHECK (char_length(time_estimate) <= 20),
  reporter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at    timestamptz,                                     -- set ⇒ archive view
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_stories_key_uq UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS user_stories_project_sprint_idx ON user_stories (project_id, sprint_id);
ALTER TABLE user_stories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE user_stories TO anon, authenticated, service_role;

-- ============ 4) tasks ============
CREATE TABLE IF NOT EXISTS tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key            text NOT NULL,                                   -- "GT-12"
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points         integer CHECK (points > 0),
  time_estimate  text CHECK (char_length(time_estimate) <= 20),
  status         text NOT NULL DEFAULT 'todo',
  reporter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tags           text[] NOT NULL DEFAULT '{}',
  pr_url         text CHECK (char_length(pr_url) <= 500),
  pr_provider    text,
  pr_state       text,
  pr_checked_at  timestamptz,
  moved_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_key_uq          UNIQUE (project_id, key),
  CONSTRAINT tasks_status_valid    CHECK (status IN ('todo','in_progress','done')),
  CONSTRAINT tasks_provider_valid  CHECK (pr_provider IS NULL OR pr_provider IN ('github','gitlab')),
  CONSTRAINT tasks_pr_state_valid  CHECK (pr_state IS NULL OR pr_state IN ('open','merged','closed','draft')),
  CONSTRAINT tasks_tags_valid      CHECK (tags <@ ARRAY['backend','frontend','ui/ux','infra','design','research','bug','chore','optimization','docs']::text[])
);
CREATE INDEX IF NOT EXISTS tasks_story_idx          ON tasks (story_id);
CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks (project_id, status);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE tasks TO anon, authenticated, service_role;

-- ============ 5) task_moves + apply trigger ============
CREATE TABLE IF NOT EXISTS task_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status   text NOT NULL CHECK (to_status IN ('todo','in_progress','done')),
  moved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_moves_task_idx ON task_moves (task_id, moved_at DESC);
ALTER TABLE task_moves ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE task_moves TO anon, authenticated, service_role;

-- The controller inserts ONLY (task_id, to_status, moved_by); this trigger reads the
-- task's current status into from_status and applies the move — one INSERT is atomic,
-- standing in for the transaction supabase-py can't give us.
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
ALTER TABLE scrum_comments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_comments TO anon, authenticated, service_role;

-- ============ 7) per-project key counters + RPC ============
CREATE TABLE IF NOT EXISTS scrum_counters (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  story_seq  integer NOT NULL DEFAULT 0,
  task_seq   integer NOT NULL DEFAULT 0
);
ALTER TABLE scrum_counters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_counters TO anon, authenticated, service_role;

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
ALTER TABLE sprint_burnup_days ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sprint_burnup_days TO anon, authenticated, service_role;

-- ============ 9) AI-draft quota ============
CREATE TABLE IF NOT EXISTS ai_draft_usage (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_on date NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, used_on)
);
ALTER TABLE ai_draft_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE ai_draft_usage TO anon, authenticated, service_role;
```

- [ ] **Step 2: Mirror into `supabase/schema.sql`** — append the same objects (the CREATE TABLE / FUNCTION / TRIGGER statements plus the `projects.estimate_scale` column on the existing `projects` definition) under a banner comment `-- ===== Scrum board (2026-08-12_scrum_board.sql) =====`. Note in the banner that `schema.sql` already has known drift (missing `conversation_participants` etc.) — do not fix unrelated drift in this task.

- [ ] **Step 3: Sanity-check the SQL parses** (no DB): `python3 -c "print(open('backend/database/migrations/2026-08-12_scrum_board.sql').read().count('CREATE TABLE IF NOT EXISTS'))"` → Expected: `8` (sprints, user_stories, tasks, task_moves, scrum_comments, scrum_counters, sprint_burnup_days, ai_draft_usage).

- [ ] **Step 4: Commit**

```bash
git add backend/database/migrations/2026-08-12_scrum_board.sql supabase/schema.sql
git commit -m "feat(scrum): schema — sprints/stories/tasks/moves/comments + key RPC, burnup snapshots, AI quota"
```

---

## Task B2: Config keys, requirements fix, models, routes, registration

**Files:**
- Modify: `backend/app/config.py` (new optional env keys)
- Modify: `backend/requirements.txt` (move `httpx` above the `# Test-only` comment)
- Create: `backend/app/scrum/__init__.py` (empty)
- Create: `backend/app/scrum/models.py`
- Create: `backend/app/scrum/url.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_scrum_endpoints.py` (auth smoke)

- [ ] **Step 1: Add env keys to `Settings`** in `backend/app/config.py`, next to the SMTP block, with the same soft-config doc style (NOT added to `validate()`):

```python
    # --- Scrum board integrations (all optional; features degrade when unset) ---
    # PR/MR state: GITHUB_TOKEN lifts api.github.com to 5k req/h (Vercel egress IPs
    # share the anonymous 60/h pool); GITLAB_UCSC_TOKEN is a git.ucsc.edu PAT with
    # read_api. AI drafting: OpenAI-compatible endpoint — e.g. Cloudflare Workers AI
    #   AI_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1
    #   AI_MODEL=@cf/meta/llama-3.1-8b-instruct
    # Empty AI_API_KEY disables drafting (board payload sends ai_enabled=false).
    GITHUB_TOKEN: str = os.environ.get("GITHUB_TOKEN", "")
    GITLAB_UCSC_TOKEN: str = os.environ.get("GITLAB_UCSC_TOKEN", "")
    AI_BASE_URL: str = os.environ.get("AI_BASE_URL", "")
    AI_API_KEY: str = os.environ.get("AI_API_KEY", "")
    AI_MODEL: str = os.environ.get("AI_MODEL", "@cf/meta/llama-3.1-8b-instruct")
```

- [ ] **Step 2: `requirements.txt`** — move the `httpx` line above the `# Test-only` comment (it is already a runtime dep of `app/database/client.py`; scrum makes it first-class).

- [ ] **Step 3: Write `backend/app/scrum/models.py`** (the full API contract):

```python
"""Pydantic models for the scrum board feature.

Char limits mirror the DB CHECKs; authorization and cross-row validation are
authoritative in the controller — Pydantic here is a fast pre-flight.
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

BoardStatus = Literal["todo", "in_progress", "done"]
EstimateScale = Literal["linear", "exponential", "fibonacci"]
TASK_TAGS = ("backend", "frontend", "ui/ux", "infra", "design", "research",
             "bug", "chore", "optimization", "docs")
ESTIMATE_SCALES: dict[str, list[int]] = {
    "linear": [1, 2, 3, 4, 5, 6],
    "exponential": [1, 2, 4, 8, 16, 32],
    "fibonacci": [1, 2, 3, 5, 8, 13],
}

# ----- Requests -----

class UpdateSettingsRequest(BaseModel):
    estimate_scale: EstimateScale

class CreateSprintRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    starts_at: date
    ends_at: date

class UpdateSprintRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    starts_at: Optional[date] = None
    ends_at: Optional[date] = None
    status: Optional[Literal["planned", "active", "completed"]] = None

class CreateStoryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description_md: Optional[str] = Field(None, max_length=20000)
    points: Optional[int] = Field(None, gt=0)
    time_estimate: Optional[str] = Field(None, max_length=20)
    assignee_id: Optional[str] = None
    sprint_id: Optional[str] = None

class UpdateStoryRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description_md: Optional[str] = Field(None, max_length=20000)
    points: Optional[int] = Field(None, gt=0)
    time_estimate: Optional[str] = Field(None, max_length=20)
    assignee_id: Optional[str] = None
    sprint_id: Optional[str] = None      # explicit null in JSON ⇒ move to backlog
    archived: Optional[bool] = None      # True sets archived_at, False clears it

class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description_md: Optional[str] = Field(None, max_length=20000)
    points: Optional[int] = Field(None, gt=0)
    time_estimate: Optional[str] = Field(None, max_length=20)
    assignee_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

class UpdateTaskRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description_md: Optional[str] = Field(None, max_length=20000)
    points: Optional[int] = Field(None, gt=0)
    time_estimate: Optional[str] = Field(None, max_length=20)
    assignee_id: Optional[str] = None
    tags: Optional[list[str]] = None
    pr_url: Optional[str] = Field(None, max_length=500)  # explicit null ⇒ unlink

class MoveTaskRequest(BaseModel):
    to_status: BoardStatus

class CreateCommentRequest(BaseModel):
    body_md: str = Field(..., min_length=1, max_length=4000)

class AiDraftRequest(BaseModel):
    kind: Literal["story", "tasks"]
    prompt: str = Field(..., min_length=1, max_length=2000)
    story_id: Optional[str] = None       # context for kind='tasks'

# ----- Subobjects -----

class ScrumMember(BaseModel):
    user_id: str
    name: str
    image_url: Optional[str] = None
    project_role: Optional[str] = None

class SprintOut(BaseModel):
    id: str
    name: str
    starts_at: date
    ends_at: date
    status: str

class TaskOut(BaseModel):
    id: str
    story_id: str
    key: str
    title: str
    description_md: Optional[str] = None
    points: Optional[int] = None
    time_estimate: Optional[str] = None
    status: BoardStatus
    reporter_id: str
    assignee_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    pr_url: Optional[str] = None
    pr_provider: Optional[str] = None
    pr_state: Optional[str] = None
    moved_by: Optional[str] = None
    moved_by_name: Optional[str] = None
    moved_at: Optional[str] = None
    comment_count: int = 0

class StoryOut(BaseModel):
    id: str
    sprint_id: Optional[str] = None
    key: str
    title: str
    description_md: Optional[str] = None
    points: Optional[int] = None
    time_estimate: Optional[str] = None
    reporter_id: str
    assignee_id: Optional[str] = None
    archived_at: Optional[str] = None
    comment_count: int = 0
    tasks: list[TaskOut] = Field(default_factory=list)

class BurnupSeries(BaseModel):
    labels: list[str]
    scope: list[int]
    completed: list[int]
    subtitle: Optional[str] = None

class CommentOut(BaseModel):
    id: str
    author_id: str
    author_name: str
    body_md: str
    created_at: str

class AiDraftTask(BaseModel):
    title: str
    tags: list[str] = Field(default_factory=list)
    points: Optional[int] = None
    time_estimate: Optional[str] = None

class AiDraft(BaseModel):
    title: Optional[str] = None
    description_md: Optional[str] = None
    points: Optional[int] = None
    time_estimate: Optional[str] = None
    tasks: list[AiDraftTask] = Field(default_factory=list)

# ----- Responses -----

class BoardProject(BaseModel):
    id: str
    name: str
    estimate_scale: EstimateScale

class BurnupOut(BaseModel):
    sprint: Optional[BurnupSeries] = None
    cumulative: BurnupSeries

class BoardResponse(BaseModel):
    project: BoardProject
    ai_enabled: bool
    sprints: list[SprintOut]
    sprint_id: Optional[str] = None
    stories: list[StoryOut]
    backlog: list[StoryOut]
    burnup: BurnupOut
    members: list[ScrumMember]
    access: Literal["member", "staff"]

class SprintResponse(BaseModel):
    message: str
    sprint: SprintOut

class StoryResponse(BaseModel):
    message: str
    story: StoryOut

class TaskResponse(BaseModel):
    message: str
    task: TaskOut

class CommentsListResponse(BaseModel):
    comments: list[CommentOut]

class CommentResponse(BaseModel):
    message: str
    comment: CommentOut

class PrRefreshResponse(BaseModel):
    updated: dict[str, str]   # task_id -> new pr_state

class AiDraftResponse(BaseModel):
    draft: AiDraft
```

- [ ] **Step 4: Write `backend/app/scrum/url.py`**:

```python
"""Routes for the scrum board feature.

Full paths under /api (attendance-style): board routes hang off
/projects/{project_id}/scrum/..., entity routes off /scrum/...
"""
from fastapi import APIRouter

from app.scrum import views

router = APIRouter(prefix="/api", tags=["scrum"])

router.get('/projects/{project_id}/scrum/board')(views.get_board)
router.patch('/projects/{project_id}/scrum/settings')(views.update_settings)
router.post('/projects/{project_id}/scrum/sprints')(views.create_sprint)
router.patch('/scrum/sprints/{sprint_id}')(views.update_sprint)
router.post('/projects/{project_id}/scrum/stories')(views.create_story)
router.patch('/scrum/stories/{story_id}')(views.update_story)
router.post('/scrum/stories/{story_id}/tasks')(views.create_task)
router.patch('/scrum/tasks/{task_id}')(views.update_task)
router.delete('/scrum/tasks/{task_id}')(views.delete_task)
router.post('/scrum/tasks/{task_id}/move')(views.move_task)
router.get('/scrum/stories/{story_id}/comments')(views.list_story_comments)
router.post('/scrum/stories/{story_id}/comments')(views.create_story_comment)
router.get('/scrum/tasks/{task_id}/comments')(views.list_task_comments)
router.post('/scrum/tasks/{task_id}/comments')(views.create_task_comment)
router.post('/projects/{project_id}/scrum/pr-refresh')(views.refresh_pr_states)
router.post('/projects/{project_id}/scrum/ai-draft')(views.ai_draft)
```

- [ ] **Step 5: Create a minimal `backend/app/scrum/views.py` stub** so the router imports (every view raises 501 for now; Tasks B4–B10 replace them one group at a time — this file is fully rewritten by the end):

```python
"""Request/response layer for the scrum board feature (filled in by Tasks B4-B10)."""
from fastapi import Depends, HTTPException

from app.dependencies import require_user


def _todo(*_args, **_kwargs):
    raise HTTPException(status_code=501, detail="Not implemented")

def get_board(project_id: str, user_id: str = Depends(require_user)): _todo()
def update_settings(project_id: str, user_id: str = Depends(require_user)): _todo()
def create_sprint(project_id: str, user_id: str = Depends(require_user)): _todo()
def update_sprint(sprint_id: str, user_id: str = Depends(require_user)): _todo()
def create_story(project_id: str, user_id: str = Depends(require_user)): _todo()
def update_story(story_id: str, user_id: str = Depends(require_user)): _todo()
def create_task(story_id: str, user_id: str = Depends(require_user)): _todo()
def update_task(task_id: str, user_id: str = Depends(require_user)): _todo()
def delete_task(task_id: str, user_id: str = Depends(require_user)): _todo()
def move_task(task_id: str, user_id: str = Depends(require_user)): _todo()
def list_story_comments(story_id: str, user_id: str = Depends(require_user)): _todo()
def create_story_comment(story_id: str, user_id: str = Depends(require_user)): _todo()
def list_task_comments(task_id: str, user_id: str = Depends(require_user)): _todo()
def create_task_comment(task_id: str, user_id: str = Depends(require_user)): _todo()
def refresh_pr_states(project_id: str, user_id: str = Depends(require_user)): _todo()
def ai_draft(project_id: str, user_id: str = Depends(require_user)): _todo()
```

- [ ] **Step 6: Register in `backend/app/main.py`** — add to the router import block:

```python
from app.scrum.url import router as scrum_router
```
and after the last `app.include_router(...)`:
```python
app.include_router(scrum_router)
```

- [ ] **Step 7: Write the failing-then-passing smoke test** `backend/tests/test_scrum_endpoints.py`:

```python
"""Route registration + auth smoke tests for the scrum module."""


def test_board_requires_auth(client):
    res = client.get("/api/projects/00000000-0000-0000-0000-000000000001/scrum/board")
    assert res.status_code == 401


def test_board_rejects_bad_token(client):
    res = client.get(
        "/api/projects/00000000-0000-0000-0000-000000000001/scrum/board",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert res.status_code == 401


def test_move_route_exists(client, auth_header):
    res = client.post(
        "/api/scrum/tasks/00000000-0000-0000-0000-000000000002/move",
        headers=auth_header, json={"to_status": "done"},
    )
    assert res.status_code == 501  # stub until Task B6
```

- [ ] **Step 8: Run** `.venv/bin/python -m pytest tests/test_scrum_endpoints.py -v` → Expected: 3 passed.

- [ ] **Step 9: Commit**

```bash
git add backend/app/config.py backend/requirements.txt backend/app/scrum backend/app/main.py backend/tests/test_scrum_endpoints.py
git commit -m "feat(scrum): module skeleton — models, routes, config keys"
```

---

## Task B3: Authorization helpers

**Files:**
- Create: `backend/app/scrum/controller.py` (started here, grown through B10)
- Test: `backend/tests/test_scrum_authz.py`

- [ ] **Step 1: Write the failing tests** `backend/tests/test_scrum_authz.py`:

```python
"""Authorization matrix for the scrum board: member / staff / stranger."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


def _client_with(member_rows, project_row):
    client = MagicMock()
    members_q = MagicMock()
    members_q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=member_rows)
    projects_q = MagicMock()
    maybe = MagicMock()
    maybe.data = project_row
    projects_q.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = maybe if project_row else None
    client.table.side_effect = lambda name: {"project_members": members_q, "projects": projects_q}[name]
    return client


@patch("app.scrum.controller._client")
def test_member_gets_member(mock_client):
    from app.scrum.controller import _board_access
    mock_client.return_value = _client_with([{"id": "m1"}], None)
    assert _board_access(project_id=PID, user_id=UID) == "member"


@patch("app.scrum.controller.get_enrollment_role", return_value=None)
@patch("app.scrum.controller._is_instructor", return_value=True)
@patch("app.scrum.controller._client")
def test_class_instructor_gets_staff(mock_client, _inst, _enr):
    from app.scrum.controller import _board_access
    mock_client.return_value = _client_with([], {"id": PID, "class_id": "c1", "assigned_ta_id": None})
    assert _board_access(project_id=PID, user_id=UID) == "staff"


@patch("app.scrum.controller.get_enrollment_role", return_value=None)
@patch("app.scrum.controller._is_instructor", return_value=False)
@patch("app.scrum.controller._client")
def test_stranger_gets_404(mock_client, _inst, _enr):
    from app.scrum.controller import _board_access
    mock_client.return_value = _client_with([], {"id": PID, "class_id": "c1", "assigned_ta_id": None})
    with pytest.raises(HTTPException) as e:
        _board_access(project_id=PID, user_id=UID)
    assert e.value.status_code == 404


@patch("app.scrum.controller._board_access", return_value="staff")
def test_writer_rejects_staff(_access):
    from app.scrum.controller import _require_writer
    with pytest.raises(HTTPException) as e:
        _require_writer(project_id=PID, user_id=UID)
    assert e.value.status_code == 403
```

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_scrum_authz.py -v` → Expected: FAIL (`No module named app.scrum.controller` / attribute errors).

- [ ] **Step 3: Start `backend/app/scrum/controller.py`** with the permission model documented up top (attendance style):

```python
"""Business logic for the scrum board.

Permission model (RLS is on with no policies; everything is enforced here):
  * Team members (project_members row)                -> full read/write ("member").
  * Class instructor (classes.created_by), class TAs
    (enrollment_role='ta'), assigned meeting TA
    (projects.assigned_ta_id)                          -> board read + comments ("staff").
  * Everyone else                                      -> 404 (don't leak existence).
Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md (D2, D4).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone, date

from fastapi import HTTPException

from app.database.client import service_client
# Sanctioned cross-module reuse (attendance/tas do the same):
from app.projects.controller import _is_instructor
from app.tas.controller import get_enrollment_role
from app.scrum.models import ESTIMATE_SCALES, TASK_TAGS

logger = logging.getLogger(__name__)

LA_UTC_OFFSET_HOURS = 8  # see _today_la()


def _client():
    if service_client is None:
        raise HTTPException(status_code=503, detail="Service unavailable")
    return service_client


def _board_access(*, project_id: str, user_id: str) -> str:
    """Return 'member' or 'staff'; raise 404 for everyone else."""
    client = _client()
    member = (client.table("project_members").select("id")
              .eq("project_id", str(project_id)).eq("user_id", str(user_id))
              .limit(1).execute())
    if member.data:
        return "member"
    proj_res = (client.table("projects").select("id, class_id, assigned_ta_id")
                .eq("id", str(project_id)).maybe_single().execute())
    proj = proj_res.data if proj_res else None
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(proj.get("assigned_ta_id") or "") == str(user_id):
        return "staff"
    if _is_instructor(user_id, proj["class_id"]):
        return "staff"
    if get_enrollment_role(client, proj["class_id"], user_id) == "ta":
        return "staff"
    raise HTTPException(status_code=404, detail="Project not found")


def _require_writer(*, project_id: str, user_id: str) -> None:
    if _board_access(project_id=project_id, user_id=user_id) != "member":
        raise HTTPException(status_code=403, detail="Only team members can modify the board")


def _today_la() -> date:
    """Calendar day in America/Los_Angeles (fixed -8h: a DST-hour drift in a burnup
    day bucket is acceptable; avoids a zoneinfo dependency on the serverless image)."""
    return (datetime.now(timezone.utc) - timedelta(hours=LA_UTC_OFFSET_HOURS)).date()
```

- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_scrum_authz.py -v` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/scrum/controller.py backend/tests/test_scrum_authz.py
git commit -m "feat(scrum): authz — member/staff/404 gates"
```

---

## Task B4: Settings + sprint CRUD

**Files:**
- Modify: `backend/app/scrum/controller.py`
- Modify: `backend/app/scrum/views.py` (replace the four stubs)
- Test: `backend/tests/test_scrum_sprints.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_sprints.py`:

```python
"""Settings + sprint CRUD."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_settings_writes_scale(mock_client, _writer):
    from app.scrum.controller import update_settings
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": PID}])
    update_settings(project_id=PID, user_id=UID, estimate_scale="linear")
    client.table.assert_called_with("projects")
    client.table.return_value.update.assert_called_with({"estimate_scale": "linear"})


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_create_sprint_returns_row(mock_client, _writer):
    from app.scrum.controller import create_sprint
    client = MagicMock()
    mock_client.return_value = client
    row = {"id": "s1", "name": "Sprint 1", "starts_at": "2026-08-17",
           "ends_at": "2026-08-30", "status": "planned"}
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[row])
    out = create_sprint(project_id=PID, user_id=UID,
                        name="Sprint 1", starts_at="2026-08-17", ends_at="2026-08-30")
    assert out["id"] == "s1"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_sprint_404_when_missing(mock_client, _writer):
    from app.scrum.controller import update_sprint
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
    with pytest.raises(HTTPException) as e:
        update_sprint(sprint_id="s-missing", user_id=UID, fields={"status": "active"})
    assert e.value.status_code == 404
```

- [ ] **Step 2: Run** → Expected: FAIL (functions missing).

- [ ] **Step 3: Add to `controller.py`**:

```python
def update_settings(*, project_id: str, user_id: str, estimate_scale: str) -> None:
    _require_writer(project_id=project_id, user_id=user_id)
    if estimate_scale not in ESTIMATE_SCALES:
        raise HTTPException(status_code=422, detail="Unknown estimate scale")
    client = _client()
    res = client.table("projects").update({"estimate_scale": estimate_scale}).eq("id", str(project_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")


def create_sprint(*, project_id: str, user_id: str, name: str, starts_at, ends_at) -> dict:
    _require_writer(project_id=project_id, user_id=user_id)
    client = _client()
    res = client.table("sprints").insert({
        "project_id": str(project_id), "name": name,
        "starts_at": str(starts_at), "ends_at": str(ends_at),
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create sprint")
    return res.data[0]


def _get_sprint_or_404(client, sprint_id: str) -> dict:
    res = (client.table("sprints").select("id, project_id, name, starts_at, ends_at, status")
           .eq("id", str(sprint_id)).maybe_single().execute())
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return row


def update_sprint(*, sprint_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    sprint = _get_sprint_or_404(client, sprint_id)
    _require_writer(project_id=sprint["project_id"], user_id=user_id)
    allowed = {k: (str(v) if k in ("starts_at", "ends_at") else v)
               for k, v in fields.items()
               if k in ("name", "starts_at", "ends_at", "status") and v is not None}
    if not allowed:
        return sprint
    res = client.table("sprints").update(allowed).eq("id", str(sprint_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update sprint")
    return res.data[0]
```

- [ ] **Step 4: Replace the four stubs in `views.py`** (keep the rest of the stub file):

```python
from fastapi import Depends, HTTPException, Response, status

from app.dependencies import require_user
from app.scrum import controller
from app.scrum.models import (CreateSprintRequest, SprintOut, SprintResponse,
                              UpdateSettingsRequest, UpdateSprintRequest)


def update_settings(project_id: str, body: UpdateSettingsRequest,
                    user_id: str = Depends(require_user)) -> Response:
    controller.update_settings(project_id=project_id, user_id=user_id,
                               estimate_scale=body.estimate_scale)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def create_sprint(project_id: str, body: CreateSprintRequest,
                  user_id: str = Depends(require_user)) -> SprintResponse:
    row = controller.create_sprint(project_id=project_id, user_id=user_id,
                                   name=body.name, starts_at=body.starts_at, ends_at=body.ends_at)
    return SprintResponse(message="Sprint created successfully", sprint=SprintOut(**{
        k: row[k] for k in ("id", "name", "starts_at", "ends_at", "status")}))


def update_sprint(sprint_id: str, body: UpdateSprintRequest,
                  user_id: str = Depends(require_user)) -> SprintResponse:
    row = controller.update_sprint(sprint_id=sprint_id, user_id=user_id,
                                   fields=body.model_dump(exclude_unset=True))
    return SprintResponse(message="Sprint updated successfully", sprint=SprintOut(**{
        k: row[k] for k in ("id", "name", "starts_at", "ends_at", "status")}))
```

- [ ] **Step 5: Run** `.venv/bin/python -m pytest tests/test_scrum_sprints.py tests/test_scrum_endpoints.py -v` → Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/scrum backend/tests/test_scrum_sprints.py
git commit -m "feat(scrum): settings + sprint CRUD"
```

---

## Task B5: Story + task CRUD with generated keys

**Files:**
- Modify: `backend/app/scrum/controller.py`, `backend/app/scrum/views.py`
- Test: `backend/tests/test_scrum_stories_tasks.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_stories_tasks.py`:

```python
"""Story/task creation (key RPC), updates, task delete, tag validation."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_create_story_uses_key_rpc(mock_client, _writer):
    from app.scrum.controller import create_story
    client = MagicMock()
    mock_client.return_value = client
    client.rpc.return_value.execute.return_value = MagicMock(data=7)
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "st1", "key": "US-7"}])
    out = create_story(project_id=PID, user_id=UID, fields={"title": "Login flow"})
    client.rpc.assert_called_with("scrum_next_key", {"p_project_id": PID, "p_kind": "story"})
    assert out["key"] == "US-7"
    inserted = client.table.return_value.insert.call_args.args[0]
    assert inserted["reporter_id"] == UID and inserted["key"] == "US-7"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_create_task_rejects_bad_tag(mock_client, _writer):
    from app.scrum.controller import create_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "st1", "project_id": PID})
    with pytest.raises(HTTPException) as e:
        create_task(story_id="st1", user_id=UID, fields={"title": "x", "tags": ["yolo"]})
    assert e.value.status_code == 422


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_update_story_archive_sets_timestamp(mock_client, _writer):
    from app.scrum.controller import update_story
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "st1", "project_id": PID, "sprint_id": "s1"})
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "st1", "archived_at": "2026-08-12T00:00:00Z"}])
    update_story(story_id="st1", user_id=UID, fields={"archived": True})
    payload = client.table.return_value.update.call_args.args[0]
    assert payload["archived_at"] is not None and "archived" not in payload
```

- [ ] **Step 2: Run** → Expected: FAIL.

- [ ] **Step 3: Add to `controller.py`**:

```python
def _next_key(client, project_id: str, kind: str) -> str:
    res = client.rpc("scrum_next_key", {"p_project_id": str(project_id), "p_kind": kind}).execute()
    n = res.data if isinstance(res.data, int) else (res.data or [{}])[0]
    if not isinstance(n, int):
        raise HTTPException(status_code=500, detail="Failed to allocate key")
    return f"{'US' if kind == 'story' else 'GT'}-{n}"


def _validate_tags(tags: list[str]) -> None:
    bad = [t for t in tags if t not in TASK_TAGS]
    if bad:
        raise HTTPException(status_code=422, detail="Unknown tag")


def _get_story_or_404(client, story_id: str) -> dict:
    res = (client.table("user_stories").select("*")
           .eq("id", str(story_id)).maybe_single().execute())
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail="Story not found")
    return row


def _get_task_or_404(client, task_id: str) -> dict:
    res = (client.table("tasks").select("*")
           .eq("id", str(task_id)).maybe_single().execute())
    row = res.data if res else None
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


def create_story(*, project_id: str, user_id: str, fields: dict) -> dict:
    _require_writer(project_id=project_id, user_id=user_id)
    client = _client()
    key = _next_key(client, project_id, "story")
    row = {"project_id": str(project_id), "key": key, "reporter_id": str(user_id)}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "sprint_id"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("user_stories").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create story")
    story = res.data[0]
    if story.get("sprint_id"):
        _snapshot_burnup_safe(story["sprint_id"])
    return story


def update_story(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    story = _get_story_or_404(client, story_id)
    _require_writer(project_id=story["project_id"], user_id=user_id)
    payload: dict = {}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id"):
        if k in fields:
            payload[k] = fields[k]
    if "sprint_id" in fields:
        payload["sprint_id"] = fields["sprint_id"]      # None ⇒ backlog
    if "archived" in fields and fields["archived"] is not None:
        payload["archived_at"] = datetime.now(timezone.utc).isoformat() if fields["archived"] else None
    if not payload:
        return story
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = client.table("user_stories").update(payload).eq("id", str(story_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update story")
    for sid in {story.get("sprint_id"), res.data[0].get("sprint_id")}:
        if sid:
            _snapshot_burnup_safe(sid)
    return res.data[0]


def create_task(*, story_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    story = _get_story_or_404(client, story_id)
    _require_writer(project_id=story["project_id"], user_id=user_id)
    _validate_tags(fields.get("tags") or [])
    key = _next_key(client, story["project_id"], "task")
    row = {"story_id": str(story_id), "project_id": str(story["project_id"]),
           "key": key, "reporter_id": str(user_id)}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "tags"):
        if fields.get(k) is not None:
            row[k] = fields[k]
    res = client.table("tasks").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create task")
    if story.get("sprint_id"):
        _snapshot_burnup_safe(story["sprint_id"])
    return res.data[0]


def update_task(*, task_id: str, user_id: str, fields: dict) -> dict:
    client = _client()
    task = _get_task_or_404(client, task_id)
    _require_writer(project_id=task["project_id"], user_id=user_id)
    if fields.get("tags") is not None:
        _validate_tags(fields["tags"])
    payload: dict = {}
    for k in ("title", "description_md", "points", "time_estimate", "assignee_id", "tags"):
        if k in fields:
            payload[k] = fields[k]
    if "pr_url" in fields:
        payload.update(_pr_fields(fields["pr_url"]))    # Task B9; stub below until then
    if not payload:
        return task
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = client.table("tasks").update(payload).eq("id", str(task_id)).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update task")
    return res.data[0]


def _pr_fields(pr_url):
    """Replaced in Task B9 with real parsing + a state fetch."""
    if pr_url is None:
        return {"pr_url": None, "pr_provider": None, "pr_state": None, "pr_checked_at": None}
    raise HTTPException(status_code=422, detail="PR linking lands in Task B9")


def delete_task(*, task_id: str, user_id: str) -> None:
    client = _client()
    task = _get_task_or_404(client, task_id)
    _require_writer(project_id=task["project_id"], user_id=user_id)
    client.table("tasks").delete().eq("id", str(task_id)).execute()


def _snapshot_burnup_safe(sprint_id: str) -> None:
    """Replaced in Task B7. Best-effort no-op until then."""
    return None
```

- [ ] **Step 4: Replace the story/task stubs in `views.py`** (imports grow accordingly):

```python
def create_story(project_id: str, body: CreateStoryRequest,
                 user_id: str = Depends(require_user)) -> StoryResponse:
    row = controller.create_story(project_id=project_id, user_id=user_id,
                                  fields=body.model_dump(exclude_unset=True))
    return StoryResponse(message="Story created successfully", story=_story_out(row))


def update_story(story_id: str, body: UpdateStoryRequest,
                 user_id: str = Depends(require_user)) -> StoryResponse:
    row = controller.update_story(story_id=story_id, user_id=user_id,
                                  fields=body.model_dump(exclude_unset=True))
    return StoryResponse(message="Story updated successfully", story=_story_out(row))


def create_task(story_id: str, body: CreateTaskRequest,
                user_id: str = Depends(require_user)) -> TaskResponse:
    row = controller.create_task(story_id=story_id, user_id=user_id,
                                 fields=body.model_dump(exclude_unset=True))
    return TaskResponse(message="Task created successfully", task=_task_out(row))


def update_task(task_id: str, body: UpdateTaskRequest,
                user_id: str = Depends(require_user)) -> TaskResponse:
    row = controller.update_task(task_id=task_id, user_id=user_id,
                                 fields=body.model_dump(exclude_unset=True))
    return TaskResponse(message="Task updated successfully", task=_task_out(row))


def delete_task(task_id: str, user_id: str = Depends(require_user)) -> Response:
    controller.delete_task(task_id=task_id, user_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```
with two local shapers used by every task/story response (place above the views):
```python
def _task_out(row: dict) -> TaskOut:
    return TaskOut(**{k: row.get(k) for k in TaskOut.model_fields if k in row} |
                   {"comment_count": row.get("comment_count", 0)})


def _story_out(row: dict) -> StoryOut:
    return StoryOut(**{k: row.get(k) for k in StoryOut.model_fields if k in row} |
                    {"comment_count": row.get("comment_count", 0),
                     "tasks": [_task_out(t) for t in row.get("tasks", [])]})
```

- [ ] **Step 5: Run** `.venv/bin/python -m pytest tests/test_scrum_stories_tasks.py -v` → Expected: 3 passed. Then the full module: `.venv/bin/python -m pytest tests/ -k scrum -v` → all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/scrum backend/tests/test_scrum_stories_tasks.py
git commit -m "feat(scrum): story/task CRUD with US-n/GT-n key RPC"
```

---

## Task B6: Move endpoint (audit via trigger)

**Files:**
- Modify: `backend/app/scrum/controller.py`, `backend/app/scrum/views.py`
- Test: `backend/tests/test_scrum_moves.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_moves.py`:

```python
"""Move endpoint: single task_moves INSERT (trigger applies), no-op fast path."""
from unittest.mock import MagicMock, patch

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"
TASK = {"id": "t1", "project_id": PID, "status": "todo", "story_id": "st1"}


@patch("app.scrum.controller._snapshot_burnup_safe")
@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_move_inserts_single_move_row(mock_client, _w, _snap):
    from app.scrum.controller import move_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=dict(TASK))
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "mv1", "from_status": "todo", "to_status": "done", "moved_at": "2026-08-12T01:00:00Z"}])
    out = move_task(task_id="t1", user_id=UID, to_status="done")
    inserted = client.table.return_value.insert.call_args.args[0]
    assert inserted == {"task_id": "t1", "to_status": "done", "moved_by": UID}
    assert out["task"]["status"] == "done" and out["move"]["from_status"] == "todo"


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_move_same_status_is_noop(mock_client, _w):
    from app.scrum.controller import move_task
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=dict(TASK))
    out = move_task(task_id="t1", user_id=UID, to_status="todo")
    client.table.return_value.insert.assert_not_called()
    assert out["move"] is None
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Add to `controller.py`**:

```python
def move_task(*, task_id: str, user_id: str, to_status: str) -> dict:
    if to_status not in ("todo", "in_progress", "done"):
        raise HTTPException(status_code=422, detail="Unknown status")
    client = _client()
    task = _get_task_or_404(client, task_id)
    _require_writer(project_id=task["project_id"], user_id=user_id)
    if task["status"] == to_status:
        return {"task": task, "move": None}
    res = client.table("task_moves").insert(
        {"task_id": str(task_id), "to_status": to_status, "moved_by": str(user_id)}
    ).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to move task")
    move = res.data[0]
    task = {**task, "status": to_status, "moved_by": str(user_id), "moved_at": move["moved_at"]}
    story = _get_story_or_404(client, task["story_id"])
    if story.get("sprint_id"):
        _snapshot_burnup_safe(story["sprint_id"])
    return {"task": task, "move": move}
```

- [ ] **Step 4: Replace the `move_task` stub in `views.py`**:

```python
def move_task(task_id: str, body: MoveTaskRequest,
              user_id: str = Depends(require_user)) -> TaskResponse:
    out = controller.move_task(task_id=task_id, user_id=user_id, to_status=body.to_status)
    return TaskResponse(message="Task moved successfully", task=_task_out(out["task"]))
```

- [ ] **Step 5: Run** `.venv/bin/python -m pytest tests/ -k scrum -v` → all pass. **Commit:**

```bash
git add backend/app/scrum backend/tests/test_scrum_moves.py
git commit -m "feat(scrum): task move — single audited INSERT, trigger applies status"
```

---

## Task B7: Burnup series (pure math + snapshot upsert)

**Files:**
- Create: `backend/app/scrum/burnup.py` (pure functions — unit-testable without mocks)
- Modify: `backend/app/scrum/controller.py` (real `_snapshot_burnup_safe`, series assembly)
- Test: `backend/tests/test_scrum_burnup.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_burnup.py`:

```python
"""Pure burnup-series math: carry-forward, today override, cumulative build."""
from datetime import date

from app.scrum.burnup import build_sprint_series, build_cumulative_series


def test_carry_forward_fills_gaps_and_today_overrides():
    snaps = [{"day": "2026-08-10", "scope_points": 10, "completed_points": 2}]
    out = build_sprint_series(
        snapshots=snaps, starts_at=date(2026, 8, 10), ends_at=date(2026, 8, 14),
        today=date(2026, 8, 12), live_scope=13, live_completed=5)
    assert out["labels"] == ["8/10", "8/11", "8/12", "8/13", "8/14"]
    assert out["scope"] == [10, 10, 13]        # truncated at today
    assert out["completed"] == [2, 2, 5]


def test_series_empty_before_start():
    out = build_sprint_series(snapshots=[], starts_at=date(2026, 9, 1),
                              ends_at=date(2026, 9, 5), today=date(2026, 8, 12),
                              live_scope=8, live_completed=0)
    assert out["scope"] == [] and out["labels"] == ["9/1", "9/2", "9/3", "9/4", "9/5"]


def test_cumulative_one_point_per_sprint():
    sprints = [
        {"id": "s1", "name": "Sprint 1", "final": {"scope_points": 10, "completed_points": 9}},
        {"id": "s2", "name": "Sprint 2", "final": {"scope_points": 8, "completed_points": 3}},
    ]
    out = build_cumulative_series(sprints)
    assert out["labels"] == ["S1", "S2"]
    assert out["scope"] == [10, 18] and out["completed"] == [9, 12]
```

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: Write `backend/app/scrum/burnup.py`**:

```python
"""Pure burnup-series math (no I/O — the controller feeds it rows).

Semantics (spec D7): scope = sum of story points in the sprint; completed = sum of
points of the sprint's DONE tasks. Past days come from sprint_burnup_days snapshots
with gaps carried forward; today is always the live recomputation. Labels cover the
whole sprint; value arrays stop at today (the chart draws the remainder as empty).
"""
from __future__ import annotations

from datetime import date, timedelta


def _label(d: date) -> str:
    return f"{d.month}/{d.day}"


def build_sprint_series(*, snapshots: list[dict], starts_at: date, ends_at: date,
                        today: date, live_scope: int, live_completed: int) -> dict:
    labels = []
    d = starts_at
    while d <= ends_at:
        labels.append(_label(d))
        d += timedelta(days=1)

    by_day = {str(s["day"]): s for s in snapshots}
    scope: list[int] = []
    completed: list[int] = []
    last_scope, last_completed = 0, 0
    d = starts_at
    while d <= min(today, ends_at):
        snap = by_day.get(d.isoformat())
        if snap:
            last_scope, last_completed = snap["scope_points"], snap["completed_points"]
        if d == today:
            last_scope, last_completed = live_scope, live_completed
        scope.append(last_scope)
        completed.append(last_completed)
        d += timedelta(days=1)
    return {"labels": labels, "scope": scope, "completed": completed}


def build_cumulative_series(sprints: list[dict]) -> dict:
    labels, scope, completed = [], [], []
    total_scope = total_done = 0
    for i, s in enumerate(sprints, start=1):
        final = s.get("final") or {"scope_points": 0, "completed_points": 0}
        total_scope += final["scope_points"]
        total_done += final["completed_points"]
        labels.append(f"S{i}")
        scope.append(total_scope)
        completed.append(total_done)
    return {"labels": labels, "scope": scope, "completed": completed}
```

- [ ] **Step 4: Replace `_snapshot_burnup_safe` in `controller.py`** with the real one, plus the live-totals helper both it and the board use:

```python
def _live_burnup_totals(client, sprint_id: str) -> tuple[int, int]:
    stories = (client.table("user_stories").select("id, points")
               .eq("sprint_id", str(sprint_id)).is_("archived_at", "null").execute())
    story_rows = stories.data or []
    scope = sum(s["points"] or 0 for s in story_rows)
    completed = 0
    ids = [s["id"] for s in story_rows]
    if ids:
        tasks = (client.table("tasks").select("points, status")
                 .in_("story_id", ids).eq("status", "done").execute())
        completed = sum(t["points"] or 0 for t in (tasks.data or []))
    return scope, completed


def _snapshot_burnup_safe(sprint_id: str) -> None:
    """Best-effort daily snapshot; never fails the triggering write."""
    try:
        client = _client()
        scope, completed = _live_burnup_totals(client, sprint_id)
        client.table("sprint_burnup_days").upsert(
            {"sprint_id": str(sprint_id), "day": _today_la().isoformat(),
             "scope_points": scope, "completed_points": completed},
            on_conflict="sprint_id,day").execute()
    except Exception:
        logger.exception("scrum: burnup snapshot failed | sprint=%s", sprint_id)
```

- [ ] **Step 5: Run** `.venv/bin/python -m pytest tests/test_scrum_burnup.py -v` → 3 passed; then `-k scrum` → all pass. **Commit:**

```bash
git add backend/app/scrum/burnup.py backend/app/scrum/controller.py backend/tests/test_scrum_burnup.py
git commit -m "feat(scrum): burnup — pure series math + lazy daily snapshots"
```

---

## Task B8: Board GET (aggregate payload)

**Files:**
- Modify: `backend/app/scrum/controller.py`, `backend/app/scrum/views.py`
- Test: `backend/tests/test_scrum_board.py`

- [ ] **Step 1: Failing test** `backend/tests/test_scrum_board.py` (endpoint altitude — controller mocked at the view boundary, messages-endpoints style):

```python
"""Board GET shape via TestClient with the controller mocked."""
from unittest.mock import patch

BOARD = {
    "project": {"id": "p1", "name": "GrepThink 2.0", "estimate_scale": "fibonacci"},
    "ai_enabled": False,
    "sprints": [{"id": "s1", "name": "Sprint 1", "starts_at": "2026-08-10",
                 "ends_at": "2026-08-23", "status": "active"}],
    "sprint_id": "s1",
    "stories": [], "backlog": [],
    "burnup": {"sprint": {"labels": [], "scope": [], "completed": [], "subtitle": None},
               "cumulative": {"labels": ["S1"], "scope": [0], "completed": [0], "subtitle": None}},
    "members": [], "access": "member",
}


@patch("app.scrum.views.controller.get_board", return_value=BOARD)
def test_get_board_shape(_get, client, auth_header):
    res = client.get("/api/projects/p1/scrum/board", headers=auth_header)
    assert res.status_code == 200
    body = res.json()
    assert body["project"]["estimate_scale"] == "fibonacci"
    assert body["access"] == "member" and body["ai_enabled"] is False
```

- [ ] **Step 2: Run** → FAIL (view still a stub).

- [ ] **Step 3: Add `get_board` to `controller.py`**:

```python
def _display_name(profile: dict | None) -> str:
    if not profile:
        return "Unknown"
    name = f"{profile.get('first_name') or ''} {profile.get('last_name') or ''}".strip()
    return name or (profile.get("email") or "Unknown")


def get_board(*, project_id: str, user_id: str, sprint_id: str | None) -> dict:
    access = _board_access(project_id=project_id, user_id=user_id)
    client = _client()
    proj = (client.table("projects").select("id, name, estimate_scale")
            .eq("id", str(project_id)).maybe_single().execute())
    project = proj.data if proj else None
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sprints = (client.table("sprints").select("id, name, starts_at, ends_at, status")
               .eq("project_id", str(project_id)).order("starts_at").execute()).data or []

    selected = None
    if sprint_id:
        selected = next((s for s in sprints if s["id"] == str(sprint_id)), None)
        if not selected:
            raise HTTPException(status_code=404, detail="Sprint not found")
    else:
        active = [s for s in sprints if s["status"] == "active"]
        selected = (sorted(active, key=lambda s: s["starts_at"])[-1] if active
                    else (sprints[-1] if sprints else None))

    all_stories = (client.table("user_stories").select("*")
                   .eq("project_id", str(project_id)).order("created_at").execute()).data or []
    story_ids = [s["id"] for s in all_stories]
    tasks = []
    if story_ids:
        tasks = (client.table("tasks").select("*")
                 .in_("story_id", story_ids).order("created_at").execute()).data or []

    comments = []
    if story_ids:
        comments = (client.table("scrum_comments").select("story_id, task_id")
                    .in_("story_id", story_ids).execute()).data or []
        task_ids = [t["id"] for t in tasks]
        if task_ids:
            comments += (client.table("scrum_comments").select("story_id, task_id")
                         .in_("task_id", task_ids).execute()).data or []
    story_counts: dict[str, int] = {}
    task_counts: dict[str, int] = {}
    for c in comments:
        if c.get("story_id"):
            story_counts[c["story_id"]] = story_counts.get(c["story_id"], 0) + 1
        if c.get("task_id"):
            task_counts[c["task_id"]] = task_counts.get(c["task_id"], 0) + 1

    member_rows = (client.table("project_members").select("user_id, role")
                   .eq("project_id", str(project_id)).execute()).data or []
    profile_ids = ({m["user_id"] for m in member_rows}
                   | {t["moved_by"] for t in tasks if t.get("moved_by")})
    profiles: dict[str, dict] = {}
    if profile_ids:
        rows = (client.table("profiles").select("id, first_name, last_name, email, image_url")
                .in_("id", list(profile_ids)).execute()).data or []
        profiles = {r["id"]: r for r in rows}
    members = [{"user_id": m["user_id"], "name": _display_name(profiles.get(m["user_id"])),
                "image_url": (profiles.get(m["user_id"]) or {}).get("image_url"),
                "project_role": m.get("role")} for m in member_rows]

    tasks_by_story: dict[str, list] = {}
    for t in tasks:
        t["comment_count"] = task_counts.get(t["id"], 0)
        t["moved_by_name"] = _display_name(profiles.get(t["moved_by"])) if t.get("moved_by") else None
        tasks_by_story.setdefault(t["story_id"], []).append(t)
    for s in all_stories:
        s["comment_count"] = story_counts.get(s["id"], 0)
        s["tasks"] = tasks_by_story.get(s["id"], [])

    sel_id = selected["id"] if selected else None
    stories = [s for s in all_stories
               if s.get("sprint_id") == sel_id and not s.get("archived_at")] if sel_id else []
    backlog = [s for s in all_stories if s.get("sprint_id") is None or s.get("archived_at")]

    from datetime import date as _date
    sprint_series = None
    if selected:
        _snapshot_burnup_safe(selected["id"])
        snaps = (client.table("sprint_burnup_days").select("day, scope_points, completed_points")
                 .eq("sprint_id", selected["id"]).order("day").execute()).data or []
        live_scope, live_completed = _live_burnup_totals(client, selected["id"])
        from app.scrum.burnup import build_sprint_series
        sprint_series = build_sprint_series(
            snapshots=snaps, starts_at=_date.fromisoformat(str(selected["starts_at"])),
            ends_at=_date.fromisoformat(str(selected["ends_at"])), today=_today_la(),
            live_scope=live_scope, live_completed=live_completed)
        sprint_series["subtitle"] = f"{selected['starts_at']} – {selected['ends_at']}"

    from app.scrum.burnup import build_cumulative_series
    cumulative_input = []
    for s in sprints:
        snaps = (client.table("sprint_burnup_days").select("day, scope_points, completed_points")
                 .eq("sprint_id", s["id"]).order("day", desc=True).limit(1).execute()).data or []
        final = snaps[0] if snaps else None
        if s["id"] == sel_id or final is None:
            sc, co = _live_burnup_totals(client, s["id"])
            final = {"scope_points": sc, "completed_points": co}
        cumulative_input.append({"id": s["id"], "name": s["name"], "final": final})
    cumulative = build_cumulative_series(cumulative_input)

    from app.config import settings
    return {"project": project, "ai_enabled": bool(settings.AI_API_KEY),
            "sprints": sprints, "sprint_id": sel_id,
            "stories": stories, "backlog": backlog,
            "burnup": {"sprint": sprint_series, "cumulative": cumulative},
            "members": members, "access": access}
```

- [ ] **Step 4: Replace the `get_board` stub in `views.py`**:

```python
def get_board(project_id: str, sprint_id: str | None = None,
              user_id: str = Depends(require_user)) -> BoardResponse:
    board = controller.get_board(project_id=project_id, user_id=user_id, sprint_id=sprint_id)
    return BoardResponse(**board)
```

- [ ] **Step 5: Run** `.venv/bin/python -m pytest tests/ -k scrum -v` → all pass. **Commit:**

```bash
git add backend/app/scrum backend/tests/test_scrum_board.py
git commit -m "feat(scrum): board GET — one-shot aggregate with burnup + members"
```

---

## Task B9: PR/MR linking + batch refresh

**Files:**
- Create: `backend/app/scrum/pr_links.py`
- Modify: `backend/app/scrum/controller.py` (real `_pr_fields`, `refresh_pr_states`), `backend/app/scrum/views.py`
- Test: `backend/tests/test_scrum_pr_links.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_pr_links.py`:

```python
"""PR URL parsing accept/reject table + state mapping."""
import pytest

from app.scrum.pr_links import parse_pr_url, map_github_state, map_gitlab_state


@pytest.mark.parametrize("url,provider", [
    ("https://github.com/ucsc/grepthink2.0/pull/42", "github"),
    ("https://git.ucsc.edu/cse115a/team1/project/-/merge_requests/17", "gitlab"),
])
def test_parse_accepts(url, provider):
    parsed = parse_pr_url(url)
    assert parsed is not None and parsed["provider"] == provider


@pytest.mark.parametrize("url", [
    "https://gitlab.com/x/y/-/merge_requests/1",     # wrong GitLab host
    "https://github.com/onlyowner/pull/42",           # malformed
    "http://github.com/o/r/pull/42",                  # not https
    "https://evil.example/github.com/o/r/pull/42",
])
def test_parse_rejects(url):
    assert parse_pr_url(url) is None


def test_github_state_mapping():
    assert map_github_state({"state": "open", "draft": True, "merged": False}) == "draft"
    assert map_github_state({"state": "closed", "draft": False, "merged": True}) == "merged"
    assert map_github_state({"state": "closed", "draft": False, "merged": False}) == "closed"
    assert map_github_state({"state": "open", "draft": False, "merged": False}) == "open"


def test_gitlab_state_mapping():
    assert map_gitlab_state({"state": "opened", "draft": True}) == "draft"
    assert map_gitlab_state({"state": "merged", "draft": False}) == "merged"
    assert map_gitlab_state({"state": "closed", "draft": False}) == "closed"
    assert map_gitlab_state({"state": "opened", "draft": False}) == "open"
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Write `backend/app/scrum/pr_links.py`**:

```python
"""PR/MR URL parsing + state fetch (GitHub, git.ucsc.edu GitLab CE).

All fetches are best-effort with a 3 s timeout: a network failure returns None and
the caller keeps the stored state (spec D8 — the campus GitLab may be VPN-gated).
"""
from __future__ import annotations

import logging
import re
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

GITHUB_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+)/pull/(\d+)/?$")
GITLAB_RE = re.compile(r"^https://git\.ucsc\.edu/((?:[\w.-]+/)+[\w.-]+)/-/merge_requests/(\d+)/?$")
FETCH_TIMEOUT_S = 3.0


def parse_pr_url(url: str) -> dict | None:
    m = GITHUB_RE.match(url or "")
    if m:
        return {"provider": "github", "owner": m.group(1), "repo": m.group(2), "number": int(m.group(3))}
    m = GITLAB_RE.match(url or "")
    if m:
        return {"provider": "gitlab", "path": m.group(1), "iid": int(m.group(2))}
    return None


def map_github_state(pr: dict) -> str:
    if pr.get("merged") or pr.get("merged_at"):
        return "merged"
    if pr.get("state") == "closed":
        return "closed"
    return "draft" if pr.get("draft") else "open"


def map_gitlab_state(mr: dict) -> str:
    state = mr.get("state")
    if state == "merged":
        return "merged"
    if state == "closed":
        return "closed"
    return "draft" if mr.get("draft") or mr.get("work_in_progress") else "open"


def fetch_pr_state(parsed: dict) -> str | None:
    """Return 'open'|'merged'|'closed'|'draft', or None on any failure."""
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_S) as http:
            if parsed["provider"] == "github":
                headers = {"Accept": "application/vnd.github+json"}
                if settings.GITHUB_TOKEN:
                    headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
                r = http.get(f"https://api.github.com/repos/{parsed['owner']}/{parsed['repo']}/pulls/{parsed['number']}",
                             headers=headers)
                if r.status_code != 200:
                    return None
                return map_github_state(r.json())
            headers = {}
            if settings.GITLAB_UCSC_TOKEN:
                headers["PRIVATE-TOKEN"] = settings.GITLAB_UCSC_TOKEN
            r = http.get(f"https://git.ucsc.edu/api/v4/projects/{quote(parsed['path'], safe='')}/merge_requests/{parsed['iid']}",
                         headers=headers)
            if r.status_code != 200:
                return None
            return map_gitlab_state(r.json())
    except Exception:
        logger.exception("scrum: PR state fetch failed | provider=%s", parsed.get("provider"))
        return None
```

- [ ] **Step 4: Replace `_pr_fields` in `controller.py` and add the batch refresh**:

```python
from app.scrum.pr_links import parse_pr_url, fetch_pr_state
from app.database.client import query_pool

PR_REFRESH_MAX = 20
PR_STALE_AFTER = timedelta(minutes=10)


def _pr_fields(pr_url) -> dict:
    if pr_url is None:
        return {"pr_url": None, "pr_provider": None, "pr_state": None, "pr_checked_at": None}
    parsed = parse_pr_url(pr_url)
    if not parsed:
        raise HTTPException(status_code=422,
                            detail="PR URL must be a github.com pull or git.ucsc.edu merge request")
    state = fetch_pr_state(parsed) or "draft"   # degrade: unreachable ⇒ gray chip
    return {"pr_url": pr_url, "pr_provider": parsed["provider"], "pr_state": state,
            "pr_checked_at": datetime.now(timezone.utc).isoformat()}


def refresh_pr_states(*, project_id: str, user_id: str) -> dict:
    _board_access(project_id=project_id, user_id=user_id)
    client = _client()
    rows = (client.table("tasks").select("id, pr_url, pr_state, pr_checked_at")
            .eq("project_id", str(project_id)).neq("pr_url", "null").execute()).data or []
    cutoff = datetime.now(timezone.utc) - PR_STALE_AFTER
    stale = []
    for t in rows:
        if not t.get("pr_url"):
            continue
        checked = t.get("pr_checked_at")
        if not checked or datetime.fromisoformat(checked.replace("Z", "+00:00")) < cutoff:
            stale.append(t)
    stale = stale[:PR_REFRESH_MAX]

    def _one(t: dict) -> tuple[str, str | None]:
        parsed = parse_pr_url(t["pr_url"])
        return t["id"], (fetch_pr_state(parsed) if parsed else None)

    updated: dict[str, str] = {}
    now = datetime.now(timezone.utc).isoformat()
    for task_id, state in query_pool.map(_one, stale):
        if state and state != next(t["pr_state"] for t in stale if t["id"] == task_id):
            updated[task_id] = state
        payload = {"pr_checked_at": now}
        if state:
            payload["pr_state"] = state
        try:
            client.table("tasks").update(payload).eq("id", str(task_id)).execute()
        except Exception:
            logger.exception("scrum: pr refresh write failed | task=%s", task_id)
    return {"updated": updated}
```

- [ ] **Step 5: Replace the `refresh_pr_states` stub in `views.py`**:

```python
def refresh_pr_states(project_id: str, user_id: str = Depends(require_user)) -> PrRefreshResponse:
    return PrRefreshResponse(**controller.refresh_pr_states(project_id=project_id, user_id=user_id))
```

- [ ] **Step 6: Run** `.venv/bin/python -m pytest tests/ -k scrum -v` → all pass. **Commit:**

```bash
git add backend/app/scrum backend/tests/test_scrum_pr_links.py
git commit -m "feat(scrum): PR/MR linking — host-allowlisted parse, cached state, batch refresh"
```

---

## Task B10: Comments CRUD + mention fan-out seam

> Mention behavior itself (extraction util, generic `mention` notification type,
> recipient filtering, deep links) is owned by the standalone mentions plan —
> `docs/superpowers/plans/2026-08-13-mentions-system.md`, Tasks M1–M3 — which replaces
> the no-op seam below. This task ships comment CRUD only.

**Files:**
- Modify: `backend/app/scrum/controller.py`, `backend/app/scrum/views.py`
- Test: `backend/tests/test_scrum_comments.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_comments.py`:

```python
"""Comments: staff may post, parent routing, and the mention seam is invoked."""
from unittest.mock import MagicMock, patch

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


def _wire(mock_client, parent):
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=parent)
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "c1", "author_id": UID, "body_md": "x", "created_at": "2026-08-12T00:00:00Z"}])
    return client


@patch("app.scrum.controller._fanout_mentions")
@patch("app.scrum.controller._board_access", return_value="staff")
@patch("app.scrum.controller._client")
def test_staff_can_comment(mock_client, _access, _fan):
    from app.scrum.controller import create_comment
    _wire(mock_client, {"id": "st1", "project_id": PID, "key": "US-3"})
    out = create_comment(parent_kind="story", parent_id="st1", user_id=UID, body_md="hello")
    assert out["id"] == "c1"


@patch("app.scrum.controller._fanout_mentions")
@patch("app.scrum.controller._board_access", return_value="member")
@patch("app.scrum.controller._client")
def test_create_comment_routes_task_parent_and_invokes_seam(mock_client, _access, fan):
    from app.scrum.controller import create_comment
    client = _wire(mock_client, {"id": "t1", "project_id": PID, "key": "GT-12"})
    create_comment(parent_kind="task", parent_id="t1", user_id=UID, body_md="hello")
    inserted = client.table.return_value.insert.call_args.args[0]
    assert inserted["task_id"] == "t1" and "story_id" not in inserted
    assert fan.call_count == 1
    assert fan.call_args.kwargs["parent_key"] == "GT-12"
    assert fan.call_args.kwargs["parent_kind"] == "task"
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Add to `backend/app/scrum/controller.py`** — the no-op seam plus comment CRUD:

```python
def _fanout_mentions(client, *, project_id: str, parent_kind: str, parent_id: str,
                     parent_key: str, author_id: str, body_md: str) -> None:
    """No-op seam. Activated by the mentions plan
    (docs/superpowers/plans/2026-08-13-mentions-system.md, Task M3): extract mention
    UUIDs, intersect with team ∪ staff, notify via the generic `mention` type."""
    return None


def _get_comment_parent(client, parent_kind: str, parent_id: str) -> dict:
    if parent_kind == "story":
        return _get_story_or_404(client, parent_id)
    return _get_task_or_404(client, parent_id)


def create_comment(*, parent_kind: str, parent_id: str, user_id: str, body_md: str) -> dict:
    client = _client()
    parent = _get_comment_parent(client, parent_kind, parent_id)
    _board_access(project_id=parent["project_id"], user_id=user_id)  # staff may comment (D2)
    row = {"author_id": str(user_id), "body_md": body_md,
           ("story_id" if parent_kind == "story" else "task_id"): str(parent_id)}
    res = client.table("scrum_comments").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create comment")
    _fanout_mentions(client, project_id=parent["project_id"], parent_kind=parent_kind,
                     parent_id=parent_id, parent_key=parent.get("key", ""),
                     author_id=user_id, body_md=body_md)
    return res.data[0]


def list_comments(*, parent_kind: str, parent_id: str, user_id: str) -> list[dict]:
    client = _client()
    parent = _get_comment_parent(client, parent_kind, parent_id)
    _board_access(project_id=parent["project_id"], user_id=user_id)
    col = "story_id" if parent_kind == "story" else "task_id"
    rows = (client.table("scrum_comments").select("id, author_id, body_md, created_at")
            .eq(col, str(parent_id)).order("created_at").execute()).data or []
    author_ids = list({r["author_id"] for r in rows})
    names: dict[str, str] = {}
    if author_ids:
        profs = (client.table("profiles").select("id, first_name, last_name, email")
                 .in_("id", author_ids).execute()).data or []
        names = {p["id"]: _display_name(p) for p in profs}
    return [{**r, "author_name": names.get(r["author_id"], "Unknown")} for r in rows]
```

- [ ] **Step 4: Replace the four comment stubs in `views.py`**:

```python
def list_story_comments(story_id: str, user_id: str = Depends(require_user)) -> CommentsListResponse:
    rows = controller.list_comments(parent_kind="story", parent_id=story_id, user_id=user_id)
    return CommentsListResponse(comments=[CommentOut(**r) for r in rows])


def create_story_comment(story_id: str, body: CreateCommentRequest,
                         user_id: str = Depends(require_user)) -> CommentResponse:
    row = controller.create_comment(parent_kind="story", parent_id=story_id,
                                    user_id=user_id, body_md=body.body_md)
    return CommentResponse(message="Comment added successfully",
                           comment=CommentOut(**row, author_name=""))


def list_task_comments(task_id: str, user_id: str = Depends(require_user)) -> CommentsListResponse:
    rows = controller.list_comments(parent_kind="task", parent_id=task_id, user_id=user_id)
    return CommentsListResponse(comments=[CommentOut(**r) for r in rows])


def create_task_comment(task_id: str, body: CreateCommentRequest,
                        user_id: str = Depends(require_user)) -> CommentResponse:
    row = controller.create_comment(parent_kind="task", parent_id=task_id,
                                    user_id=user_id, body_md=body.body_md)
    return CommentResponse(message="Comment added successfully",
                           comment=CommentOut(**row, author_name=""))
```

- [ ] **Step 5: Run** `.venv/bin/python -m pytest tests/ -k scrum -v` → all pass. **Commit:**

```bash
git add backend/app/scrum backend/tests/test_scrum_comments.py
git commit -m "feat(scrum): comments CRUD with mention fan-out seam"
```

---

## Task B11: AI drafting endpoint

**Files:**
- Create: `backend/app/scrum/ai_draft.py`
- Modify: `backend/app/scrum/controller.py`, `backend/app/scrum/views.py`
- Test: `backend/tests/test_scrum_ai_draft.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_scrum_ai_draft.py`:

```python
"""AI draft: quota 429, disabled 503, snap-to-scale."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.scrum.ai_draft import snap_points

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


def test_snap_points_to_scale():
    fib = [1, 2, 3, 5, 8, 13]
    assert snap_points(4, fib) == 3      # ties round down
    assert snap_points(7, fib) == 8
    assert snap_points(99, fib) == 13
    assert snap_points(None, fib) is None


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_draft_503_when_unconfigured(mock_client, _w, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "AI_API_KEY", "")
    from app.scrum.controller import ai_draft
    with pytest.raises(HTTPException) as e:
        ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)
    assert e.value.status_code == 503


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_draft_429_over_quota(mock_client, _w, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "AI_API_KEY", "k")
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"count": 10})
    from app.scrum.controller import ai_draft
    with pytest.raises(HTTPException) as e:
        ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)
    assert e.value.status_code == 429
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Write `backend/app/scrum/ai_draft.py`**:

```python
"""LLM drafting for stories/tasks via an OpenAI-compatible endpoint (spec D14).

Provider-agnostic: AI_BASE_URL/AI_API_KEY/AI_MODEL point at Cloudflare Workers AI by
default (free tier, hard-capped), but Groq/Gemini/OpenRouter drop in unchanged.
"""
from __future__ import annotations

import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

LLM_TIMEOUT_S = 15.0

SYSTEM_PROMPT = """You draft scrum items for a university software-engineering team.
Reply with ONLY a JSON object, no prose, in exactly this shape:
{"title": str, "description_md": str, "points": int, "time_estimate": str,
 "tasks": [{"title": str, "tags": [str], "points": int, "time_estimate": str}]}
Rules: tags only from {tags}. points only from {scale}. time_estimate like "4h" or "2d".
For kind=story fill every field with 2-5 tasks; for kind=tasks leave title/description_md
null and propose 3-6 tasks for the given story. Descriptions are concise markdown."""


def snap_points(value, allowed: list[int]):
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return min(allowed, key=lambda a: (abs(a - v), a))


def request_draft(*, kind: str, prompt: str, scale_values: list[int],
                  tags: tuple, story_context: str | None) -> dict:
    """Call the LLM; return the parsed JSON dict. Raises httpx errors / ValueError."""
    system = SYSTEM_PROMPT.replace("{tags}", ", ".join(tags)).replace(
        "{scale}", ", ".join(str(v) for v in scale_values))
    user = f"kind={kind}\n"
    if story_context:
        user += f"story: {story_context}\n"
    user += f"request: {prompt}"
    with httpx.Client(timeout=LLM_TIMEOUT_S) as http:
        r = http.post(
            f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
            json={"model": settings.AI_MODEL, "temperature": 0.3, "max_tokens": 900,
                  "response_format": {"type": "json_object"},
                  "messages": [{"role": "system", "content": system},
                               {"role": "user", "content": user}]},
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
    return json.loads(content)
```

- [ ] **Step 4: Add to `controller.py`**:

```python
AI_DAILY_LIMIT = 10


def ai_draft(*, project_id: str, user_id: str, kind: str, prompt: str,
             story_id: str | None) -> dict:
    _require_writer(project_id=project_id, user_id=user_id)
    from app.config import settings
    if not settings.AI_API_KEY or not settings.AI_BASE_URL:
        raise HTTPException(status_code=503, detail="AI drafting is not configured")
    client = _client()

    today = _today_la().isoformat()
    usage_res = (client.table("ai_draft_usage").select("count")
                 .eq("user_id", str(user_id)).eq("used_on", today).maybe_single().execute())
    used = (usage_res.data or {}).get("count", 0) if usage_res else 0
    if used >= AI_DAILY_LIMIT:
        raise HTTPException(status_code=429, detail="Daily AI draft limit reached (10/day)")

    proj = (client.table("projects").select("estimate_scale")
            .eq("id", str(project_id)).maybe_single().execute())
    scale = ESTIMATE_SCALES[(proj.data or {}).get("estimate_scale", "fibonacci") if proj else "fibonacci"]

    story_context = None
    if story_id:
        story = _get_story_or_404(client, story_id)
        if story["project_id"] != str(project_id):
            raise HTTPException(status_code=404, detail="Story not found")
        story_context = f"{story['key']} {story['title']}: {(story.get('description_md') or '')[:500]}"

    from app.scrum.ai_draft import request_draft, snap_points
    try:
        raw = request_draft(kind=kind, prompt=prompt, scale_values=scale,
                            tags=TASK_TAGS, story_context=story_context)
    except Exception:
        logger.exception("scrum: ai draft failed | project=%s", project_id)
        raise HTTPException(status_code=502, detail="Draft failed — try again")

    draft = {
        "title": raw.get("title"),
        "description_md": raw.get("description_md"),
        "points": snap_points(raw.get("points"), scale),
        "time_estimate": raw.get("time_estimate"),
        "tasks": [{
            "title": str(t.get("title") or "")[:200],
            "tags": [tag for tag in (t.get("tags") or []) if tag in TASK_TAGS],
            "points": snap_points(t.get("points"), scale),
            "time_estimate": t.get("time_estimate"),
        } for t in (raw.get("tasks") or []) if t.get("title")],
    }

    # Courtesy quota: read-modify-write race can miscount by one; acceptable (spec D14).
    client.table("ai_draft_usage").upsert(
        {"user_id": str(user_id), "used_on": today, "count": used + 1},
        on_conflict="user_id,used_on").execute()
    return {"draft": draft}
```

- [ ] **Step 5: Replace the `ai_draft` stub in `views.py`** (rate-limited — needs `request: Request`):

```python
from fastapi import Request
from app.limiter import limiter


@limiter.limit("5/minute")
def ai_draft(request: Request, project_id: str, body: AiDraftRequest,
             user_id: str = Depends(require_user)) -> AiDraftResponse:
    out = controller.ai_draft(project_id=project_id, user_id=user_id, kind=body.kind,
                              prompt=body.prompt, story_id=body.story_id)
    return AiDraftResponse(**out)
```

- [ ] **Step 6: Run** `.venv/bin/python -m pytest tests/ -k scrum -v` → all pass, then the whole suite `.venv/bin/python -m pytest` → no regressions. **Commit:**

```bash
git add backend/app/scrum backend/tests/test_scrum_ai_draft.py
git commit -m "feat(scrum): AI drafting — OpenAI-compatible provider, 10/day DB quota, snap-to-scale"
```

---

## Task B12: Contract layer — `api.ts`, actions catalog, AGENTS.md, migration note

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/public/.well-known/grepthink-actions.json`
- Modify: `AGENTS.md` (module list + API-surface line)

- [ ] **Step 1: Add types + methods to `frontend/src/lib/api.ts`** — interfaces mirroring `models.py` responses (`ApiScrumBoard`, `ApiScrumStory`, `ApiScrumTask`, `ApiScrumSprint`, `ApiScrumComment`, `ApiScrumMember`, `ApiBurnupSeries`, `ApiAiDraft`) and one method per route on the `api` object:

```ts
// --- Scrum board ---
getScrumBoard: (projectId: string, sprintId?: string) =>
  apiRequest<ApiScrumBoard>(`/api/projects/${projectId}/scrum/board${sprintId ? `?sprint_id=${sprintId}` : ''}`),
updateScrumSettings: (projectId: string, estimateScale: ApiEstimateScale) =>
  apiRequest<void>(`/api/projects/${projectId}/scrum/settings`, { method: 'PATCH', body: JSON.stringify({ estimate_scale: estimateScale }) }),
createSprint: (projectId: string, body: { name: string; starts_at: string; ends_at: string }) =>
  apiRequest<{ message: string; sprint: ApiScrumSprint }>(`/api/projects/${projectId}/scrum/sprints`, { method: 'POST', body: JSON.stringify(body) }),
updateSprint: (sprintId: string, body: Partial<Pick<ApiScrumSprint, 'name' | 'starts_at' | 'ends_at' | 'status'>>) =>
  apiRequest<{ message: string; sprint: ApiScrumSprint }>(`/api/scrum/sprints/${sprintId}`, { method: 'PATCH', body: JSON.stringify(body) }),
createStory: (projectId: string, body: ApiCreateStoryBody) =>
  apiRequest<{ message: string; story: ApiScrumStory }>(`/api/projects/${projectId}/scrum/stories`, { method: 'POST', body: JSON.stringify(body) }),
updateStory: (storyId: string, body: ApiUpdateStoryBody) =>
  apiRequest<{ message: string; story: ApiScrumStory }>(`/api/scrum/stories/${storyId}`, { method: 'PATCH', body: JSON.stringify(body) }),
createScrumTask: (storyId: string, body: ApiCreateTaskBody) =>
  apiRequest<{ message: string; task: ApiScrumTask }>(`/api/scrum/stories/${storyId}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
updateScrumTask: (taskId: string, body: ApiUpdateTaskBody) =>
  apiRequest<{ message: string; task: ApiScrumTask }>(`/api/scrum/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(body) }),
deleteScrumTask: (taskId: string) =>
  apiRequest<void>(`/api/scrum/tasks/${taskId}`, { method: 'DELETE' }),
moveScrumTask: (taskId: string, toStatus: ApiBoardStatus) =>
  apiRequest<{ message: string; task: ApiScrumTask }>(`/api/scrum/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify({ to_status: toStatus }) }),
getScrumComments: (parent: 'stories' | 'tasks', id: string) =>
  apiRequest<{ comments: ApiScrumComment[] }>(`/api/scrum/${parent}/${id}/comments`),
createScrumComment: (parent: 'stories' | 'tasks', id: string, bodyMd: string) =>
  apiRequest<{ message: string; comment: ApiScrumComment }>(`/api/scrum/${parent}/${id}/comments`, { method: 'POST', body: JSON.stringify({ body_md: bodyMd }) }),
refreshScrumPrStates: (projectId: string) =>
  apiRequest<{ updated: Record<string, string> }>(`/api/projects/${projectId}/scrum/pr-refresh`, { method: 'POST' }),
aiDraftScrum: (projectId: string, body: { kind: 'story' | 'tasks'; prompt: string; story_id?: string }) =>
  apiRequest<{ draft: ApiAiDraft }>(`/api/projects/${projectId}/scrum/ai-draft`, { method: 'POST', body: JSON.stringify(body) }),
```
(Define the `ApiScrum*`/`ApiCreate*`/`ApiUpdate*`/`ApiEstimateScale`/`ApiBoardStatus` interfaces beside the other `ApiXxx` types, field-for-field from `models.py`.)

- [ ] **Step 2: `grepthink-actions.json`** — append one entry per route, copying the exact key set of an existing entry (`{id, title, role, method, endpoint, params, uiRoute}`); `uiRoute` is `/app/projects/{projectId}/board`; `role` "member" (board mutations) or "any" (reads/comments).

- [ ] **Step 3: `AGENTS.md`** — add `scrum` to the module list line under §Directory structure and `/api/scrum` + `/api/projects/{id}/scrum` to the §API surface prefix list.

- [ ] **Step 4: Gates** — `cd frontend && npm run build` → Expected: clean; `cd backend && .venv/bin/python -m pytest` → all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/public/.well-known/grepthink-actions.json AGENTS.md
git commit -m "feat(scrum): typed api.ts methods + actions catalog + AGENTS.md surface"
```

> **Migration application (maintainer gate — not a plan step):** apply
> `2026-08-12_scrum_board.sql` to the **dev** Supabase project via MCP on go-ahead;
> stage the prod copy as `migrations/prod/2026-08-12_scrum_board_expand.sql` at
> merge-to-main time. Merging ≠ applied — verify against the target project.

---

## Plan self-review (done at write time)

- **Spec coverage:** D1/D12/D13 + spec Part 3 are Part 2 (frontend) scope; D2–D11, D14, D15 map to B1–B12 above. Requirement 6's audit → B6; 2 → B7/B8; 7 → B9; 9 → B10 (CRUD + seam) + mentions plan M1–M5; 10 → B11; 11 → B4 + B11 snap; 12 → B5 (`archived`/`sprint_id`); 3/4/5 → B1/B5 columns.
- **Type consistency:** view shapers `_task_out`/`_story_out` (B5) are used by B6; `_snapshot_burnup_safe` stub (B5) is replaced in B7 with the same signature; `_pr_fields` stub (B5) replaced in B9 with the same signature.
- **Known deliberate roughness:** MagicMock chains assert call shape, not SQL truth — the DB-side trigger/RPC behavior is verified manually on dev after the migration applies (B12 gate).

## Part 2 roadmap (expanded into a full plan after Part 1 lands)

F1 route + page scaffold + skeleton + breadcrumb + ProjectView tab strip · F2 port chips/badges/cards (`design/components/scrum/`, `.gt-*` classes per D12, `--gt-purple` token) · F3 board + HTML5 DnD + optimistic move w/ rollback · F4 story modal (view/edit/create, task rows w/ status select) · F5 `ScrumMarkdown` + `MentionTextarea` + comments UI · F6 burnup SVG + backlog panel + ScalePicker/PointPicker · F7 AI-draft flow (prefill, never auto-create) · F8 skeletons, empty states, `lint:design`, vitest suite.
