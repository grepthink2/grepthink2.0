// Intentional addition: Table, SortableHeader — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface TableColumn<Row = any> {
  key: string;
  label: React.ReactNode;
  /** With `onSort`, the header becomes a SortableHeader (a button; the <th> carries `aria-sort` while this column sorts the table). */
  sortable?: boolean;
  /** Fixed column width (CSS value). */
  width?: string;
  render?: (row: Row) => React.ReactNode;
}

export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface TableProps<Row = any> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** Visually hidden <caption>; also names the scroll region when the table overflows. */
  caption?: React.ReactNode;
  sort?: TableSort;
  /** Asked for the next sort (ascending first, then the other way). Without it no header is a button. */
  onSort?: (next: TableSort) => void;
  /** Skeleton rows + `aria-busy`. @default false */
  loading?: boolean;
  /** @default 4 */
  skeletonRows?: number;
  /** Custom empty row content (defaults to a compact card EmptyState with `emptyText`). */
  emptyState?: React.ReactNode;
  /** @default 'Nothing here yet.' */
  emptyText?: string;
  rowKey?: (row: Row, index: number) => string | number;
  /** The first cell becomes a button that opens the row. */
  onRowClick?: (row: Row) => void;
  /** The first cell becomes a link to the row on another site (an in-app route is `rowTo`). */
  rowHref?: (row: Row) => string;
  /** The first cell becomes a link to the row's in-app route (the codebase renders a react-router Link; the kit an <a>). Before `rowHref` and `onRowClick`. */
  rowTo?: (row: Row) => string;
  /** 6/8 × 12 padding, 13px cells. @default false */
  dense?: boolean;
  /**
   * The header row sticks while the table scrolls under it — inside the Table's own wrapper only: its
   * `overflow-x: auto` makes the wrapper the scroll box, so limit the wrapper's height (`className` or
   * `style`), not a box around the Table. @default false
   */
  stickyHeader?: boolean;
  className?: string;
  /** Reaches the wrapper (a `maxHeight` for a sticky header). */
  style?: React.CSSProperties;
}

/** Data table with sortable headers, loading, empty and open-row patterns. */
export function Table<Row = any>(props: TableProps<Row>): React.JSX.Element;

export type SortDirection = 'asc' | 'desc';
export interface SortState<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export interface SortableHeaderProps<K extends string = string> extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'children' | 'scope' | 'aria-sort'> {
  label: React.ReactNode;
  sortKey: K;
  /** The table's sort (useTableSort's `sort`); null while no column is sorted. */
  currentSort: SortState<K> | null;
  /** Called with this header's key; the table decides the direction (useTableSort's `toggleSort`). */
  onSort: (key: K) => void;
}

/**
 * A sortable column header: `<th scope="col">` + sort button. `aria-sort` only while its column sorts the
 * table (ARIA 1.2: one per table); unsorted, a neutral up-down glyph. Table renders it; a table of its own can too.
 */
export function SortableHeader<K extends string = string>(props: SortableHeaderProps<K>): React.JSX.Element;

/** Numbers numerically, strings case-insensitively. */
export function compareValues(a: string | number, b: string | number): number;
/** A new, stably sorted array. */
export function sortRows<T>(rows: T[], accessor: (row: T) => string | number, direction: SortDirection): T[];
/** The active column flips; another column starts ascending. */
export function nextSortState<K extends string>(current: SortState<K>, key: K): SortState<K>;
/** Sort state for a table that draws its own header row with SortableHeader. */
export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => string | number>,
  initial: SortState<K>,
): { sortedRows: T[]; sort: SortState<K>; toggleSort: (key: K) => void };
