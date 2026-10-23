import React from 'react';
import { EmptyState } from '../feedback/EmptyState.jsx';

/* lucide ChevronUp / ChevronDown / ChevronsUpDown at 12px */
const SortGlyph = ({ dir }) => (
  <svg className="gt-table__sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'desc' ? <path d="M6 9l6 6 6-6" /> : dir === 'asc' ? <path d="M18 15l-6-6-6 6" /> : <><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></>}
  </svg>
);

/** Numbers compare numerically; strings case-insensitively (localeCompare, base sensitivity). */
export function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}
/** A new array sorted by the accessor in the given direction. Stable; never mutates. */
export function sortRows(rows, accessor, direction) {
  const factor = direction === 'asc' ? 1 : -1;
  return rows.map((row, index) => ({ row, index }))
    .sort((a, b) => { const r = compareValues(accessor(a.row), accessor(b.row)); return r !== 0 ? r * factor : a.index - b.index; })
    .map(({ row }) => row);
}
/** Pressing the active column flips its direction; another column starts ascending. */
export function nextSortState(current, key) {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: 'asc' };
}
/**
 * Sort state for a table of its own (one that draws its header row with SortableHeader):
 * `{ sortedRows, sort, toggleSort }`. `accessors` maps each sortable key to the value it sorts by;
 * `initial` is `{ key, direction }`. Exported from Table.jsx as the codebase ships it in
 * `components/Table/` (fold-back 2026-10-22).
 */
export function useTableSort(rows, accessors, initial) {
  const [sort, setSort] = React.useState(initial);
  const sortedRows = React.useMemo(() => sortRows(rows, accessors[sort.key], sort.direction), [rows, accessors, sort]);
  const toggleSort = (key) => setSort((current) => nextSortState(current, key));
  return { sortedRows, sort, toggleSort };
}

/**
 * A sortable column header: a `<th scope="col">` holding a button that sorts by its column. While
 * its column sorts the table the `<th>` carries `aria-sort` (ascending / descending) and the chevron
 * points the way it sorts; ARIA 1.2 puts `aria-sort` on the sorted column only, so the others carry
 * none and show a neutral up-down glyph (a figure column may sort largest-first on its first press).
 * Table renders it for a sortable column; a table of its own renders it with useTableSort.
 */
export function SortableHeader({ label, sortKey, currentSort, onSort, className = '', ...rest }) {
  const direction = currentSort && currentSort.key === sortKey ? currentSort.direction : null;
  return (
    <th {...rest} scope="col" className={className || undefined} aria-sort={direction === null ? undefined : direction === 'asc' ? 'ascending' : 'descending'}>
      <button type="button" className={['gt-table__sort', direction !== null ? 'gt-table__sort--active' : ''].filter(Boolean).join(' ')} onClick={() => onSort(sortKey)}>
        {label}<SortGlyph dir={direction} />
      </button>
    </th>
  );
}

/**
 * Data table: `scope="col"` headers, sortable headers as buttons with `aria-sort` on the sorted
 * column (a header is a button only when the table has `onSort`), a visually hidden caption,
 * Skeleton loading rows, a compact EmptyState row, `dense` rows, a sticky header (inside the
 * Table's own wrapper — limit the wrapper's height, not a box around it), and horizontal scrolling
 * inside its card on phones (the scroll region is focusable only when it overflows). Rows that open
 * something put a link (`rowTo` for an in-app route, `rowHref` for another site) or button
 * (`onRowClick`) in the first cell; the row itself only shows hover — no `<tr onClick>`.
 */
export function Table({
  columns = [], rows = [], caption, sort, onSort, loading = false, skeletonRows = 4,
  emptyState = null, emptyText = 'Nothing here yet.', rowKey = (row, i) => row.id ?? i,
  onRowClick, rowHref, rowTo, dense = false, stickyHeader = false, className = '', style,
}) {
  const wrapRef = React.useRef(null);
  const [scrolls, setScrolls] = React.useState(false);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [rows.length, columns.length]);
  const sortBy = (key) => {
    if (onSort) onSort({ key, dir: sort && sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  };
  const current = sort ? { key: sort.key, direction: sort.dir } : null;
  const opens = onRowClick || rowHref || rowTo;
  return (
    <div
      ref={wrapRef}
      className={['gt-table-wrapper', className].filter(Boolean).join(' ')}
      style={style}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls && typeof caption === 'string' ? caption : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      <table className={['gt-table', dense ? 'gt-table--dense' : '', stickyHeader ? 'gt-table--sticky' : ''].filter(Boolean).join(' ')} aria-busy={loading || undefined}>
        {caption && <caption className="gt-visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const colStyle = col.width ? { width: col.width } : undefined;
              return col.sortable && onSort
                ? <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={current} onSort={sortBy} style={colStyle} />
                : <th key={col.key} scope="col" style={colStyle}>{col.label}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, r) => (
              <tr key={`s${r}`} aria-hidden="true">
                {columns.map((col) => <td key={col.key}><span className="gt-skeleton" style={{ width: `${55 + ((r * 17 + col.key.length * 13) % 40)}%` }} /></td>)}
              </tr>
            ))
            : rows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((col, ci) => {
                  const content = col.render ? col.render(row) : row[col.key];
                  if (!opens || ci !== 0) return <td key={col.key}>{content}</td>;
                  return (
                    <td key={col.key}>
                      {rowTo
                        ? <a className="gt-table__open" href={rowTo(row)}>{content}</a>
                        : rowHref
                          ? <a className="gt-table__open" href={rowHref(row)}>{content}</a>
                          : <button type="button" className="gt-table__open" onClick={() => onRowClick(row)}>{content}</button>}
                    </td>
                  );
                })}
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="gt-table__empty-cell">
                {emptyState || <EmptyState variant="card" title={emptyText} titleAs="p" />}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
