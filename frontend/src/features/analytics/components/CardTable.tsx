import type { ReactNode } from 'react';
import { Table, type TableColumn } from '@/components/Table/Table';

export interface CardTableColumn { key: string; label: string; numeric?: boolean }
export interface CardTableRow { key: string; cells: ReactNode[] }
export interface CardTableProps { caption: string; columns: CardTableColumn[]; rows: CardTableRow[] }

/**
 * A card's figures as a table, the twin its Table toggle shows in place of the chart, on the shared Table with dense rows
 * and a header that sticks: a visually hidden caption names it, each row's first cell is that row's header, numeric
 * columns align right, and it scrolls inside the card. It takes the breakdown table's look (`.gt-table--breakdown`).
 */
export function CardTable({ caption, columns, rows }: CardTableProps) {
  const tableColumns: TableColumn<CardTableRow>[] = columns.map((c, i) => ({
    key: c.key,
    label: c.label,
    rowHeader: i === 0,
    className: c.numeric ? 'gt-table__num' : undefined,
    render: (row) => row.cells[i],
  }));
  return (
    <div className="gt-table--breakdown">
      <Table caption={caption} columns={tableColumns} rows={rows} rowKey={(row) => row.key} dense stickyHeader />
    </div>
  );
}
