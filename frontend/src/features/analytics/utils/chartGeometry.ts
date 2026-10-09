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

/** 0, step, 2·step, … up to `max` (inclusive, within a millionth of a step): by 1 for an integer `max` ≤ 4, otherwise by the 1, 2 or 5 × 10^k nearest `max / count`, so every tick is a round number. */
export function ticks(max: number, count = 4): number[] {
  const step = Number.isInteger(max) && max <= 4 ? 1 : niceStep(max / count);
  const out: number[] = [];
  for (let i = 0; step > 0 && i * step <= max + step * 1e-6; i += 1) out.push(i * step);
  return out;
}

/** The value of the ladder [1, 2, 5] × 10^k (the next decade's 1 included) nearest `target`, the smaller on a tie. */
function niceStep(target: number): number {
  const base = 10 ** Math.floor(Math.log10(target));
  let best = base;
  for (const m of [2, 5, 10]) if (Math.abs(m * base - target) < Math.abs(best - target)) best = m * base;
  return best;
}

/** An axis tick's label: counts stay compact ("1.3M"); a fractional tick keeps up to two decimals ("1.25"). */
export function tickLabel(t: number): string {
  return Number.isInteger(t) ? compactNumber(t) : String(Number(t.toFixed(2)));
}

/** Per-character widths of the charts' 11px Poppins text, measured: regular labels run about 6.3px ("Backlog" is 43.7px, "S8" 13.4px) and a semibold digit is at most 7.1px. The one calibration every label fit uses; a font change means re-measuring it. */
const CHAR_WIDTH = { regular: 6.3, semibold: 7.2 } as const;

/** About how wide `text` renders at 11px: enough to keep labels apart and inside a chart, not a layout measurement. */
export function textWidth(text: string, weight: keyof typeof CHAR_WIDTH): number {
  return text.length * CHAR_WIDTH[weight];
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
