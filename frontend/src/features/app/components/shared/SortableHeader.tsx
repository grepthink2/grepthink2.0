import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { SortState } from '@features/app/utils/useTableSort';
import './SortableHeader.scss';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  currentSort: SortState<K>;
  onSort: (key: K) => void;
  /** Extra class names forwarded to the <th>. */
  className?: string;
}

/** A table header cell that toggles column sorting when clicked. */
function SortableHeader<K extends string>({
  label,
  sortKey,
  currentSort,
  onSort,
  className,
}: SortableHeaderProps<K>) {
  const isActive = currentSort.key === sortKey;
  const ariaSort = isActive
    ? currentSort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  return (
    <th
      className={`sortable-header${isActive ? ' sortable-header--active' : ''}${className ? ` ${className}` : ''}`}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className="sortable-header__button"
        onClick={() => onSort(sortKey)}
      >
        <span className="sortable-header__label">{label}</span>
        <span className="sortable-header__icon" aria-hidden="true">
          {!isActive ? (
            <ChevronsUpDown size={14} />
          ) : currentSort.direction === 'asc' ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </span>
      </button>
    </th>
  );
}

export default SortableHeader;
