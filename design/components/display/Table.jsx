import React from 'react';
import { EmptyState } from '../feedback/EmptyState.jsx';

const SortGlyph = ({ dir }) => (
  <svg className="gt-table__sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'desc' ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
  </svg>
);

/**
 * Data table: `scope="col"` headers, sortable headers as buttons with `aria-sort`, a visually
 * hidden caption, Skeleton loading rows, a compact EmptyState row, `dense` rows, a sticky header,
 * and horizontal scrolling inside its card on phones (the scroll region is focusable only when it
 * overflows). Rows that open something put a link (`rowHref`) or button (`onRowClick`) in the
 * first cell; the row itself only shows hover — no `<tr onClick>`.
 */
export function Table({
  columns = [], rows = [], caption, sort, onSort, loading = false, skeletonRows = 4,
  emptyState = null, emptyText = 'Nothing here yet.', rowKey = (row, i) => row.id ?? i,
  onRowClick, rowHref, dense = false, stickyHeader = false, className = '',
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
  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    onSort({ key: col.key, dir: sort && sort.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc' });
  };
  const opens = onRowClick || rowHref;
  return (
    <div
      ref={wrapRef}
      className={['gt-table-wrapper', className].filter(Boolean).join(' ')}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls && typeof caption === 'string' ? caption : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      <table className={['gt-table', dense ? 'gt-table--dense' : '', stickyHeader ? 'gt-table--sticky' : ''].filter(Boolean).join(' ')} aria-busy={loading || undefined}>
        {caption && <caption className="gt-visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort && sort.key === col.key;
              return (
                <th key={col.key} scope="col" style={col.width ? { width: col.width } : undefined}
                  aria-sort={col.sortable ? (active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}>
                  {col.sortable ? (
                    <button type="button" className={['gt-table__sort', active ? 'gt-table__sort--active' : ''].filter(Boolean).join(' ')} onClick={() => handleSort(col)}>
                      {col.label}<SortGlyph dir={active ? sort.dir : 'asc'} />
                    </button>
                  ) : col.label}
                </th>
              );
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
                      {rowHref
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
