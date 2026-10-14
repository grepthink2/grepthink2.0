Submission timeliness as 100%-stacked bars — early (green-300) · on time (green) · late (warning) · missing (error) — one row per class, or per assignment when a class is selected (ordered by due date).

```jsx
<TimelinessBars rows={timeliness.rows.map(r => ({
  key: r.key, label: r.label, expected: r.expected, editedLate: r.edited_late, href: r.href,
  folded: r.kind === 'folded', dueAt: r.due_at,
  buckets: Object.entries(r.buckets).map(([key, value]) => ({ key, value })),
}))} />
```

Not-due-yet rows: gray track + italic "Due Oct 12". Folded row: italic, no link, ⓘ "fewer than 3 people". Tooltip: count and % per bucket, expected total, due date, edited-late count. ≥ 20 rows → dense 14px bars + "Show all (n)".
