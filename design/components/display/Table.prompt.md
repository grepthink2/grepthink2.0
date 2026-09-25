Data table matching the app idiom (grey head row, 1px row borders, hover). Sortable headers, shimmer skeleton, empty state.

```jsx
<Table
  columns={[
    { key:'name', label:'Name', sortable:true },
    { key:'due', label:'Deadline', sortable:true },
    { key:'status', label:'Status', render: r => <Badge tone={r.tone}>{r.status}</Badge> },
  ]}
  rows={assignments}
  sort={sort} onSort={setSort}
/>
```

Wrap in `<Card padded={false}>` for the standard white table card. `loading` renders skeleton rows; `emptyState` accepts an `<EmptyState/>`.
