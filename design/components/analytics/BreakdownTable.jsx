import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';
import { fmtCompact, fmtPct } from './ChartTooltip.jsx';

/** Per-class columns (first release). Append TIMELINESS_COLUMNS once timeliness ships. */
export const BREAKDOWN_COLUMNS = [
  { key: 'name', label: 'Class', format: 'text', sortable: true },
  { key: 'teams', label: 'Teams', format: 'int', sortable: true },
  { key: 'students', label: 'Students', format: 'int', sortable: true },
  { key: 'team_messages', label: 'Team msgs', format: 'int', sortable: true },
  { key: 'stories', label: 'Stories', format: 'int', sortable: true },
  { key: 'tasks', label: 'Tasks', format: 'int', sortable: true },
  { key: 'points_done_rate', label: 'Pts done %', format: 'pct', sortable: true },
];

/** Per-team columns (a class is selected). */
export const TEAM_BREAKDOWN_COLUMNS = [
  { key: 'name', label: 'Team', format: 'text', sortable: true },
  { key: 'members', label: 'Members', format: 'int', sortable: true },
  { key: 'team_messages', label: 'Team msgs', format: 'int', sortable: true },
  { key: 'stories', label: 'Stories', format: 'int', sortable: true },
  { key: 'tasks', label: 'Tasks', format: 'int', sortable: true },
  { key: 'points_done_rate', label: 'Pts done %', format: 'pct', sortable: true },
];

/** Columns that arrive with timeliness (sub-project C). */
export const TIMELINESS_COLUMNS = [
  { key: 'on_time_rate', label: 'On time %', format: 'pct', sortable: true },
  { key: 'missing', label: 'Missing', format: 'int', sortable: true },
];

function Cell({ col, row }) {
  const v = row[col.key];
  if (v === null || v === undefined) return <span className="gt-table__null">—</span>;
  if (col.format === 'pct') {
    return (
      <span className="gt-table__pct">
        <span className="gt-table__meter" aria-hidden="true"><span className="gt-table__meter-fill" style={{ width: `${Math.round(v * 100)}%` }} /></span>
        {fmtPct(v)}
      </span>
    );
  }
  if (col.format === 'int') return fmtCompact(v);
  return v;
}

/**
 * Per-class / per-team breakdown (.gt-table--breakdown). Sticky header, right-aligned
 * tabular figures, 3px inline meters on percentage cells, a "View" link per real row,
 * the folded row last in italics with a ⓘ "Fewer than 3 people". Rows beyond
 * `maxRows` sit behind "Show all (n)"; > 12 rows ⇒ 20px dense rows.
 */
export function BreakdownTable({ columns = BREAKDOWN_COLUMNS, rows = [], sort, onSort, getRowHref, onRowView, dense, maxRows = 12, className = '' }) {
  const [all, setAll] = React.useState(false);
  const isDense = dense ?? rows.length > 12;
  const ordered = React.useMemo(() => {
    const real = rows.filter((r) => r.kind !== 'folded');
    const folded = rows.filter((r) => r.kind === 'folded');
    if (sort && sort.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      real.sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
      });
    }
    return [...real, ...folded];
  }, [rows, sort]);
  const visible = all || ordered.length <= maxRows ? ordered : ordered.slice(0, maxRows);
  const hasView = !!(getRowHref || onRowView);

  const clickSort = (key) => {
    if (!onSort) return;
    onSort({ key, dir: sort && sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' });
  };

  return (
    <div className={['gt-table', 'gt-table--breakdown', isDense ? 'gt-table--dense' : '', className].filter(Boolean).join(' ')}>
      <div className="gt-table__scroll">
        <table className="gt-table__table">
          <thead>
            <tr>
              {columns.map((c) => {
                const num = c.format !== 'text';
                const active = sort && sort.key === c.key;
                return (
                  <th key={c.key} className={num ? 'gt-table__num' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} scope="col">
                    {c.sortable && onSort ? (
                      <button type="button" className={['gt-table__sort', active ? 'gt-table__sort--active' : ''].filter(Boolean).join(' ')} onClick={() => clickSort(c.key)}>
                        {c.label}
                        <AnalyticsIcon className="gt-table__sort-icon" name={active ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'} size={12} />
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
              {hasView && <th aria-label="Open" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const folded = r.kind === 'folded';
              const href = !folded && getRowHref ? getRowHref(r) : null;
              return (
                <tr key={r.id} className={folded ? 'gt-table__row--folded' : ''}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.format !== 'text' ? 'gt-table__num' : ''}>
                      {c.key === 'name' ? (
                        <span className="gt-table__name">{r.name}{folded && <span className="gt-table__info" title="Fewer than 3 people"><AnalyticsIcon name="info" size={12} /></span>}</span>
                      ) : <Cell col={c} row={r} />}
                    </td>
                  ))}
                  {hasView && (
                    <td className="gt-table__num">
                      {folded ? null : onRowView ? <button type="button" className="gt-table__link" onClick={() => onRowView(r)}>View</button> : href ? <a className="gt-table__link" href={href}>View</a> : null}
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={columns.length + (hasView ? 1 : 0)} style={{ textAlign: 'center', color: 'var(--gt-text-tertiary)', height: 64 }}>Nothing to list</td></tr>}
          </tbody>
        </table>
      </div>
      {ordered.length > maxRows && (
        <div className="gt-table__bar">
          <span>Showing {visible.length} of {ordered.length}</span>
          <button type="button" className="gt-table__more" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all (${ordered.length})`}</button>
        </div>
      )}
    </div>
  );
}
