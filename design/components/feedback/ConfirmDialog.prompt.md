Ask before an action that can't be undone. WAI-ARIA: Alert Dialog pattern (`role="alertdialog"` on the Modal shell, size sm).

```jsx
<ConfirmDialog open={!!target} destructive title={`Remove ${target?.name}?`}
  message="They lose access to the team's board and chat. You can invite them again later."
  confirmLabel="Remove" busyLabel="Removing…" onCancel={() => setTarget(null)}
  onConfirm={async () => { await removeMember(target.id); setTarget(null); }} />

<InlineConfirm message="Delete 'Sprint 3 planning'? It disappears from your team's calendars." onCancel={stop} onConfirm={del} busy={deleting} />
```

- Title is the question; the message names the thing and the consequence. **Cancel** (outline) takes focus first; **Confirm** is primary, or solid danger when `destructive`.
- While `onConfirm`'s promise runs: Confirm shows "Removing…" with the spinner (same width), Cancel is disabled, Esc and the scrim are blocked (`closeDisabled`). If it rejects, the dialog stays open with an error Alert above the actions ("That didn't work. Try again.") — never a second dialog.
- Replaces the app's ConfirmModal (5 callers), 5 `window.confirm` calls and 3 `alert()` calls (an `alert()` that only informs becomes a Toast or an Alert).
- Inside another dialog, use **InlineConfirm** instead: the row becomes a muted 7px-radius strip with a red alert disc, the sentence (`role="group"` labelled by it), outline **Cancel** (focused) and danger **Delete**; Esc cancels without closing the enclosing dialog. Phones: the buttons stretch to 44px.
