import React from 'react';
import { Skeleton } from './Skeleton';

interface TableSkeletonProps {
  /** BEM root shared by the real table, e.g. 'roster-list', 'assignment-list'. */
  block: string;
  /** Header title kept visible above the table (e.g. 'Student Count'). */
  title: string;
  /** Column header labels — kept visible so the table reads as structured. */
  headers: string[];
  /** Number of placeholder rows. */
  rows?: number;
  /** Optional per-column skeleton bar width; falls back to '70%'. */
  cellWidths?: Array<string | number>;
}

/**
 * Loading placeholder that mirrors the app's standard `*-list` table layout:
 * header + count area, table-card, real column headers, and N shimmer rows.
 * Reuses the existing table classNames so the skeleton occupies the same box
 * as the loaded table (no layout shift).
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  block,
  title,
  headers,
  rows = 8,
  cellWidths,
}) => (
  <div className={block} aria-busy="true">
    <div className={`${block}__header`}>
      <h2 className={`${block}__title`}>{title}</h2>
    </div>
    <div className={`${block}__table-card`}>
      <div className={`${block}__table-wrapper`}>
        <table className={`${block}__table`}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {headers.map((_, c) => (
                  <td key={c}>
                    <Skeleton width={cellWidths?.[c] ?? '70%'} height={14} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default TableSkeleton;
