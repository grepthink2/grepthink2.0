# Messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build minimal 1:1 direct messaging for project recruitment (students↔students + instructors↔students) per the spec at `docs/superpowers/specs/2026-04-23-messages-design.md`.

**Architecture:** 3 Postgres tables, 4 FastAPI endpoints (polling-based, no realtime), one reusable `MessageButton` component placed at four spots on existing project pages. No new infra dependencies.

**Tech Stack:** FastAPI + supabase-py, Postgres (Supabase-managed), React 19 + TypeScript + react-router-dom v7, SCSS modules, pytest for backend tests. **No frontend test framework exists in the repo** — frontend tasks verify via manual smoke tests through Claude Preview.

**Testing approach:**
- **Backend:** Strict TDD. Each task = write failing test → confirm fail → implement → confirm pass → commit. Builds on existing `backend/tests/conftest.py` patterns (HS256 hand-signed tokens, no live Supabase).
- **Frontend:** Build + manual verify via Preview screenshots. Add automated frontend tests in a follow-up.
- **DB tests:** None directly — exercised through controller tests with mocked Supabase responses.

---

## File map

### Created (backend)
- `backend/database/migrations/2026-04-23_messages.sql` — DDL for 3 tables + indexes + trigger
- `backend/app/messages/__init__.py`
- `backend/app/messages/models.py` — Pydantic request/response shapes
- `backend/app/messages/controller.py` — `can_message`, `has_shared_class`, `send_message`, `list_inbox`, `list_messages`, `mark_read`, `_get_or_create_conversation`
- `backend/app/messages/views.py` — 4 endpoint handlers
- `backend/app/messages/url.py` — APIRouter registration
- `backend/tests/test_messages_can_message.py`
- `backend/tests/test_messages_send.py`
- `backend/tests/test_messages_inbox.py`
- `backend/tests/test_messages_endpoints.py`

### Modified (backend)
- `backend/app/main.py` — register messages router

### Created (frontend)
- `frontend/src/features/messages/types.ts`
- `frontend/src/features/messages/hooks/useConversations.ts`
- `frontend/src/features/messages/hooks/useConversationMessages.ts`
- `frontend/src/features/messages/hooks/useUnreadTotal.ts`
- `frontend/src/features/messages/components/MessageButton.tsx`
- `frontend/src/features/messages/components/ConversationList.tsx`
- `frontend/src/features/messages/components/MessageBubble.tsx`
- `frontend/src/features/messages/components/MessageComposer.tsx`
- `frontend/src/features/messages/components/ConversationThread.tsx`
- `frontend/src/features/messages/components/NewConversationCompose.tsx`
- `frontend/src/features/messages/pages/Messages.tsx`
- `frontend/src/features/messages/messages.scss`

### Modified (frontend)
- `frontend/src/lib/api.ts` — add 4 message API methods + types
- `frontend/src/App.tsx` — replace stub route with real ones (lines 48 and below)
- `frontend/src/features/app/AppView.tsx` — mount tab title hook
- `frontend/src/features/app/components/Layout/Sidebar.tsx` — render unread badge on Messages item
- `frontend/src/features/app/pages/ProjectDetails.tsx` — add `<MessageButton>` at owner header + per-member rows
- `frontend/src/features/app/pages/MyProject.tsx` — add `<MessageButton>` per join requester

---

# Phase 1 — Database

## Task 1: Migration SQL

**Files:**
- Create: `backend/database/migrations/2026-04-23_messages.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Messages feature — 3 tables + last_message_at trigger.
-- Spec: docs/superpowers/specs/2026-04-23-messages-design.md
--
-- RLS deliberately not enabled in v1 — controllers enforce permissions.
-- Adding RLS is tracked as a follow-up in CODE_REVIEW.md #4.

CREATE TABLE conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a          uuid NOT NULL REFERENCES profiles(id),
    user_b          uuid NOT NULL REFERENCES profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz,
    CONSTRAINT conversations_canonical_order CHECK (user_a < user_b),
    CONSTRAINT conversations_unique_pair UNIQUE (user_a, user_b)
);

CREATE INDEX conversations_user_a_idx ON conversations (user_a);
CREATE INDEX conversations_user_b_idx ON conversations (user_b);
CREATE INDEX conversations_last_message_at_idx ON conversations (last_message_at DESC NULLS LAST);

CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    sender_id       uuid NOT NULL REFERENCES profiles(id),
    body            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 1024)
);

CREATE INDEX messages_conv_created_idx ON messages (conversation_id, created_at DESC);

CREATE TABLE conversation_reads (
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    user_id         uuid NOT NULL REFERENCES profiles(id),
    last_read_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

-- Bump conversations.last_message_at on every message insert.
-- Avoids race conditions vs. doing this in application code.
CREATE OR REPLACE FUNCTION bump_conversation_last_message()
RETURNS trigger AS $$
BEGIN
    UPDATE conversations
       SET last_message_at = NEW.created_at
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_bump_last_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION bump_conversation_last_message();
```

- [ ] **Step 2: Apply via Supabase SQL Editor**

Open the Supabase project's SQL editor, paste the file contents, run. Verify no errors.

Sanity check (in same SQL editor):
```sql
SELECT count(*) FROM conversations;       -- expect 0
SELECT count(*) FROM messages;            -- expect 0
SELECT count(*) FROM conversation_reads;  -- expect 0
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'messages_bump_last_message';
-- expect a trigger definition
```

- [ ] **Step 3: Commit**

```bash
git add backend/database/migrations/2026-04-23_messages.sql
git commit -m "Messages: DB migration (conversations, messages, conversation_reads + trigger)"
```

---

# Phase 2 — Backend controllers (TDD)

## Task 2: `can_message` — instructor-instructor exclusion

**Files:**
- Create: `backend/app/messages/__init__.py` (empty)
- Create: `backend/app/messages/controller.py`
- Create: `backend/tests/test_messages_can_message.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_messages_can_message.py
"""Tests for app.messages.controller.can_message."""
from __future__ import annotations
from unittest.mock import patch
import pytest


@patch("app.messages.controller.has_shared_class", return_value=True)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_blocks_instructor_pair(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "instructor", "bob": "instructor"}
    assert can_message("alice", "bob") is False


@patch("app.messages.controller.has_shared_class", return_value=True)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_allows_instructor_student(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "instructor", "bob": "student"}
    assert can_message("alice", "bob") is True


@patch("app.messages.controller.has_shared_class", return_value=True)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_allows_student_student(get_roles, _has_shared):
    from app.messages.controller import can_message
    get_roles.return_value = {"alice": "student", "bob": "student"}
    assert can_message("alice", "bob") is True


@patch("app.messages.controller.has_shared_class", return_value=False)
@patch("app.messages.controller.get_profile_roles")
def test_can_message_requires_shared_class(_get_roles, _has_shared):
    from app.messages.controller import can_message
    _get_roles.return_value = {"alice": "student", "bob": "student"}
    assert can_message("alice", "bob") is False


def test_can_message_rejects_self():
    from app.messages.controller import can_message
    assert can_message("alice", "alice") is False
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_messages_can_message.py -v
```
Expected: ImportError / ModuleNotFoundError on `app.messages.controller`.

- [ ] **Step 3: Implement minimum to pass**

```python
# backend/app/messages/__init__.py
# (empty)
```

```python
# backend/app/messages/controller.py
"""Business logic for the messages feature.

Permissions, conversation creation, message insertion, inbox + thread
reads, and read marks. See docs/superpowers/specs/2026-04-23-messages-design.md
for the full design.
"""
from __future__ import annotations

import logging

from app.database.client import service_client

logger = logging.getLogger(__name__)


def get_profile_roles(user_ids: list[str]) -> dict[str, str | None]:
    """Return {user_id: role} for the given ids. Missing rows → None."""
    if not user_ids:
        return {}
    res = (
        service_client.table("profiles")
        .select("id, role")
        .in_("id", user_ids)
        .execute()
    )
    found = {row["id"]: row["role"] for row in (res.data or [])}
    return {uid: found.get(uid) for uid in user_ids}


def has_shared_class(a_id: str, b_id: str) -> bool:
    """Two users share a class iff each has a relationship (instructor or
    enrolled student) to at least one common class id."""
    # Get every class id the user has any relationship to.
    def _user_classes(uid: str) -> set[str]:
        owned = (
            service_client.table("classes")
            .select("id")
            .eq("created_by", uid)
            .execute()
        )
        enrolled = (
            service_client.table("class_enrollments")
            .select("class_id")
            .eq("user_id", uid)
            .execute()
        )
        return {row["id"] for row in (owned.data or [])} | {
            row["class_id"] for row in (enrolled.data or [])
        }

    return bool(_user_classes(a_id) & _user_classes(b_id))


def can_message(a_id: str, b_id: str) -> bool:
    """Per spec Q1=C: students↔students, instructors↔students, no
    instructor↔instructor; both must share an active class."""
    if a_id == b_id:
        return False
    roles = get_profile_roles([a_id, b_id])
    if roles.get(a_id) == "instructor" and roles.get(b_id) == "instructor":
        return False
    return has_shared_class(a_id, b_id)
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_messages_can_message.py -v
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/ backend/tests/test_messages_can_message.py
git commit -m "Messages: can_message + has_shared_class + role lookup"
```

---

## Task 3: `_get_or_create_conversation` (canonical pair handling)

**Files:**
- Modify: `backend/app/messages/controller.py`
- Create: `backend/tests/test_messages_send.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_messages_send.py
"""Tests for the send-message path: conversation create-or-fetch + insert."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest


def _mock_supabase_chain(return_data):
    """Build a chainable mock that returns `return_data` from .execute()."""
    mock = MagicMock()
    chain = MagicMock()
    chain.execute.return_value = MagicMock(data=return_data)
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value = chain
    mock.table.return_value.insert.return_value = chain
    return mock


@patch("app.messages.controller.service_client")
def test_get_or_create_canonicalizes_pair(client):
    """Given two ids, the smaller goes in user_a regardless of call order."""
    from app.messages.controller import _get_or_create_conversation

    # Simulate "row exists"
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "conv-1"}
    )

    # Both call orderings should yield same lookup args.
    _get_or_create_conversation("00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000001")
    _get_or_create_conversation("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002")

    # Both calls should have queried with user_a=...001 and user_b=...002
    eq_calls = client.table.return_value.select.return_value.eq.call_args_list
    # Each invocation uses two .eq()s; we expect every first-eq is user_a -> ...001
    for call in eq_calls:
        if call.args[0] == "user_a":
            assert call.args[1] == "00000000-0000-0000-0000-000000000001"
        elif call.args[0] == "user_b":
            assert call.args[1] == "00000000-0000-0000-0000-000000000002"


@patch("app.messages.controller.service_client")
def test_get_or_create_inserts_when_absent(client):
    from app.messages.controller import _get_or_create_conversation

    # First lookup returns no row, then insert returns a new id.
    select_chain = client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single
    select_chain.return_value.execute.return_value = MagicMock(data=None)
    insert_chain = client.table.return_value.insert
    insert_chain.return_value.execute.return_value = MagicMock(data=[{"id": "new-conv"}])

    result = _get_or_create_conversation(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    )
    assert result == "new-conv"
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_messages_send.py::test_get_or_create_canonicalizes_pair -v
```
Expected: ImportError on `_get_or_create_conversation`.

- [ ] **Step 3: Implement**

Append to `backend/app/messages/controller.py`:

```python
def _canonical_pair(a_id: str, b_id: str) -> tuple[str, str]:
    """Return (smaller, larger) so all (a, b) lookups hit one canonical row."""
    return (a_id, b_id) if a_id < b_id else (b_id, a_id)


def _get_or_create_conversation(a_id: str, b_id: str) -> str:
    """Return the conversation id for the pair, creating it if absent."""
    user_a, user_b = _canonical_pair(a_id, b_id)
    existing = (
        service_client.table("conversations")
        .select("id")
        .eq("user_a", user_a)
        .eq("user_b", user_b)
        .maybe_single()
        .execute()
    )
    if existing.data:
        return existing.data["id"]
    created = (
        service_client.table("conversations")
        .insert({"user_a": user_a, "user_b": user_b})
        .execute()
    )
    if not created.data:
        # Lost a create race — refetch.
        refetch = (
            service_client.table("conversations")
            .select("id")
            .eq("user_a", user_a)
            .eq("user_b", user_b)
            .maybe_single()
            .execute()
        )
        return refetch.data["id"]
    return created.data[0]["id"]
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd backend && pytest tests/test_messages_send.py::test_get_or_create_canonicalizes_pair tests/test_messages_send.py::test_get_or_create_inserts_when_absent -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/tests/test_messages_send.py
git commit -m "Messages: _get_or_create_conversation with canonical pair ordering"
```

---

## Task 4: `send_message` — validation + insert + sender-read mark

**Files:**
- Modify: `backend/app/messages/controller.py`
- Modify: `backend/tests/test_messages_send.py`

- [ ] **Step 1: Write the failing test (append to existing test file)**

```python
# Append to backend/tests/test_messages_send.py
from fastapi import HTTPException


@patch("app.messages.controller.can_message", return_value=False)
def test_send_rejects_when_not_eligible(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message("alice", "bob", "hi")
    assert exc.value.status_code == 403


@patch("app.messages.controller.can_message", return_value=True)
def test_send_rejects_empty_body(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message("alice", "bob", "")
    assert exc.value.status_code == 400


@patch("app.messages.controller.can_message", return_value=True)
def test_send_rejects_whitespace_only_body(_can):
    from app.messages.controller import send_message
    with pytest.raises(HTTPException) as exc:
        send_message("alice", "bob", "   \n\t  ")
    assert exc.value.status_code == 400


@patch("app.messages.controller.can_message", return_value=True)
def test_send_rejects_body_over_1024_codepoints(_can):
    from app.messages.controller import send_message
    body = "a" * 1025
    with pytest.raises(HTTPException) as exc:
        send_message("alice", "bob", body)
    assert exc.value.status_code == 400


@patch("app.messages.controller.service_client")
@patch("app.messages.controller._get_or_create_conversation", return_value="conv-1")
@patch("app.messages.controller.can_message", return_value=True)
def test_send_inserts_message_and_marks_sender_read(_can, _get, client):
    from app.messages.controller import send_message
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "msg-1", "sender_id": "alice", "body": "hi", "created_at": "2026-04-23T00:00:00Z"}]
    )
    client.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])

    conv_id, msg = send_message("alice", "bob", "hi")
    assert conv_id == "conv-1"
    assert msg["body"] == "hi"
    # Sender read mark was upserted.
    upsert_args = client.table.return_value.upsert.call_args
    assert upsert_args is not None
    payload = upsert_args.args[0]
    assert payload["conversation_id"] == "conv-1"
    assert payload["user_id"] == "alice"
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd backend && pytest tests/test_messages_send.py -v
```
Expected: the new tests fail with `ImportError` on `send_message`.

- [ ] **Step 3: Implement**

Append to `backend/app/messages/controller.py`:

```python
from datetime import datetime, timezone
from fastapi import HTTPException


_MAX_BODY_CODEPOINTS = 1024


def send_message(sender_id: str, to_user_id: str, body: str) -> tuple[str, dict]:
    """Validate, get-or-create the conversation, insert the message, and
    mark the sender's read pointer. Returns (conversation_id, message_row).
    """
    if not can_message(sender_id, to_user_id):
        raise HTTPException(status_code=403, detail="You can't message this user")

    # Body validation — code points (Python len) per spec Q10=B.
    n = len(body)
    if n < 1 or n > _MAX_BODY_CODEPOINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Body must be 1–{_MAX_BODY_CODEPOINTS} characters (got {n})",
        )
    if not body.strip():
        raise HTTPException(status_code=400, detail="Body cannot be only whitespace")

    conv_id = _get_or_create_conversation(sender_id, to_user_id)

    inserted = (
        service_client.table("messages")
        .insert(
            {"conversation_id": conv_id, "sender_id": sender_id, "body": body}
        )
        .execute()
    )
    if not inserted.data:
        raise HTTPException(status_code=500, detail="Failed to insert message")
    message_row = inserted.data[0]

    # Sender implicitly reads their own send.
    now_iso = datetime.now(timezone.utc).isoformat()
    service_client.table("conversation_reads").upsert(
        {
            "conversation_id": conv_id,
            "user_id": sender_id,
            "last_read_at": now_iso,
        }
    ).execute()

    logger.info(
        "Message sent | sender=%s recipient=%s conv=%s msg=%s len=%d",
        sender_id, to_user_id, conv_id, message_row["id"], n,
    )
    return conv_id, message_row
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd backend && pytest tests/test_messages_send.py -v
```
Expected: all tests passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/tests/test_messages_send.py
git commit -m "Messages: send_message with validation + sender read mark"
```

---

## Task 5: `list_inbox`

**Files:**
- Modify: `backend/app/messages/controller.py`
- Create: `backend/tests/test_messages_inbox.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_messages_inbox.py
"""Tests for the inbox listing path."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


@patch("app.messages.controller.can_message", return_value=True)
@patch("app.messages.controller.service_client")
def test_list_inbox_returns_conversations_with_metadata(client, _can):
    from app.messages.controller import list_inbox

    # 1) conversations fetch (pairs caller is part of, with last_message_at NOT NULL)
    conv_chain = client.table.return_value.select.return_value.or_.return_value.not_.is_.return_value.order
    conv_chain.return_value.execute.return_value = MagicMock(data=[
        {"id": "conv-1", "user_a": "alice", "user_b": "bob",
         "last_message_at": "2026-04-23T00:00:00Z"},
    ])

    # 2) profiles fetch for "other_user"
    profile_chain = client.table.return_value.select.return_value.in_
    profile_chain.return_value.execute.return_value = MagicMock(data=[
        {"id": "bob", "email": "bob@ucsc.edu"},
    ])

    # 3) latest message per conversation
    latest_chain = client.table.return_value.select.return_value.eq.return_value.order.return_value.limit
    latest_chain.return_value.execute.return_value = MagicMock(data=[
        {"id": "msg-1", "body": "hi", "sender_id": "bob",
         "created_at": "2026-04-23T00:00:00Z"},
    ])

    # 4) caller's last_read_at
    caller_read_chain = client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single
    caller_read_chain.return_value.execute.return_value = MagicMock(data={
        "last_read_at": "2026-04-22T00:00:00Z"
    })

    # 5) unread count
    unread_chain = client.table.return_value.select.return_value.eq.return_value.gt.return_value.neq
    unread_chain.return_value.execute.return_value = MagicMock(data=[{}, {}, {}], count=3)

    # 6) other user's last_read_at
    other_read_chain = caller_read_chain  # same shape, second call

    result = list_inbox("alice")
    assert isinstance(result, list)
    assert len(result) == 1
    row = result[0]
    assert row["id"] == "conv-1"
    assert row["other_user"]["id"] == "bob"
    assert row["last_message"]["body"] == "hi"
    assert "unread_count" in row
    assert "can_send" in row
    assert "last_message_at" in row
```

> Note: this test mocks the supabase chain pessimistically. The implementation may simplify queries; if so, simplify the test to match the actual call shape rather than fighting the mock chain. The intent is documented in the assertions.

- [ ] **Step 2: Run, confirm fail**

```bash
cd backend && pytest tests/test_messages_inbox.py -v
```
Expected: ImportError on `list_inbox`.

- [ ] **Step 3: Implement**

Append to `backend/app/messages/controller.py`:

```python
def list_inbox(caller_id: str) -> list[dict]:
    """Return the caller's inbox: conversations they're part of with at
    least one message, sorted newest-activity first, with per-row unread
    count, can_send, and last-message preview.
    """
    # 1) conversations where caller is a participant AND has any message.
    convs_resp = (
        service_client.table("conversations")
        .select("id, user_a, user_b, last_message_at")
        .or_(f"user_a.eq.{caller_id},user_b.eq.{caller_id}")
        .not_.is_("last_message_at", "null")
        .order("last_message_at", desc=True)
        .execute()
    )
    convs = convs_resp.data or []
    if not convs:
        return []

    # 2) Resolve other-user profile rows in a single batched call.
    other_ids = [
        c["user_b"] if c["user_a"] == caller_id else c["user_a"] for c in convs
    ]
    # Profiles table only has (id, email, role) — no display-name column
    # exists today. Frontend falls back to email if name is null.
    profiles_resp = (
        service_client.table("profiles")
        .select("id, email")
        .in_("id", other_ids)
        .execute()
    )
    profiles = {p["id"]: p for p in (profiles_resp.data or [])}

    rows: list[dict] = []
    for c in convs:
        other_id = c["user_b"] if c["user_a"] == caller_id else c["user_a"]
        other = profiles.get(other_id) or {"id": other_id, "email": None}

        # Latest message preview.
        latest_resp = (
            service_client.table("messages")
            .select("id, body, sender_id, created_at")
            .eq("conversation_id", c["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        latest = (latest_resp.data or [None])[0]

        # Caller's read pointer.
        my_read_resp = (
            service_client.table("conversation_reads")
            .select("last_read_at")
            .eq("conversation_id", c["id"])
            .eq("user_id", caller_id)
            .maybe_single()
            .execute()
        )
        my_last_read = (my_read_resp.data or {}).get("last_read_at") or "1970-01-01T00:00:00Z"

        # Other user's read pointer (for "Seen" indicator).
        other_read_resp = (
            service_client.table("conversation_reads")
            .select("last_read_at")
            .eq("conversation_id", c["id"])
            .eq("user_id", other_id)
            .maybe_single()
            .execute()
        )
        other_last_read = (other_read_resp.data or {}).get("last_read_at")

        # Unread count: messages not from caller and after caller's last_read_at.
        unread_resp = (
            service_client.table("messages")
            .select("id", count="exact")
            .eq("conversation_id", c["id"])
            .gt("created_at", my_last_read)
            .neq("sender_id", caller_id)
            .execute()
        )
        unread_count = unread_resp.count or 0

        rows.append({
            "id": c["id"],
            "other_user": {
                "id": other["id"],
                "email": other.get("email"),
                "name": None,  # No display-name column exists yet; frontend uses email.
            },
            "last_message": (
                {
                    "body": latest["body"],
                    "created_at": latest["created_at"],
                    "sender_id": latest["sender_id"],
                }
                if latest else None
            ),
            "unread_count": unread_count,
            "other_user_last_read_at": other_last_read,
            "can_send": can_message(caller_id, other_id),
            "last_message_at": c["last_message_at"],
        })
    return rows
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd backend && pytest tests/test_messages_inbox.py -v
```
Expected: 1 passed. (May need to relax mock chain expectations — see note in Step 1.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/tests/test_messages_inbox.py
git commit -m "Messages: list_inbox with per-row metadata"
```

---

## Task 6: `list_messages` + `mark_read`

**Files:**
- Modify: `backend/app/messages/controller.py`
- Modify: `backend/tests/test_messages_inbox.py` (or new file — keep close)

- [ ] **Step 1: Write the failing test (append)**

```python
# Append to backend/tests/test_messages_inbox.py
from fastapi import HTTPException


@patch("app.messages.controller.service_client")
def test_list_messages_rejects_non_participant(client):
    from app.messages.controller import list_messages
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "conv-1", "user_a": "alice", "user_b": "bob"}
    )
    with pytest.raises(HTTPException) as exc:
        list_messages("eve", "conv-1")
    assert exc.value.status_code == 403


@patch("app.messages.controller.service_client")
def test_list_messages_returns_latest_50_for_participant(client):
    from app.messages.controller import list_messages
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "conv-1", "user_a": "alice", "user_b": "bob"}
    )
    msgs = [{"id": f"m{i}", "body": f"#{i}", "sender_id": "alice", "created_at": "2026-04-23T00:00:00Z"} for i in range(50)]
    client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=msgs)
    out = list_messages("alice", "conv-1")
    assert len(out) == 50
    assert out[0]["id"] == "m0"


@patch("app.messages.controller.service_client")
def test_mark_read_upserts_for_participant(client):
    from app.messages.controller import mark_read
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": "conv-1", "user_a": "alice", "user_b": "bob"}
    )
    client.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
    mark_read("alice", "conv-1")
    upsert_args = client.table.return_value.upsert.call_args
    payload = upsert_args.args[0]
    assert payload["conversation_id"] == "conv-1"
    assert payload["user_id"] == "alice"


import pytest  # ensure pytest is imported once at top of file
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd backend && pytest tests/test_messages_inbox.py -v
```
Expected: 3 new tests fail with ImportError.

- [ ] **Step 3: Implement**

Append to `backend/app/messages/controller.py`:

```python
def _require_participant(caller_id: str, conversation_id: str) -> dict:
    """Fetch the conversation and 403 if caller isn't a participant.
    Returns the conversation row.
    """
    res = (
        service_client.table("conversations")
        .select("id, user_a, user_b")
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv = res.data
    if caller_id not in (conv["user_a"], conv["user_b"]):
        logger.warning(
            "Participant check failed | conv=%s caller=%s",
            conversation_id, caller_id,
        )
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv


def list_messages(caller_id: str, conversation_id: str) -> list[dict]:
    """Return the latest 50 messages in the conversation, newest first.
    Frontend reverses for chronological display."""
    _require_participant(caller_id, conversation_id)
    res = (
        service_client.table("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []


def mark_read(caller_id: str, conversation_id: str) -> None:
    """Upsert the caller's read pointer to now()."""
    _require_participant(caller_id, conversation_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    service_client.table("conversation_reads").upsert(
        {
            "conversation_id": conversation_id,
            "user_id": caller_id,
            "last_read_at": now_iso,
        }
    ).execute()
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd backend && pytest tests/test_messages_inbox.py -v
```
Expected: all tests passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/messages/controller.py backend/tests/test_messages_inbox.py
git commit -m "Messages: list_messages + mark_read with participant check"
```

---

# Phase 3 — Backend views, models, routes

## Task 7: Pydantic models

**Files:**
- Create: `backend/app/messages/models.py`

- [ ] **Step 1: Write the file**

```python
# backend/app/messages/models.py
"""Request/response models for the messages feature."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    to_user_id: str = Field(..., description="Recipient user id (profiles.id)")
    body: str = Field(..., min_length=1, max_length=1024)


class MessageOut(BaseModel):
    id: str
    sender_id: str
    body: str
    created_at: str


class SendMessageResponse(BaseModel):
    conversation_id: str
    message: MessageOut


class OtherUserOut(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


class LastMessageOut(BaseModel):
    body: str
    created_at: str
    sender_id: str


class ConversationOut(BaseModel):
    id: str
    other_user: OtherUserOut
    last_message: Optional[LastMessageOut] = None
    unread_count: int
    other_user_last_read_at: Optional[str] = None
    can_send: bool
    last_message_at: Optional[str] = None


class InboxResponse(BaseModel):
    conversations: list[ConversationOut]


class ListMessagesResponse(BaseModel):
    messages: list[MessageOut]
```

- [ ] **Step 2: Sanity-import to catch syntax errors**

```bash
cd backend && source .venv/bin/activate && python -c "from app.messages import models; print(models.SendMessageRequest.model_json_schema())"
```
Expected: prints a JSON schema dict.

- [ ] **Step 3: Commit**

```bash
git add backend/app/messages/models.py
git commit -m "Messages: Pydantic models"
```

---

## Task 8: Views

**Files:**
- Create: `backend/app/messages/views.py`

- [ ] **Step 1: Write the file**

```python
# backend/app/messages/views.py
"""FastAPI handlers for the messages feature."""
from __future__ import annotations

import logging
from fastapi import Depends, HTTPException, status
from fastapi.responses import Response

from app.dependencies import require_user
from app.messages import controller
from app.messages.models import (
    InboxResponse,
    ListMessagesResponse,
    SendMessageRequest,
    SendMessageResponse,
)

logger = logging.getLogger(__name__)


def list_inbox(user_id: str = Depends(require_user)) -> InboxResponse:
    rows = controller.list_inbox(user_id)
    return InboxResponse(conversations=rows)


def send_message(
    payload: SendMessageRequest,
    user_id: str = Depends(require_user),
) -> SendMessageResponse:
    conv_id, msg = controller.send_message(user_id, payload.to_user_id, payload.body)
    return SendMessageResponse(conversation_id=conv_id, message=msg)


def list_messages(
    conversation_id: str,
    user_id: str = Depends(require_user),
) -> ListMessagesResponse:
    msgs = controller.list_messages(user_id, conversation_id)
    return ListMessagesResponse(messages=msgs)


def mark_read(
    conversation_id: str,
    user_id: str = Depends(require_user),
) -> Response:
    controller.mark_read(user_id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 2: Sanity-import**

```bash
cd backend && python -c "from app.messages import views; print(views.send_message)"
```
Expected: prints a function reference.

- [ ] **Step 3: Commit**

```bash
git add backend/app/messages/views.py
git commit -m "Messages: FastAPI views"
```

---

## Task 9: Router + register in main.py

**Files:**
- Create: `backend/app/messages/url.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the router**

```python
# backend/app/messages/url.py
"""Routes for the messages feature."""
from fastapi import APIRouter
from app.messages import views

router = APIRouter(prefix="/api/messages", tags=["messages"])

router.get("/conversations")(views.list_inbox)
router.post("")(views.send_message)
router.get("/conversations/{conversation_id}/messages")(views.list_messages)
router.post("/conversations/{conversation_id}/read", status_code=204)(views.mark_read)
```

- [ ] **Step 2: Register in main.py**

In `backend/app/main.py`, add the import alongside the others (around line 21):

```python
from app.tsr.url import router as tsr_router
from app.messages.url import router as messages_router
```

And register the router below the others (around line 54):

```python
app.include_router(tsr_router)
app.include_router(messages_router)
```

- [ ] **Step 3: Verify the app boots**

```bash
cd backend && rm -f /tmp/msg-boot.log
.venv/bin/python run.py > /tmp/msg-boot.log 2>&1 &
PID=$!
sleep 6
if kill -0 "$PID" 2>/dev/null; then
  curl -s http://localhost:5001/openapi.json | python -c "import sys, json; d=json.load(sys.stdin); print('\n'.join([p for p in d['paths'] if 'message' in p]))"
  kill "$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
else
  wait "$PID" 2>/dev/null
  cat /tmp/msg-boot.log
  echo "BOOT FAILED"
  exit 1
fi
```
Expected output (4 paths):
```
/api/messages/conversations
/api/messages
/api/messages/conversations/{conversation_id}/messages
/api/messages/conversations/{conversation_id}/read
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/messages/url.py backend/app/main.py
git commit -m "Messages: register router on /api/messages"
```

---

## Task 10: Endpoint integration tests (auth + permissions)

**Files:**
- Create: `backend/tests/test_messages_endpoints.py`

- [ ] **Step 1: Write the test**

```python
# backend/tests/test_messages_endpoints.py
"""Endpoint-level integration tests using FastAPI TestClient."""
from __future__ import annotations
from unittest.mock import patch
from .conftest import make_token


def test_inbox_requires_auth(client):
    res = client.get("/api/messages/conversations")
    assert res.status_code == 401


def test_send_requires_auth(client):
    res = client.post("/api/messages", json={"to_user_id": "x", "body": "hi"})
    assert res.status_code == 401


@patch("app.messages.controller.list_inbox", return_value=[])
def test_inbox_returns_empty_array_when_no_conversations(_list, client, auth_header):
    res = client.get("/api/messages/conversations", headers=auth_header)
    assert res.status_code == 200
    assert res.json() == {"conversations": []}


@patch("app.messages.controller.send_message")
def test_send_returns_message_envelope(send_msg, client, auth_header):
    send_msg.return_value = (
        "conv-1",
        {"id": "msg-1", "sender_id": "user-abc", "body": "hi", "created_at": "2026-04-23T00:00:00Z"},
    )
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": "hi"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["conversation_id"] == "conv-1"
    assert body["message"]["body"] == "hi"


def test_send_rejects_oversized_body_at_pydantic_layer(client, auth_header):
    res = client.post(
        "/api/messages",
        headers=auth_header,
        json={"to_user_id": "bob", "body": "a" * 1025},
    )
    assert res.status_code == 422  # Pydantic validation error


@patch("app.messages.controller.list_messages", return_value=[])
def test_list_messages_returns_empty(_list, client, auth_header):
    res = client.get("/api/messages/conversations/conv-1/messages", headers=auth_header)
    assert res.status_code == 200
    assert res.json() == {"messages": []}


@patch("app.messages.controller.mark_read", return_value=None)
def test_mark_read_returns_204(_mark, client, auth_header):
    res = client.post("/api/messages/conversations/conv-1/read", headers=auth_header)
    assert res.status_code == 204
```

- [ ] **Step 2: Run, confirm pass**

```bash
cd backend && pytest tests/test_messages_endpoints.py -v
```
Expected: 7 passed.

- [ ] **Step 3: Run the full backend suite to confirm no regressions**

```bash
cd backend && pytest -v
```
Expected: existing tests still passing (Phase 6 had 17, this PR adds ~15+).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_messages_endpoints.py
git commit -m "Messages: endpoint integration tests"
```

---

# Phase 4 — Frontend types + API client

## Task 11: Add types and API methods

**Files:**
- Create: `frontend/src/features/messages/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Write the types**

```ts
// frontend/src/features/messages/types.ts
export interface Conversation {
  id: string;
  other_user: { id: string; email: string | null; name: string | null };
  last_message: { body: string; created_at: string; sender_id: string } | null;
  unread_count: number;
  other_user_last_read_at: string | null;
  can_send: boolean;
  last_message_at: string | null;
}

export interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
```

- [ ] **Step 2: Add API methods to `frontend/src/lib/api.ts`**

Append four methods inside the `export const api = { ... }` object (just before the closing `};` near the end of the file):

```ts
  /** Inbox (GET /api/messages/conversations) — polled at 15s. */
  getConversations: async () => {
    return apiRequest<{ conversations: import('@/features/messages/types').Conversation[] }>(
      '/api/messages/conversations'
    );
  },

  /** Send a DM. Creates the conversation if absent (POST /api/messages). */
  sendMessage: async (toUserId: string, body: string) => {
    return apiRequest<{
      conversation_id: string;
      message: import('@/features/messages/types').Message;
    }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ to_user_id: toUserId, body }),
    });
  },

  /** Latest 50 messages (GET /api/messages/conversations/:id/messages). */
  listMessages: async (conversationId: string) => {
    return apiRequest<{ messages: import('@/features/messages/types').Message[] }>(
      `/api/messages/conversations/${conversationId}/messages`
    );
  },

  /** Mark conversation read through now (POST /api/messages/conversations/:id/read). */
  markConversationRead: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  },
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/messages/types.ts frontend/src/lib/api.ts
git commit -m "Messages: frontend types and api client methods"
```

---

# Phase 5 — Frontend hooks

## Task 12: `useConversations` (inbox poll)

**Files:**
- Create: `frontend/src/features/messages/hooks/useConversations.ts`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/features/messages/hooks/useConversations.ts
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Conversation } from '../types';

const POLL_MS = 15_000;

export interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = async () => {
    try {
      const res = await api.getConversations();
      if (cancelledRef.current) return;
      setConversations(res.conversations);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, []);

  return { conversations, loading, error, refetch: load };
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/hooks/useConversations.ts
git commit -m "Messages: useConversations polling hook"
```

---

## Task 13: `useUnreadTotal` (derived total)

**Files:**
- Create: `frontend/src/features/messages/hooks/useUnreadTotal.ts`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/features/messages/hooks/useUnreadTotal.ts
import { useConversations } from './useConversations';

/**
 * Total unread message count across all conversations.
 * Mounting this hook anywhere starts the inbox poll loop (15s).
 * Used at app root to drive the sidebar badge and tab title.
 */
export function useUnreadTotal(): number {
  const { conversations } = useConversations();
  return conversations.reduce((sum, c) => sum + c.unread_count, 0);
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/hooks/useUnreadTotal.ts
git commit -m "Messages: useUnreadTotal derived hook"
```

---

## Task 14: `useConversationMessages` (thread poll)

**Files:**
- Create: `frontend/src/features/messages/hooks/useConversationMessages.ts`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/features/messages/hooks/useConversationMessages.ts
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Message } from '../types';

const POLL_MS = 3_000;

export interface UseConversationMessagesResult {
  messages: Message[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useConversationMessages(
  conversationId: string | null,
): UseConversationMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.listMessages(conversationId);
      if (cancelledRef.current) return;
      // Backend returns newest-first; reverse for chronological display.
      setMessages([...res.messages].reverse());
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    load();
    if (!conversationId) return;
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [conversationId]);

  return { messages, loading, error, refetch: load };
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/hooks/useConversationMessages.ts
git commit -m "Messages: useConversationMessages polling hook"
```

---

# Phase 6 — Frontend components

## Task 15: `MessageButton` — the contextual entry point

**Files:**
- Create: `frontend/src/features/messages/components/MessageButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/features/messages/components/MessageButton.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useConversations } from '../hooks/useConversations';

interface Props {
  /** profiles.id of the user to message. */
  userId: string;
  /** Visible label. Defaults to "Message". */
  label?: string;
  /** Optional className for parent-styled overrides. */
  className?: string;
  /** If parent already knows the caller can't message this user, disable. */
  disabled?: boolean;
}

/**
 * Reusable button that routes the caller to a DM with `userId`.
 *
 * Decision rule:
 *  1. If a conversation already exists in the inbox cache → navigate
 *     directly to /app/messages/:id.
 *  2. Otherwise → navigate to /app/messages/compose?to=<userId>; the
 *     compose view sends the first message and then redirects.
 *
 * On send-time the backend re-checks eligibility and returns 403 if
 * lapsed; the compose flow surfaces that as a toast.
 */
const MessageButton: React.FC<Props> = ({ userId, label = 'Message', className, disabled }) => {
  const navigate = useNavigate();
  const { conversations } = useConversations();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const existing = conversations.find((c) => c.other_user.id === userId);
      if (existing) {
        navigate(`/app/messages/${existing.id}`);
      } else {
        navigate(`/app/messages/compose?to=${encodeURIComponent(userId)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={className ?? 'message-button'}
      onClick={handleClick}
      disabled={busy || disabled}
    >
      {label}
    </button>
  );
};

export default MessageButton;
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/components/MessageButton.tsx
git commit -m "Messages: MessageButton entry-point component"
```

---

## Task 16: `MessageBubble` + `ConversationList` + `MessageComposer`

These are tightly coupled visually; one commit covers them.

**Files:**
- Create: `frontend/src/features/messages/components/MessageBubble.tsx`
- Create: `frontend/src/features/messages/components/ConversationList.tsx`
- Create: `frontend/src/features/messages/components/MessageComposer.tsx`

- [ ] **Step 1: `MessageBubble.tsx`**

```tsx
// frontend/src/features/messages/components/MessageBubble.tsx
import React from 'react';

interface Props {
  body: string;
  createdAt: string;
  isOwn: boolean;
  /** Render "Seen HH:MM" under this bubble (only for own latest seen message). */
  seenLabel?: string | null;
}

const MessageBubble: React.FC<Props> = ({ body, createdAt, isOwn, seenLabel }) => {
  const time = new Date(createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <div className={`message-bubble ${isOwn ? 'message-bubble--own' : 'message-bubble--other'}`}>
      <div className="message-bubble__body">{body}</div>
      <div className="message-bubble__meta">
        <span className="message-bubble__time">{time}</span>
        {seenLabel && <span className="message-bubble__seen">{seenLabel}</span>}
      </div>
    </div>
  );
};

export default MessageBubble;
```

- [ ] **Step 2: `ConversationList.tsx`**

```tsx
// frontend/src/features/messages/components/ConversationList.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import type { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
}

const ConversationList: React.FC<Props> = ({ conversations, selectedId, loading }) => {
  if (loading) return <div className="conversation-list conversation-list--loading">Loading…</div>;
  if (conversations.length === 0) {
    return (
      <div className="conversation-list conversation-list--empty">
        <p>No conversations yet.</p>
        <p className="conversation-list__hint">
          Visit a project page and click <strong>Message</strong> to start one.
        </p>
      </div>
    );
  }
  return (
    <ul className="conversation-list">
      {conversations.map((c) => {
        const name = c.other_user.name || c.other_user.email || 'Unknown';
        const isSelected = c.id === selectedId;
        const isUnread = c.unread_count > 0;
        return (
          <li
            key={c.id}
            className={`conversation-list__item ${isSelected ? 'is-selected' : ''} ${isUnread ? 'is-unread' : ''}`}
          >
            <Link to={`/app/messages/${c.id}`} className="conversation-list__link">
              <div className="conversation-list__name">{name}</div>
              {c.last_message && (
                <div className="conversation-list__preview">{c.last_message.body}</div>
              )}
              {isUnread && <span className="conversation-list__badge">{c.unread_count}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default ConversationList;
```

- [ ] **Step 3: `MessageComposer.tsx`**

```tsx
// frontend/src/features/messages/components/MessageComposer.tsx
import React, { useState } from 'react';

interface Props {
  /** False when caller has lost eligibility — input is locked + banner shown. */
  canSend: boolean;
  /** otherUser display name for the placeholder. */
  otherName: string;
  onSend: (body: string) => Promise<void>;
}

const MAX = 1024;

const MessageComposer: React.FC<Props> = ({ canSend, otherName, onSend }) => {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const len = [...body].length; // code points (matches backend Q10=B)
  const isValid = body.trim().length > 0 && len <= MAX && canSend;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setBody('');
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  if (!canSend) {
    return (
      <div className="composer composer--read-only">
        You and {otherName} don't currently share a class. Conversation is read-only.
      </div>
    );
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer__input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Message ${otherName}…`}
        rows={2}
      />
      <div className="composer__row">
        <span className={`composer__counter ${len > MAX ? 'is-over' : ''}`}>
          {len} / {MAX}
        </span>
        <button type="submit" className="composer__send" disabled={!isValid || busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error && <div className="composer__error">{error}</div>}
    </form>
  );
};

export default MessageComposer;
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/messages/components/MessageBubble.tsx \
        frontend/src/features/messages/components/ConversationList.tsx \
        frontend/src/features/messages/components/MessageComposer.tsx
git commit -m "Messages: bubble, list, composer components"
```

---

## Task 17: `ConversationThread`

**Files:**
- Create: `frontend/src/features/messages/components/ConversationThread.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/features/messages/components/ConversationThread.tsx
import React, { useEffect, useRef } from 'react';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { api } from '@/lib/api';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  callerId: string;
  onMessageSent: () => void;
}

const ConversationThread: React.FC<Props> = ({ conversation, callerId, onMessageSent }) => {
  const { messages, loading, refetch } = useConversationMessages(conversation.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark read on mount and whenever new messages land while in view.
  useEffect(() => {
    api.markConversationRead(conversation.id).catch(() => undefined);
  }, [conversation.id, messages.length]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async (body: string) => {
    await api.sendMessage(conversation.other_user.id, body);
    await refetch();
    onMessageSent();
  };

  // "Seen HH:MM" indicator: render under the caller's latest sent message
  // iff the other user's last_read_at >= that message's created_at.
  const myLatestSent = [...messages].reverse().find((m) => m.sender_id === callerId);
  const seenLabel =
    myLatestSent &&
    conversation.other_user_last_read_at &&
    new Date(conversation.other_user_last_read_at) >= new Date(myLatestSent.created_at)
      ? `Seen ${new Date(conversation.other_user_last_read_at).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : null;

  return (
    <div className="thread">
      <div className="thread__header">
        {conversation.other_user.name || conversation.other_user.email}
      </div>
      <div className="thread__scroll" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <div className="thread__loading">Loading…</div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              body={m.body}
              createdAt={m.created_at}
              isOwn={m.sender_id === callerId}
              seenLabel={m.id === myLatestSent?.id ? seenLabel : null}
            />
          ))
        )}
      </div>
      <MessageComposer
        canSend={conversation.can_send}
        otherName={conversation.other_user.name || conversation.other_user.email || 'this user'}
        onSend={handleSend}
      />
    </div>
  );
};

export default ConversationThread;
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/components/ConversationThread.tsx
git commit -m "Messages: ConversationThread (header, scroll, mark-read)"
```

---

## Task 18: `NewConversationCompose`

For the case where the caller clicks Message on a user they have no existing conversation with.

**Files:**
- Create: `frontend/src/features/messages/components/NewConversationCompose.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/features/messages/components/NewConversationCompose.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import MessageComposer from './MessageComposer';

interface Props {
  toUserId: string;
  onConversationCreated: () => void;
}

/**
 * Right-pane variant rendered when the URL is /app/messages/compose?to=<id>
 * and there's no existing conversation in the inbox cache.
 *
 * On first send: POST /messages → backend creates conversation + inserts
 * → frontend navigates to /app/messages/:newConvId.
 */
const NewConversationCompose: React.FC<Props> = ({ toUserId, onConversationCreated }) => {
  const navigate = useNavigate();

  const handleSend = async (body: string) => {
    const res = await api.sendMessage(toUserId, body);
    onConversationCreated();
    navigate(`/app/messages/${res.conversation_id}`, { replace: true });
  };

  return (
    <div className="thread thread--compose">
      <div className="thread__header">New conversation</div>
      <div className="thread__scroll thread__scroll--empty">
        Send your first message to start the conversation.
      </div>
      <MessageComposer canSend={true} otherName="this user" onSend={handleSend} />
    </div>
  );
};

export default NewConversationCompose;
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/messages/components/NewConversationCompose.tsx
git commit -m "Messages: NewConversationCompose pane for first-message flow"
```

---

# Phase 7 — Frontend page + routing

## Task 19: `Messages.tsx` page (composes everything)

**Files:**
- Create: `frontend/src/features/messages/pages/Messages.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/features/messages/pages/Messages.tsx
import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useConversations } from '../hooks/useConversations';
import ConversationList from '../components/ConversationList';
import ConversationThread from '../components/ConversationThread';
import NewConversationCompose from '../components/NewConversationCompose';
import '../messages.scss';

const Messages: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams] = useSearchParams();
  const composeTo = searchParams.get('to');
  const { user } = useAuth();
  const { conversations, loading, refetch } = useConversations();

  const callerId = user?.id ?? '';
  const selectedId = conversationId === 'compose' ? null : conversationId ?? null;
  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="messages-page">
      <aside className="messages-page__list">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          loading={loading}
        />
      </aside>
      <section className="messages-page__pane">
        {conversationId === 'compose' && composeTo ? (
          <NewConversationCompose toUserId={composeTo} onConversationCreated={refetch} />
        ) : selectedConversation ? (
          <ConversationThread
            conversation={selectedConversation}
            callerId={callerId}
            onMessageSent={refetch}
          />
        ) : (
          <div className="messages-page__empty">Select a conversation to start chatting.</div>
        )}
      </section>
    </div>
  );
};

export default Messages;
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```
Expected: errors about missing `messages.scss` import — fix in next task.

- [ ] **Step 3: Skip-commit** (next task adds the SCSS so the page actually renders).

---

## Task 20: `messages.scss` (minimal styles using existing tokens)

**Files:**
- Create: `frontend/src/features/messages/messages.scss`

- [ ] **Step 1: Write the stylesheet**

```scss
// frontend/src/features/messages/messages.scss
@use '@/styles/colors' as c;
@use '@/styles/variables' as v;

.messages-page {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
  min-height: 0;
  background: c.$white;
  border-radius: v.$border-radius-md;

  &__list {
    border-right: 1px solid c.$border-color;
    overflow-y: auto;
    min-width: 0;
  }

  &__pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: c.$text-tertiary;
  }
}

.conversation-list {
  list-style: none;
  margin: 0;
  padding: 0;

  &--empty,
  &--loading {
    padding: v.$spacing-lg;
    color: c.$text-tertiary;
  }

  &__hint {
    margin-top: v.$spacing-sm;
    font-size: 0.875rem;
  }

  &__item {
    border-bottom: 1px solid c.$border-color;
    position: relative;
    transition: background v.$transition-fast;

    &.is-selected { background: rgba(c.$primary-color, 0.08); }
    &.is-unread .conversation-list__name { font-weight: 600; }
  }

  &__link {
    display: block;
    padding: v.$spacing-md;
    color: c.$text-primary;
    text-decoration: none;
  }

  &__name { color: c.$text-primary; }

  &__preview {
    margin-top: v.$spacing-xs;
    color: c.$text-tertiary;
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__badge {
    position: absolute;
    top: v.$spacing-md;
    right: v.$spacing-md;
    background: c.$primary-color;
    color: c.$white;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.75rem;
    font-weight: 600;
  }
}

.thread {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  &__header {
    padding: v.$spacing-md;
    border-bottom: 1px solid c.$border-color;
    font-weight: 600;
    color: c.$text-primary;
  }

  &__scroll {
    flex: 1;
    overflow-y: auto;
    padding: v.$spacing-md;
    display: flex;
    flex-direction: column;
    gap: v.$spacing-sm;

    &--empty {
      align-items: center;
      justify-content: center;
      color: c.$text-tertiary;
    }
  }

  &__loading { color: c.$text-tertiary; }
}

.message-bubble {
  max-width: 70%;
  padding: v.$spacing-sm v.$spacing-md;
  border-radius: v.$border-radius-md;
  word-wrap: break-word;

  &--own {
    align-self: flex-end;
    background: c.$primary-color;
    color: c.$white;
  }

  &--other {
    align-self: flex-start;
    background: c.$background;
    color: c.$text-primary;
  }

  &__meta {
    margin-top: v.$spacing-xs;
    display: flex;
    gap: v.$spacing-sm;
    font-size: 0.75rem;
    opacity: 0.85;
  }
}

.composer {
  border-top: 1px solid c.$border-color;
  padding: v.$spacing-md;

  &--read-only {
    color: c.$text-tertiary;
    text-align: center;
    font-style: italic;
  }

  &__input {
    width: 100%;
    border: 1px solid c.$border-color;
    border-radius: v.$border-radius-sm;
    padding: v.$spacing-sm;
    font: inherit;
    resize: vertical;
    min-height: 60px;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: v.$spacing-sm;
  }

  &__counter {
    color: c.$text-tertiary;
    font-size: 0.75rem;

    &.is-over { color: c.$error-color; }
  }

  &__send {
    background: c.$primary-color;
    color: c.$white;
    border: 0;
    border-radius: v.$border-radius-sm;
    padding: v.$spacing-sm v.$spacing-md;
    cursor: pointer;
    font: inherit;

    &:hover:not(:disabled) { background: c.$primary-hover; }
    &:disabled {
      background: c.$disabled-bg;
      cursor: not-allowed;
    }
  }

  &__error {
    color: c.$error-color;
    margin-top: v.$spacing-sm;
    font-size: 0.875rem;
  }
}

.message-button {
  background: c.$primary-color;
  color: c.$white;
  border: 0;
  border-radius: v.$border-radius-sm;
  padding: v.$spacing-xs v.$spacing-md;
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;

  &:hover:not(:disabled) { background: c.$primary-hover; }
  &:disabled {
    background: c.$disabled-bg;
    cursor: not-allowed;
  }
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd frontend && npx tsc -b --noEmit && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit (the page from Task 19 + this stylesheet together)**

```bash
git add frontend/src/features/messages/pages/Messages.tsx \
        frontend/src/features/messages/messages.scss
git commit -m "Messages: Messages page + base SCSS"
```

---

## Task 21: Wire routes in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the import** (top of App.tsx, alongside other lazy/feature imports)

```tsx
import Messages from '@/features/messages/pages/Messages';
```

- [ ] **Step 2: Replace the stub route at `App.tsx:48`**

Old:
```tsx
<Route path="messages" element={<div>Messages - Coming Soon</div>} />
```

New (three routes):
```tsx
<Route path="messages" element={<Messages />} />
<Route path="messages/compose" element={<Messages />} />
<Route path="messages/:conversationId" element={<Messages />} />
```

- [ ] **Step 3: Type-check + build**

```bash
cd frontend && npx tsc -b --noEmit && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "Messages: route registration in App.tsx"
```

---

# Phase 8 — Wire into existing UI

## Task 22: Sidebar unread badge

**Files:**
- Modify: `frontend/src/features/app/components/Layout/Sidebar.tsx`
- Modify: `frontend/src/features/app/components/Layout/Sidebar.scss`

- [ ] **Step 1: Add the badge render**

In `Sidebar.tsx`, add the import at the top:

```tsx
import { useUnreadTotal } from '@/features/messages/hooks/useUnreadTotal';
```

Inside the `Sidebar` component, near the top of the function body (alongside other hooks):

```tsx
const unreadTotal = useUnreadTotal();
```

Find the rendering of `<span>{item.label}</span>` (around line 147 per the file map) and replace the surrounding `<button>` block's child rendering with:

```tsx
{!isCollapsed && <span>{item.label}</span>}
{!isCollapsed && item.path === '/app/messages' && unreadTotal > 0 && (
  <span className="sidebar__unread-badge">{unreadTotal}</span>
)}
```

(Position the badge to the right of the label.)

- [ ] **Step 2: Add the SCSS**

Append to `Sidebar.scss`:

```scss
.sidebar__unread-badge {
  margin-left: auto;
  background: $primary-color;
  color: $white;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}
```

If the existing Sidebar.scss already imports `$primary-color` etc., this will resolve. If not, replace with hardcoded `#018156` and `#FFFFFF` to avoid SCSS partial-import gotchas.

- [ ] **Step 3: Type-check + build**

```bash
cd frontend && npx tsc -b --noEmit && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/app/components/Layout/Sidebar.tsx \
        frontend/src/features/app/components/Layout/Sidebar.scss
git commit -m "Messages: sidebar unread badge"
```

---

## Task 23: Browser tab title

**Files:**
- Modify: `frontend/src/features/app/AppView.tsx`

- [ ] **Step 1: Add the title-sync effect**

In `AppView.tsx`, add the import:

```tsx
import { useUnreadTotal } from '@/features/messages/hooks/useUnreadTotal';
```

Inside the `AppView` component (near the other hooks/state declarations):

```tsx
const unreadTotal = useUnreadTotal();
useEffect(() => {
  document.title = unreadTotal > 0 ? `(${unreadTotal}) GrepThink` : 'GrepThink';
  return () => {
    // Restore on unmount (e.g., navigating to /login).
    document.title = 'GrepThink';
  };
}, [unreadTotal]);
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/app/AppView.tsx
git commit -m "Messages: browser tab title with unread total"
```

---

## Task 24: `MessageButton` on `ProjectDetails.tsx`

**Files:**
- Modify: `frontend/src/features/app/pages/ProjectDetails.tsx`

- [ ] **Step 1: Read the current structure**

```bash
grep -n "owner\|members\|created_by\|return (" frontend/src/features/app/pages/ProjectDetails.tsx | head -30
```

Identify (a) the spot where the project owner is rendered (typically a header/description block) and (b) the spot where each project member is rendered (typically inside a `.map()`).

- [ ] **Step 2: Add the import**

At the top of `ProjectDetails.tsx`:

```tsx
import MessageButton from '@/features/messages/components/MessageButton';
import { useAuth } from '@/lib/auth';
```

Inside the component (if not already there):

```tsx
const { user } = useAuth();
```

- [ ] **Step 3: Add the owner-message button**

In the project-header rendering, alongside the owner's name, add:

```tsx
{project.created_by && project.created_by !== user?.id && (
  <MessageButton userId={project.created_by} label="Message owner" />
)}
```

(Adjust property name `project.created_by` to whatever the actual project type uses — verify with `grep created_by frontend/src/features/app/pages/ProjectDetails.tsx`.)

- [ ] **Step 4: Add per-member buttons**

Inside the members-list `.map((m) => ...)` block, add next to each row:

```tsx
{m.user_id !== user?.id && (
  <MessageButton userId={m.user_id} />
)}
```

- [ ] **Step 5: Build**

```bash
cd frontend && npm run build
```
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/app/pages/ProjectDetails.tsx
git commit -m "Messages: MessageButton on project details (owner + members)"
```

---

## Task 25: `MessageButton` on `MyProject.tsx` (per join requester)

**Files:**
- Modify: `frontend/src/features/app/pages/MyProject.tsx`

- [ ] **Step 1: Inspect**

```bash
grep -n "join\|request\|requester" frontend/src/features/app/pages/MyProject.tsx | head -20
```

Identify where pending join requests are rendered (likely a list with `.map()` over join requests).

- [ ] **Step 2: Add the import**

```tsx
import MessageButton from '@/features/messages/components/MessageButton';
```

- [ ] **Step 3: Add a button per row**

Inside the join-requests `.map()`, next to the existing accept/reject buttons:

```tsx
<MessageButton userId={request.user_id} />
```

Adjust `request.user_id` to whatever field the requester uses in your `ApiProjectJoinRequest` type.

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/app/pages/MyProject.tsx
git commit -m "Messages: MessageButton next to pending join requesters"
```

---

# Phase 9 — Verification + handoff

## Task 26: End-to-end smoke test via Preview

**Files:** None.

This is the manual verification step. The implementer should:

- [ ] **Step 1: Start frontend + backend via Preview**

```
preview_start({ name: "backend" })
preview_start({ name: "frontend" })
```

Expected: both servers come up. Backend logs include "Application startup complete". Frontend Vite reports "ready in N ms".

- [ ] **Step 2: Manually verify each user-facing path**

Log in as **two test users** (preferably one student + one student in the same class, then add an instructor for the second pass). For each, check:

- Sidebar Messages link is visible.
- Visit a project → "Message owner" button appears for non-self projects.
- Click "Message owner" → land on `/app/messages/compose?to=<id>`.
- Type a message → Send → URL changes to `/app/messages/:conversationId`. Message appears.
- Recipient (other tab/user) sees:
  - Sidebar badge increments to 1.
  - Browser tab title changes to `(1) GrepThink`.
  - Inbox shows the new conversation with bold name and `1` badge.
- Recipient clicks the conversation → reads → badge clears within 15s.
- Sender then sees "Seen HH:MM" under their last message within 3s.
- Send a 1025-character message → Send button is disabled, counter is red.
- Send a whitespace-only message → Send button is disabled.

- [ ] **Step 3: Mark issues**

If any of the above fails, file a follow-up task; do not block the PR for cosmetic issues.

- [ ] **Step 4: Stop servers**

```
preview_stop({ serverId: "..." })
```

## Task 27: Open the PR

**Files:** None.

- [ ] **Step 1: Push**

```bash
git push origin feat/messages
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base beta --head feat/messages --title "feat(messages): minimal 1:1 DM for project recruitment" --body "$(cat <<'EOF'
## Summary

Implements the minimal direct-messaging feature scoped for project recruitment. Spec at `docs/superpowers/specs/2026-04-23-messages-design.md`.

- 1:1 DMs only. Students↔students + instructors↔students. Instructor↔instructor out of scope.
- Eligibility = at least one shared class. Conversation becomes read-only when eligibility lapses.
- Polling (3s thread / 15s inbox), no realtime.
- Conversation-level read receipts ("Seen HH:MM" on sender's latest).
- 1024 code-point body limit.
- Discovery only via project-page MessageButton (4 spots).

## Test plan

- [ ] Backend: `cd backend && pytest` → all pass (existing 17 + new ~20)
- [ ] Frontend: `cd frontend && npm run build` → no TS errors
- [ ] Manual: two-user smoke test per Task 26 in the implementation plan.

## Out of scope (follow-ups)

Edit/delete, attachments, search, typing indicators, group chats, "+ New" picker, push, RLS policies, rate limiting, mobile responsive, draft sync. See spec §"Not in v1".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Done.** Spec at `docs/superpowers/specs/2026-04-23-messages-design.md` and plan at `docs/superpowers/plans/2026-04-23-messages-implementation.md` for any reviewer who wants context.
