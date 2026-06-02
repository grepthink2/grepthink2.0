import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Users, TrendingUp, Zap } from 'lucide-react';
import type { RankedStaffingProject, StaffingSortKey, SortDir } from './assignTypes';
import './StaffingTable.scss';

interface StaffingTableProps {
  projects: RankedStaffingProject[];
  onAddSeat: (projectId: string) => void;
  onRemoveSeat: (projectId: string) => void;
}

type ColDef = {
  key: StaffingSortKey;
  label: string;
  icon?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
};

const COLUMNS: ColDef[] = [
  { key: 'name',      label: 'Project Name',  align: 'left'   },
  { key: 'seats',     label: 'SEATS',         align: 'center' },
  { key: 'breadth',   label: 'Breadth',       icon: <Users size={13} />, align: 'center' },
  { key: 'depth',     label: 'Depth',         icon: <TrendingUp size={13} />, align: 'center' },
  { key: 'strength',  label: 'Strength',      icon: <Zap size={13} />,  align: 'center' },
  { key: 'bRank',     label: 'B Rank',        align: 'center' },
  { key: 'dRank',     label: 'D Rank',        align: 'center' },
  { key: 'sRank',     label: 'S Rank',        align: 'center' },
  { key: 'sumRanks',  label: 'Sum',           align: 'center' },
  { key: 'totalRank', label: 'Total Rank',    align: 'center' },
];

const SortIcon: React.FC<{ columnKey: StaffingSortKey; sortKey: StaffingSortKey; dir: SortDir }> = ({
  columnKey,
  sortKey,
  dir,
}) => {
  if (columnKey !== sortKey) return <ChevronsUpDown size={12} className="staffing-table__sort-icon staffing-table__sort-icon--idle" />;
  return dir === 'asc'
    ? <ChevronUp size={12} className="staffing-table__sort-icon staffing-table__sort-icon--active" />
    : <ChevronDown size={12} className="staffing-table__sort-icon staffing-table__sort-icon--active" />;
};

const StaffingTable: React.FC<StaffingTableProps> = ({ projects, onAddSeat, onRemoveSeat }) => {
  const [sortKey, setSortKey] = useState<StaffingSortKey>('bRank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: StaffingSortKey) => {
    if (key === 'seats') return; // seats column is not sortable
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...projects].sort((a, b) => {
    if (sortKey === 'name') {
      const aVal = a.name.toLowerCase();
      const bVal = b.name.toLowerCase();
      if (sortDir === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }

    const getVal = (p: RankedStaffingProject): number => {
      switch (sortKey) {
        case 'breadth':   return p.breadth;
        case 'depth':     return p.depth;
        case 'strength':  return p.strength;
        case 'bRank':     return p.bRank;
        case 'dRank':     return p.dRank;
        case 'sRank':     return p.sRank;
        case 'sumRanks':  return p.sumRanks;
        case 'totalRank': return p.totalRank;
        default:          return 0;
      }
    };

    const diff = getVal(a) - getVal(b);
    return sortDir === 'asc' ? diff : -diff;
  });

  return (
    <div className="staffing-table">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={[
                  `staffing-table__th`,
                  `staffing-table__th--${col.align ?? 'left'}`,
                  col.key !== 'seats' ? 'staffing-table__th--sortable' : '',
                  col.key === sortKey ? 'staffing-table__th--sorted' : '',
                ].join(' ')}
                onClick={() => handleSort(col.key)}
              >
                <span className="staffing-table__th-inner">
                  {col.icon && <span className="staffing-table__th-icon">{col.icon}</span>}
                  {col.label}
                  {col.key !== 'seats' && (
                    <SortIcon columnKey={col.key} sortKey={sortKey} dir={sortDir} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((project) => (
            <tr key={project.id} className="staffing-table__row">
              {/* Project Name */}
              <td className="staffing-table__td staffing-table__td--name">
                {project.name}
              </td>

              {/* Seats stepper */}
              <td className="staffing-table__td staffing-table__td--seats">
                <div className="staffing-table__stepper">
                  <button
                    className="staffing-table__step-btn staffing-table__step-btn--minus"
                    onClick={() => onRemoveSeat(project.id)}
                    aria-label={`Remove seat from ${project.name}`}
                  >
                    −
                  </button>
                  <span className="staffing-table__seat-count">{project.totalSeats}</span>
                  <button
                    className="staffing-table__step-btn staffing-table__step-btn--plus"
                    onClick={() => onAddSeat(project.id)}
                    aria-label={`Add seat to ${project.name}`}
                  >
                    +
                  </button>
                </div>
              </td>

              {/* Breadth */}
              <td className="staffing-table__td staffing-table__td--center staffing-table__td--metric">
                {project.breadth}
              </td>

              {/* Depth */}
              <td className="staffing-table__td staffing-table__td--center staffing-table__td--metric">
                {project.depth}
              </td>

              {/* Strength */}
              <td className="staffing-table__td staffing-table__td--center staffing-table__td--metric">
                {project.strength.toFixed(2)}
              </td>

              {/* B Rank */}
              <td className="staffing-table__td staffing-table__td--center">
                <span className="staffing-table__rank-pill staffing-table__rank-pill--muted">
                  {project.bRank}
                </span>
              </td>

              {/* D Rank */}
              <td className="staffing-table__td staffing-table__td--center">
                <span className="staffing-table__rank-pill staffing-table__rank-pill--muted">
                  {project.dRank}
                </span>
              </td>

              {/* S Rank */}
              <td className="staffing-table__td staffing-table__td--center">
                <span className="staffing-table__rank-pill staffing-table__rank-pill--muted">
                  {project.sRank}
                </span>
              </td>

              {/* Sum */}
              <td className="staffing-table__td staffing-table__td--center staffing-table__td--metric">
                {project.sumRanks}
              </td>

              {/* Total Rank */}
              <td className="staffing-table__td staffing-table__td--center">
                <span className="staffing-table__rank-pill staffing-table__rank-pill--total">
                  {project.totalRank}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StaffingTable;
