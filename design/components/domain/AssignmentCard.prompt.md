Assignment row with due date, status pill and status-appropriate action button.

```jsx
<AssignmentCard name="TSR 3" due="Feb 01, 2026" project="GrepThink 2.0"
  status="in_progress" onAction={openTsr} />
```

Statuses: `not_started` · `in_progress` · `submitted` · `due_soon` · `closed`.
