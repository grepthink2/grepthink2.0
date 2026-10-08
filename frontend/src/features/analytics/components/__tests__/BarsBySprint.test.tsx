import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubResizeObserver } from '../../test/resizeObserver';
import { BarsBySprint } from '../BarsBySprint';

const PANELS = [
  { key: 'task', title: 'Characters per task', overall: { median: 29, n: 418 }, columns: [{ label: 'Backlog', median: 20, n: 40 }, { label: 'Sprint 1', median: 31, n: 120 }] },
  { key: 'story', title: 'Characters per story', overall: { median: 96, n: 61 }, columns: [{ label: 'Backlog', median: 60, n: 10 }, { label: 'Sprint 1', median: 110, n: 20 }] },
];
/** Backlog and `sprints` sprints, medians `first`, `first + step`, … (the handoff's density case is Backlog + 8). */
const columns = (sprints: number, first: number, step: number) => [{ label: 'Backlog', median: first, n: 5 },
  ...Array.from({ length: sprints }, (_, i) => ({ label: `Sprint ${i + 1}`, median: first + (i + 1) * step, n: 5 }))];
const pair = (task: ReturnType<typeof columns>, story: ReturnType<typeof columns>) => [
  { key: 'task', title: 'Characters per task', overall: { median: 60, n: 45 }, columns: task },
  { key: 'story', title: 'Characters per story', overall: { median: 120, n: 45 }, columns: story }];
const numberAttr = (els: Iterable<Element>, name: string) => Array.from(els).map((e) => Number(e.getAttribute(name)));
const capsOf = (svg: Element) => svg.querySelectorAll('.gt-cols__cap');

describe('BarsBySprint', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('draws two panels with one series on a shared scale and the median on each cap', () => {
    const { container } = render(<BarsBySprint panels={PANELS} />);
    expect(screen.getByText('median 29 chars · 418 tasks')).toBeInTheDocument();
    expect(screen.getByText('median 96 chars · 61 stories')).toBeInTheDocument();
    expect(container.querySelectorAll('.gt-cols__bar')).toHaveLength(4);
    const caps = Array.from(container.querySelectorAll('.gt-cols__cap')).map((c) => Number(c.getAttribute('y')));
    expect(caps).toHaveLength(4);
    expect(caps[3]).toBeLessThan(caps[1]); // the story Sprint 1 cap (110) sits higher than the task Sprint 1 cap (31): one shared scale
    expect(container.querySelectorAll('.gt-cols__bar')[0].getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('.gt-legend')).toBeNull(); // one series → no legend
  });
  it('keeps the brief\'s geometry before the first measurement: 40 units a column, 24-wide bars at 40i + 8', () => {
    const { container } = render(<BarsBySprint panels={PANELS} />);
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('viewBox', '0 0 80 140'));
    expect(Array.from(container.querySelectorAll('.gt-cols__bar')).map((b) => b.getAttribute('d')!.slice(0, 3))).toEqual(['M8 ', 'M48', 'M8 ', 'M48']);
    expect(container.querySelector('.gt-cols--stacked')).toBeNull();
  });
  it('draws both panels 1:1 from the wrapper\'s measured width, the columns spread over each and at most 24 wide', () => {
    const { report } = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={PANELS} />);
    report(524); // two 254px panels and the 16px gap
    const svgs = container.querySelectorAll('svg');
    svgs.forEach((svg) => expect(svg.getAttribute('viewBox')).toBe('0 0 254 140'));
    expect(numberAttr(capsOf(svgs[0]), 'x')).toEqual([63.5, 190.5]); // the centres of two 127px slots
    Array.from(container.querySelectorAll('.gt-cols__bar')).forEach((bar) => expect(bar.getAttribute('d')).toMatch(/h-24z$/));
  });
  it('stacks the panels when a side-by-side panel cannot hold every cap, and then draws all of them (Backlog + 8 sprints at 311px)', () => {
    const { report } = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={pair(columns(8, 22, 13), columns(8, 100, 11))} />);
    report(311); // a phone card's content: side by side would leave 147.5px for nine 3-digit caps that need 9 × 25.6
    expect(container.querySelector('.gt-cols')).toHaveClass('gt-cols--stacked');
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('viewBox', '0 0 311 140');
      expect(capsOf(svg)).toHaveLength(9);
    });
  });
  it('keeps the panels side by side while each can hold its caps (4 columns at 556px)', () => {
    const { report } = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={pair(columns(3, 22, 5), columns(3, 64, 22))} />);
    report(556);
    expect(container.querySelector('.gt-cols')).not.toHaveClass('gt-cols--stacked');
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('viewBox', '0 0 270 140'); // (556 − 16) / 2
      expect(capsOf(svg)).toHaveLength(4);
    });
  });
  it('keeps every cap when the stacked panel holds them exactly (Backlog + 9 three-digit caps at 256px: 10 × 25.6)', () => {
    const { report } = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={pair(columns(9, 100, 11), columns(9, 120, 9))} />);
    report(256); // slot 25.6 minus a 21.6px cap leaves exactly the 4px of air, give or take a float rounding
    expect(container.querySelector('.gt-cols')).toHaveClass('gt-cols--stacked');
    container.querySelectorAll('svg').forEach((svg) => expect(capsOf(svg)).toHaveLength(10));
  });
  it('thins labels only when even a stacked panel cannot hold them, keeping them apart and inside (4-digit medians at 311px)', () => {
    const { report } = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={pair(columns(8, 1050, 37), columns(8, 1100, 41))} />);
    report(311);
    expect(container.querySelector('.gt-cols')).toHaveClass('gt-cols--stacked');
    const svg = container.querySelector('svg')!;
    const ticks = Array.from(svg.querySelectorAll('.gt-cols__tick'));
    expect(ticks[0]).toHaveTextContent('Backlog');
    expect(ticks[ticks.length - 1]).toHaveTextContent('S8');
    const tx = numberAttr(ticks, 'x');
    expect(tx[0]).toBeGreaterThanOrEqual(22); // "Backlog" is 43.7px at 11px Poppins: its centre keeps it inside the panel
    tx.slice(1).forEach((x, i) => expect(x - tx[i]).toBeGreaterThanOrEqual(29)); // half of "Backlog" (21.9px) plus half of "S8" (6.7px)
    const cx = numberAttr(capsOf(svg), 'x');
    expect(cx.length).toBeLessThan(9);
    expect(cx[cx.length - 1]).toBe(311 - 18); // the last column's cap is always drawn, kept inside the panel
    cx.slice(1).forEach((x, i) => expect(x - cx[i]).toBeGreaterThanOrEqual(27)); // "1,234" is 26.9px in semibold
    expect(svg.querySelectorAll('.gt-cols__bar')).toHaveLength(9); // every column is still drawn
  });
  it('writes the figures compactly, and the noun in the singular for one', () => {
    render(<BarsBySprint panels={[
      { key: 'task', title: 'Characters per task', overall: { median: 1234, n: 12900 }, columns: [{ label: 'Sprint 1', median: 1234, n: 12900 }] },
      { key: 'story', title: 'Characters per story', overall: { median: 96, n: 1 }, columns: [{ label: 'Sprint 1', median: 96, n: 1 }] }]} />);
    expect(screen.getByText('median 1,234 chars · 12.9K tasks')).toBeInTheDocument();
    expect(screen.getByText('median 96 chars · 1 story')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument(); // the cap
  });
  it('draws a panel with no columns as a bare baseline that says so', () => {
    const { container } = render(<BarsBySprint panels={[PANELS[0], { key: 'story', title: 'Characters per story', overall: { median: 0, n: 0 }, columns: [] }]} />);
    const empty = screen.getByRole('img', { name: 'Characters per story by sprint: no items' });
    expect(empty.querySelectorAll('.gt-cols__bar, text')).toHaveLength(0);
    expect(empty.querySelectorAll('.gt-cols__axis')).toHaveLength(1);
    expect(screen.getByText('median 0 chars · 0 stories')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN/);
  });
});
