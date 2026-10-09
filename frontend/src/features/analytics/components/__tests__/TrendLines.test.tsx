import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubResizeObserver } from '../../test/resizeObserver';
import { TrendLines, TrendTable } from '../TrendLines';

const PANEL = {
  key: 'team_messages_per_team' as const, title: 'Messages per team', unit: 'per team per week',
  current: [{ week_start: '2026-09-07', value: 7.5 }, { week_start: '2026-09-14', value: null }, { week_start: '2026-09-21', value: 10 }],
  previous: [{ week_start: '2026-08-10', value: 5 }, { week_start: '2026-08-17', value: 6 }, { week_start: '2026-08-24', value: 6.5 }],
};
const week = (week_start: string, value: number | null) => ({ week_start, value });

describe('TrendLines', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('draws the previous range as a gray context line only when compare is on', () => {
    const { container, rerender } = render(<TrendLines panels={[PANEL]} compare asOf="2026-10-06" />);
    expect(container.querySelectorAll('.gt-trend__current')).toHaveLength(1);
    expect(container.querySelectorAll('.gt-trend__previous')).toHaveLength(1);
    expect(screen.getByText(/This range/)).toBeInTheDocument();
    expect(screen.getByText('as of Oct 6, 2026')).toBeInTheDocument();
    rerender(<TrendLines panels={[PANEL]} compare={false} asOf="2026-10-06" />);
    expect(container.querySelectorAll('.gt-trend__previous')).toHaveLength(0);
  });
  it('leaves a gap for a null week instead of bridging it', () => {
    const { container } = render(<TrendLines panels={[PANEL]} compare={false} asOf={null} />);
    const d = container.querySelector('.gt-trend__current')!.getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
  it('shows an empty note when no panel has data', () => {
    render(<TrendLines panels={[{ ...PANEL, current: [], previous: null }]} compare asOf={null} />);
    expect(screen.getByText(/after the first nightly rollup/)).toBeInTheDocument();
  });
  it('says the range has no complete week yet once the rollup has run, not that it never ran', () => {
    // the 7d preset on a weekday: its one Monday starts the week in progress, which the backend leaves out
    render(<TrendLines panels={[{ ...PANEL, current: [], previous: [week('2026-09-28', 6)] }]} compare asOf="2026-10-07" />);
    expect(screen.getByText('No complete week in this range yet.')).toBeInTheDocument();
    expect(screen.queryByText(/after the first nightly rollup/)).toBeNull();
  });
  it('draws each panel 1:1 at its measured width', () => {
    const { report } = stubResizeObserver();
    const { container } = render(<TrendLines panels={[PANEL]} compare asOf={null} />);
    report(345); // one of three panels of a wide card
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 345 120');
    expect(container.querySelector('.gt-trend__axis')).toHaveAttribute('x2', '305'); // the plot leaves 40px for the end label
  });
  it('marks a week that no line reaches, so a single week or one between gaps still shows', () => {
    const { container, rerender } = render(<TrendLines panels={[{ ...PANEL, current: [week('2026-10-05', 6)], previous: null }]} compare asOf={null} />);
    expect(container.querySelectorAll('.gt-trend__marker')).toHaveLength(1); // the first week after the first rollup
    expect(screen.getByRole('img', { name: 'Messages per team, 1 week; week of Oct 5: 6' })).toBeInTheDocument();
    rerender(<TrendLines panels={[PANEL]} compare asOf={null} />); // 7.5, a gap, 10: neither point has a neighbour to draw a line to
    expect(container.querySelectorAll('.gt-trend__marker.gt-series--1')).toHaveLength(2);
    expect(container.querySelectorAll('.gt-trend__marker.gt-series--gray')).toHaveLength(0); // the previous line reaches every point
  });
  it('labels the latest week of this range at its end point, and says it to screen readers', () => {
    const { container, rerender } = render(<TrendLines panels={[PANEL]} compare={false} asOf={null} />);
    expect(container.querySelectorAll('.gt-trend__end-label')).toHaveLength(1);
    expect(container.querySelector('.gt-trend__end-label')).toHaveTextContent(/^10$/);
    expect(screen.getByRole('img', { name: 'Messages per team, 3 weeks; week of Sep 21: 10' })).toBeInTheDocument();
    rerender(<TrendLines panels={[{ ...PANEL, current: [week('2026-09-07', 7.5), week('2026-09-14', 8.25), week('2026-09-21', null)] }]} compare={false} asOf={null} />);
    expect(container.querySelector('.gt-trend__end-label')).toHaveTextContent(/^8\.25$/); // this week is not rolled up yet
    expect(screen.getByRole('img', { name: 'Messages per team, 3 weeks; week of Sep 14: 8.25' })).toBeInTheDocument();
    rerender(<TrendLines panels={[{ key: 'on_time_rate', title: 'On-time rate', unit: 'rate', current: [week('2026-09-14', 0.91), week('2026-09-21', 0.79)], previous: null }]} compare={false} asOf={null} />);
    expect(container.querySelector('.gt-trend__end-label')).toHaveTextContent(/^79%$/);
  });
  it('names the previous range in the legend only when a previous line is drawn', () => {
    const { container } = render(<TrendLines panels={[{ ...PANEL, previous: null }]} compare asOf={null} />); // the All preset has no previous range
    expect(screen.queryByText('Previous range')).toBeNull();
    expect(container.querySelector('.gt-legend')).toBeNull(); // one series, no legend
  });
  it('makes room at the right edge for a long end label', () => {
    const { container } = render(<TrendLines panels={[{ ...PANEL, current: [week('2026-09-14', 98.5), week('2026-09-21', 123.45)], previous: null }]} compare={false} asOf={null} />);
    const label = container.querySelector('.gt-trend__end-label')!;
    expect(label).toHaveTextContent(/^123\.45$/);
    expect(Number(label.getAttribute('x')) + 34.4).toBeLessThanOrEqual(260); // "123.45" is about 34.4px in 11px semibold
    expect(container.querySelector('.gt-trend__axis')).toHaveAttribute('x2', '204.8'); // 260 − (6 × 7.2 + 12)
  });
  it('gives every panel the same right margin, sized for the widest end label, so the weeks line up across panels', () => {
    const long = { ...PANEL, key: 'points_done_per_team' as const, title: 'Points done per team', current: [week('2026-09-07', 98.5), week('2026-09-14', null), week('2026-09-21', 123.45)], previous: null };
    const { container } = render(<TrendLines panels={[PANEL, long]} compare asOf={null} />);
    const ends = Array.from(container.querySelectorAll('.gt-trend__axis')).map((a) => a.getAttribute('x2'));
    expect(ends).toEqual(['204.8', '204.8']); // 260 − (6 × 7.2 + 12), from "123.45" in the second panel
  });
  it('adds the previous range\'s value at the same week to the summary when compare is on', () => {
    const { rerender } = render(<TrendLines panels={[PANEL]} compare asOf={null} />);
    expect(screen.getByRole('img', { name: 'Messages per team, 3 weeks; week of Sep 21: 10; previous range: 6.5' })).toBeInTheDocument();
    rerender(<TrendLines panels={[PANEL]} compare={false} asOf={null} />);
    expect(screen.getByRole('img', { name: 'Messages per team, 3 weeks; week of Sep 21: 10' })).toBeInTheDocument();
  });
  it('aligns a previous range one week longer by week index, so this range stops a week short of the right edge', () => {
    const longer = { ...PANEL, current: [week('2026-09-07', 7.5), week('2026-09-14', 8), week('2026-09-21', 10)],
      previous: [week('2026-08-03', 5), week('2026-08-10', 6), week('2026-08-17', 6.5), week('2026-08-24', 7)] };
    const lastX = (d: string) => Number(d.split('L').pop()!.split(' ')[0]);
    const { container, rerender } = render(<TrendLines panels={[longer]} compare asOf={null} />);
    const axisEnd = Number(container.querySelector('.gt-trend__axis')!.getAttribute('x2'));
    expect(lastX(container.querySelector('.gt-trend__previous')!.getAttribute('d')!)).toBe(axisEnd); // four weeks span the plot
    expect(lastX(container.querySelector('.gt-trend__current')!.getAttribute('d')!)).toBeLessThan(axisEnd);
    expect(screen.getByRole('img', { name: 'Messages per team, 3 weeks; week of Sep 21: 10; previous range: 6.5' })).toBeInTheDocument();
    rerender(<TrendLines panels={[longer]} compare={false} asOf={null} />);
    expect(lastX(container.querySelector('.gt-trend__current')!.getAttribute('d')!)).toBe(axisEnd); // alone, three weeks span it
  });
  it('treats weeks whose values are all null as no data: the empty note when every panel is so, a bare panel beside data', () => {
    const blank = { ...PANEL, key: 'tasks_per_team' as const, title: 'Tasks created per team', current: [week('2026-09-14', null), week('2026-09-21', null)], previous: [week('2026-08-17', null)] };
    const { rerender } = render(<TrendLines panels={[blank]} compare asOf="2026-10-06" />);
    expect(screen.getByText('No team activity in this range.')).toBeInTheDocument(); // complete weeks, no class in session
    rerender(<TrendLines panels={[PANEL, blank]} compare asOf="2026-10-06" />);
    const bare = screen.getByRole('img', { name: 'Tasks created per team, 2 weeks' });
    expect(bare.querySelectorAll('.gt-trend__marker, .gt-trend__end-label')).toHaveLength(0);
    expect(bare.innerHTML).not.toMatch(/NaN/);
  });
});

describe('TrendTable', () => {
  const TASKS = { ...PANEL, key: 'tasks_per_team' as const, title: 'Tasks created per team', current: [week('2026-09-07', 1.1), week('2026-09-14', 2.25), week('2026-09-21', 4)], previous: null };
  const RATE = { key: 'on_time_rate' as const, title: 'On-time rate', unit: 'rate', current: [week('2026-09-07', null), week('2026-09-14', 0.91), week('2026-09-21', 0.79)], previous: null };
  it('lists one row per week of this range and one column per panel, its unit in the header', () => {
    render(<TrendTable panels={[PANEL, TASKS, RATE]} asOf="2026-10-06" />);
    const table = screen.getByRole('table', { name: 'Trends by week' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Week', 'Messages per team (per team per week)', 'Tasks created per team (per team per week)', 'On-time rate (rate)',
    ]);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Sep 7, 2026', 'Sep 14, 2026', 'Sep 21, 2026']);
    const row = (name: string) => within(within(table).getByRole('rowheader', { name }).closest('tr') as HTMLElement).getAllByRole('cell').map((c) => c.textContent);
    expect(row('Sep 7, 2026')).toEqual(['7.5', '1.1', '—']);
    expect(row('Sep 14, 2026')).toEqual(['—', '2.25', '91%']); // a week without a value reads "—"
    expect(screen.getByText('as of Oct 6, 2026')).toBeInTheDocument();
  });
  it('says what the chart would say when there is nothing to list', () => {
    const { rerender } = render(<TrendTable panels={[{ ...PANEL, current: [], previous: null }]} asOf={null} />);
    expect(screen.getByText('Trends appear after the first nightly rollup.')).toBeInTheDocument();
    rerender(<TrendTable panels={[{ ...PANEL, current: [], previous: null }]} asOf="2026-10-07" />);
    expect(screen.getByText('No complete week in this range yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
