import type { PreviewMeta } from '@components/previewMeta';
import { Badge } from '@components/Badge/Badge';
import { SortableHeader } from './SortableHeader';
import { Table, type TableColumn } from './Table';
import { useTableSort } from './useTableSort';

export const meta: PreviewMeta = { group: 'Display', height: 820 };

type Team = { id: string; name: string; members: number; sprint: number; status: 'sprint.active' | 'sprint.planned' | 'sprint.completed' };

const TEAMS: Team[] = [
  { id: 'team-4', name: 'Bike Share Map', members: 5, sprint: 3, status: 'sprint.active' },
  { id: 'team-7', name: 'Course Planner', members: 4, sprint: 2, status: 'sprint.active' },
  { id: 'team-2', name: 'Lab Queue', members: 6, sprint: 4, status: 'sprint.completed' },
];

const BY = { name: (t: Team) => t.name, members: (t: Team) => t.members, sprint: (t: Team) => t.sprint };

const COLUMNS: TableColumn<Team>[] = [
  { key: 'name', label: 'Team', sortable: true, rowHeader: true },
  { key: 'members', label: 'Members', sortable: true, width: '120px' },
  { key: 'sprint', label: 'Sprint', sortable: true, width: '100px' },
  { key: 'status', label: 'Status', render: (t) => <Badge status={t.status} /> },
];

export default function TablePreview() {
  const { sortedRows, sort, toggleSort } = useTableSort(TEAMS, BY, { key: 'name', direction: 'asc' });
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Sortable headers, and a link in each row's first cell (sort a column; the links only change this page's #)</p>
        <Table
          caption="Teams in CSE 115A"
          columns={COLUMNS}
          rows={sortedRows}
          sort={{ key: sort.key, dir: sort.direction }}
          onSort={(next) => toggleSort(next.key as keyof typeof BY)}
          rowHref={(team) => `#${team.id}`}
        />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Loading, dense and empty</p>
        <Table caption="Teams loading" columns={COLUMNS} rows={[]} loading skeletonRows={2} />
        <Table dense caption="Teams with no sprint yet" columns={COLUMNS} rows={[]} emptyText="No team has started a sprint." />
      </section>
      <section className="ds-section">
        <p className="ds-caption">A table of your own, with SortableHeader and useTableSort</p>
        <table style={{ borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <SortableHeader label="Team" sortKey="name" currentSort={sort} onSort={toggleSort} />
              <SortableHeader label="Members" sortKey="members" currentSort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((team) => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
