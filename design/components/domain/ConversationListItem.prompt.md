Direct-messaging set: `ConversationListItem` (avatar, preview, unread pill), `MessageBubble` (green own / white other), `MessageComposer` (Enter to send), `UnreadBadge` (red count pill).

```jsx
<ConversationListItem name="Team 1" preview="standup at 4?" time="2m" unread={3} onClick={open} />
<MessageBubble author="Tony W" time="3:42 PM">standup at 4?</MessageBubble>
<MessageBubble own time="3:43 PM">works for me</MessageBubble>
<MessageComposer value={draft} onChange={setDraft} onSend={send} />
```
