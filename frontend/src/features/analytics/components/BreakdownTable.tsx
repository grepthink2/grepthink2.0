import { Download, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiAnalyticsBreakdownRow } from '@/lib/api/types';
import { percent } from '../utils/analyticsFormat';

export interface BreakdownColumn { key: keyof ApiAnalyticsBreakdownRow; label: string; kind: 'text' | 'number' | 'percent' }

// eslint-disable-next-line react-refresh/only-export-components -- the page's CSV export uses the table's own columns
export function breakdownColumns(kind: 'class' | 'team'): BreakdownColumn[] {
  const head: BreakdownColumn[] = kind === 'class'
    ? [{ key: 'name', label: 'Class', kind: 'text' }, { key: 'teams', label: 'Teams', kind: 'number' }, { key: 'students', label: 'Students', kind: 'number' }]
    : [{ key: 'name', label: 'Team', kind: 'text' }, { key: 'members', label: 'Members', kind: 'number' }];
  return [...head,
    { key: 'team_messages', label: 'Team msgs', kind: 'number' }, { key: 'stories', label: 'Stories', kind: 'number' },
    { key: 'tasks', label: 'Tasks', kind: 'number' }, { key: 'points_done_rate', label: 'Pts done %', kind: 'percent' }];
}

/** The visible columns as CSV-ready values (percentages formatted, null → ''). */
// eslint-disable-next-line react-refresh/only-export-components -- the page's CSV export uses the table's own columns
export function breakdownCsvRows(kind: 'class' | 'team', rows: ApiAnalyticsBreakdownRow[]): Record<string, unknown>[] {
  const cols = breakdownColumns(kind);
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, c.kind === 'percent' ? (r[c.key] === null ? '' : percent(r[c.key] as number)) : r[c.key]])));
}

export interface BreakdownTableProps { kind: 'class' | 'team'; rows: ApiAnalyticsBreakdownRow[]; onExport: () => void }

type Sort = { key: keyof ApiAnalyticsBreakdownRow; dir: 'asc' | 'desc' };
const BY_NAME: Sort = { key: 'name', dir: 'asc' };

/** Per class or per team (brief §4 #12): sticky header, right-aligned tabular figures, a 3px meter under percentages, the folded row last and italic. */
export function BreakdownTable({ kind, rows, onExport }: BreakdownTableProps) {
  const cols = useMemo(() => breakdownColumns(kind), [kind]);
  const [chosen, setSort] = useState<Sort>(BY_NAME);
  // A column the other kind showed (Students, once a class is picked) is not one of these: sort by name until another is chosen.
  const sort = cols.some((c) => c.key === chosen.key) ? chosen : BY_NAME;
  const sorted = useMemo(() => {
    const real = rows.filter((r) => r.kind === 'row');
    const folded = rows.filter((r) => r.kind === 'folded');
    const cmp = (a: ApiAnalyticsBreakdownRow, b: ApiAnalyticsBreakdownRow) => {
      const va = a[sort.key] ?? (typeof b[sort.key] === 'number' ? -Infinity : '');
      const vb = b[sort.key] ?? (typeof a[sort.key] === 'number' ? -Infinity : '');
      const base = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? base : -base;
    };
    return [...real.sort(cmp), ...folded];
  }, [rows, sort]);
  const toggle = (key: keyof ApiAnalyticsBreakdownRow) =>
    setSort(sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' });
  return (
    <div className="gt-table">
      <div className="gt-table__bar">
        <button type="button" className="gt-table__export" onClick={onExport}><Download size={14} aria-hidden="true" /> Export CSV</button>
      </div>
      <div className="gt-table__scroll">
        <table className="gt-table__table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={c.kind === 'text' ? '' : 'gt-table__num'}>
                  <button type="button" className="gt-table__sort" onClick={() => toggle(c.key)}>{c.label}</button>
                </th>
              ))}
              <th scope="col" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={r.kind === 'folded' ? 'gt-table__row--folded' : undefined}>
                {cols.map((c) => {
                  const v = r[c.key];
                  if (c.kind === 'text') return <td key={c.key}>{String(v ?? '')}{r.kind === 'folded' ? <Info size={12} role="img" aria-label="Fewer than 3 people" className="gt-table__info" /> : null}</td>;
                  if (c.kind === 'percent') return (
                    <td key={c.key} className="gt-table__num">
                      {percent(v as number | null)}
                      {typeof v === 'number' ? <span className="gt-table__meter" aria-hidden="true"><span className="gt-table__meter-fill" style={{ width: `${Math.round(v * 100)}%` }} /></span> : null}
                    </td>
                  );
                  return <td key={c.key} className="gt-table__num">{v === null || v === undefined ? '—' : (v as number).toLocaleString('en-US')}</td>;
                })}
                <td className="gt-table__num">{r.kind === 'row' && r.href ? <Link to={r.href}>View</Link> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
