The one unread pill — sidebar items, the header bell, the conversation list, the message widget. Promoted from `domain/ConversationListItem` (`.gt-unread`).

```jsx
<SidebarNavItem label="Messages" badge={3} />            {/* renders <UnreadBadge count={3} /> */}
<UnreadBadge count={12} />                                {/* "12 unread" for screen readers */}
<button aria-label="Notifications, 8 unread"><Bell /><UnreadBadge count={8} /></button>
```

- Unread is **always red**: solid `--gt-error` (#DC2626) with white 11/700 text — 4.8:1. The legacy `#FF3B30` sidebar red (3.5:1 behind white) retires; `--gt-error-icon` stays only as a token.
- Accessible text is built in ("3 unread"). Inside a control named by `aria-label` (an icon button), the label hides it — put the count in the label too ("Notifications, 8 unread").
- 18px, min 18 wide, "99+" cap, renders nothing at 0. `dot` for the collapsed sidebar. Any other count is a CountBadge.
