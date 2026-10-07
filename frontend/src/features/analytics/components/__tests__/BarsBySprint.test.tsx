import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarsBySprint } from '../BarsBySprint';

const PANELS = [
  { key: 'task', title: 'Characters per task', overall: { median: 29, n: 418 }, columns: [{ label: 'Backlog', median: 20, n: 40 }, { label: 'Sprint 1', median: 31, n: 120 }] },
  { key: 'story', title: 'Characters per story', overall: { median: 96, n: 61 }, columns: [{ label: 'Backlog', median: 60, n: 10 }, { label: 'Sprint 1', median: 110, n: 20 }] },
];
/** Backlog and eight sprints: the handoff's density case. */
const DENSE = [{ key: 'task', title: 'Characters per task', overall: { median: 60, n: 45 }, columns: [
  { label: 'Backlog', median: 22, n: 5 }, ...Array.from({ length: 8 }, (_, i) => ({ label: `Sprint ${i + 1}`, median: 100 + i * 13, n: 5 }))] }];

/** Stubs ResizeObserver; `report(w)` then tells every observed panel it is w pixels wide. */
function stubResizeObserver() {
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { callbacks.push(cb); } observe() {} unobserve() {} disconnect() {} });
  return (width: number) => act(() => callbacks.forEach((cb) => cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)));
}
const numberAttr = (els: Iterable<Element>, name: string) => Array.from(els).map((e) => Number(e.getAttribute(name)));

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
  it('draws each panel 1:1 at its measured width, the columns spread over it and at most 24 wide', () => {
    const report = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={PANELS} />);
    report(254); // a panel of the wide scrum card
    const svgs = container.querySelectorAll('svg');
    svgs.forEach((svg) => expect(svg.getAttribute('viewBox')).toBe('0 0 254 140'));
    expect(numberAttr(svgs[0].querySelectorAll('.gt-cols__cap'), 'x')).toEqual([63.5, 190.5]); // the centres of two 127px slots
    Array.from(container.querySelectorAll('.gt-cols__bar')).forEach((bar) => expect(bar.getAttribute('d')).toMatch(/h-24z$/));
  });
  it('keeps dense labels apart and inside the panel, the first and the last always (Backlog + 8 sprints at 147px)', () => {
    const report = stubResizeObserver();
    const { container } = render(<BarsBySprint panels={DENSE} />);
    report(147); // a panel of a phone card
    const ticks = Array.from(container.querySelectorAll('.gt-cols__tick'));
    expect(ticks.length).toBeLessThan(9);
    expect(ticks[0]).toHaveTextContent('Backlog');
    expect(ticks[ticks.length - 1]).toHaveTextContent('S8');
    const tx = numberAttr(ticks, 'x');
    expect(tx[0]).toBeGreaterThanOrEqual(22); // "Backlog" is 43.7px at 11px Poppins: its centre keeps it inside the panel
    tx.slice(1).forEach((x, i) => expect(x - tx[i]).toBeGreaterThanOrEqual(29)); // half of "Backlog", half of "S8" and air
    const cx = numberAttr(container.querySelectorAll('.gt-cols__cap'), 'x');
    expect(cx.length).toBeLessThan(9);
    cx.slice(1).forEach((x, i) => expect(x - cx[i]).toBeGreaterThanOrEqual(23)); // three-digit medians are at most 21.3px wide
    expect(Math.max(...cx)).toBeLessThanOrEqual(147 - 21.3 / 2); // and the last stays inside the panel
    expect(container.querySelectorAll('.gt-cols__bar')).toHaveLength(9); // every column is still drawn
  });
  it('writes the figures compactly, and the noun in the singular for one', () => {
    render(<BarsBySprint panels={[
      { key: 'task', title: 'Characters per task', overall: { median: 1234, n: 12900 }, columns: [{ label: 'Sprint 1', median: 1234, n: 12900 }] },
      { key: 'story', title: 'Characters per story', overall: { median: 96, n: 1 }, columns: [{ label: 'Sprint 1', median: 96, n: 1 }] }]} />);
    expect(screen.getByText('median 1,234 chars · 12.9K tasks')).toBeInTheDocument();
    expect(screen.getByText('median 96 chars · 1 story')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument(); // the cap
  });
});
