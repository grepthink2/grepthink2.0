# Messages UI Polish & Floating Widget — Design Spec

**Date:** 2026-04-26
**Branch:** feat/messages
**Scope:** Inbox header, three-dot delete menu, thread header update, floating message widget

## Context

The messaging feature is functional on `feat/messages`. This spec covers UI polish to align with the Figma design (file `lZ2cJPUa7uwjxiIhpCUxE1`, node `149:309`) and adds a floating chat tab. Explicitly excluded from scope: starred chats, grouped chats (plus icon), avatars backed by profile photos, online presence indicators.

## 1. Inbox Panel (Left Side)

### Header Bar
- "All Messages" title, left-aligned, ~18px semibold, `$text-primary`
- Search icon right-aligned (visual only, non-functional for now)
- Bottom border (`1px solid $border-color`) separating header from list

### Conversation Items
Each row includes:
- **Initials avatar**: 51x51px circle, gray background (`$background`), initials derived from display name, `$text-secondary` text, ~18px font
- **Name**: Semibold, `$text-primary`, 0.95rem
- **Relative timestamp**: Right-aligned, `$text-tertiary`, 0.8rem (e.g., "10 Hours", "2 Days", "Apr 24" for older)
- **Last message preview**: Single line, truncated, `$text-tertiary`, 0.85rem
- **Unread badge**: Small colored circle (not the current pill), bottom-right of row area
- **Three-dot menu**: Appears on row hover, right side. Single "Delete" option. Uses shared `<ConversationMenu />`.
- **Active state**: `rgba($primary-color, 0.08)` background + 3px left border (unchanged)

### No star icons.

## 2. Thread Header

- **Left side**: Initials avatar (51x51px, same shared component) + name (~18px semibold). No subtitle for now.
- **Right side**: Three-dot menu icon (vertical dots), always visible. Opens dropdown with single "Delete conversation" option. Uses shared `<ConversationMenu />`.
- **No star icon. No plus/add icon.**
- **Height**: ~76px matching Figma. Padding: `$spacing-md` vertical, `$spacing-lg` horizontal.
- **Bottom border**: 1px solid `$border-color` (unchanged).

## 3. Floating Message Widget

### Collapsed State (Tab)
- `position: fixed; bottom: 0; right: 24px`
- Pill/tab shape: rounded top corners (`$border-radius-md`), flat bottom edge
- `$white` background, slight `box-shadow`
- Contains: chat icon + "Messages" label + unread count badge
- Clicking toggles expanded view

### Expanded State (Popover)
- ~360px wide x 480px tall, `position: fixed`, anchored bottom-right
- `$white` background, `$border-radius-md` top corners, `box-shadow`
- `z-index: $z-index-dropdown` (10)

#### Header Bar
- "Messages" title + minimize button (chevron-down or X icon)

#### List View
- Reuses `ConversationList` component directly
- Same inbox items: initials avatar, name, timestamp, preview, hover three-dot menu

#### Thread View
- When a conversation is clicked, swaps the list for `ConversationThread`
- Back arrow in header to return to list view
- All inline — no router navigation

### State Management
- `useState` for open/closed + selected conversation ID
- No router involvement
- Pulls from existing `useConversations()` context (zero new polling)

### Auto-Hide Rules
- Hidden on `/app/messages` via CSS (avoid duplicate UI)
- Hidden on screens < 768px via `@media` query

## 4. Delete Conversation

### Trigger Points
- Three-dot menu in inbox items (hover-reveal)
- Three-dot menu in thread header (always visible)

### Shared Component
`<ConversationMenu />` — accepts `conversationId` and `onDeleted` callback. Renders the vertical-dots icon + dropdown with "Delete" option.

### Confirmation
Browser `confirm()` dialog: "Delete this conversation? This cannot be undone."

### API
`DELETE /api/messages/conversations/{id}` — new endpoint.
- Backend deletes the conversation for the calling user only (the other party still sees their copy).
- Returns 204 No Content.

### After Delete
- **Thread view**: Navigate to `/app/messages` (shows empty state)
- **Inbox**: Remove item from list (refetch inbox)
- **Widget**: Return to list view (refetch inbox)

## 5. New Shared Components

| Component | Purpose |
|---|---|
| `InitialsAvatar` | 51x51 gray circle with initials. Used in inbox items, thread header, widget. |
| `ConversationMenu` | Three-dot icon + dropdown. Used in inbox items (hover), thread header (always), widget. |

## 6. Files to Create/Modify

### New Files
- `frontend/src/features/messages/components/InitialsAvatar.tsx`
- `frontend/src/features/messages/components/ConversationMenu.tsx`
- `frontend/src/features/messages/components/MessageWidget.tsx`

### Modified Files
- `frontend/src/features/messages/components/ConversationList.tsx` — add header bar, avatar, relative timestamps, hover menu, unread dot style
- `frontend/src/features/messages/components/ConversationThread.tsx` — add avatar + menu to header
- `frontend/src/features/messages/pages/Messages.scss` — new styles for all above
- `frontend/src/features/app/App.tsx` (or layout root) — mount `<MessageWidget />`
- `frontend/src/lib/api.ts` — add `deleteConversation()` endpoint
- `backend/app/messages/views.py` — add DELETE endpoint
- `backend/app/messages/controller.py` — add delete logic
- `backend/app/messages/url.py` — add DELETE route

## 7. Out of Scope

- Profile photo avatars (needs backend `avatar_url` field)
- Online/presence indicators (needs WebSocket or last-seen polling infra)
- Emoji button in composer
- Composer pill-style redesign
- Search functionality (icon is visual placeholder only)
- Starred chats
- Grouped/multi-party chats
