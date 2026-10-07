import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StackedBars } from '../StackedBars';

const ROWS = [
  { key: '0', label: 'Backlog', teams: 9, segments: [{ status: 'todo' as const, count: 40, points: 80 }, { status: 'in_progress' as const, count: 0, points: 0 }, { status: 'done' as const, count: 0, points: 0 }] },
  { key: '1', label: 'Sprint 1', teams: 8, segments: [{ status: 'todo' as const, count: 5, points: 8 }, { status: 'in_progress' as const, count: 10, points: 21 }, { status: 'done' as const, count: 35, points: 71 }] },
];
/** A sprint of 135 tasks beside a one-team sprint of 6 (the sample's Sprint 1 and a late sprint few teams reached). */
const UNEVEN = [
  { key: '1', label: 'Sprint 1', teams: 23, segments: [{ status: 'todo' as const, count: 11, points: 19 }, { status: 'in_progress' as const, count: 6, points: 13 }, { status: 'done' as const, count: 118, points: 226 }] },
  { key: '4', label: 'Sprint 4', teams: 1, segments: [{ status: 'todo' as const, count: 2, points: 3 }, { status: 'in_progress' as const, count: 1, points: 2 }, { status: 'done' as const, count: 3, points: 5 }] },
];

describe('StackedBars', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('switching the unit changes the numbers but never the colours (classes)', () => {
    const { container, rerender } = render(<StackedBars rows={ROWS} unit="count" />);
    const before = Array.from(container.querySelectorAll('.gt-stack__segment')).map((e) => e.className);
    expect(screen.getByText('35')).toBeInTheDocument();
    rerender(<StackedBars rows={ROWS} unit="points" />);
    expect(screen.getByText('71')).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll('.gt-stack__segment')).map((e) => e.className)).toEqual(before);
    expect(before.some((c) => c.includes('gt-status--done'))).toBe(true);
  });
  it('always shows a legend and the team count, and lists tasks with no visible label in the row title', () => {
    const { container } = render(<StackedBars rows={ROWS} unit="count" />);
    expect(container.querySelector('.gt-legend')).not.toBeNull();
    expect(screen.getByText('9 teams')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Sprint 1.*5 to do.*10 in progress.*35 done/ })).toBeInTheDocument();
  });
  it('rows are buttons only when a click handler exists', () => {
    const { rerender } = render(<StackedBars rows={ROWS} unit="count" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    rerender(<StackedBars rows={ROWS} unit="count" onRowClick={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
  it('puts a figure inside its segment only when it fits there (the track is 448px at the fallback width), else in the title', () => {
    const { container } = render(<StackedBars rows={UNEVEN} unit="count" />);
    const [big, small] = Array.from(container.querySelectorAll<HTMLElement>('.gt-stack__row'));
    expect(within(big).getByText('6')).toBeInTheDocument(); // 6 / 135 of 448px ≈ 20px: room for one figure and its padding
    expect(small.querySelectorAll('.gt-stack__value')).toHaveLength(0); // 2, 1 and 3 of 135: 3–10px segments
    expect(Array.from(small.querySelectorAll('.gt-stack__segment')).map((s) => s.getAttribute('title'))).toEqual(['To do: 2', 'In progress: 1', 'Done: 3']);
  });
  it('measures its track, so a figure that fits a wide card moves to the title on a phone card', () => {
    let report: ResizeObserverCallback = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { report = cb; } observe() {} unobserve() {} disconnect() {} });
    const { container } = render(<StackedBars rows={UNEVEN} unit="count" />);
    const big = container.querySelector<HTMLElement>('.gt-stack__row')!;
    expect(within(big).getByText('11')).toBeInTheDocument(); // 11 / 135 of 448px ≈ 37px
    act(() => report([{ contentRect: { width: 311 } } as ResizeObserverEntry], {} as ResizeObserver)); // a 343px card: a 159px track
    expect(within(big).queryByText('11')).toBeNull(); // ≈ 13px, narrower than "11" and its padding
    expect(within(big).getByText('118')).toBeInTheDocument();
  });
  it('says "1 team" for one, and names each row with its team count and unit for screen readers', () => {
    render(<StackedBars rows={UNEVEN} unit="points" />);
    expect(screen.getByText('1 team')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sprint 1, 23 teams, points: 19 to do, 13 in progress, 226 done' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sprint 4, 1 team, points: 3 to do, 2 in progress, 5 done' })).toBeInTheDocument();
  });
  it('reports the clicked row, named like its chart', () => {
    const onRowClick = vi.fn();
    render(<StackedBars rows={ROWS} unit="count" onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sprint 1, 8 teams, tasks: 5 to do, 10 in progress, 35 done' }));
    expect(onRowClick).toHaveBeenCalledWith('1');
  });
});
