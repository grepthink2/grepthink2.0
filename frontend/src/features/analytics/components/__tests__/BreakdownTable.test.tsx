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
/** Each body row's name: the row's own header cell. */
const firstCells = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getByRole('rowheader').textContent);

describe('BreakdownTable', () => {
  it('sorts by a column on header click and keeps the folded row last', async () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: /Team msgs/ });
    await userEvent.click(within(header).getByRole('button'));
    let names = firstCells();
    expect(names).toEqual(['CSE 115B', 'CSE 115A · Fall 2026', 'Smaller groups (1)']);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(within(header).getByRole('button'));
    names = firstCells();
    expect(names).toEqual(['CSE 115A · Fall 2026', 'CSE 115B', 'Smaller groups (1)']);
  });
  it('renders percentages with a meter, — for null, a View link, and an italic folded row with its explanation', () => {
    renderTable();
    expect(screen.getByText('61%')).toBeInTheDocument();
    expect(screen.getByText('61%').querySelector('.gt-table__meter-fill')).toHaveStyle({ width: '61%' });
    expect(screen.getByText('CSE 115B').closest('tr')!.querySelector('.gt-table__meter')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'View CSE 115A · Fall 2026' })).toHaveAttribute('href', '/app/analytics?institution=i1&class=c1');
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
    expect(firstCells()).toEqual(['Alpha', 'Zeta']);
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });
  it('names the table, each row (its header cell) and each View link', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Breakdown by class' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'CSE 115A · Fall 2026' })).toHaveAttribute('scope', 'row');
    expect(screen.getByRole('rowheader', { name: /Smaller groups \(1\)/ })).toHaveAttribute('scope', 'row');
    expect(screen.getByRole('link', { name: 'View CSE 115B' })).toHaveAttribute('href', '/app/analytics?institution=i1&class=c2');
  });
  it('marks only the sorted column with an arrow', async () => {
    renderTable();
    const arrows = () => document.querySelectorAll('.gt-table__sort-icon');
    expect(arrows()).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Class' }).querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevron-up');
    const header = screen.getByRole('columnheader', { name: 'Team msgs' });
    await userEvent.click(within(header).getByRole('button'));
    expect(arrows()).toHaveLength(1);
    expect(header.querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevron-down');
  });
  it('sorts names as people read them, "Team 2" before "Team 10"', () => {
    const team = (id: string, name: string): ApiAnalyticsBreakdownRow => ({ id, name, kind: 'row', members: 4, team_messages: 1, stories: 1, tasks: 1, points_done_rate: null, on_time_rate: null, missing: 0, href: null });
    render(<MemoryRouter><BreakdownTable kind="team" rows={[team('t10', 'Team 10'), team('t2', 'Team 2'), team('t1', 'Team 1')]} onExport={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('table', { name: 'Breakdown by team' })).toBeInTheDocument();
    expect(firstCells()).toEqual(['Team 1', 'Team 2', 'Team 10']);
  });
  it('sorts a missing figure first ascending and last descending, the folded row still last', async () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: 'Pts done %' });
    await userEvent.click(within(header).getByRole('button'));
    expect(firstCells()).toEqual(['CSE 115A · Fall 2026', 'CSE 115B', 'Smaller groups (1)']);
    await userEvent.click(within(header).getByRole('button'));
    expect(firstCells()).toEqual(['CSE 115B', 'CSE 115A · Fall 2026', 'Smaller groups (1)']);
  });
  it('keeps the meter inside its cell', () => {
    const rows: ApiAnalyticsBreakdownRow[] = [{ ...ROWS[0], id: 'hi', name: 'Over', points_done_rate: 1.4 }, { ...ROWS[1], id: 'lo', name: 'Under', points_done_rate: -0.2 }];
    render(<MemoryRouter><BreakdownTable kind="class" rows={rows} onExport={vi.fn()} /></MemoryRouter>);
    expect([...document.querySelectorAll<HTMLElement>('.gt-table__meter-fill')].map((f) => f.style.width)).toEqual(['100%', '0%']);
  });
  it('builds CSV rows with an empty cell for a missing figure, the folded row included', () => {
    const csv = breakdownCsvRows('class', ROWS);
    expect(csv[1]).toEqual({ name: 'CSE 115B', teams: 7, students: 38, team_messages: 344, stories: 20, tasks: 96, points_done_rate: '' });
    expect(csv[2]).toEqual({ name: 'Smaller groups (1)', teams: 1, students: 2, team_messages: 5, stories: 2, tasks: 4, points_done_rate: '25%' });
    const noRate = { ...ROWS[0], points_done_rate: undefined } as unknown as ApiAnalyticsBreakdownRow;
    expect(breakdownCsvRows('class', [noRate])[0].points_done_rate).toBe('');
  });
  it('exports on click and builds CSV rows with the visible columns', async () => {
    const onExport = vi.fn();
    renderTable(onExport);
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(breakdownCsvRows('class', ROWS)[0]).toEqual({ name: 'CSE 115A · Fall 2026', teams: 8, students: 41, team_messages: 228, stories: 24, tasks: 118, points_done_rate: '61%' });
  });
});
