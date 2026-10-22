import { Download, Info } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Table, type TableColumn, type TableSort } from '@/components/Table/Table';
import type { ApiAnalyticsBreakdownRow } from '@/lib/api/types';
import { percent } from '../utils/analyticsFormat';

export interface BreakdownColumn { key: keyof ApiAnalyticsBreakdownRow; label: string; kind: 'text' | 'number' | 'percent' }

// oxlint-disable-next-line react/only-export-components -- the page's CSV export uses the table's own columns
export function breakdownColumns(kind: 'class' | 'team'): BreakdownColumn[] {
  const head: BreakdownColumn[] = kind === 'class'
    ? [{ key: 'name', label: 'Class', kind: 'text' }, { key: 'teams', label: 'Teams', kind: 'number' }, { key: 'students', label: 'Students', kind: 'number' }]
    : [{ key: 'name', label: 'Team', kind: 'text' }, { key: 'members', label: 'Members', kind: 'number' }];
  return [...head,
    { key: 'team_messages', label: 'Team msgs', kind: 'number' }, { key: 'stories', label: 'Stories', kind: 'number' },
    { key: 'tasks', label: 'Tasks', kind: 'number' }, { key: 'points_done_rate', label: 'Pts done %', kind: 'percent' }];
}

/** The visible columns as CSV-ready values (percentages formatted, null → ''). */
// oxlint-disable-next-line react/only-export-components -- the page's CSV export uses the table's own columns
export function breakdownCsvRows(kind: 'class' | 'team', rows: ApiAnalyticsBreakdownRow[]): Record<string, unknown>[] {
  const cols = breakdownColumns(kind);
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, c.kind === 'percent' ? (r[c.key] == null ? '' : percent(r[c.key] as number)) : r[c.key]])));
}

export interface BreakdownTableProps { kind: 'class' | 'team'; rows: ApiAnalyticsBreakdownRow[]; onExport: () => void }

type Sort = { key: keyof ApiAnalyticsBreakdownRow; dir: 'asc' | 'desc' };
const BY_NAME: Sort = { key: 'name', dir: 'asc' };
/** Names compare as people read them: "Team 2" before "Team 10", case and accents aside. */
const NAMES = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** A cell: the name (with the folded row's explanation), a percentage over its 3px meter, or a figure; "—" when missing. */
function cellOf(column: BreakdownColumn, row: ApiAnalyticsBreakdownRow): ReactNode {
  const v = row[column.key];
  if (column.kind !== 'text' && (v === null || v === undefined)) return <span className="gt-table__null">—</span>;
  if (column.kind === 'text') {
    return <>{String(v ?? '')}{row.kind === 'folded' ? <Info size={12} role="img" aria-label="Fewer than 3 people" className="gt-table__info" /> : null}</>;
  }
  if (column.kind === 'percent') {
    return (
      <>
        {percent(v as number)}
        <span className="gt-table__meter" aria-hidden="true"><span className="gt-table__meter-fill" style={{ width: `${Math.min(100, Math.max(0, Math.round((v as number) * 100)))}%` }} /></span>
      </>
    );
  }
  return (v as number).toLocaleString('en-US');
}

/**
 * Per class or per team (brief §4 #12), on the shared Table with a sticky header: the name is each row's header,
 * figures are right-aligned and tabular, a 3px meter sits under percentages, and the folded row comes last, in italics.
 * It takes the design's breakdown look, `.gt-table--breakdown` in analytics.scss.
 */
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
      const base = typeof va === 'number' && typeof vb === 'number' ? va - vb : NAMES.compare(String(va), String(vb));
      return sort.dir === 'asc' ? base : -base;
    };
    return [...real.sort(cmp), ...folded];
  }, [rows, sort]);
  // The Table asks for the next sort: the sorted column turns around, and another starts the way this table always has,
  // names A–Z and figures largest first.
  const onSort = (next: TableSort) => {
    const key = next.key as keyof ApiAnalyticsBreakdownRow;
    setSort(key === sort.key ? { key, dir: next.dir } : { key, dir: key === 'name' ? 'asc' : 'desc' });
  };
  const columns: TableColumn<ApiAnalyticsBreakdownRow>[] = [
    ...cols.map((c): TableColumn<ApiAnalyticsBreakdownRow> => ({
      key: c.key,
      label: c.label,
      sortable: true,
      // the name is the row's header, as in the cards' twin tables
      rowHeader: c.kind === 'text',
      className: c.kind === 'text' ? undefined : 'gt-table__num',
      render: (r) => cellOf(c, r),
    })),
    {
      key: 'open',
      label: <span className="gt-visually-hidden">Open</span>,
      className: 'gt-table__num',
      render: (r) => (r.kind === 'row' && r.href ? <Link className="gt-table__link" to={r.href} aria-label={`View ${r.name}`}>View</Link> : null),
    },
  ];
  return (
    <div className="gt-table--breakdown">
      <div className="gt-table__bar">
        <button type="button" className="gt-table__export" onClick={onExport}><Download size={14} aria-hidden="true" /> Export CSV</button>
      </div>
      <Table
        caption={kind === 'class' ? 'Breakdown by class' : 'Breakdown by team'}
        columns={columns}
        rows={sorted}
        sort={sort}
        onSort={onSort}
        rowClassName={(r) => (r.kind === 'folded' ? 'gt-table__row--folded' : undefined)}
        dense
        stickyHeader
      />
    </div>
  );
}
