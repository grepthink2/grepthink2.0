import type { ReactNode } from 'react';

export interface CardTableColumn { key: string; label: string; numeric?: boolean }
export interface CardTableRow { key: string; cells: ReactNode[] }
export interface CardTableProps { caption: string; columns: CardTableColumn[]; rows: CardTableRow[] }

/**
 * A card's figures as a table, the twin its Table toggle shows in place of the chart: a visually hidden caption names it,
 * each row's first cell is that row's header, numeric columns align right, and it scrolls inside the card under a header
 * that sticks.
 */
export function CardTable({ caption, columns, rows }: CardTableProps) {
  const numeric = (i: number) => (columns[i]?.numeric ? 'gt-table__num' : undefined);
  return (
    <div className="gt-table__scroll">
      <table className="gt-table__table">
        <caption className="gt-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => <th key={c.key} scope="col" className={numeric(i)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, i) => (i === 0
                ? <th key={columns[i]?.key ?? i} scope="row" className={numeric(i)}>{cell}</th>
                : <td key={columns[i]?.key ?? i} className={numeric(i)}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
