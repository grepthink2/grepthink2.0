/** Tiny scale and path helpers for the hand-rolled SVG charts (the BurnupChart idiom). */

import { compactNumber } from './analyticsFormat';

export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  return (v: number) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0));
}

/** The smallest 1, 2, 2.5, 5 or 10 × 10^k that is ≥ max (1 when max ≤ 0). */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const step of [1, 2, 2.5, 5, 10]) if (step * base >= max) return step * base;
  return 10 * base;
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

/** An axis tick's label: counts stay compact ("1.3M"); a fractional tick keeps up to two decimals ("1.25"). */
export function tickLabel(t: number): string {
  return Number.isInteger(t) ? compactNumber(t) : String(Number(t.toFixed(2)));
}

/** "M x y L x y …", starting a new sub-path after every null (a gap, never a bridge). */
export function linePath(points: ([number, number] | null)[]): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p === null) { pen = false; continue; }
    const [x, y] = p;
    d += `${pen ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`;
    pen = true;
  }
  return d;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** A column with a 4px (or smaller) rounded data end and a square baseline: the brief's bar rule. */
export function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${fmt(x)} ${fmt(y + rr)}a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(rr)} -${fmt(rr)}h${fmt(w - 2 * rr)}a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(rr)} ${fmt(rr)}v${fmt(h - rr)}h-${fmt(w)}z`;
}
