Data table. Native `<table>` semantics: `scope="col"` headers, a visually hidden `<caption>`, `aria-sort` on the sorted header.

```jsx
<Table caption="Class roster" columns={cols} rows={students} sort={sort} onSort={setSort}
  rowTo={(s) => `/app/students/${s.id}`} loading={loading} emptyText="No students match these filters." />
<Table dense stickyHeader style={{ maxHeight: 320 }} caption="Breakdown by team" columns={cols} rows={rows} />
```

- **Sortable headers** (`SortableHeader`, exported with `useTableSort` for a table that draws its own header row): a button inside the `<th>` (tight focus ring) — only when the table has `onSort`. The sorted column's `<th>` carries `aria-sort` ascending / descending and its chevron points the way it sorts; the others carry none (ARIA 1.2: one per table) and show a faint neutral up-down glyph (lucide ChevronsUpDown), since a figure column may sort largest-first on the first press.
- **Rows that open something**: the link (`rowTo` for an in-app route, `rowHref` for another site) or button (`onRowClick`) lives in the first cell; the row only shows hover. No `<tr onClick>` — no keyboard can reach it.
- **Loading**: Skeleton rows (`aria-hidden`) and `aria-busy` on the table. **Empty**: one full-width row with a compact card EmptyState (`emptyText`, or pass `emptyState`).
- **Dense** rows (6/8 × 12, 13px) for analytics breakdowns. **Sticky header**: it sticks inside the Table's own wrapper only — its `overflow-x: auto` makes the wrapper the scroll box — so limit the wrapper (`style={{ maxHeight }}` or a class), never a box around the Table.
- **Phones**: the table scrolls sideways inside its card; when it overflows, the wrapper becomes a focusable `role="region"` named by the caption, so keyboard users can scroll it. In a flush Card the card rings itself around the focused region (the card no longer clips).
- Head row `--gt-surface-sunken`, 13px tertiary 500; cells 14px 500, 1px row rules, `--gt-gray-50` hover. The sort and open-row buttons set their own padding, radius, font and transition, so the app's global `button` rule never reaches them.
