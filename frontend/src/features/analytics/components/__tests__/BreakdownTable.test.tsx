import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ApiAnalyticsBreakdownRow } from '@/lib/api/types';
import { BreakdownTable, breakdownCsvRows } from '../BreakdownTable';

const ROWS: ApiAnalyticsBreakdownRow[] = [
  { id: 'c1', name: 'CSE 115A · Fall 2026', kind: 'row', teams: 8, students: 41, team_messages: 228, stories: 24, tasks: 118, points_done_rate: 0.61, on_time_rate: null, missing: 0, href: '/app/analytics?institution=i1&class=c1' },
  { id: 'c2', name: 'CSE 115B', kind: 'row', teams: 7, students: 38, team_messages: 344, stories: 20, tasks: 96, points_done_rate: null, on_time_rate: null, missing: 0, href: '/app/analytics?institution=i1&class=c2' },
  { id: 'folded', name: 'Smaller groups (1)', kind: 'folded', teams: 1, students: 2, team_messages: 5, stories: 2, tasks: 4, points_done_rate: 0.25, on_time_rate: null, missing: 0 },
];
const renderTable = (onExport = vi.fn()) => render(<MemoryRouter><BreakdownTable kind="class" rows={ROWS} onExport={onExport} /></MemoryRouter>);

describe('BreakdownTable', () => {
  it('sorts by a column on header click and keeps the folded row last', async () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: /Team msgs/ });
    await userEvent.click(within(header).getByRole('button'));
    let names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['CSE 115B', 'CSE 115A · Fall 2026', 'Smaller groups (1)']);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(within(header).getByRole('button'));
    names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['CSE 115A · Fall 2026', 'CSE 115B', 'Smaller groups (1)']);
  });
  it('renders percentages with a meter, — for null, a View link, and an italic folded row with its explanation', () => {
    renderTable();
    expect(screen.getByText('61%')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'View' })[0]).toHaveAttribute('href', '/app/analytics?institution=i1&class=c1');
    const folded = screen.getByText('Smaller groups (1)').closest('tr')!;
    expect(folded).toHaveClass('gt-table__row--folded');
    expect(within(folded).queryByRole('link')).toBeNull();
    expect(within(folded).getByLabelText('Fewer than 3 people')).toBeInTheDocument();
  });
  it('sorts by name again when the sorted column is not one of the new kind', async () => {
    const TEAMS: ApiAnalyticsBreakdownRow[] = [
      { id: 't2', name: 'Zeta', kind: 'row', members: 4, team_messages: 10, stories: 1, tasks: 2, points_done_rate: 0.5, on_time_rate: null, missing: 0, href: null },
      { id: 't1', name: 'Alpha', kind: 'row', members: 5, team_messages: 20, stories: 3, tasks: 4, points_done_rate: 0.2, on_time_rate: null, missing: 0, href: null },
    ];
    const { rerender } = renderTable();
    await userEvent.click(within(screen.getByRole('columnheader', { name: /Students/ })).getByRole('button'));
    rerender(<MemoryRouter><BreakdownTable kind="team" rows={TEAMS} onExport={vi.fn()} /></MemoryRouter>);
    const header = screen.getByRole('columnheader', { name: 'Team' });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Alpha', 'Zeta']);
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });
  it('exports on click and builds CSV rows with the visible columns', async () => {
    const onExport = vi.fn();
    renderTable(onExport);
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(breakdownCsvRows('class', ROWS)[0]).toEqual({ name: 'CSE 115A · Fall 2026', teams: 8, students: 41, team_messages: 228, stories: 24, tasks: 118, points_done_rate: '61%' });
  });
});
