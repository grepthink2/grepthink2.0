import { useEffect, useId, useImperativeHandle, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { SortableHeader } from './SortableHeader';
import './Table.scss';

export interface TableColumn<Row extends object = Record<string, unknown>> {
  key: string;
  label: ReactNode;
  /** The header becomes a sort button (with `onSort`), and the `<th>` carries `aria-sort`. */
  sortable?: boolean;
  /** A fixed column width (a CSS value). */
  width?: string;
  /** The cell's content; the row's own value under `key` otherwise. */
  render?: (row: Row) => ReactNode;
  /** The column's body cells are their rows' headers (`<th scope="row">`), as a name column is. */
  rowHeader?: boolean;
  /** A class on the column's header and cells, for a feature's own alignment (numbers on the right). */
  className?: string;
}

export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface TableProps<Row extends object = Record<string, unknown>>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role' | 'aria-label' | 'aria-labelledby' | 'tabIndex'> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** The visually hidden `<caption>` that names the table, and its scroll region when it overflows. */
  caption: ReactNode;
  sort?: TableSort;
  onSort?: (next: TableSort) => void;
  /** Skeleton rows, and `aria-busy`. @default false */
  loading?: boolean;
  /** @default 4 */
  skeletonRows?: number;
  /** The empty row's content (a compact card EmptyState with `emptyText` otherwise). */
  emptyState?: ReactNode;
  /** @default 'Nothing here yet.' */
  emptyText?: string;
  /** @default the row's `id`, else its index */
  rowKey?: (row: Row, index: number) => string | number;
  /** The first cell becomes a button that opens the row. */
  onRowClick?: (row: Row) => void;
  /** The first cell becomes a link to the row on another site (an in-app route is `rowTo`). */
  rowHref?: (row: Row) => string;
  /** The first cell becomes a react-router link to the row's in-app route. Before `rowHref` and `onRowClick`. */
  rowTo?: (row: Row) => LinkProps['to'];
  /** A class for a row (a folded or a highlighted one). */
  rowClassName?: (row: Row, index: number) => string | undefined;
  /** 6/8 × 12 padding, 13px cells. @default false */
  dense?: boolean;
  /**
   * The header row sticks while the table scrolls under it, which happens inside the Table's own
   * wrapper only: its `overflow-x: auto` makes it the scrollport, so the header sticks only when the
   * wrapper's height is limited (a `max-height` from the feature, through `className` or `style`), and
   * not when a container around the Table scrolls. @default false
   */
  stickyHeader?: boolean;
  /**
   * Set while the table overflows its wrapper: a focusable region named by the caption. JSX takes any
   * hyphenated prop a type leaves out, so these are declared `never` rather than only omitted.
   */
  role?: never;
  'aria-label'?: never;
  'aria-labelledby'?: never;
  tabIndex?: never;
  ref?: Ref<HTMLDivElement>;
}

const byIdOrIndex = (row: object, index: number) => (row as { id?: string | number }).id ?? index;

/**
 * The data table, ported from design/components/display/Table.jsx: native table semantics, with
 * `scope="col"` headers and a visually hidden caption that names it. A sortable column's header is a
 * SortableHeader: a button that asks `onSort` for the next sort (ascending first, then the other way)
 * and a `<th>` that carries `aria-sort` while it sorts the table. While `loading`, skeleton rows
 * (hidden from assistive tech) stand in and the table is `aria-busy`; with no rows, one row holds a
 * compact card EmptyState. A row that opens something carries a link (`rowTo`, `rowHref`) or button
 * (`onRowClick`) in its first cell; the row itself only shows hover, so no `<tr onClick>` that a
 * keyboard cannot reach. `dense` rows suit analytics breakdowns, and `stickyHeader` a scrolling card
 * (its `max-height` is the feature's). The wrapper scrolls sideways on phones, and while the table
 * overflows it is a focusable region named by the caption, so a keyboard can scroll it.
 *
 * A sortable column needs `onSort` to be a button, `onRowClick` gets the row alone, and `rowTo` is an
 * in-app route where `rowHref` is another site. Codebase-side: `caption` is required, since every
 * table needs a name, and the region is labelled by it (`aria-labelledby`), so a caption that is not a
 * string names it too; `rowTo` renders the first cell as a react-router `Link`, so an in-app row opens
 * without reloading the app; overflow counts in both directions, as a feature's `max-height` scrolls
 * the table down; and a column can be its rows' headers (`rowHeader`) and carry a class (`className`),
 * and a row a class (`rowClassName`). Native props and `ref` reach the wrapper.
 */
export function Table<Row extends object = Record<string, unknown>>({
  columns, rows, caption, sort, onSort, loading = false, skeletonRows = 4, emptyState, emptyText = 'Nothing here yet.',
  rowKey = byIdOrIndex, onRowClick, rowHref, rowTo, rowClassName, dense = false, stickyHeader = false, className = '', ref, ...rest
}: TableProps<Row>) {
  const captionId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useImperativeHandle(ref, () => wrapRef.current as HTMLDivElement, []);

  // Measured whenever the wrapper (a narrower window) or the table (more rows, wider cells) changes
  // size; the observer reports both once as it starts.
  useEffect(() => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (!wrap || !table || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      setScrolls(wrap.scrollWidth > wrap.clientWidth + 1 || wrap.scrollHeight > wrap.clientHeight + 1);
    });
    observer.observe(wrap);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  const opens = Boolean(onRowClick || rowHref || rowTo);
  const sortBy = (key: string) => {
    onSort?.({ key, dir: sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  };
  const current = sort ? { key: sort.key, direction: sort.dir } : null;

  return (
    <div
      {...rest}
      ref={wrapRef}
      className={['gt-table-wrapper', className].filter(Boolean).join(' ')}
      role={scrolls ? 'region' : undefined}
      aria-labelledby={scrolls ? captionId : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      <table
        ref={tableRef}
        className={['gt-table', dense ? 'gt-table--dense' : '', stickyHeader ? 'gt-table--sticky' : ''].filter(Boolean).join(' ')}
        aria-busy={loading || undefined}
      >
        <caption id={captionId} className="gt-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const style = col.width ? { width: col.width } : undefined;
              return col.sortable && onSort ? (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  currentSort={current}
                  onSort={sortBy}
                  className={col.className}
                  style={style}
                />
              ) : (
                <th key={col.key} scope="col" className={col.className} style={style}>{col.label}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, r) => (
              <tr key={`skeleton-${r}`} aria-hidden="true">
                {columns.map((col) => (
                  <td key={col.key}><Skeleton width={`${55 + ((r * 17 + col.key.length * 13) % 40)}%`} height="0.9em" /></td>
                ))}
              </tr>
            ))
            : rows.map((row, i) => (
              <tr key={rowKey(row, i)} className={rowClassName?.(row, i)}>
                {columns.map((col, ci) => {
                  const content = col.render ? col.render(row) : ((row as Record<string, unknown>)[col.key] as ReactNode);
                  let cell = content;
                  if (opens && ci === 0) {
                    if (rowTo) cell = <Link className="gt-table__open" to={rowTo(row)}>{content}</Link>;
                    else if (rowHref) cell = <a className="gt-table__open" href={rowHref(row)}>{content}</a>;
                    else cell = <button type="button" className="gt-table__open" onClick={() => onRowClick?.(row)}>{content}</button>;
                  }
                  return col.rowHeader
                    ? <th key={col.key} scope="row" className={col.className}>{cell}</th>
                    : <td key={col.key} className={col.className}>{cell}</td>;
                })}
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="gt-table__empty-cell">
                {emptyState ?? <EmptyState variant="card" title={emptyText} titleAs="p" />}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
