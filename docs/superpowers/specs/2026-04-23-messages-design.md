# Messages — Design Spec

**Status:** Draft → approved for implementation
**Branch:** `feat/messages`
**Author:** Pranay + Claude
**Date:** 2026-04-23

## Intent

A minimal 1:1 direct-message feature whose primary use case is **students approaching
each other about project recruitment**. Secondary use case: instructors coordinating
with students in their classes. Explicitly *not* a general chat app — the feature is
scoped tightly so conversations around "hey, interested in joining our project?" happen
in GrepThink rather than Discord or external email.

## Decisions (traceable to brainstorm)

| # | Decision |
|---|---|
| Q1 | Both students↔students AND instructors↔students DM. Instructor↔instructor **out of scope**. |
| Q2 | 1:1 threads only. No groups. |
| Q3 | Conversation identity is per-pair (global). Class is an eligibility gate, not a thread property. |
| Q4 | When a pair no longer shares an active class, the conversation becomes **read-only**. History stays. Re-enables if they share a class again. |
| Q5 | Read receipts = conversation-level unread count for recipient + "Seen HH:MM" indicator on sender's latest message. No per-message read timestamps. |
| Q6 | Polling only (no realtime in v1). 3s for the open thread, 15s for the inbox + sidebar badge. |
| Q7 | Discovery via project-page buttons only: project detail "Message owner", per-member "Message", my-project per-join-requester "Message", instructor view per-student-member "Message". |
| Q7b | No "+ New Message" picker on the Messages page. Messages page = pure inbox. |
| Q8 | Sidebar unread badge + browser tab title `(N) GrepThink`. N = total unread messages. |
| Q9 | Load latest 50 on open. **No scroll-up pagination in v1.** If latest 50 isn't enough, future problem. |
| Q10 | Character limit = 1024 Unicode code points (Python `len(s)`). |

Implicit defaults:
- Messages are immutable. No edit, no delete.
- Text-only. No attachments, markdown, mentions, or link previews.
- First write to a conversation auto-creates it. No empty conversations appear in the inbox.

---

## Data model

Three new tables in the Supabase schema.

### `conversations`

| column | type | notes |
|---|---|---|
| `id` | uuid | pk, default `gen_random_uuid()` |
| `user_a` | uuid | fk `profiles.id`, **smaller** of the two uuids (lexicographic) |
| `user_b` | uuid | fk `profiles.id`, **larger** of the two uuids |
| `created_at` | timestamptz | default `now()` |
| `last_message_at` | timestamptz | denormalized; bumped on every message insert |

Constraints:
- `UNIQUE (user_a, user_b)` — exactly one conversation per pair.
- `CHECK (user_a < user_b)` — canonical ordering; prevents the same pair stored two ways.
- FKs use `NO ACTION` — deleting a profile with message history is not permitted at the DB layer.

### `messages`

| column | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `conversation_id` | uuid | fk `conversations.id` |
| `sender_id` | uuid | fk `profiles.id` |
| `body` | text | `CHECK (char_length(body) BETWEEN 1 AND 1024)` |
| `created_at` | timestamptz | default `now()` |

Index: `(conversation_id, created_at DESC)` covers pagination-style reads and latest-message lookups.

No `updated_at`, no `deleted_at` — messages are immutable.

### `conversation_reads`

| column | type | notes |
|---|---|---|
| `conversation_id` | uuid | fk |
| `user_id` | uuid | fk `profiles.id` |
| `last_read_at` | timestamptz | |

Primary key: `(conversation_id, user_id)`. Two rows max per conversation.

Powers:
- **Unread count for user X:** `count(messages m WHERE m.conversation_id = r.conversation_id AND m.created_at > r.last_read_at AND m.sender_id != X)` where `r` is X's read-row for that conversation.
- **"Seen" for sender:** check the *other* user's `last_read_at >= my_latest_sent_message.created_at`.

---

## API surface

Prefix: `/api/messages`. All endpoints require a valid JWT (`Depends(require_user)`). Eligibility enforcement is in the controller layer.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/messages/conversations` | List inbox |
| `POST` | `/api/messages` | Send a message (creates conversation on first send) |
| `GET` | `/api/messages/conversations/{id}/messages` | List latest 50 messages (no pagination) |
| `POST` | `/api/messages/conversations/{id}/read` | Mark conversation read through `now()` |

### `GET /api/messages/conversations`

```jsonc
{
  "conversations": [
    {
      "id": "uuid",
      "other_user": { "id": "uuid", "email": "bob@ucsc.edu", "name": "Bob" },
      "last_message": { "body": "hey are you free...", "created_at": "...", "sender_id": "uuid" },
      "unread_count": 3,
      "other_user_last_read_at": "2026-04-22T19:12:00Z",
      "can_send": true,
      "last_message_at": "..."
    }
  ]
}
```

- Sorted by `last_message_at DESC`.
- Filter: conversations with `last_message_at IS NOT NULL` only (no "ghost conversations").
- `can_send` is `can_message(caller, other_user)`.

### `POST /api/messages`

```jsonc
// Request
{ "to_user_id": "uuid", "body": "hello" }

// Response: 201
{
  "conversation_id": "uuid",
  "message": { "id": "uuid", "sender_id": "uuid", "body": "hello", "created_at": "..." }
}
```

Backend transaction:
1. Validate: `body` is 1–1024 code points, non-whitespace; `to_user_id != caller`; `can_message(caller, to_user_id)`.
2. Get-or-create conversation row for the canonical pair.
3. Insert message.
4. Bump `conversations.last_message_at`.
5. Upsert caller's `conversation_reads.last_read_at = now()` (senders implicitly read their own sends).

Errors:
- 400 — body length, whitespace-only, self-send, missing fields.
- 403 — `can_message` returns false.

### `GET /api/messages/conversations/{id}/messages`

```jsonc
{
  "messages": [
    { "id": "uuid", "sender_id": "uuid", "body": "...", "created_at": "..." }
  ]
}
```

- Always returns the latest 50 messages, ordered `created_at DESC`.
- Frontend reverses for chronological display.
- 403 if caller isn't a participant of the conversation. 404 if conversation doesn't exist.
- Used by both the initial thread open *and* the 3s polling loop — the poll re-fetches the same 50 and diffs client-side. (For recruitment threads averaging 3–5 messages, this is trivial overhead.)

### `POST /api/messages/conversations/{id}/read`

- Empty request body.
- Upserts `(conversation_id, caller_id, last_read_at = now())`.
- 204 on success.
- 403 if caller isn't a participant.

---

## Permissions: `can_message`

```python
def can_message(a_id: str, b_id: str) -> bool:
    if a_id == b_id:
        return False
    roles = get_profile_roles([a_id, b_id])  # {id: role}
    if roles.get(a_id) == 'instructor' and roles.get(b_id) == 'instructor':
        return False
    return has_shared_class(a_id, b_id)
```

### `has_shared_class` — one SQL

```sql
WITH user_classes AS (
  SELECT created_by AS user_id, id AS class_id FROM classes
  UNION
  SELECT user_id, class_id FROM class_enrollments
)
SELECT EXISTS (
  SELECT 1
  FROM user_classes ua
  JOIN user_classes ub ON ua.class_id = ub.class_id
  WHERE ua.user_id = :a AND ub.user_id = :b
);
```

### Enforcement points

| Endpoint | What's checked |
|---|---|
| `POST /messages` (send) | `can_message(caller, to_user_id)` → 403 if false. Called **every send** so lapsed eligibility blocks further messages even after conversation was created. |
| `GET /conversations` (inbox) | No eligibility gate — you always see your own inbox. `can_send` computed per row. |
| `GET /conversations/{id}/messages` | Participant check only. Eligibility is irrelevant to reading history (Q4=A). |
| `POST /conversations/{id}/read` | Participant check only. |

### Participant check

Separate from `can_message`. Defined as: `caller_id IN (conversation.user_a, conversation.user_b)`. Called on every read- and write-path endpoint that takes a `conversation_id` path parameter. Returns 403 otherwise.

Distinct from eligibility — prevents third parties from guessing conversation ids to exfiltrate history, and is also the correct check on *read* paths (a conversation that went read-only due to lapsed eligibility is still readable by its participants).

---

## Frontend architecture

### Module layout

```
frontend/src/features/messages/
├── pages/Messages.tsx               # /app/messages and /app/messages/:id
├── components/
│   ├── ConversationList.tsx
│   ├── ConversationThread.tsx       # Contains inline SeenIndicator + ReadOnlyBanner
│   ├── MessageBubble.tsx
│   ├── MessageComposer.tsx          # Textarea + char counter + send
│   └── MessageButton.tsx            # Reused from project pages
├── hooks/
│   ├── useConversations.ts          # Polls /conversations every 15s
│   └── useConversationMessages.ts   # Polls /messages every 3s when mounted
└── types.ts
```

### Routing

- `/app/messages` → inbox with right pane showing "No conversation selected"
- `/app/messages/:conversationId` → inbox + open thread
- `/app/messages/compose?to=<user_id>` → composer-only right pane for a user the caller has no existing conversation with. On first send → `navigate('/app/messages/:conversationId')`.

### `MessageButton` — the only entry point

Used in four places:
- `ProjectDetail.tsx` — "Message owner" button in the project header.
- `ProjectDetail.tsx` — "Message" button next to each non-self project member.
- `MyProject.tsx` — "Message" next to each pending join requester.
- Instructor's project detail view — "Message" next to each student member.

Click behavior:
1. Check `useConversations` cache for existing conversation with `userId`.
2. If found → `navigate('/app/messages/:conversationId')`.
3. If not found → `navigate('/app/messages/compose?to=' + userId)`.
4. Button disabled + tooltip when parent knows caller isn't eligible (optional short-circuit).

On the backend side, any "get existing conversation id for pair X" lookup is free — the inbox response already carries it.

### Polling

| Loop | Interval | Mounted when |
|---|---|---|
| Inbox | 15s | App root (drives sidebar badge + tab title); also any time `<Messages>` is on screen |
| Thread | 3s | `<ConversationThread>` is mounted (viewing a specific conversation) |

No `document.hidden` pause/resume. Always-on polling is fine at these cadences.

### Send flow

1. User types → char counter updates (turns red at 1024).
2. Send button enabled iff `body.trim().length > 0 && char_length(body) <= 1024 && can_send`.
3. Click → Send button disabled + spinner → `POST /api/messages`.
4. Success → append server-returned message to thread, clear composer, re-enable Send, bump inbox cache.
5. Failure → toast "Couldn't send. Try again." Re-enable Send. Keep draft in composer.
6. 403 specifically → toast "You no longer share a class with this user." + refetch conversation metadata (flips `can_send` false, composer locks).

### Read mark

- Thread mount → immediate `POST /read`.
- New message arrives via poll while thread is in view → `POST /read` again on that tick (no debounce; cadence already gated at 3s).
- No mark-on-unmount needed.

### Unread total, sidebar badge, tab title

- `useUnreadTotal()` reads from the same `useConversations` cache and sums `unread_count` across rows.
- Sidebar Messages item: renders `{count > 0 && <span className="badge">{count}</span>}`. Styles plain — just show the number.
- Tab title: `useEffect` at app root sets `document.title = count > 0 ? \`(${count}) GrepThink\` : 'GrepThink'`.

### UI states

- **Inbox empty:** "No conversations yet. Visit a project page and click Message to start one."
- **Thread, ineligible:** composer replaced with inline banner: "You and {Name} don't currently share a class. Conversation is read-only."
- **Thread, sending:** Send button disabled, spinner in button.
- **Seen indicator:** if `other_user_last_read_at >= my_latest_sent_message.created_at`, render inline `<span>Seen HH:MM</span>` under the most recent sent bubble.

---

## Error handling (essentials only)

- **Poll failure:** silent retry on next tick.
- **Send failure:** toast + keep draft; user retries.
- **Double-click Send:** button disabled during POST.
- **Clock skew:** timestamps always from server; relative time ("5m ago") computed client-side but anchored on server `created_at`.
- **Concurrent sends:** no conflict; each is a distinct insert. Display order = `created_at ASC`, tiebreak on `id`.
- **Account deletion:** FKs use `NO ACTION`. Deletes fail at the DB while history exists. Not a v1 feature.
- **Logout in another tab:** existing `onAuthStateChange SIGNED_OUT` flow handles it — polls abort when `getToken()` returns null.
- **Invalid conversation id in URL:** 404 → redirect to `/app/messages` + toast.

---

## Not in v1

Captured for PR description, not as design commitments:

Edit, delete, attachments, markdown, mentions, link previews, search, typing indicators, group chats, instructor↔instructor, "+ New" picker, per-class threads, push notifications, realtime, RLS policies (defense in depth), rate limiting, mobile responsive, block/mute/report, draft sync across devices, per-message read timestamps, scroll-up pagination, "99+" display cap, connection-lost banner, optimistic send.
