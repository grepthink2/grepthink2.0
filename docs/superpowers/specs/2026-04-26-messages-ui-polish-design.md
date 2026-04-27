# Messages UI Polish & Floating Widget — Design Spec

**Date:** 2026-04-26
**Branch:** feat/messages
**Scope:** Inbox header, three-dot delete menu, thread header update, floating message widget
**Refined:** 2026-04-26 (gaps 1-11 below resolved before implementation)

## Context

The messaging feature is functional on `feat/messages`. This spec covers UI polish to align with the Figma design (file `lZ2cJPUa7uwjxiIhpCUxE1`, node `149:309`) and adds a floating chat tab.

Explicitly excluded from scope: starred chats, grouped chats (plus icon), avatars backed by profile photos, online presence indicators, search functionality (icon is a placeholder).

## Reversal of an earlier decision

The original messages spec (`2026-04-23-messages-design.md` Q3) said *"no delete for messages or DMs"*. This spec **reverses that for conversations only** — users can hide a conversation from their own inbox. Messages themselves remain immutable: nothing in the `messages` table is ever deleted or modified. Per-user conversation hiding is implemented as a new `conversation_deletes` table (insert-only); it doesn't alter or delete existing rows in `conversations` or `messages`.

The other party is never affected by your delete. If they send a new message after you've deleted, the conversation reappears in your inbox (so delete acts as "hide until next activity," not "block").

## Layout note

Figma shows the inbox on the **right** and thread on the **left**. The current implementation (and this spec) keep the inbox on the **left** for two reasons: (1) matches Slack/iMessage/Discord conventions students are already familiar with; (2) avoids re-doing the existing CSS grid. If you want to flip to the Figma layout, that's a separate decision and a small follow-up — say so and I'll do it.

## 1. Inbox Panel (Left Side)

### Header Bar
- "All Messages" title, left-aligned, 18px semibold, `$text-primary`
- Search icon right-aligned (visual only — `tabindex="-1"` so keyboard users skip it; clicking does nothing)
- Bottom border (`1px solid $border-color`) separating header from list
- Height: 64px, padding `$spacing-md $spacing-lg`

### Conversation Items
Each row includes:
- **Initials avatar**: 51×51px circle, `$background` fill, initials in `$text-secondary` 18px semibold
- **Name**: 0.95rem semibold, `$text-primary`
- **Relative timestamp**: right-aligned, 0.8rem, `$text-tertiary`. Bucketing:
  - `< 1 min` → `Just now`
  - `< 1 hour` → `{N} Min`
  - `< 24 hours` → `{N} Hours`
  - `< 7 days` → `{N} Days`
  - `≥ 7 days` → `Apr 24` (locale-formatted month + day; year only if not current year)
- **Last message preview**: single line, ellipsis-truncated, 0.85rem, `$text-tertiary`
- **Unread badge**: small filled circle, `$primary-color` background, 18×18px, white digit inside (cap at `99+`). Bottom-right of row area. Hidden when `unread_count === 0`.
- **Three-dot menu (vertical-dots icon)**: opacity 0 by default; opacity 1 on `:hover` AND `:focus-within` (keyboard accessibility). Right side. Opens `<ConversationMenu />` dropdown with single "Delete" option.
- **Active state**: `rgba($primary-color, 0.08)` background + 3px solid `$primary-color` left border (unchanged from current)

### No star icons.

## 2. Thread Header

- **Left side**: `<InitialsAvatar size={51} />` + name (18px semibold). No role subtitle.
- **Right side**: `<ConversationMenu />` (vertical-dots icon, always visible — not hover-only on this surface). Single "Delete conversation" option.
- **No star icon. No plus/add icon.**
- **Height**: 76px. Padding: `$spacing-md $spacing-lg`.
- **Bottom border**: `1px solid $border-color` (unchanged).

## 3. Floating Message Widget

The widget doesn't exist in the Figma — its visual language is **inspired by the inbox card** in the Figma design: white background, subtle shadow, ~10px (`$border-radius-md`) corner radius, same row layout (avatar / name+preview / time+unread).

### Collapsed State (Tab)
- `position: fixed; bottom: 0; right: 24px`
- Pill shape: top corners `$border-radius-md`, flat bottom edge (sits flush with the viewport bottom)
- 200px wide × 48px tall
- `$white` background, `box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08)` (shadow goes UP only since the bottom is flush)
- Contains, left-to-right: chat icon (`react-icons/lu` `LuMessageCircle`), "Messages" label (0.9rem semibold, `$text-primary`), and the unread count badge (same style as inbox items — `$primary-color` filled circle with white digit)
- Hover: `$background` fill, cursor pointer
- Clicking toggles the expanded view

### Expanded State (Popover)
- 360px wide × 480px tall
- `position: fixed; bottom: 0; right: 24px`
- `$white` background, `border-radius: $border-radius-md $border-radius-md 0 0` (rounded top, flush bottom)
- `box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12)`
- `z-index: $z-index-dropdown` (10) — sits above page content but below modals (which are 100). When a modal opens, the widget is hidden behind it intentionally.
- Stacking: tab disappears when expanded (the popover takes its place)

#### Header Bar (inside popover)
- 56px tall, `$spacing-sm $spacing-md` padding
- Two states:
  - **List view**: "Messages" title (1rem semibold, `$text-primary`) on the left + minimize button (chevron-down icon) on the right
  - **Thread view**: back arrow (chevron-left) + `<InitialsAvatar size={32} />` + name on the left + minimize button on the right

#### List View
- Reuses `<ConversationList />` directly. Same items: avatar (size=40 in widget, see §5), name, timestamp, preview, unread badge, hover three-dot.
- Vertically scrollable.

#### Thread View
- When a conversation row is clicked, swaps the list for `<ConversationThread />` rendered inline (no router navigation).
- All existing thread behavior — composer, send, "Seen" indicator, read-only banner — works unchanged.
- Back arrow returns to the list view.
- The 3s polling for the open thread engages while the widget is in thread view (just like the page-route variant). When you close the widget or go back to list, polling stops.

### State Management
- Local `useState` in `<MessageWidget />`: `isOpen`, `selectedConversationId`.
- No router involvement — the widget operates entirely client-side without changing the URL.
- Pulls from existing `useConversations()` context (zero new polling for the inbox; the inbox is already polled at 15s by `<ConversationsProvider />` mounted in `AppView`).

### Auto-Hide Rules
- Hidden whenever `location.pathname.startsWith('/app/messages')` — covers `/app/messages`, `/app/messages/:id`, `/app/messages/compose` (avoids duplicate UI).
- Hidden on screens < 768px via `@media (max-width: 767px)` — the widget would crowd a phone-width screen; on mobile users can use the full-page route via the sidebar.

## 4. Delete Conversation

### Trigger Points
- Three-dot menu in inbox items (hover-or-focus-reveal)
- Three-dot menu in thread header (always visible)
- Three-dot menu in widget inbox items (hover-or-focus-reveal)

### Shared Component
`<ConversationMenu />` — accepts `conversationId: string` and `onDeleted?: () => void`. Renders the vertical-dots icon button + a positioned dropdown with "Delete" entry. Closes on outside click, on Escape, or after the action completes.

### Confirmation
Browser `window.confirm('Delete this conversation? This cannot be undone.')`. Cheap and effective for v1; a custom modal can replace it later if needed.

### API
`DELETE /api/messages/conversations/{id}` — new endpoint.

- **Auth**: `Depends(require_user)`
- **Authorization**: caller must be a participant in the conversation (404 if conversation doesn't exist; 403 if caller is not a participant) — same shape as the existing `_conversation_or_403` helper
- **Action**: `INSERT INTO conversation_deletes (conversation_id, user_id, deleted_at) VALUES (?, ?, now()) ON CONFLICT (conversation_id, user_id) DO UPDATE SET deleted_at = now()` — idempotent. Repeated calls bump the timestamp.
- **Response**: 204 No Content (always — even if the row already existed)
- **Side effects**: none on `messages` or `conversations`. Other party's view is unaffected.

### Inbox filter (server-side)

`list_inbox` adds a join: a conversation appears in caller's inbox iff:
- caller is a participant, AND
- `last_message_at IS NOT NULL` (existing rule), AND
- the caller has no `conversation_deletes` row OR `last_message_at > caller's deleted_at` (i.e., new activity since the delete)

This implements "hide until next activity": delete a conversation, it disappears; if the other party sends a new message later, it reappears.

### After Delete (frontend)
- **Inbox row**: optimistic remove + `refetch()` confirms
- **Thread page (`/app/messages/:id`)**: navigate to `/app/messages` (shows empty state) + refetch
- **Widget thread view**: return to widget list view + refetch

## 5. New Shared Components

| Component | Purpose | Props |
|---|---|---|
| `InitialsAvatar` | Gray-filled circle with initials. Used in inbox items, thread header, widget. | `email: string`, `name?: string \| null`, `size?: number` (default `51`) |
| `ConversationMenu` | Three-dot icon + dropdown. Used in inbox items, thread header, widget items. | `conversationId: string`, `onDeleted?: () => void`, `alwaysVisible?: boolean` (default `false` — hover/focus reveal; `true` for thread header) |
| `MessageWidget` | The floating chat tab + popover. Mounted once at app root. | (none) |

## 6. Files to Create/Modify

### New Files
- `frontend/src/features/messages/components/InitialsAvatar.tsx`
- `frontend/src/features/messages/components/ConversationMenu.tsx`
- `frontend/src/features/messages/components/MessageWidget.tsx`
- `frontend/src/features/messages/utils/relativeTime.ts` — exports `formatRelativeTime(iso: string): string` per the bucketing in §1
- `backend/database/migrations/2026-04-26_conversation_deletes.sql`

### Modified Files
- `frontend/src/features/messages/components/ConversationList.tsx` — header bar, swap email-only display for `<InitialsAvatar />`, use `formatRelativeTime`, switch unread badge style, add `<ConversationMenu />` (hover/focus reveal)
- `frontend/src/features/messages/components/ConversationThread.tsx` — header gets `<InitialsAvatar />` + `<ConversationMenu alwaysVisible />`
- `frontend/src/features/messages/pages/Messages.scss` — new styles for all of the above
- `frontend/src/features/app/AppView.tsx` — mount `<MessageWidget />` once inside the auth-guarded shell, after `<Outlet />`
- `frontend/src/lib/api.ts` — add `deleteConversation(id: string): Promise<void>` (uses `DELETE` method, 204-safe path already in place)
- `backend/app/messages/views.py` — add `delete_conversation` view (returns 204)
- `backend/app/messages/controller.py` — add `delete_conversation_for_user`; update `list_inbox` query to filter on `conversation_deletes`
- `backend/app/messages/url.py` — add `DELETE` route
- `backend/tests/test_messages_endpoints.py` — add 3 tests for DELETE (success, repeat is idempotent, non-participant 403)
- `backend/tests/test_messages_list.py` — add 1 test verifying inbox filter omits deleted conversations until new activity

## 7. Out of Scope

- Profile photo avatars (needs `profiles.avatar_url`)
- Online/presence indicators (needs realtime or last-seen polling infra)
- Emoji button in composer
- Composer redesign (pill style)
- Search functionality (icon is visual placeholder only)
- Starred chats
- Grouped/multi-party chats
- Mobile-responsive layout for the inbox/thread page itself (just the widget hides at < 768px)
- "Mark unread" / mute / archive
- Custom confirmation modal (browser `confirm()` for now)

## 8. DB migration (verbatim SQL)

```sql
-- Per-user conversation hide. Insert-only conceptually; ON CONFLICT just
-- bumps the timestamp so repeated deletes are idempotent.
-- Spec: docs/superpowers/specs/2026-04-26-messages-ui-polish-design.md §4

CREATE TABLE conversation_deletes (
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    user_id         uuid NOT NULL REFERENCES profiles(id),
    deleted_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

-- list_inbox filter uses (user_id, conversation_id), so the PK index covers it.
-- Inbox query also wants "deleted_at < last_message_at" to re-show on new activity;
-- the deleted_at lookup is already covered by the PK lookup.
```

RLS handling matches the other messages tables — controllers use `service_client`, no policies required for v1.
