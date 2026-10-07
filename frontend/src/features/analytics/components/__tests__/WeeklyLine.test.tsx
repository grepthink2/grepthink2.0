import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeeklyLine } from '../WeeklyLine';

const TEAM = { key: 'team', label: 'Team channels', colorClass: 'gt-series--1', points: [
  { weekStart: '2026-09-07', value: 100 }, { weekStart: '2026-09-14', value: 160 }, { weekStart: '2026-09-21', value: 130 }] };
const DM = { key: 'dm', label: 'Direct', colorClass: 'gt-series--2', points: [
  { weekStart: '2026-09-07', value: 120 }, { weekStart: '2026-09-14', value: 110 }, { weekStart: '2026-09-21', value: 190 }] };
/** n consecutive Mondays from Jan 5, 2026, valued 10, 11, 12, … */
const weeksOf = (n: number, key = 'team', colorClass = 'gt-series--1') => ({ key, label: key, colorClass, points: Array.from({ length: n }, (_, i) => ({
  weekStart: new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10), value: 10 + i })) });

describe('WeeklyLine', () => {
  it('draws one path per series, a legend only for two, and names itself for screen readers', () => {
    const { container, rerender } = render(<WeeklyLine series={[TEAM]} ariaLabel="Messages per week" />);
    expect(screen.getByRole('img', { name: 'Messages per week; week of Sep 21: Team channels 130' })).toBeInTheDocument();
    expect(container.querySelectorAll('.gt-line__path')).toHaveLength(1);
    expect(container.querySelector('.gt-legend')).toBeNull();
    expect(container.querySelectorAll('.gt-line__area')).toHaveLength(1); // series 1 gets the 10 % wash
    rerender(<WeeklyLine series={[TEAM, DM]} ariaLabel="Messages per week" />);
    expect(container.querySelectorAll('.gt-line__path')).toHaveLength(2);
    expect(container.querySelector('.gt-legend')).not.toBeNull();
    expect(container.querySelectorAll('.gt-line__area')).toHaveLength(1);
  });
  it('snaps a crosshair to the nearest week and lists both values in one tooltip', () => {
    const { container } = render(<WeeklyLine series={[TEAM, DM]} ariaLabel="Messages per week" />);
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 220, right: 600, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(svg, { clientX: 590, clientY: 100 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 21');
    expect(screen.getByRole('tooltip')).toHaveTextContent('130');
    expect(screen.getByRole('tooltip')).toHaveTextContent('190');
    expect(container.querySelectorAll('.gt-line__crosshair')).toHaveLength(1);
    fireEvent.mouseLeave(svg);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('labels the last point of each series and uses no inline colours', () => {
    const { container } = render(<WeeklyLine series={[TEAM, DM]} ariaLabel="x" />);
    expect(container.querySelectorAll('.gt-line__end-label')).toHaveLength(2);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
  it('anchors the tooltip at its point and shifts the box by the same share of its own width, so it stays inside the chart', () => {
    const { container } = render(<WeeklyLine series={[TEAM, DM]} ariaLabel="Messages per week" />);
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 220, right: 600, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });
    const wrap = container.querySelector<HTMLElement>('.gt-line')!;
    fireEvent.mouseMove(svg, { clientX: 590, clientY: 100 }); // the last week sits at 544 / 600 of the width
    expect(screen.getByRole('tooltip').style.left).toBe('90.67%');
    expect(wrap.style.getPropertyValue('--tip-shift')).toBe('-90.67%');
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 100 }); // the first week sits at 40 / 600
    expect(screen.getByRole('tooltip').style.left).toBe('6.67%');
    expect(wrap.style.getPropertyValue('--tip-shift')).toBe('-6.67%');
  });
  it('steps through the weeks from the keyboard with the same tooltip as hover', () => {
    render(<WeeklyLine series={[TEAM, DM]} ariaLabel="Messages per week" />);
    const chart = screen.getByRole('img', { name: /^Messages per week/ });
    fireEvent.focus(chart);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 21');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 14');
    expect(screen.getByRole('tooltip')).toHaveTextContent('160');
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 7');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // already at the first week
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 7');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 14');
    fireEvent.keyDown(chart, { key: 'End' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 21');
    fireEvent.blur(chart);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('shows no tooltip and does not throw when the hovered week is gone or there are no weeks', () => {
    const { container, rerender } = render(<WeeklyLine series={[TEAM, DM]} ariaLabel="Messages per week" />);
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 220, right: 600, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(svg, { clientX: 590, clientY: 100 }); // the last of three weeks
    const twoWeeks = [TEAM, DM].map((s) => ({ ...s, points: s.points.slice(0, 2) }));
    rerender(<WeeklyLine series={twoWeeks} ariaLabel="Messages per week" />); // a refresh drops a week under the pointer
    expect(screen.queryByRole('tooltip')).toBeNull();
    rerender(<WeeklyLine series={[{ ...TEAM, points: [] }]} ariaLabel="Messages per week" />);
    const chart = screen.getByRole('img', { name: 'Messages per week' });
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('keeps the two end labels apart when the series finish close together, the higher line on top', () => {
    const endAt = (v: number) => ({ ...DM, points: DM.points.map((p, i) => (i === 2 ? { ...p, value: v } : p)) });
    const labelYs = (c: HTMLElement) => Array.from(c.querySelectorAll('.gt-line__end-label')).map((t) => Number(t.getAttribute('y')));
    const { container, rerender } = render(<WeeklyLine series={[TEAM, endAt(130)]} ariaLabel="x" />); // a tie
    let [team, dm] = labelYs(container);
    expect(Math.abs(team - dm)).toBeGreaterThanOrEqual(12);
    rerender(<WeeklyLine series={[TEAM, endAt(134)]} ariaLabel="x" />); // Direct ends 4 above Team channels
    [team, dm] = labelYs(container);
    expect(team - dm).toBeGreaterThanOrEqual(12);
  });
  it('appends the latest week to the summary, and nothing when there are no weeks', () => {
    const { rerender } = render(<WeeklyLine series={[TEAM, DM]} ariaLabel="Messages per week" />);
    expect(screen.getByRole('img', { name: 'Messages per week; week of Sep 21: Team channels 130, Direct 190' })).toBeInTheDocument();
    rerender(<WeeklyLine series={[{ ...TEAM, points: [] }]} ariaLabel="Messages per week" />);
    expect(screen.getByRole('img', { name: 'Messages per week' })).toBeInTheDocument();
  });
  it('labels at most one week per 48 units, always the first and the last, none crowding the last (n = 17, W = 600)', () => {
    const { container } = render(<WeeklyLine series={[weeksOf(17)]} ariaLabel="x" />);
    const labels = Array.from(container.querySelectorAll('text.gt-line__tick[text-anchor="middle"]'));
    const xs = labels.map((t) => Number(t.getAttribute('x')));
    expect(xs[0]).toBe(40);
    expect(xs[xs.length - 1]).toBe(544);
    expect(labels[labels.length - 1]).toHaveTextContent('Apr 27'); // the 17th Monday
    xs.slice(1).forEach((v, i) => expect(v - xs[i]).toBeGreaterThanOrEqual(48));
  });
  it('marks every point up to 26 weeks and only each series\' last point beyond, the lines kept', () => {
    const { container, rerender } = render(<WeeklyLine series={[weeksOf(26), weeksOf(26, 'dm', 'gt-series--2')]} ariaLabel="x" />);
    expect(container.querySelectorAll('.gt-line__marker')).toHaveLength(52);
    rerender(<WeeklyLine series={[weeksOf(27), weeksOf(27, 'dm', 'gt-series--2')]} ariaLabel="x" />);
    const markers = Array.from(container.querySelectorAll('.gt-line__marker'));
    expect(markers.map((m) => m.getAttribute('cx'))).toEqual(['544', '544']);
    expect(container.querySelectorAll('.gt-line__path')).toHaveLength(2);
  });
  it('draws the Team channels line at its known coordinates (W = 600, axis max 200)', () => {
    const { container } = render(<WeeklyLine series={[TEAM]} ariaLabel="x" />);
    expect(container.querySelector('.gt-line__path')!.getAttribute('d')).toBe('M40 104L292 51.2L544 77.6');
  });
  it('draws a single week as one marker, with no area and no NaN', () => {
    const { container } = render(<WeeklyLine series={[{ ...TEAM, points: TEAM.points.slice(0, 1) }]} ariaLabel="x" />);
    expect(container.querySelectorAll('.gt-line__marker')).toHaveLength(1);
    expect(container.querySelector('.gt-line__area')).toBeNull();
    expect(container.innerHTML).not.toContain('NaN');
  });
  it('renders a flat zero line without NaN when every value is 0', () => {
    const { container } = render(<WeeklyLine series={[{ ...TEAM, points: TEAM.points.map((p) => ({ ...p, value: 0 })) }]} ariaLabel="x" />);
    expect(container.innerHTML).not.toContain('NaN');
  });
});
