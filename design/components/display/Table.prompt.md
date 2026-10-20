Data table. Native `<table>` semantics: `scope="col"` headers, a visually hidden `<caption>`, `aria-sort` on sortable headers.

```jsx
<Table caption="Class roster" columns={cols} rows={students} sort={sort} onSort={setSort}
  rowHref={(s) => `/app/students/${s.id}`} loading={loading} emptyText="No students match these filters." />
<Table dense stickyHeader caption="Breakdown by team" columns={cols} rows={rows} />
```

- **Sortable headers**: a button inside the `<th>` (tight focus ring, chevron at 35% → 100% when active); the `<th>` carries `aria-sort` ascending / descending / none.
- **Rows that open something**: the link (`rowHref`) or button (`onRowClick`) lives in the first cell; the row only shows hover. No `<tr onClick>` — no keyboard can reach it.
- **Loading**: Skeleton rows (`aria-hidden`) and `aria-busy` on the table. **Empty**: one full-width row with a compact card EmptyState (`emptyText`, or pass `emptyState`).
- **Dense** rows (6/8 × 12, 13px) for analytics breakdowns; **sticky header** inside a scrolling card (`max-height` set by the feature).
- **Phones**: the table scrolls sideways inside its card; when it overflows, the wrapper becomes a focusable `role="region"` named by the caption, so keyboard users can scroll it.
- Head row `--gt-surface-sunken`, 13px tertiary 500; cells 14px 500, 1px row rules, `--gt-gray-50` hover.
