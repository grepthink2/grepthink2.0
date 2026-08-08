import * as React from 'react';

export interface TableColumn<Row = any> {
  key: string;
  label: React.ReactNode;
  /** Enables the sortable-header button. */
  sortable?: boolean;
  /** Fixed column width (CSS value). */
  width?: string;
  /** Custom cell renderer. */
  render?: (row: Row) => React.ReactNode;
}

export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface TableProps<Row = any> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** Controlled sort state. */
  sort?: TableSort;
  onSort?: (next: TableSort) => void;
  /** Render shimmer skeleton rows instead of data. @default false */
  loading?: boolean;
  /** @default 4 */
  skeletonRows?: number;
  /** Rendered when rows is empty (use <EmptyState/>). */
  emptyState?: React.ReactNode;
  rowKey?: (row: Row, index: number) => string | number;
  onRowClick?: (row: Row) => void;
  className?: string;
}

/**
 * Data table with sortable headers + skeleton loading.
 * @startingPoint section="Data" subtitle="Sortable table with loading & empty states" viewport="700x300"
 */
export function Table<Row = any>(props: TableProps<Row>): React.JSX.Element;
