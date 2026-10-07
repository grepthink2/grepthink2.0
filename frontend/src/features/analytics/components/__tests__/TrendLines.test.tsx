import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrendLines } from '../TrendLines';

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
  it('draws each panel 1:1 at its measured width', () => {
    let report: ResizeObserverCallback = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { report = cb; } observe() {} unobserve() {} disconnect() {} });
    const { container } = render(<TrendLines panels={[PANEL]} compare asOf={null} />);
    act(() => report([{ contentRect: { width: 345 } } as ResizeObserverEntry], {} as ResizeObserver)); // one of three panels of a wide card
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
});
