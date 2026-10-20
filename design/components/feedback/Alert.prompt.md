Inline alert for a **persistent condition** on the page or in a form. Soft fill + `-text` colour per tone, 16px icon, radius 7.

```jsx
<Alert tone="error" title="Couldn't save this meeting." actions={<Button size="sm" variant="outline" onClick={retry}>Try again</Button>}>
  Your changes are still here.
</Alert>
<Alert tone="warning" title="You have an unsent draft" actions={<><Button size="sm" variant="outline" onClick={restore}>Restore draft</Button><Button size="sm" variant="danger-ghost" onClick={discard}>Discard</Button></>} />
<Alert tone="info" onDismiss={hide}>Preview mode — students can't see changes yet.</Alert>
```

Which feedback when:
- **Alert** — a condition that persists until something changes (preview mode, a failed load, a save error).
- **Toast** — a passing confirmation ("Saved", "Invite sent"), with an optional Undo.
- **Field error** — under its field (FieldShell), linked by `aria-describedby`.
- **Save error** — an Alert above the form's actions; the typed values stay.
- Never a red panel for an empty or failed list region — that's EmptyState `variant="error"`.

Announcing: `tone="error"` is `role="alert"` (spoken at once); the others are `role="status"` (polite). Mount error alerts when the error happens, not ahead of time. The × is "Dismiss" (44px on phones).
