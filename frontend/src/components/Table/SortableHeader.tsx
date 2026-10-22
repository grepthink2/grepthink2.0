import type { ReactNode, Ref, ThHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SortState } from './useTableSort';
import './SortableHeader.scss';

export interface SortableHeaderProps<K extends string>
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'children' | 'scope' | 'aria-sort'> {
  label: ReactNode;
  sortKey: K;
  /** The table's sort (useTableSort's `sort`); null while no column is sorted. */
  currentSort: SortState<K> | null;
  /** Called with this header's key; the table decides the direction (useTableSort's `toggleSort`). */
  onSort: (key: K) => void;
  /**
   * Set by the header: a column header whose `aria-sort` follows `currentSort`. JSX takes any
   * hyphenated prop a type leaves out, so both are declared `never` rather than only omitted.
   */
  scope?: never;
  'aria-sort'?: never;
  ref?: Ref<HTMLTableCellElement>;
}

/**
 * A sortable column header, ported from the header of design/components/display/Table.jsx: a
 * `<th scope="col">` with `aria-sort` (ascending, descending, or none while another column sorts the
 * table), holding a button that sorts by its column. The chevron points the way the column sorts,
 * faint until the column is the sorted one. The Table component renders it for a sortable column, and
 * a table of its own can render it in its header row with useTableSort.
 *
 * Native props and `ref` reach the `<th>`.
 */
export function SortableHeader<K extends string>({ label, sortKey, currentSort, onSort, ref, ...rest }: SortableHeaderProps<K>) {
  const direction = currentSort?.key === sortKey ? currentSort.direction : null;
  const Icon = direction === 'desc' ? ChevronDown : ChevronUp;
  return (
    <th {...rest} ref={ref} scope="col" aria-sort={direction === null ? 'none' : direction === 'asc' ? 'ascending' : 'descending'}>
      <button
        type="button"
        className={['gt-table__sort', direction !== null ? 'gt-table__sort--active' : ''].filter(Boolean).join(' ')}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon size={12} strokeWidth={2.5} className="gt-table__sort-icon" aria-hidden="true" />
      </button>
    </th>
  );
}
