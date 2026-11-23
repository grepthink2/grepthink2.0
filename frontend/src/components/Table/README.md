The data table: real table semantics, sortable column headers, a link or button in each row's first cell when a row opens something, and loading and empty states.

## Use

```jsx
<Table
  caption="Teams in CSE 115A"
  columns={COLUMNS}
  rows={sortedRows}
  sort={{ key: sort.key, dir: sort.direction }}
  onSort={(next) => toggleSort(next.key as keyof typeof BY)}
  rowHref={(team) => `#${team.id}`}
/>
<Table caption="Teams loading" columns={COLUMNS} rows={[]} loading skeletonRows={2} />
```

`COLUMNS` is a list of `{ key, label, sortable?, width?, render?, rowHeader?, className? }`; `render` draws a cell (a Badge for a status), and `rowHeader` makes a column's cells their rows' headers. The rows here are sorted with useTableSort, below.

## Props that matter

- `caption`, required: names the table for screen readers (visually hidden).
- `columns` and `rows`. A row's key is its `id`, else its index, or `rowKey`.
- `sort` (`{ key, dir }`) and `onSort`, which asks for the next sort: a new column ascending, the same column the other way. A `sortable` column's header is a button only when `onSort` is set. The table does not sort rows itself.
- A row that opens something: `rowTo` (an in-app route), `rowHref` (another site) or `onRowClick` puts a link or button in its first cell, and the row shows hover. The preview's links only change the page's `#`.
- `loading`: skeleton rows (`skeletonRows`, default 4) and the table marked busy.
- `emptyText` (default "Nothing here yet.") or `emptyState`: the one row shown with no rows.
- `dense`: tighter 13px rows, for analytics breakdowns.
- `stickyHeader`: the header row sticks while the table scrolls inside its own box; give it a `max-height` through `style` or a class.
- `rowClassName`: a class for a folded or highlighted row.

On a narrow screen the table scrolls sideways, and while it overflows it is a focusable region named by the caption, so a keyboard can scroll it.

## The consumer supplies

- The caption, the columns and the rows, already sorted and filtered, and the empty text that says why nothing shows.

## Do and don't

- Do put a row's link or button in its first cell (`rowTo`, `rowHref`, `onRowClick`); never make the whole `<tr>` clickable, which no keyboard can reach.
- Do keep figures in their own columns, with a `className` to right-align them.
- Don't hand-build a data table where this one fits.

## SortableHeader

A sortable column header for a table you draw yourself: a `<th scope="col">` holding a sort button, with `aria-sort` and a chevron while its column sorts the table, and a faint up-down glyph otherwise.

```jsx
<SortableHeader label="Team" sortKey="name" currentSort={sort} onSort={toggleSort} />
```

- `label`, `sortKey`, `currentSort` (useTableSort's `sort`, or `null`) and `onSort` (useTableSort's `toggleSort`).

## useTableSort

Sorts rows for a table: `useTableSort(rows, accessors, initial)` returns `{ sortedRows, sort, toggleSort }`. `accessors` maps each sortable key to a function giving a row's value (numbers compare as numbers, text without regard to case), and `initial` is `{ key, direction }`. `toggleSort(key)` sorts a new column ascending and flips the current one. Keep `accessors` stable (a module constant), as `BY` is here. `sortRows`, `compareValues` and `nextSortState` are exported too.
