import * as React from 'react';

export interface TableColumn<Row = any> {
  key: string;
  label: React.ReactNode;
  /** Header becomes a button; the <th> carries `aria-sort`. */
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
  /** The first cell becomes a link to the row. */
  rowHref?: (row: Row) => string;
  /** 6/8 × 12 padding, 13px cells. @default false */
  dense?: boolean;
  /** Sticky header row inside a scrolling container. @default false */
  stickyHeader?: boolean;
  className?: string;
}

/** Data table with sortable headers, loading, empty and open-row patterns. */
export function Table<Row = any>(props: TableProps<Row>): React.JSX.Element;
