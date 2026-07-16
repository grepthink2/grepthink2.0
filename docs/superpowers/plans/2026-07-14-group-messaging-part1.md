# Group Messaging + Design Foundations (Part 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scalable group messaging (three auto-provisioned channels per team: TA↔team, Instructor↔team, members-only) on a unified participants model, plus design-system foundations (tokens/motion) and the rebuilt Messages UI.

**Architecture:** One `conversations` table gains `type`/`project_id`; a new `conversation_participants` table holds membership for every conversation (DMs backfilled, team channels provisioned + kept in sync by Postgres triggers). Inbox moves to a SQL RPC (no more 5,000-message pulls); threads get keyset pagination; realtime becomes delta-apply (one RLS-scoped `messages` INSERT subscription) instead of refetch-on-event. Frontend Phase A vendors the design-system CSS tokens and a motion layer; Phase B rebuilds the messaging UI on them.

**Tech Stack:** FastAPI + supabase-py (service role), Postgres/Supabase (RLS + Realtime), Vite + React 19 + react-router 7 + SCSS, pytest (TestClient + MagicMock), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-group-messaging-and-design-system.md`
**Part 2** (Phases C–E: app shell, page sweep, adherence lint) is written after this plan executes, so its tasks reference the real patterns established here.

**Conventions for every task below:**
- Backend tests run from `backend/`: `venv/bin/python -m pytest tests/<file> -v` (venv per AGENTS.md; if missing: `python3 -m venv venv && venv/bin/pip install -r requirements.txt -r requirements-dev.txt`).
- Frontend commands run from `frontend/`: `npm run build`, `npx vitest run <path>`.
- Commit after each task with the message given in its final step. All commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- The design-system zip lives at `/Users/pronei/work/CSE115C/grepthink2.0/GrepThink Design System.zip` (repo main checkout root, outside this worktree).

---

## Task B1: Migration SQL — schema, triggers, backfill, RLS, inbox RPC

**Files:**
- Create: `backend/database/migrations/2026-07-14_group_messaging.sql`

This file is NOT applied by tests (no local DB). It is applied to the shared Supabase project via MCP in Task R1, **only on maintainer go-ahead**. Every statement is idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING` / `DROP … IF EXISTS` before `CREATE`).

- [ ] **Step 1: Write the migration file** with exactly this content:

```sql
-- Group messaging: unified participants model.
-- Spec: docs/superpowers/specs/2026-07-14-group-messaging-and-design-system.md
-- Idempotent; applied manually via Supabase MCP on maintainer go-ahead.

-- ============ 1) conversations: type + project_id ============
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'dm';
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_valid;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_valid
  CHECK (type IN ('dm','team_ta','team_instructor','team_members'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE conversations ALTER COLUMN user_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_b DROP NOT NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_shape;
ALTER TABLE conversations ADD CONSTRAINT conversations_shape CHECK (
  (type = 'dm' AND user_a IS NOT NULL AND user_b IS NOT NULL AND project_id IS NULL)
  OR (type <> 'dm' AND project_id IS NOT NULL AND user_a IS NULL AND user_b IS NULL)
);

-- One channel of each kind per team. (Existing canonical-order CHECK and
-- UNIQUE(user_a,user_b) pass NULL-safely for team rows.)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_team_channel_uq
  ON conversations (project_id, type) WHERE type <> 'dm';
CREATE INDEX IF NOT EXISTS conversations_project_idx
  ON conversations (project_id) WHERE project_id IS NOT NULL;

-- ============ 2) participants ============
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('member','ta','instructor')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON conversation_participants (user_id);
GRANT ALL ON TABLE conversation_participants TO anon, authenticated, service_role;

-- ============ 3) keyset-pagination index ============
CREATE INDEX IF NOT EXISTS messages_conv_created_id_idx
  ON messages (conversation_id, created_at DESC, id DESC);

-- ============ 4) provisioning + sync ============
CREATE OR REPLACE FUNCTION provision_team_channels(p_project_id uuid)
RETURNS void AS $$
DECLARE
  v_class_owner uuid;
BEGIN
  INSERT INTO conversations (type, project_id)
  SELECT t, p_project_id
    FROM unnest(ARRAY['team_ta','team_instructor','team_members']) AS t
  ON CONFLICT (project_id, type) WHERE type <> 'dm' DO NOTHING;

  -- members into all three channels
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, pm.user_id, 'member'
    FROM conversations c
    JOIN project_members pm ON pm.project_id = p_project_id
   WHERE c.project_id = p_project_id AND c.type <> 'dm'
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- TA seat
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, p.assigned_ta_id, 'ta'
    FROM conversations c
    JOIN projects p ON p.id = p_project_id
   WHERE c.project_id = p_project_id AND c.type = 'team_ta'
     AND p.assigned_ta_id IS NOT NULL
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- instructor seat (class owner)
  SELECT cl.created_by INTO v_class_owner
    FROM projects p JOIN classes cl ON cl.id = p.class_id
   WHERE p.id = p_project_id;
  IF v_class_owner IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, v_class_owner, 'instructor'
      FROM conversations c
     WHERE c.project_id = p_project_id AND c.type = 'team_instructor'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_projects_provision_channels()
RETURNS trigger AS $$
BEGIN
  PERFORM provision_team_channels(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_provision_channels ON projects;
CREATE TRIGGER projects_provision_channels
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION trg_projects_provision_channels();

CREATE OR REPLACE FUNCTION trg_project_members_sync()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM provision_team_channels(NEW.project_id);
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.user_id, 'member'
      FROM conversations c
     WHERE c.project_id = NEW.project_id AND c.type <> 'dm'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = OLD.project_id AND c.type <> 'dm'
       AND cp.user_id = OLD.user_id AND cp.role = 'member';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_members_sync_channels ON project_members;
CREATE TRIGGER project_members_sync_channels
AFTER INSERT OR DELETE ON project_members
FOR EACH ROW EXECUTE FUNCTION trg_project_members_sync();

CREATE OR REPLACE FUNCTION trg_projects_ta_swap()
RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_ta_id IS DISTINCT FROM OLD.assigned_ta_id THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = NEW.id AND c.type = 'team_ta' AND cp.role = 'ta';
    IF NEW.assigned_ta_id IS NOT NULL THEN
      PERFORM provision_team_channels(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_ta_swap_channel ON projects;
CREATE TRIGGER projects_ta_swap_channel
AFTER UPDATE OF assigned_ta_id ON projects
FOR EACH ROW EXECUTE FUNCTION trg_projects_ta_swap();

CREATE OR REPLACE FUNCTION trg_classes_owner_swap()
RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    DELETE FROM conversation_participants cp
     USING conversations c, projects p
     WHERE cp.conversation_id = c.id AND c.type = 'team_instructor'
       AND c.project_id = p.id AND p.class_id = NEW.id AND cp.role = 'instructor';
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.created_by, 'instructor'
      FROM conversations c JOIN projects p ON p.id = c.project_id
     WHERE c.type = 'team_instructor' AND p.class_id = NEW.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS classes_owner_swap_channel ON classes;
CREATE TRIGGER classes_owner_swap_channel
AFTER UPDATE OF created_by ON classes
FOR EACH ROW EXECUTE FUNCTION trg_classes_owner_swap();

-- DM participant rows for every creation path (backend, manual, etc.)
CREATE OR REPLACE FUNCTION trg_dm_participants()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'dm' THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, NEW.user_a, 'member'), (NEW.id, NEW.user_b, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS conversations_dm_participants ON conversations;
CREATE TRIGGER conversations_dm_participants
AFTER INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION trg_dm_participants();

-- ============ 5) backfill ============
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT id, user_a, 'member' FROM conversations
 WHERE type = 'dm' AND user_a IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT id, user_b, 'member' FROM conversations
 WHERE type = 'dm' AND user_b IS NOT NULL
ON CONFLICT DO NOTHING;
SELECT provision_team_channels(id) FROM projects;

-- ============ 6) RLS (SELECT-only; writes stay service-role) ============
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_participants_select_own ON conversation_participants;
-- NOTE: keep this policy self-reference-free (plain user_id check) —
-- a participants policy that queries participants recurses and errors.
CREATE POLICY conversation_participants_select_own ON conversation_participants
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS conversations_select_participant ON conversations;
CREATE POLICY conversations_select_participant ON conversations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversation_participants cp
     WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS messages_select_participant ON messages;
CREATE POLICY messages_select_participant ON messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversation_participants cp
     WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  ));

-- ============ 7) inbox RPC ============
CREATE OR REPLACE FUNCTION messages_inbox(p_user uuid)
RETURNS TABLE (
  id uuid, type text, project_id uuid, team_name text,
  created_at timestamptz, last_message_at timestamptz,
  unread_count bigint, my_last_read_at timestamptz,
  last_message jsonb, participants jsonb, can_send boolean
)
LANGUAGE sql STABLE AS $$
WITH my_convs AS (
  SELECT c.*
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.user_id = p_user
    LEFT JOIN conversation_deletes cd
      ON cd.conversation_id = c.id AND cd.user_id = p_user
   WHERE (cd.deleted_at IS NULL OR c.last_message_at > cd.deleted_at)
),
my_classes AS (
  SELECT class_id FROM class_enrollments WHERE user_id = p_user
  UNION
  SELECT id FROM classes WHERE created_by = p_user
)
SELECT
  c.id, c.type, c.project_id, p.name AS team_name,
  c.created_at, c.last_message_at,
  COALESCE(un.cnt, 0) AS unread_count,
  r.last_read_at AS my_last_read_at,
  lm.msg AS last_message,
  parts.arr AS participants,
  CASE
    WHEN c.type <> 'dm' THEN true
    ELSE (
      NOT (
        (SELECT role FROM profiles WHERE id = p_user) = 'instructor'
        AND (SELECT role FROM profiles WHERE id = other_id.uid) = 'instructor'
      )
      AND EXISTS (
        SELECT 1 FROM my_classes mc
         WHERE mc.class_id IN (
           SELECT class_id FROM class_enrollments WHERE user_id = other_id.uid
           UNION
           SELECT id FROM classes WHERE created_by = other_id.uid
         )
      )
    )
  END AS can_send
FROM my_convs c
LEFT JOIN projects p ON p.id = c.project_id
LEFT JOIN conversation_reads r
  ON r.conversation_id = c.id AND r.user_id = p_user
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM messages m
   WHERE m.conversation_id = c.id AND m.sender_id <> p_user
     AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
) un ON true
LEFT JOIN LATERAL (
  SELECT to_jsonb(x) AS msg FROM (
    SELECT m.id, m.sender_id, m.body, m.created_at
      FROM messages m WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) x
) lm ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', pr.id, 'role', cp.role, 'email', pr.email,
           'first_name', pr.first_name, 'last_name', pr.last_name,
           'image_url', pr.image_url, 'last_read_at', cr.last_read_at
         ) ORDER BY cp.role, pr.first_name) AS arr
    FROM conversation_participants cp
    JOIN profiles pr ON pr.id = cp.user_id
    LEFT JOIN conversation_reads cr
      ON cr.conversation_id = c.id AND cr.user_id = cp.user_id
   WHERE cp.conversation_id = c.id
) parts ON true
LEFT JOIN LATERAL (
  SELECT CASE WHEN c.type = 'dm' THEN
           CASE WHEN c.user_a = p_user THEN c.user_b ELSE c.user_a END
         END AS uid
) other_id ON true
WHERE
  (c.type = 'dm' AND c.last_message_at IS NOT NULL)
  OR c.type IN ('team_members','team_instructor')
  OR (c.type = 'team_ta' AND (
        c.last_message_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM conversation_participants tp
                    WHERE tp.conversation_id = c.id AND tp.role = 'ta')))
ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
LIMIT 200;
$$;
```

- [ ] **Step 2: Sanity-check the SQL.** Read the file top to bottom against this checklist: every `CREATE` guarded (`IF NOT EXISTS` / `OR REPLACE` / preceded by `DROP … IF EXISTS`); no statement references a column not in `supabase/schema.sql` (`projects.class_id/name/assigned_ta_id`, `classes.created_by`, `project_members.project_id/user_id`, `profiles.role/email/first_name/last_name/image_url` — all verified present); the participants policy contains no self-referencing subquery.

- [ ] **Step 3: Commit**

```bash
git add backend/database/migrations/2026-07-14_group_messaging.sql
git commit -m "feat(messages): group messaging migration — participants model, triggers, RLS, inbox RPC"
```

---

## Task B2: Pydantic models v2

**Files:**
- Modify: `backend/app/messages/models.py`

- [ ] **Step 1: Replace the file content** with:

```python
"""Pydantic request/response models for the messages feature.

Char limit (1024 code points) is enforced authoritatively in the controller;
Pydantic validation here is a fast pre-flight so 400s short-circuit cheaply.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ----- Requests --------------------------------------------------------------

class SendMessageRequest(BaseModel):
    """Exactly one of to_user_id (new DM) or conversation_id (existing
    conversation / team channel) — enforced in the controller (400)."""
    to_user_id: Optional[str] = None
    conversation_id: Optional[str] = None
    # 1024 code-point limit; backend re-checks (defense in depth).
    body: str = Field(..., min_length=1, max_length=1024)


# ----- Subobjects ------------------------------------------------------------

class OtherUser(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    image_url: Optional[str] = None


class Participant(BaseModel):
    id: str
    role: str  # 'member' | 'ta' | 'instructor'
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    image_url: Optional[str] = None
    last_read_at: Optional[str] = None


class MessagePreview(BaseModel):
    id: str
    sender_id: str
    body: str
    created_at: str


class Message(BaseModel):
    id: str
    sender_id: str
    body: str
    created_at: str


# ----- Responses -------------------------------------------------------------

class ConversationSummary(BaseModel):
    id: str
    type: str = "dm"  # 'dm' | 'team_ta' | 'team_instructor' | 'team_members'
    project_id: Optional[str] = None
    team_name: Optional[str] = None
    participants: list[Participant] = []
    # Populated for type='dm' only (stale-client compat).
    other_user: Optional[OtherUser] = None
    last_message: Optional[MessagePreview] = None
    unread_count: int
    other_user_last_read_at: Optional[str] = None
    can_send: bool
    last_message_at: Optional[str] = None


class ConversationsListResponse(BaseModel):
    conversations: list[ConversationSummary]


class SendMessageResponse(BaseModel):
    conversation_id: str
    message: Message


class MessagesListResponse(BaseModel):
    messages: list[Message]
    # Opaque cursor for the next-older page; None when history is exhausted.
    next_cursor: Optional[str] = None


class Contact(BaseModel):
    id: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    image_url: Optional[str] = None
    role: Optional[str] = None


class ContactsListResponse(BaseModel):
    contacts: list[Contact]
```

- [ ] **Step 2: Verify existing suite still passes** (models are additive; `other_user` became Optional which existing tests don't construct directly)

Run: `venv/bin/python -m pytest tests/ -v`
Expected: all existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/messages/models.py
git commit -m "feat(messages): v2 response models — type, participants, cursor, contacts"
```

---

## Task B3: Participant-based authorization

**Files:**
- Modify: `backend/app/messages/controller.py` (replace `_conversation_or_403`; callers keep working)
- Test: `backend/tests/test_messages_participants.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
"""Participant-based authorization for conversations (groups + DMs)."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


def _mock_conv(client, conv):
    (client.table.return_value.select.return_value.eq.return_value
     .maybe_single.return_value.execute.return_value) = MagicMock(data=conv)


def _mock_participants(client, user_ids):
    """conversation_participants .select().eq().execute() → rows."""
    (client.table.return_value.select.return_value.eq.return_value
     .execute.return_value) = MagicMock(
        data=[{"user_id": u, "role": "member"} for u in user_ids])


@patch("app.messages.controller.service_client")
def test_participant_passes(client):
    from app.messages.controller import _require_participant
    _mock_conv(client, {"id": "c1", "type": "team_members",
                        "user_a": None, "user_b": None})
    _mock_participants(client, ["alice", "bob"])
    conv = _require_participant("c1", "alice")
    assert conv["type"] == "team_members"


@patch("app.messages.controller.service_client")
def test_outsider_403(client):
    from app.messages.controller import _require_participant
    _mock_conv(client, {"id": "c1", "type": "team_ta",
                        "user_a": None, "user_b": None})
    _mock_participants(client, ["alice", "bob"])
    with pytest.raises(HTTPException) as exc:
        _require_participant("c1", "mallory")
    assert exc.value.status_code == 403


@patch("app.messages.controller.service_client")
def test_missing_conversation_404(client):
    from app.messages.controller import _require_participant
    (client.table.return_value.select.return_value.eq.return_value
     .maybe_single.return_value.execute.return_value) = None
    with pytest.raises(HTTPException) as exc:
        _require_participant("nope", "alice")
    assert exc.value.status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/test_messages_participants.py -v`
Expected: FAIL — `ImportError: cannot import name '_require_participant'`.

- [ ] **Step 3: Implement.** In `controller.py`, replace the whole `_conversation_or_403` function with (keep its position in the file):

```python
def _participant_ids(conversation_id: str) -> list[str]:
    """All participant user ids for a conversation."""
    res = (
        service_client.table("conversation_participants")
        .select("user_id, role")
        .eq("conversation_id", conversation_id)
        .execute()
    )
    return [r["user_id"] for r in (res.data or [])]


def _require_participant(conversation_id: str, caller_id: str) -> dict:
    """Load conversation, ensuring caller is a participant.

    Raises 404 if the conversation doesn't exist, 403 if caller isn't a
    participant. Read-only conversations stay readable by participants.
    """
    res = (
        service_client.table("conversations")
        .select("id, type, user_a, user_b, project_id")
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    # supabase-py 2.x: None when the row doesn't exist.
    conv = res.data if res is not None else None
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if caller_id not in _participant_ids(conversation_id):
        logger.warning(
            "messages: participant check failed | caller=%s conv=%s",
            caller_id, conversation_id,
        )
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv
```

Then update the three call sites in the same file — `list_messages`, `mark_read`, `delete_conversation_for_user` — replacing `_conversation_or_403(conversation_id, caller_id)` with `_require_participant(conversation_id, caller_id)`.

- [ ] **Step 4: Run new + existing message tests**

Run: `venv/bin/python -m pytest tests/test_messages_participants.py tests/test_messages_list.py tests/test_messages_endpoints.py -v`
Expected: new tests PASS. If any existing test patches/uses `_conversation_or_403` directly, update that reference to `_require_participant` (behavior contract is identical for DMs — participants are backfilled).

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/tests/test_messages_participants.py
git commit -m "feat(messages): participant-based conversation authorization"
```

---

## Task B4: Inbox via `messages_inbox` RPC

**Files:**
- Modify: `backend/app/messages/controller.py` (replace `list_inbox` and delete `_INBOX_BULK_MESSAGE_LIMIT`)
- Test: `backend/tests/test_messages_inbox.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
"""Inbox: RPC-backed list_inbox mapping to API response shape."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


RPC_DM_ROW = {
    "id": "conv-dm", "type": "dm", "project_id": None, "team_name": None,
    "created_at": "2026-07-01T00:00:00+00:00",
    "last_message_at": "2026-07-10T00:00:00+00:00",
    "unread_count": 2, "my_last_read_at": None,
    "last_message": {"id": "m9", "sender_id": "bob", "body": "yo",
                     "created_at": "2026-07-10T00:00:00+00:00"},
    "participants": [
        {"id": "alice", "role": "member", "email": "a@ucsc.edu",
         "first_name": "Alice", "last_name": "A", "image_url": None,
         "last_read_at": "2026-07-09T00:00:00+00:00"},
        {"id": "bob", "role": "member", "email": "b@ucsc.edu",
         "first_name": "Bob", "last_name": "B", "image_url": None,
         "last_read_at": "2026-07-08T00:00:00+00:00"},
    ],
    "can_send": True,
}

RPC_TEAM_ROW = {
    "id": "conv-team", "type": "team_ta", "project_id": "proj-1",
    "team_name": "Team Rocket",
    "created_at": "2026-07-01T00:00:00+00:00", "last_message_at": None,
    "unread_count": 0, "my_last_read_at": None, "last_message": None,
    "participants": [
        {"id": "alice", "role": "member", "email": "a@ucsc.edu",
         "first_name": "Alice", "last_name": "A", "image_url": None,
         "last_read_at": None},
        {"id": "ta-1", "role": "ta", "email": "t@ucsc.edu",
         "first_name": "Tess", "last_name": "A", "image_url": None,
         "last_read_at": None},
    ],
    "can_send": True,
}


@patch("app.messages.controller.service_client")
def test_inbox_calls_rpc_with_caller(client):
    from app.messages.controller import list_inbox
    client.rpc.return_value.execute.return_value = MagicMock(data=[])
    assert list_inbox(caller_id="alice") == []
    client.rpc.assert_called_once_with("messages_inbox", {"p_user": "alice"})


@patch("app.messages.controller.service_client")
def test_inbox_dm_row_derives_other_user(client):
    from app.messages.controller import list_inbox
    client.rpc.return_value.execute.return_value = MagicMock(data=[RPC_DM_ROW])
    [row] = list_inbox(caller_id="alice")
    assert row["other_user"]["id"] == "bob"
    assert row["other_user"]["name"] == "Bob B"
    assert row["other_user_last_read_at"] == "2026-07-08T00:00:00+00:00"
    assert row["unread_count"] == 2
    assert row["type"] == "dm"


@patch("app.messages.controller.service_client")
def test_inbox_team_row_has_no_other_user(client):
    from app.messages.controller import list_inbox
    client.rpc.return_value.execute.return_value = MagicMock(data=[RPC_TEAM_ROW])
    [row] = list_inbox(caller_id="alice")
    assert row["other_user"] is None
    assert row["team_name"] == "Team Rocket"
    assert row["can_send"] is True
    assert {p["role"] for p in row["participants"]} == {"member", "ta"}
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/test_messages_inbox.py -v`
Expected: FAIL — `list_inbox` still queries `conversations` table (no `rpc` call) / KeyError on new fields.

- [ ] **Step 3: Implement.** In `controller.py`, delete the `_INBOX_BULK_MESSAGE_LIMIT` constant and its comment block, and replace the entire `list_inbox` function with:

```python
def list_inbox(*, caller_id: str) -> list[dict]:
    """Caller's conversations (DMs + team channels), hydrated and sorted.

    One SQL round trip: the messages_inbox() Postgres function computes
    last-message previews, unread counts (bounded, index-backed), the
    participant list, per-user hide state, and DM can_send — replacing the
    old bulk pull of up to 5,000 messages into Python memory.
    """
    res = service_client.rpc("messages_inbox", {"p_user": caller_id}).execute()
    rows = res.data or []
    out: list[dict] = []
    for r in rows:
        parts = r.get("participants") or []
        other = None
        other_last_read = None
        if r["type"] == "dm":
            others = [p for p in parts if p["id"] != caller_id]
            if others:
                o = others[0]
                first = (o.get("first_name") or "").strip()
                last = (o.get("last_name") or "").strip()
                other = {
                    "id": o["id"],
                    "email": o.get("email"),
                    "name": f"{first} {last}".strip() or None,
                    "first_name": o.get("first_name"),
                    "last_name": o.get("last_name"),
                    "image_url": o.get("image_url"),
                }
                other_last_read = o.get("last_read_at")
        out.append({
            "id": r["id"],
            "type": r["type"],
            "project_id": r.get("project_id"),
            "team_name": r.get("team_name"),
            "participants": parts,
            "other_user": other,
            "last_message": r.get("last_message"),
            "unread_count": r.get("unread_count") or 0,
            "other_user_last_read_at": other_last_read,
            "can_send": bool(r.get("can_send")),
            "last_message_at": r.get("last_message_at"),
        })
    return out
```

- [ ] **Step 4: Run tests** (old inbox tests asserting the bulk-query behavior in `tests/test_messages_list.py` — if any assert on `_INBOX_BULK_MESSAGE_LIMIT` or the 6-query pattern, rewrite them to the RPC contract or delete them in favor of `test_messages_inbox.py`)

Run: `venv/bin/python -m pytest tests/test_messages_inbox.py tests/test_messages_list.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/tests/test_messages_inbox.py backend/tests/test_messages_list.py
git commit -m "feat(messages): inbox via messages_inbox RPC — no more bulk message pulls"
```

---

## Task B5: Keyset-paginated `list_messages`

**Files:**
- Modify: `backend/app/messages/controller.py` (`list_messages`), `backend/app/messages/views.py`, `backend/app/messages/url.py` (no route change needed — query params only)
- Test: `backend/tests/test_messages_pagination.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
"""Keyset pagination for thread history."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


def _msgs(n, start=0):
    return [{"id": f"m{i}", "sender_id": "alice", "body": f"b{i}",
             "created_at": f"2026-07-10T00:00:{59 - i:02d}+00:00"}
            for i in range(start, start + n)]


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_full_page_returns_cursor(client, _auth):
    from app.messages.controller import list_messages
    rows = _msgs(50)
    q = client.table.return_value.select.return_value.eq.return_value
    q.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=rows)
    result = list_messages(conversation_id="c1", caller_id="alice")
    assert len(result["messages"]) == 50
    last = rows[-1]
    assert result["next_cursor"] == f"{last['created_at']}|{last['id']}"


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_short_page_has_no_cursor(client, _auth):
    from app.messages.controller import list_messages
    q = client.table.return_value.select.return_value.eq.return_value
    q.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=_msgs(3))
    result = list_messages(conversation_id="c1", caller_id="alice")
    assert result["next_cursor"] is None


@patch("app.messages.controller._require_participant")
@patch("app.messages.controller.service_client")
def test_before_cursor_applies_keyset_filter(client, _auth):
    from app.messages.controller import list_messages
    q = client.table.return_value.select.return_value.eq.return_value
    chain = q.or_.return_value
    chain.order.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    list_messages(conversation_id="c1", caller_id="alice",
                  before="2026-07-10T00:00:30+00:00|m29")
    args, _ = q.or_.call_args
    assert "created_at.lt.2026-07-10T00:00:30+00:00" in args[0]
    assert "id.lt.m29" in args[0]


def test_malformed_cursor_400():
    from app.messages.controller import list_messages
    with patch("app.messages.controller._require_participant"):
        with pytest.raises(HTTPException) as exc:
            list_messages(conversation_id="c1", caller_id="alice",
                          before="not-a-cursor")
        assert exc.value.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/test_messages_pagination.py -v`
Expected: FAIL — `list_messages` returns a list (not dict), no `before` kwarg.

- [ ] **Step 3: Implement.** Replace `list_messages` in `controller.py` with:

```python
def list_messages(
    *,
    conversation_id: str,
    caller_id: str,
    limit: int = 50,
    before: str | None = None,
) -> dict:
    """A page of messages, newest first, with keyset pagination.

    `before` is an opaque cursor "<created_at>|<id>" from a previous page.
    Returns {"messages": [...], "next_cursor": str | None} — next_cursor is
    None when there is no older history.
    """
    _require_participant(conversation_id, caller_id)
    limit = max(1, min(limit, 100))
    query = (
        service_client.table("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversation_id)
    )
    if before is not None:
        try:
            before_created_at, before_id = before.split("|", 1)
            if not before_created_at or not before_id:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="Malformed cursor")
        query = query.or_(
            f"created_at.lt.{before_created_at},"
            f"and(created_at.eq.{before_created_at},id.lt.{before_id})"
        )
    res = (
        query
        .order("created_at", desc=True)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    messages = res.data or []
    next_cursor = None
    if len(messages) == limit:
        tail = messages[-1]
        next_cursor = f"{tail['created_at']}|{tail['id']}"
    return {"messages": messages, "next_cursor": next_cursor}
```

Update the view in `views.py`:

```python
def list_messages(
    conversation_id: str,
    user_id: str = Depends(require_user),
    before: str | None = None,
    limit: int = 50,
) -> MessagesListResponse:
    page = controller.list_messages(
        conversation_id=conversation_id, caller_id=user_id,
        before=before, limit=limit,
    )
    return MessagesListResponse(**page)
```

- [ ] **Step 4: Run tests** (fix any old test in `test_messages_list.py` that asserted the bare-list return shape — the response model now carries `messages` + `next_cursor`)

Run: `venv/bin/python -m pytest tests/test_messages_pagination.py tests/test_messages_list.py tests/test_messages_endpoints.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/app/messages/views.py backend/tests/test_messages_pagination.py backend/tests/test_messages_list.py
git commit -m "feat(messages): keyset pagination for thread history"
```

---

## Task B6: `send_message` v2 — conversation_id path + rate limit

**Files:**
- Modify: `backend/app/messages/controller.py` (`send_message`), `backend/app/messages/views.py` (rate limit + request plumbing)
- Test: `backend/tests/test_messages_send_v2.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
"""send_message v2: target an existing conversation (DM or team channel)."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException


def _wire_insert(client, conv="conv-t"):
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "msg-1", "conversation_id": conv,
               "sender_id": "alice", "body": "hi", "created_at": "now"}])


def test_requires_exactly_one_target():
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", body="hi")
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", body="hi",
                     to_user_id="bob", conversation_id="c1")
    assert exc.value.status_code == 400


@patch("app.messages.controller.notify_recipients")
@patch("app.messages.controller._participant_ids",
       return_value=["alice", "bob", "carol"])
@patch("app.messages.controller._require_participant",
       return_value={"id": "conv-t", "type": "team_members",
                     "user_a": None, "user_b": None})
@patch("app.messages.controller.service_client")
def test_team_channel_send_notifies_others(client, _conv, _ids, notify):
    from app.messages.controller import send_message
    _wire_insert(client)
    result = send_message(sender_id="alice", conversation_id="conv-t", body="hi")
    assert result["conversation_id"] == "conv-t"
    _, kwargs = notify.call_args
    assert sorted(kwargs["recipient_ids"]) == ["bob", "carol"]


@patch("app.messages.controller.can_message", return_value=False)
@patch("app.messages.controller._participant_ids", return_value=["alice", "bob"])
@patch("app.messages.controller._require_participant",
       return_value={"id": "conv-d", "type": "dm",
                     "user_a": "alice", "user_b": "bob"})
@patch("app.messages.controller.service_client")
def test_dm_via_conversation_id_rechecks_eligibility(client, _conv, _ids, _can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message(sender_id="alice", conversation_id="conv-d", body="hi")
    assert exc.value.status_code == 403


@patch("app.messages.controller.notify_recipients")
@patch("app.messages.controller._get_or_create_conversation", return_value="conv-x")
@patch("app.messages.controller.can_message", return_value=True)
@patch("app.messages.controller.service_client")
def test_legacy_to_user_id_path_still_works(client, _can, _goc, notify):
    from app.messages.controller import send_message
    _wire_insert(client, conv="conv-x")
    result = send_message(sender_id="alice", to_user_id="bob", body="hi")
    assert result["conversation_id"] == "conv-x"
    _, kwargs = notify.call_args
    assert kwargs["recipient_ids"] == ["bob"]
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/test_messages_send_v2.py -v`
Expected: FAIL — unexpected keyword `conversation_id` / no `notify_recipients`.

- [ ] **Step 3: Implement.** In `controller.py`, replace the whole `send_message` function with the following (and add `notify_recipients` just above it):

```python
def notify_recipients(
    *, recipient_ids: list[str], sender_id: str, conversation_id: str, body: str,
) -> None:
    """Fan out the new-message notification to every other participant."""
    from app.notifications.controller import notify_new_message
    for recipient_id in recipient_ids:
        notify_new_message(
            recipient_id=recipient_id,
            sender_id=sender_id,
            conversation_id=conversation_id,
            body=body,
        )


def send_message(
    *,
    sender_id: str,
    body: str,
    to_user_id: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Validate, persist, and mark sender as read-up-to-now.

    Targets exactly one of:
      - to_user_id: DM shortcut (creates the conversation on first send);
      - conversation_id: an existing conversation — DM or team channel.
    Returns: {"conversation_id": "...", "message": {...row...}}.
    Raises HTTPException(400|403|404) on validation/eligibility failures.
    """
    if bool(to_user_id) == bool(conversation_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of to_user_id or conversation_id",
        )

    cleaned = body.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body) > MAX_MESSAGE_CODEPOINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Message exceeds {MAX_MESSAGE_CODEPOINTS} character limit",
        )

    if conversation_id is not None:
        conv = _require_participant(conversation_id, sender_id)
        participant_ids = _participant_ids(conversation_id)
        if conv["type"] == "dm":
            other_id = conv["user_b"] if conv["user_a"] == sender_id else conv["user_a"]
            if not can_message(sender_id, other_id):
                logger.info(
                    "send_message: blocked | sender=%s conv=%s reason=dm-ineligible",
                    sender_id, conversation_id,
                )
                raise HTTPException(status_code=403, detail="Cannot message this user")
        recipient_ids = [uid for uid in participant_ids if uid != sender_id]
    else:
        if to_user_id == sender_id:
            raise HTTPException(status_code=400, detail="Cannot message yourself")
        if not can_message(sender_id, to_user_id):
            logger.info(
                "send_message: blocked | sender=%s target=%s reason=ineligible",
                sender_id, to_user_id,
            )
            raise HTTPException(status_code=403, detail="Cannot message this user")
        conversation_id = _get_or_create_conversation(sender_id, to_user_id)
        recipient_ids = [to_user_id]

    inserted = (
        service_client.table("messages")
        .insert({
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "body": body,
        })
        .execute()
    )
    message_row = inserted.data[0]

    # Sender is implicitly "read" through their own latest send.
    service_client.table("conversation_reads").upsert({
        "conversation_id": conversation_id,
        "user_id": sender_id,
        "last_read_at": message_row["created_at"],
    }, on_conflict="conversation_id,user_id").execute()

    logger.info(
        "send_message: inserted | sender=%s conv=%s msg=%s",
        sender_id, conversation_id, message_row["id"],
    )

    notify_recipients(
        recipient_ids=recipient_ids,
        sender_id=sender_id,
        conversation_id=conversation_id,
        body=body,
    )

    return {"conversation_id": conversation_id, "message": message_row}
```

Update the view in `views.py` — slowapi needs the `Request` param, keyed by IP like every other limited route:

```python
from fastapi import Depends, Request, Response, status
from app.limiter import limiter
```

```python
@limiter.limit("30/minute")
def send_message(
    request: Request,
    body: SendMessageRequest,
    user_id: str = Depends(require_user),
) -> SendMessageResponse:
    result = controller.send_message(
        sender_id=user_id,
        to_user_id=body.to_user_id,
        conversation_id=body.conversation_id,
        body=body.body,
    )
    return SendMessageResponse(**result)
```

- [ ] **Step 4: Run tests** (update any test in `test_messages_send.py` that patched `notify_new_message` at the old import site — the controller now routes through `notify_recipients`). Note: slowapi keeps in-process counters — if `test_messages_endpoints.py` POSTs `/api/messages` more than 30 times in one run and starts seeing 429s, add an autouse fixture that calls `app.state.limiter.reset()` between tests rather than raising the limit.

Run: `venv/bin/python -m pytest tests/test_messages_send_v2.py tests/test_messages_send.py tests/test_messages_endpoints.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/app/messages/views.py backend/tests/test_messages_send_v2.py backend/tests/test_messages_send.py
git commit -m "feat(messages): send to team channels + rate-limited send endpoint"
```

---

## Task B7: Contacts endpoint (kills the browser fan-out)

**Files:**
- Modify: `backend/app/messages/controller.py` (add `list_contacts`), `backend/app/messages/views.py`, `backend/app/messages/url.py`
- Test: `backend/tests/test_messages_contacts.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
"""Server-side messageable-users list."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


def _wire(client, *, owned, enrolled, class_enrollments, class_owners, profiles):
    """Route table() calls to canned data by table + call order."""
    def table(name):
        m = MagicMock()
        chain = m.select.return_value
        if name == "classes":
            # 1st: caller-owned classes (.eq); 2nd: owners of class ids (.in_)
            chain.eq.return_value.execute.return_value = MagicMock(data=owned)
            chain.in_.return_value.execute.return_value = MagicMock(data=class_owners)
        elif name == "class_enrollments":
            chain.eq.return_value.execute.return_value = MagicMock(data=enrolled)
            chain.in_.return_value.execute.return_value = MagicMock(data=class_enrollments)
        elif name == "profiles":
            chain.in_.return_value.execute.return_value = MagicMock(data=profiles)
        return m
    client.table.side_effect = table


@patch("app.messages.controller.service_client")
def test_contacts_excludes_self_and_instructor_pairs(client):
    from app.messages.controller import list_contacts
    _wire(
        client,
        owned=[{"id": "cls1", "created_by": "prof"}],   # caller owns cls1
        enrolled=[],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "prof"},
        ],
        class_owners=[{"id": "cls1", "created_by": "prof2"}],
        profiles=[
            {"id": "prof", "role": "instructor", "email": "p@u.e",
             "first_name": "Pat", "last_name": "Prof", "image_url": None},
            {"id": "prof2", "role": "instructor", "email": "p2@u.e",
             "first_name": "Pam", "last_name": "Prof", "image_url": None},
            {"id": "stu1", "role": "student", "email": "s@u.e",
             "first_name": "Sam", "last_name": "Stu", "image_url": None},
        ],
    )
    contacts = list_contacts(caller_id="prof")
    ids = {c["id"] for c in contacts}
    assert "stu1" in ids          # student peer included
    assert "prof" not in ids      # never include self
    assert "prof2" not in ids     # instructor↔instructor excluded


@patch("app.messages.controller.service_client")
def test_contacts_query_filters_by_name(client):
    from app.messages.controller import list_contacts
    _wire(
        client,
        owned=[],
        enrolled=[{"class_id": "cls1"}],
        class_enrollments=[
            {"class_id": "cls1", "user_id": "stu1"},
            {"class_id": "cls1", "user_id": "stu2"},
        ],
        class_owners=[],
        profiles=[
            {"id": "me", "role": "student", "email": "me@u.e",
             "first_name": "Me", "last_name": "M", "image_url": None},
            {"id": "stu1", "role": "student", "email": "s@u.e",
             "first_name": "Samantha", "last_name": "Stone", "image_url": None},
            {"id": "stu2", "role": "student", "email": "j@u.e",
             "first_name": "Jo", "last_name": "Jones", "image_url": None},
        ],
    )
    contacts = list_contacts(caller_id="me", query="stone")
    assert [c["id"] for c in contacts] == ["stu1"]
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/test_messages_contacts.py -v`
Expected: FAIL — `ImportError: cannot import name 'list_contacts'`.

- [ ] **Step 3: Implement.** Append to `controller.py`:

```python
def list_contacts(*, caller_id: str, query: str | None = None) -> list[dict]:
    """Everyone the caller may DM: peers across the caller's classes
    (enrolled students/TAs + class owners), minus self and minus
    instructor↔instructor pairs. Optional case-insensitive name/email filter.

    Replaces the frontend's per-class getClassStudents() fan-out.
    """
    owned = (
        service_client.table("classes")
        .select("id, created_by")
        .eq("created_by", caller_id)
        .execute()
    )
    enrolled = (
        service_client.table("class_enrollments")
        .select("class_id")
        .eq("user_id", caller_id)
        .execute()
    )
    class_ids = sorted(
        {r["id"] for r in (owned.data or [])}
        | {r["class_id"] for r in (enrolled.data or [])}
    )
    if not class_ids:
        return []

    peers_enrolled = (
        service_client.table("class_enrollments")
        .select("class_id, user_id")
        .in_("class_id", class_ids)
        .execute()
    )
    peers_owning = (
        service_client.table("classes")
        .select("id, created_by")
        .in_("id", class_ids)
        .execute()
    )
    peer_ids = (
        {r["user_id"] for r in (peers_enrolled.data or [])}
        | {r["created_by"] for r in (peers_owning.data or [])}
    ) - {caller_id}
    if not peer_ids:
        return []

    profiles_res = (
        service_client.table("profiles")
        .select("id, email, role, first_name, last_name, image_url")
        .in_("id", sorted(peer_ids | {caller_id}))
        .execute()
    )
    profiles = {p["id"]: p for p in (profiles_res.data or [])}
    caller_role = (profiles.get(caller_id) or {}).get("role")

    needle = (query or "").strip().lower()
    out: list[dict] = []
    for uid in sorted(peer_ids):
        p = profiles.get(uid)
        if not p:
            continue
        if caller_role == "instructor" and p.get("role") == "instructor":
            continue
        first = (p.get("first_name") or "").strip()
        last = (p.get("last_name") or "").strip()
        name = f"{first} {last}".strip() or None
        if needle:
            haystack = f"{name or ''} {p.get('email') or ''}".lower()
            if needle not in haystack:
                continue
        out.append({
            "id": uid,
            "name": name,
            "first_name": p.get("first_name"),
            "last_name": p.get("last_name"),
            "email": p.get("email"),
            "image_url": p.get("image_url"),
            "role": p.get("role"),
        })
    out.sort(key=lambda c: (c["name"] or c["email"] or "").lower())
    return out[:500]
```

Add the view in `views.py` (import `ContactsListResponse` from models):

```python
def list_contacts(
    user_id: str = Depends(require_user),
    q: str | None = None,
) -> ContactsListResponse:
    return ContactsListResponse(contacts=controller.list_contacts(caller_id=user_id, query=q))
```

Add the route in `url.py` (before the parameterized conversation routes for clarity):

```python
router.get('/contacts')(views.list_contacts)
```

- [ ] **Step 4: Run tests**

Run: `venv/bin/python -m pytest tests/test_messages_contacts.py tests/test_messages_endpoints.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/app/messages/views.py backend/app/messages/url.py backend/tests/test_messages_contacts.py
git commit -m "feat(messages): server-side contacts endpoint"
```

---

## Task B8: Notify all roles (not just students)

**Files:**
- Modify: `backend/app/notifications/controller.py` (`notify_new_message`, ~line 356)
- Test: `backend/tests/test_notifications_messages.py` (new)

- [ ] **Step 1: Write the failing test**

```python
"""Message notifications reach TAs and instructors too (group channels)."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


@patch("app.notifications.controller._upsert_unread_notification")
@patch("app.notifications.controller.profile_display_name", return_value="Alice A")
@patch("app.notifications.controller._get_profile", return_value={"id": "alice"})
def test_notifies_non_students(_prof, _name, upsert):
    from app.notifications.controller import notify_new_message
    notify_new_message(
        recipient_id="ta-1", sender_id="alice",
        conversation_id="conv-t", body="hello team",
    )
    upsert.assert_called_once()
    _, kwargs = upsert.call_args
    assert kwargs["user_id"] == "ta-1"
    assert kwargs["type"] == "message"
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/test_notifications_messages.py -v`
Expected: FAIL — `_upsert_unread_notification` not called. If it fails instead on `get_user_role` being invoked (network/mock error), that confirms the guard is still present.

- [ ] **Step 3: Implement.** In `notify_new_message`, delete the two guard lines and update the docstring:

```python
    """Notify a participant when they receive a new message.

    All roles get message notifications — TA/instructor channels mean staff
    must hear replies (changed 2026-07-14; was students-only)."""
```

(i.e. remove:)

```python
    if get_user_role(recipient_id) != "student":
        return
```

- [ ] **Step 4: Run tests**

Run: `venv/bin/python -m pytest tests/test_notifications_messages.py -v`
Expected: PASS. Also run `venv/bin/python -m pytest tests/ -v` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/notifications/controller.py backend/tests/test_notifications_messages.py
git commit -m "feat(notifications): message notifications for all roles"
```

---

## Task A1: Vendor design-system tokens + Fira Code

**Files:**
- Create: `frontend/src/styles/tokens/colors.css`, `frontend/src/styles/tokens/typography.css`, `frontend/src/styles/tokens/spacing.css` (copied verbatim from the zip)
- Modify: `frontend/src/main.tsx`, `frontend/index.html`

- [ ] **Step 1: Copy token files from the zip**

```bash
mkdir -p frontend/src/styles/tokens
unzip -o -j "/Users/pronei/work/CSE115C/grepthink2.0/GrepThink Design System.zip" \
  "tokens/colors.css" "tokens/typography.css" "tokens/spacing.css" \
  -d frontend/src/styles/tokens
```

(`tokens/fonts.css` is deliberately NOT vendored — its Google-Fonts `@import` would block CSS; fonts load from `index.html` per codebase idiom.)

- [ ] **Step 2: Load tokens globally.** In `frontend/src/main.tsx`, add above the existing `import '@/index.css';` line:

```tsx
import '@/styles/tokens/colors.css';
import '@/styles/tokens/typography.css';
import '@/styles/tokens/spacing.css';
```

- [ ] **Step 3: Add Fira Code to `frontend/index.html`.** Find the existing Google Fonts `<link>` for Poppins and extend the family list (or add a sibling link immediately after it):

```html
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/tokens frontend/src/main.tsx frontend/index.html
git commit -m "feat(design): vendor gt design tokens + Fira Code"
```

---

## Task A2: SCSS bridge — fix error color, wire values to tokens

**Files:**
- Modify: `frontend/src/styles/_colors.scss`

- [ ] **Step 1: Find every `$error-color` / raw `#ff3b30` usage**

Run: `cd frontend && grep -rn '\$error-color\|#ff3b30\|#FF3B30' src --include='*.scss' --include='*.tsx'`
Note each hit. Per spec, the sidebar unread badge keeps `#ff3b30`; everything else moves to `#DC2626`.

- [ ] **Step 2: Pin the badge, flip the variable.** In the sidebar SCSS hit(s) that style the unread badge (from Step 1, e.g. `Sidebar.scss`), replace `$error-color` with the literal `#ff3b30` plus comment `// legacy badge red — kept verbatim per design spec`. Then in `_colors.scss` replace the status block:

```scss
// Status Colors — semantic values match src/styles/tokens/colors.css (--gt-error etc.)
$error-color: #DC2626;
$error-soft: #FDECEA;
$error-text: #B91C1C;
$success-soft: #E6F4EF;
$disabled-bg: #cccccc;
```

- [ ] **Step 3: Verify build + visual spot-check**

Run: `npm run build`
Expected: clean. Grep once more for `$error-color` — remaining usages are intentional (#DC2626 consumers).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/_colors.scss frontend/src/features
git commit -m "fix(design): standardize error color on #DC2626 (badge keeps legacy red)"
```

---

## Task A3: Motion layer + focus ring + view-transition CSS

**Files:**
- Create: `frontend/src/styles/_motion.scss`
- Modify: `frontend/src/styles/index.scss`, `frontend/src/index.css`

- [ ] **Step 1: Create `frontend/src/styles/_motion.scss`**

```scss
/**
 * Motion primitives — the design system's calm spec:
 * 0.2s ease (fast) / 0.3s ease (medium); fades and small slides only;
 * press = 0.5px nudge; NO scale transforms. A global reduced-motion
 * kill switch lives in index.css.
 */
@use './variables' as *;

@mixin gt-transition($props...) {
  transition-property: $props;
  transition-duration: 0.2s;
  transition-timing-function: ease;
}

@mixin gt-transition-medium($props...) {
  transition-property: $props;
  transition-duration: 0.3s;
  transition-timing-function: ease;
}

/// Press feedback: a 0.5px downward nudge, never a shrink.
@mixin gt-press {
  &:active {
    transform: translateY(0.5px);
  }
}

/// Popover/dropdown entrance: 6px slide + fade, 0.15s.
@mixin gt-popover-enter {
  animation: gt-pop-in 0.15s ease both;
}

@keyframes gt-pop-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/// Message/list-item entrance: 4px rise + fade.
@keyframes gt-rise-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Forward it.** In `frontend/src/styles/index.scss` add to the forward list:

```scss
@forward './motion';
```

- [ ] **Step 3: Globals.** Append to `frontend/src/index.css`:

```css
/* ---- gt design system globals ---- */

/* Standardized always-visible focus ring (accent blue, 2px). */
:where(a, button, input, textarea, select, summary, [tabindex]):focus-visible {
  outline: none;
  box-shadow: var(--gt-focus-ring);
}

/* Route changes: quick cross-fade via the View Transitions API. */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 0.2s;
  animation-timing-function: ease;
}

/* Reduced-motion kill switch — spec requires honoring it everywhere. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none !important;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/_motion.scss frontend/src/styles/index.scss frontend/src/index.css
git commit -m "feat(design): motion primitives, standardized focus ring, view-transition base"
```

---

## Task F1: API client v2 types + methods

**Files:**
- Modify: `frontend/src/lib/api.ts` (messages type block ~line 378 and methods block ~line 1244)

- [ ] **Step 1: Replace the messages type block** (`ApiMessageOtherUser` through `ApiConversationSummary`) with:

```ts
export type ConversationType = 'dm' | 'team_ta' | 'team_instructor' | 'team_members';

export interface ApiMessageOtherUser {
  id: string;
  email: string | null;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

export interface ApiParticipant {
  id: string;
  role: 'member' | 'ta' | 'instructor';
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  last_read_at?: string | null;
}

export interface ApiMessagePreview {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ApiMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ApiConversationSummary {
  id: string;
  type: ConversationType;
  project_id: string | null;
  team_name: string | null;
  participants: ApiParticipant[];
  /** Populated for type='dm' only. */
  other_user: ApiMessageOtherUser | null;
  last_message: ApiMessagePreview | null;
  unread_count: number;
  other_user_last_read_at: string | null;
  can_send: boolean;
  last_message_at: string | null;
}

export interface ApiContact {
  id: string;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  image_url?: string | null;
  role?: string | null;
}
```

- [ ] **Step 2: Replace the messages methods block** with:

```ts
  // ----- Messages ----------------------------------------------------------

  /** Inbox: caller's conversations (DMs + team channels) by latest activity. */
  getConversations: async () => {
    return apiRequest<{ conversations: ApiConversationSummary[] }>('/api/messages/conversations');
  },

  /** Send a message. Exactly one target: an existing conversation (DM or
   *  team channel) via conversationId, or a new DM via toUserId. */
  sendMessage: async (args: { conversationId?: string; toUserId?: string; body: string }) => {
    return apiRequest<{ conversation_id: string; message: ApiMessage }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: args.conversationId,
        to_user_id: args.toUserId,
        body: args.body,
      }),
    });
  },

  /** A page of messages (newest first). Pass `before` (next_cursor from the
   *  previous page) to load older history. */
  getMessages: async (conversationId: string, opts?: { before?: string }) => {
    const params = opts?.before ? `?before=${encodeURIComponent(opts.before)}` : '';
    return apiRequest<{ messages: ApiMessage[]; next_cursor: string | null }>(
      `/api/messages/conversations/${conversationId}/messages${params}`,
    );
  },

  /** Server-side messageable-users list (replaces per-class fan-out). */
  getContacts: async (q?: string) => {
    const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return apiRequest<{ contacts: ApiContact[] }>(`/api/messages/contacts${params}`);
  },

  /** Mark conversation as read through now(). 204 on success. */
  markConversationRead: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  },

  /** Hide a conversation from the caller's inbox (idempotent). 204 on success. */
  deleteConversation: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  },
```

- [ ] **Step 3: Fix compile errors at call sites.** `npx tsc -b` (or `npm run build`) will flag every `sendMessage(userId, body)` caller — `ConversationThread.tsx`, `NewConversationCompose.tsx`, and any widget path. Update each to the object form now (`api.sendMessage({ toUserId, body })` keeps old behavior); Tasks F4–F7 rewrite them properly. Also add `conversationTitle` consumers later — nothing else changes here.

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/features/messages
git commit -m "feat(messages): api client v2 — types, cursor pagination, contacts"
```

---

## Task F2: Inbox provider — delta-apply realtime

**Files:**
- Create: `frontend/src/features/messages/inboxReducer.ts`, `frontend/src/features/messages/__tests__/inboxReducer.test.ts`
- Modify: `frontend/src/features/messages/hooks/useConversations.tsx`, `frontend/src/features/messages/hooks/useUnreadTotal.ts` (comment fix only)

- [ ] **Step 1: Write the failing reducer tests** (`__tests__/inboxReducer.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { applyIncomingMessage, type IncomingMessageRow } from '../inboxReducer';
import type { ApiConversationSummary } from '@/lib/api';

const conv = (id: string, at: string | null): ApiConversationSummary => ({
  id, type: 'dm', project_id: null, team_name: null, participants: [],
  other_user: { id: 'x', email: null, name: null }, last_message: null,
  unread_count: 0, other_user_last_read_at: null, can_send: true,
  last_message_at: at,
});

const msg = (cid: string, sender: string, at: string): IncomingMessageRow => ({
  id: `m-${at}`, conversation_id: cid, sender_id: sender, body: 'hi', created_at: at,
});

describe('applyIncomingMessage', () => {
  it('patches preview, bumps unread for messages from others, resorts', () => {
    const prev = [conv('a', '2026-07-10T00:00:00Z'), conv('b', '2026-07-11T00:00:00Z')];
    const { next, unknownConversation } = applyIncomingMessage(
      prev, msg('a', 'them', '2026-07-12T00:00:00Z'), 'me');
    expect(unknownConversation).toBe(false);
    expect(next[0].id).toBe('a');                       // resorted to top
    expect(next[0].unread_count).toBe(1);
    expect(next[0].last_message?.body).toBe('hi');
    expect(next[0].last_message_at).toBe('2026-07-12T00:00:00Z');
  });

  it('does not bump unread for own messages', () => {
    const prev = [conv('a', null)];
    const { next } = applyIncomingMessage(prev, msg('a', 'me', '2026-07-12T00:00:00Z'), 'me');
    expect(next[0].unread_count).toBe(0);
  });

  it('flags unknown conversations for a refetch', () => {
    const { next, unknownConversation } = applyIncomingMessage(
      [conv('a', null)], msg('zzz', 'them', '2026-07-12T00:00:00Z'), 'me');
    expect(unknownConversation).toBe(true);
    expect(next.length).toBe(1);
  });

  it('normalizes postgres space-separated timestamps', () => {
    const prev = [conv('a', null)];
    const { next } = applyIncomingMessage(
      prev, msg('a', 'them', '2026-07-12 00:00:00+00'), 'me');
    expect(next[0].last_message_at).toBe('2026-07-12T00:00:00+00');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/features/messages`
Expected: FAIL — module `../inboxReducer` not found.

- [ ] **Step 3: Implement `inboxReducer.ts`**

```ts
import type { ApiConversationSummary } from '@/lib/api';

/** Raw `messages` row from a Supabase Realtime INSERT payload. */
export interface IncomingMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/** Realtime serializes timestamptz with a space; Date parsing (esp. Safari)
 *  wants the ISO 'T'. Normalize once at the ingestion boundary. */
export const normalizeTimestamp = (ts: string): string => ts.replace(' ', 'T');

const byLatest = (a: ApiConversationSummary, b: ApiConversationSummary) =>
  (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '');

/**
 * Pure delta-apply for an incoming message: patch that conversation's
 * preview/unread/sort in place. Returns unknownConversation=true when the
 * message references a conversation not in the list (new DM / new channel)
 * — the caller refetches the inbox once for that case.
 */
export function applyIncomingMessage(
  prev: ApiConversationSummary[],
  raw: IncomingMessageRow,
  meId: string,
): { next: ApiConversationSummary[]; unknownConversation: boolean } {
  const created_at = normalizeTimestamp(raw.created_at);
  const idx = prev.findIndex(c => c.id === raw.conversation_id);
  if (idx === -1) return { next: prev, unknownConversation: true };

  const target = prev[idx];
  const patched: ApiConversationSummary = {
    ...target,
    last_message: {
      id: raw.id, sender_id: raw.sender_id, body: raw.body, created_at,
    },
    last_message_at: created_at,
    unread_count: raw.sender_id === meId
      ? target.unread_count
      : target.unread_count + 1,
  };
  const next = [...prev.slice(0, idx), patched, ...prev.slice(idx + 1)].sort(byLatest);
  return { next, unknownConversation: false };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/messages`
Expected: PASS.

- [ ] **Step 5: Rewire the provider.** In `useConversations.tsx`:
  1. Replace the two `postgres_changes`-on-`conversations` handlers with ONE handler on `messages` INSERTs (RLS scopes delivery to conversations the user participates in — that's why the migration's participant policy matters):

```tsx
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as IncomingMessageRow;
          setConversations(prev => {
            const { next, unknownConversation } = applyIncomingMessage(prev, row, userId);
            if (unknownConversation) void refetch();
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch();
      });
```

  2. Import `applyIncomingMessage`/`IncomingMessageRow` from `../inboxReducer`.
  3. Update the provider docblock: it now delta-applies incoming messages and refetches only on (re)connect or unknown conversations — no refetch-per-event.
  4. Keep `refetch`, `optimisticMarkRead`, and the context shape unchanged (Sidebar/Header/widget consumers untouched).

- [ ] **Step 6: Fix the stale comment** in `useUnreadTotal.ts` — replace the "polled every 15s" sentence with: `Sums per-conversation counts from the realtime-maintained inbox provider.`

- [ ] **Step 7: Build + test**

Run: `npm run build && npx vitest run src/features/messages`
Expected: clean + PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/messages
git commit -m "feat(messages): delta-apply inbox realtime — no refetch storms"
```

---

## Task F3: Thread hook — append delta + scroll-up pagination

**Files:**
- Create: `frontend/src/features/messages/threadReducer.ts`, `frontend/src/features/messages/__tests__/threadReducer.test.ts`
- Modify: `frontend/src/features/messages/hooks/useConversationMessages.ts`

- [ ] **Step 1: Write the failing reducer tests**

```ts
import { describe, expect, it } from 'vitest';
import { appendMessage, prependOlder, reconcileOptimistic } from '../threadReducer';
import type { ApiMessage } from '@/lib/api';

const m = (id: string, at: string): ApiMessage =>
  ({ id, sender_id: 's', body: 'b', created_at: at });

describe('threadReducer', () => {
  it('appendMessage dedupes by id', () => {
    const prev = [m('a', '1'), m('b', '2')];
    expect(appendMessage(prev, m('b', '2'))).toBe(prev);       // no-op
    expect(appendMessage(prev, m('c', '3'))).toHaveLength(3);  // appended
  });

  it('reconcileOptimistic swaps temp for server row, deduping the echo', () => {
    const prev = [m('temp-1', '1')];
    const real = m('server-1', '1');
    const next = reconcileOptimistic(prev, 'temp-1', real);
    expect(next.map(x => x.id)).toEqual(['server-1']);
    // realtime echo of the same row later is a no-op
    expect(appendMessage(next, real)).toBe(next);
  });

  it('prependOlder puts older page first and dedupes overlap', () => {
    const cur = [m('c', '3'), m('d', '4')];
    const older = [m('a', '1'), m('b', '2'), m('c', '3')]; // overlap on c
    expect(prependOlder(cur, older).map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/messages`
Expected: FAIL — module `../threadReducer` not found.

- [ ] **Step 3: Implement `threadReducer.ts`**

```ts
import type { ApiMessage } from '@/lib/api';

/** Append a message if its id isn't present (dedupes realtime echoes of
 *  optimistic sends). Returns the same array reference on no-op. */
export function appendMessage(prev: ApiMessage[], msg: ApiMessage): ApiMessage[] {
  if (prev.some(x => x.id === msg.id)) return prev;
  return [...prev, msg];
}

/** Replace an optimistic temp message with the server row (or append if the
 *  temp was already dropped), never duplicating the server id. */
export function reconcileOptimistic(
  prev: ApiMessage[],
  tempId: string,
  real: ApiMessage,
): ApiMessage[] {
  if (prev.some(x => x.id === real.id)) {
    return prev.filter(x => x.id !== tempId);
  }
  const idx = prev.findIndex(x => x.id === tempId);
  if (idx === -1) return [...prev, real];
  const next = [...prev];
  next[idx] = real;
  return next;
}

/** Prepend an older (chronological) page, dropping any overlap with the
 *  current window. */
export function prependOlder(prev: ApiMessage[], older: ApiMessage[]): ApiMessage[] {
  const seen = new Set(prev.map(x => x.id));
  return [...older.filter(x => !seen.has(x.id)), ...prev];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/messages`
Expected: PASS.

- [ ] **Step 5: Rewrite `useConversationMessages.ts`** as:

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { api, type ApiMessage } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { appendMessage, prependOlder, reconcileOptimistic } from '../threadReducer';
import { normalizeTimestamp, type IncomingMessageRow } from '../inboxReducer';

interface State {
  messages: ApiMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string | null;
}

/**
 * A thread's messages in chronological order (oldest first). Loads the
 * latest page once, then applies realtime INSERTs as deltas (deduped by id
 * against optimistic sends) — no refetch per event. loadOlder() pages
 * history upward via the keyset cursor.
 */
export function useConversationMessages(conversationId: string | null) {
  const [state, setState] = useState<State>({
    messages: [], loading: true, loadingOlder: false, hasMore: false, error: null,
  });
  const cursor = useRef<string | null>(null);
  const cancelled = useRef(false);

  const loadInitial = useCallback(async (id: string) => {
    try {
      const res = await api.getMessages(id);
      if (cancelled.current) return;
      cursor.current = res.next_cursor;
      setState({
        messages: [...res.messages].reverse(), // newest-first → chronological
        loading: false, loadingOlder: false,
        hasMore: res.next_cursor != null, error: null,
      });
    } catch (err) {
      if (cancelled.current) return;
      setState(prev => ({ ...prev, loading: false, error: (err as Error).message }));
    }
  }, []);

  const loadOlder = useCallback(async () => {
    const before = cursor.current;
    if (!conversationId || !before) return;
    setState(prev => prev.loadingOlder ? prev : { ...prev, loadingOlder: true });
    try {
      const res = await api.getMessages(conversationId, { before });
      if (cancelled.current) return;
      cursor.current = res.next_cursor;
      setState(prev => ({
        ...prev,
        messages: prependOlder(prev.messages, [...res.messages].reverse()),
        loadingOlder: false,
        hasMore: res.next_cursor != null,
      }));
    } catch {
      if (!cancelled.current) {
        setState(prev => ({ ...prev, loadingOlder: false }));
      }
    }
  }, [conversationId]);

  useEffect(() => {
    cancelled.current = false;
    cursor.current = null;
    if (!conversationId) {
      setState({ messages: [], loading: false, loadingOlder: false, hasMore: false, error: null });
      return;
    }
    setState(prev => ({ ...prev, loading: true }));
    loadInitial(conversationId);
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as IncomingMessageRow;
          const msg: ApiMessage = {
            id: row.id, sender_id: row.sender_id, body: row.body,
            created_at: normalizeTimestamp(row.created_at),
          };
          setState(prev => {
            const next = appendMessage(prev.messages, msg);
            return next === prev.messages ? prev : { ...prev, messages: next };
          });
        },
      )
      .subscribe((status) => {
        // On (re)connect, reload the latest page — events may have been missed.
        if (status === 'SUBSCRIBED') loadInitial(conversationId);
      });
    return () => {
      cancelled.current = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadInitial]);

  const addOptimisticMessage = useCallback((msg: ApiMessage) => {
    setState(prev => ({ ...prev, messages: [...prev.messages, msg] }));
  }, []);

  const confirmOptimistic = useCallback((tempId: string, real: ApiMessage) => {
    setState(prev => ({
      ...prev,
      messages: reconcileOptimistic(prev.messages, tempId, real),
    }));
  }, []);

  const dropOptimistic = useCallback((tempId: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== tempId),
    }));
  }, []);

  return { ...state, loadOlder, addOptimisticMessage, confirmOptimistic, dropOptimistic };
}
```

- [ ] **Step 6: Build + test** (ConversationThread still compiles against the old return shape — `refetch` is gone; if the build flags it, patch the call sites minimally now, Task F5 rewrites the component)

Run: `npm run build && npx vitest run src/features/messages`
Expected: clean + PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/messages
git commit -m "feat(messages): thread delta realtime + scroll-up keyset pagination"
```

---

## Task F4: Conversation title helper + ConversationList with type badges

**Files:**
- Create: `frontend/src/features/messages/conversationTitle.ts`, `frontend/src/features/messages/__tests__/conversationTitle.test.ts`
- Modify: `frontend/src/features/messages/components/ConversationList.tsx`

- [ ] **Step 1: Failing tests for the title helper**

```ts
import { describe, expect, it } from 'vitest';
import { conversationTitle, conversationBadge } from '../conversationTitle';
import type { ApiConversationSummary } from '@/lib/api';

const base: Omit<ApiConversationSummary, 'type' | 'team_name' | 'other_user'> = {
  id: 'c', project_id: 'p', participants: [], last_message: null,
  unread_count: 0, other_user_last_read_at: null, can_send: true,
  last_message_at: null,
};

describe('conversationTitle', () => {
  it('uses the peer name for DMs', () => {
    const conv = { ...base, type: 'dm', team_name: null,
      other_user: { id: 'x', email: 'x@ucsc.edu', name: 'Xena X' } } as ApiConversationSummary;
    expect(conversationTitle(conv)).toBe('Xena X');
  });

  it('uses the team name for channels', () => {
    const conv = { ...base, type: 'team_ta', team_name: 'Team Rocket',
      other_user: null } as ApiConversationSummary;
    expect(conversationTitle(conv)).toBe('Team Rocket');
  });
});

describe('conversationBadge', () => {
  it('maps channel types to short labels', () => {
    expect(conversationBadge('dm')).toBeNull();
    expect(conversationBadge('team_ta')).toBe('TA');
    expect(conversationBadge('team_instructor')).toBe('Instructor');
    expect(conversationBadge('team_members')).toBe('Team');
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **implement `conversationTitle.ts`**:

```ts
import type { ApiConversationSummary, ConversationType } from '@/lib/api';

/** Display title: DM → peer name/email; channel → team name. */
export function conversationTitle(conv: ApiConversationSummary): string {
  if (conv.type === 'dm') {
    return conv.other_user?.name || conv.other_user?.email || 'Unknown';
  }
  return conv.team_name || 'Your team';
}

/** Short type chip; null for DMs (no chip). */
export function conversationBadge(type: ConversationType): string | null {
  switch (type) {
    case 'team_ta': return 'TA';
    case 'team_instructor': return 'Instructor';
    case 'team_members': return 'Team';
    default: return null;
  }
}
```

Run: `npx vitest run src/features/messages` — Expected: PASS.

- [ ] **Step 3: Update `ConversationList.tsx`.** Keep the component's existing props (`conversations`, `loading`, `activeId`, `onSelect`), row structure, avatar, relative-time, and unread-badge rendering. Make exactly these changes:
  1. Row title: replace the inline other-user name derivation with `conversationTitle(conv)`.
  2. Avatar: for channels pass the team name to `InitialsAvatar` (`name={conversationTitle(conv)}`, no email/image).
  3. After the title element, render the chip when present:

```tsx
{conversationBadge(conversation.type) && (
  <span className={`gt-convo__chip gt-convo__chip--${conversation.type}`}>
    {conversationBadge(conversation.type)}
  </span>
)}
```

  4. Preview line: when the last message exists and `last_message.sender_id === user?.id`, prefix with `You: ` (import `useAuth` if the component doesn't already have the user).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/messages
git commit -m "feat(messages): unified inbox rows with channel type chips"
```

---

## Task F5: ConversationThread — group rendering + infinite history

**Files:**
- Modify: `frontend/src/features/messages/components/ConversationThread.tsx`, `frontend/src/features/messages/components/MessageBubble.tsx`

- [ ] **Step 1: Extend `MessageBubble.tsx`** (full replacement — adds author line for group messages):

```tsx
import React from 'react';
import type { ApiMessage } from '@/lib/api';

interface Props {
  message: ApiMessage;
  isMine: boolean;
  /** Sender display name — rendered above the bubble for group threads. */
  author?: string | null;
  /** True while an optimistic send awaits the server row. */
  pending?: boolean;
}

/** Single message bubble — left-aligned for theirs, right-aligned for mine. */
export const MessageBubble: React.FC<Props> = ({ message, isMine, author, pending }) => {
  return (
    <div
      className={[
        'messages-bubble',
        `messages-bubble--${isMine ? 'mine' : 'theirs'}`,
        pending ? 'messages-bubble--pending' : '',
      ].filter(Boolean).join(' ')}
    >
      {!isMine && author && <div className="messages-bubble__author">{author}</div>}
      <div className="messages-bubble__body">{message.body}</div>
      <div className="messages-bubble__time">
        {new Date(message.created_at).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Rewrite `ConversationThread.tsx`.** Keep the existing props contract (`conversation`, `onDeleted`, `headerAvatarSize`, `hideHeader`), the header/menu/skeleton/empty-state structure, mark-read effect, and near-bottom autoscroll. Changes:

  1. **Imports/state**: pull `loadOlder`, `loadingOlder`, `hasMore`, `confirmOptimistic`, `dropOptimistic` from the rewritten hook; import `conversationTitle` from `../conversationTitle`; import `useConversations` only for `optimisticMarkRead` (drop `refetchInbox` — realtime handles the inbox).
  2. **Group metadata**:

```tsx
const isGroup = conversation.type !== 'dm';
const senderNames = useMemo(() => {
  const map = new Map<string, string>();
  for (const p of conversation.participants) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Unknown';
    map.set(p.id, name);
  }
  return map;
}, [conversation.participants]);
```

  3. **Header title**: `conversationTitle(conversation)`; for groups add a subtitle line under the title listing participant names (`Array.from(senderNames.values()).join(', ')`) with class `messages-thread__subtitle`.
  4. **History sentinel** — first child inside `.messages-thread__scroll`:

```tsx
{hasMore && (
  <div ref={topSentinelRef} className="messages-thread__older">
    {loadingOlder ? 'Loading earlier messages…' : ''}
  </div>
)}
```

with the observer + scroll-anchoring effects:

```tsx
const topSentinelRef = useRef<HTMLDivElement>(null);
const prevScrollHeight = useRef(0);

useEffect(() => {
  const sentinel = topSentinelRef.current;
  const scroller = scrollRef.current;
  if (!sentinel || !scroller || !hasMore) return;
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loadingOlder) {
      prevScrollHeight.current = scroller.scrollHeight;
      void loadOlder();
    }
  }, { root: scroller, rootMargin: '120px' });
  obs.observe(sentinel);
  return () => obs.disconnect();
}, [hasMore, loadingOlder, loadOlder]);

// Keep the viewport anchored when older messages are prepended.
useLayoutEffect(() => {
  const scroller = scrollRef.current;
  if (!scroller || !prevScrollHeight.current) return;
  scroller.scrollTop += scroller.scrollHeight - prevScrollHeight.current;
  prevScrollHeight.current = 0;
}, [messages.length]);
```

  5. **Day separators + bubbles** — replace the plain `messages.map` with:

```tsx
{messages.map((m, i) => {
  const day = new Date(m.created_at).toDateString();
  const prevDay = i > 0 ? new Date(messages[i - 1].created_at).toDateString() : null;
  return (
    <React.Fragment key={m.id}>
      {day !== prevDay && (
        <div className="messages-thread__day">
          {new Date(m.created_at).toLocaleDateString([], {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </div>
      )}
      <MessageBubble
        message={m}
        isMine={m.sender_id === user?.id}
        author={isGroup ? senderNames.get(m.sender_id) ?? 'Unknown' : null}
        pending={m.id.startsWith('temp-')}
      />
    </React.Fragment>
  );
})}
```

  6. **Send path** — replace `handleSend` with:

```tsx
const handleSend = async (body: string) => {
  const tempId = `temp-${Date.now()}`;
  addOptimisticMessage({
    id: tempId,
    sender_id: user!.id,
    body,
    created_at: new Date().toISOString(),
  });
  try {
    const res = await api.sendMessage({ conversationId: conversation.id, body });
    confirmOptimistic(tempId, res.message);
  } catch (err) {
    dropOptimistic(tempId);
    throw err;
  }
};
```

  7. **Seen receipt**: guard the existing `seenAt` block with `conversation.type === 'dm' && conversation.other_user`.
  8. **Composer disabled copy**: `disabledReason={isGroup ? "You're no longer in this team channel." : \`You and ${title} don't currently share a class. Conversation is read-only.\`}`.
  9. **Mark-read effect**: also call `optimisticMarkRead(conversation.id)` so the sidebar badge clears instantly; delete the stale "poll tick" comment.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/messages
git commit -m "feat(messages): group threads — sender names, day separators, infinite history"
```

---

## Task F6: Messages SCSS — design-system restyle + motion

**Files:**
- Modify: `frontend/src/features/messages/pages/Messages.scss`

- [ ] **Step 1: Restyle to tokens.** Keep every existing selector (`.messages-page*`, `.messages-thread*`, `.messages-bubble*`, `.messages-composer*`, `.message-widget*`, conversation-list classes) and the responsive/layout rules; replace hard-coded values with tokens and add the new elements. Concretely:
  1. Add `@use '@styles/index.scss' as *;` if not present (for motion mixins).
  2. Swap colors: surfaces → `var(--gt-surface)`, canvas → `var(--gt-canvas)`, borders → `var(--gt-border)`, primary text → `var(--gt-text-primary)`, secondary/tertiary text → `var(--gt-text-secondary)`/`var(--gt-text-tertiary)`, greens → `var(--gt-primary)`/`var(--gt-primary-hover)`, focus states → `box-shadow: var(--gt-focus-ring-tight)`.
  3. Cards/panels: `border-radius: var(--gt-radius-md); box-shadow: var(--gt-shadow-card);`.
  4. Bubbles:

```scss
.messages-bubble {
  max-width: 72%;
  padding: 8px 12px;
  border-radius: var(--gt-radius-md);
  animation: gt-rise-in 0.2s ease both;

  &--mine {
    align-self: flex-end;
    background: var(--gt-primary);
    color: var(--gt-text-inverse);
    .messages-bubble__time { color: rgba(255, 255, 255, 0.75); }
  }
  &--theirs {
    align-self: flex-start;
    background: var(--gt-surface);
    border: 1px solid var(--gt-border);
    color: var(--gt-text-primary);
  }
  &--pending { opacity: 0.6; }

  &__author {
    font-size: var(--gt-text-caption);
    font-weight: var(--gt-weight-medium);
    color: var(--gt-text-tertiary);
    margin-bottom: 2px;
  }
  &__body { font-size: var(--gt-text-body); line-height: var(--gt-leading-snug); white-space: pre-wrap; word-break: break-word; }
  &__time { font-size: 11px; color: var(--gt-text-tertiary); margin-top: 2px; text-align: right; }
}
```

  5. New elements:

```scss
.messages-thread__day {
  align-self: center;
  font-size: var(--gt-text-caption);
  color: var(--gt-text-tertiary);
  background: var(--gt-surface-sunken);
  border-radius: var(--gt-radius-lg);
  padding: 2px 10px;
  margin: var(--gt-space-sm) 0;
}
.messages-thread__older {
  align-self: center;
  min-height: 20px;
  font-size: var(--gt-text-caption);
  color: var(--gt-text-tertiary);
}
.messages-thread__subtitle {
  font-size: var(--gt-text-caption);
  color: var(--gt-text-tertiary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gt-convo__chip {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: var(--gt-weight-semibold);
  letter-spacing: var(--gt-tracking-wide);
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: var(--gt-radius-lg);
  &--team_ta { background: var(--gt-info-soft); color: var(--gt-info-text); }
  &--team_instructor { background: var(--gt-warning-soft); color: var(--gt-warning-text); }
  &--team_members { background: var(--gt-success-soft); color: var(--gt-success-text); }
}
```

  6. Composer: input focus `border-color: var(--gt-accent); box-shadow: var(--gt-focus-ring-tight);`; send button `background: var(--gt-primary)`, hover `var(--gt-primary-hover)`, `@include gt-press;`, disabled `opacity: 0.45`.
  7. Conversation rows: hover `background: var(--gt-surface-muted); @include gt-transition(background-color);`, active row `background: var(--gt-green-50);`, unread name/preview weights per kit (`600` name, preview `var(--gt-weight-medium)` + `var(--gt-text-secondary)`).
  8. Unread badge pill keeps `#ff3b30` (legacy exception) — comment it.

- [ ] **Step 2: Build + visual check**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/pages/Messages.scss
git commit -m "feat(design): messages UI on gt tokens with calm motion"
```

---

## Task F7: New-conversation search → contacts endpoint

**Files:**
- Modify: `frontend/src/features/messages/components/NewConversationSearch.tsx`

- [ ] **Step 1: Replace the data layer.** Delete the `getClasses()` + per-class `getClassStudents()` `Promise.all` fan-out block (the effect around lines 40–85) and its Map-dedupe. Replace with a debounced server search, keeping the component's existing result-row rendering and selection contract:

```tsx
const [contacts, setContacts] = useState<ApiContact[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  const t = setTimeout(async () => {
    try {
      const res = await api.getContacts(query);
      if (!cancelled) {
        setContacts(res.contacts);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (!cancelled) {
        setError((err as Error).message);
        setLoading(false);
      }
    }
  }, 250);
  return () => { cancelled = true; clearTimeout(t); };
}, [query]);
```

(`query` is the component's existing search-input state; map the previously-used candidate fields onto `ApiContact` — `id`, `name`, `email`, `image_url` are all present. Remove any now-unused client-side filtering of the candidate list; the server already filtered.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean — and `grep -n "getClassStudents" src/features/messages -r` returns nothing.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/components/NewConversationSearch.tsx
git commit -m "feat(messages): contacts search via server endpoint — no client fan-out"
```

---

## Task F8: Loose ends — compose path, widget, route transitions

**Files:**
- Modify: `frontend/src/features/messages/components/NewConversationCompose.tsx`, `frontend/src/features/messages/components/MessageWidget.tsx`, `frontend/src/features/messages/components/ConversationList.tsx` (Link wiring if it uses raw navigate — optional), `frontend/src/App.tsx` (no route changes; only if Link components live here)

- [ ] **Step 1: Compose path.** In `NewConversationCompose.tsx`, confirm the send call is the object form `api.sendMessage({ toUserId: selectedUser.id, body })` (Task F1 may have already patched it mechanically — make it idiomatic and ensure the post-send navigation to the returned `conversation_id` still works).

- [ ] **Step 2: Widget.** In `MessageWidget.tsx`: confirm it still compiles against the provider (context shape unchanged); its thread view now inherits group support via `ConversationThread` (`hideHeader` path). Restyle only if it hard-codes colors the SCSS pass missed.

- [ ] **Step 3: Route transitions.** Where the messages page navigates between list/thread (`Messages.tsx` `navigate(...)` calls and `ConversationList` row `onSelect`), enable View Transitions: `navigate(path, { viewTransition: true })` (react-router 7 option; falls back gracefully where unsupported).

- [ ] **Step 4: Full check**

Run: `npm run build && npx vitest run src/features/messages`
Expected: clean + PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(messages): compose/widget on v2 API + view transitions"
```

---

## Task V1: End-to-end verification (preview)

**Files:** none (verification only)

- [ ] **Step 1: Backend full suite**: `cd backend && venv/bin/python -m pytest tests/ -v` — Expected: all PASS.
- [ ] **Step 2: Frontend**: `cd frontend && npm run build && npx vitest run` — Expected: clean + PASS.
- [ ] **Step 3: Browser verification** via the preview servers (`.claude/launch.json`; note — previews are pinned to a worktree: confirm the dev server is serving THIS worktree's code via its startup output before trusting what you see). Exercise: inbox loads with team channels + chips; open a channel; send as member (optimistic → confirmed); scroll up through history pages; day separators; DM still works end-to-end; composer disabled state; reduced-motion (OS setting) kills animations. **Requires R1 applied first** — the RPC and tables must exist; until then verify DM regressions only against the current schema.
- [ ] **Step 4: Commit any fixes** discovered, one commit per fix, `fix(messages): <what>`.

---

## Task R1 (GATED — maintainer go-ahead required): Apply migration

**Do not run without explicit maintainer approval in-session.**

- [ ] **Step 1: Ask the maintainer** to confirm applying `2026-07-14_group_messaging.sql` to the shared Supabase project.
- [ ] **Step 2: Apply** via Supabase MCP `apply_migration` (name: `group_messaging`), content = the file from Task B1.
- [ ] **Step 3: Post-apply checks** via MCP `execute_sql`:
  - `SELECT count(*) FROM conversation_participants;` — > 0 (backfill ran).
  - `SELECT type, count(*) FROM conversations GROUP BY type;` — three team types present, count per type = number of projects.
  - `SELECT * FROM messages_inbox('<a real student uuid>'::uuid) LIMIT 3;` — returns rows, no error.
  - Confirm `messages` is in the `supabase_realtime` publication (`SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`) — it already is for the current thread subscriptions; if missing, add via dashboard.
- [ ] **Step 4: Run Task V1 Step 3** (the full browser pass) now that the schema is live.

---

## Self-review checklist (run after writing, fixed inline)

- Spec coverage: schema/backfill/triggers/RLS (B1), inbox scalability (B4), pagination (B5), group send + rate limit (B6), contacts (B7), notifications (B8), tokens (A1), conflicts fixed (A2), motion/focus/VT (A3), delta realtime (F2/F3), group UI (F4/F5), restyle (F6), fan-out fix (F7), stale comments (F2/F5), rollout gate (R1). Phases C–E → Part 2 by design.
- No placeholder steps; every code step carries the code.
- Type consistency: `_require_participant`/`_participant_ids`/`notify_recipients` names match across B3–B6; `MessagesListResponse.next_cursor` matches F1's `next_cursor`; hook return names (`loadOlder`, `confirmOptimistic`, `dropOptimistic`) match F3→F5 usage.
