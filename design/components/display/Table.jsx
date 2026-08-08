import React from 'react';

/**
 * Data table with sortable headers, skeleton loading and empty state.
 * Matches the app's table idiom: #EEEEEE head row, 1px row borders,
 * #FAFAFA row hover, white card wrapper handled by parent Card.
 */
export function Table({
  columns = [],
  rows = [],
  sort,
  onSort,
  loading = false,
  skeletonRows = 4,
  emptyState = null,
  rowKey = (row, i) => row.id ?? i,
  onRowClick,
  className = '',
}) {
  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    const dir = sort && sort.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSort({ key: col.key, dir });
  };

  return (
    <div className={['gt-table-wrapper', className].filter(Boolean).join(' ')}>
      <table className="gt-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined} aria-sort={sort && sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {col.sortable ? (
                  <button type="button" className={['gt-table__sort', sort && sort.key === col.key ? 'gt-table__sort--active' : ''].filter(Boolean).join(' ')} onClick={() => handleSort(col)}>
                    {col.label}
                    <svg className="gt-table__sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      {sort && sort.key === col.key && sort.dir === 'desc'
                        ? <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        : <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                    </svg>
                  </button>
                ) : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, r) => (
                <tr key={`s${r}`} aria-hidden="true">
                  {columns.map((col) => (
                    <td key={col.key}><span className="gt-skeleton" style={{ width: `${55 + ((r * 17 + col.key.length * 13) % 40)}%` }} /></td>
                  ))}
                </tr>
              ))
            : rows.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  className={onRowClick ? 'gt-table__row--clickable' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                  ))}
                </tr>
              ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="gt-table__empty-cell">{emptyState || 'Nothing here yet.'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
