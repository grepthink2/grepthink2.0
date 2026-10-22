import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardTable } from '../CardTable';

const renderTable = () => render(
  <CardTable
    caption="Messages per week"
    columns={[{ key: 'week', label: 'Week' }, { key: 'team', label: 'Team channels', numeric: true }, { key: 'dm', label: 'Direct', numeric: true }]}
    rows={[{ key: 'w1', cells: ['Sep 7, 2026', 120, 34] }, { key: 'w2', cells: ['Sep 14, 2026', 98, 41] }]}
  />,
);

describe('CardTable', () => {
  it('names the table by its caption and each row by its first cell', () => {
    renderTable();
    const table = screen.getByRole('table', { name: 'Messages per week' });
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Sep 7, 2026', 'Sep 14, 2026']);
    const first = within(table).getByRole('rowheader', { name: 'Sep 7, 2026' }).closest('tr') as HTMLElement;
    expect(within(first).getAllByRole('cell').map((c) => c.textContent)).toEqual(['120', '34']);
  });

  it('right-aligns the numeric columns, header and cells, on the shared dense Table in the breakdown look', () => {
    const { container } = renderTable();
    expect(screen.getByRole('columnheader', { name: 'Week' })).not.toHaveClass('gt-table__num');
    expect(screen.getByRole('columnheader', { name: 'Team channels' })).toHaveClass('gt-table__num');
    expect(screen.getByText('120')).toHaveClass('gt-table__num');
    expect(screen.getByRole('rowheader', { name: 'Sep 7, 2026' })).not.toHaveClass('gt-table__num');
    const table = screen.getByRole('table');
    expect(table).toHaveClass('gt-table', 'gt-table--dense', 'gt-table--sticky');
    expect(container.firstChild).toHaveClass('gt-table--breakdown');
  });
});
