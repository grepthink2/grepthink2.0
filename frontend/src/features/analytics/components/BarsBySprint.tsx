import { useRef } from 'react';
import { compactNumber } from '../utils/analyticsFormat';
import { linearScale, niceMax, roundedTopRect, textWidth } from '../utils/chartGeometry';
import { useMeasuredWidth } from '../utils/useMeasuredWidth';

// The panels draw 1:1 at widths taken from one measurement of the grid (useMeasuredWidth), so the 11px labels keep their
// size and the columns stay at most 24px wide. Side by side, a panel is (W − 16) / 2; when that leaves a panel too little
// room for every median cap, the grid stacks the panels (`.gt-cols--stacked`) and each is W wide. Only a panel too narrow
// even then thins its labels. Before the first measurement (and in jsdom) a panel is 40 units a column: the brief's
// geometry, 24px columns 16px apart.

export interface CharsPanel { key: string; title: string; overall: { median: number; n: number }; columns: { label: string; median: number; n: number }[] }

const H = 140;
const PAD = { top: 18, bottom: 22 };
/** A column's slot before the grid is measured. */
const SLOT = 40;
/** `.gt-cols`' gap between the two panels. */
const GAP = 16;
/** A column is at most 24px wide and takes at most 60 % of its slot (24 of 40). */
const BAR = 24;
const BAR_SHARE = 0.6;
/** The grid draws 1:1 down to 240px, a 320px phone's card. */
const FLOOR = 240;
/** The least space between two neighbouring labels. */
const LABEL_AIR = 4;
/** Float slack for placeLabels' comparisons: a slot that holds its cap with exactly LABEL_AIR to spare must still count as holding it. */
const EPSILON = 1e-6;

/** The room every median cap needs at once: n slots of the widest cap plus LABEL_AIR. */
function capRoom(caps: string[]): number {
  return caps.length * (Math.max(0, ...caps.map((c) => textWidth(c, 'semibold'))) + LABEL_AIR);
}

/** The last-resort guard: which labels to draw, and their x. Each is centred on its column but kept inside the panel, drawn only when it clears the last drawn label by LABEL_AIR; the last column's label always, dropping any it would touch. */
function placeLabels(widths: number[], slot: number, w: number): Map<number, number> {
  const kept: { i: number; x: number; left: number; right: number }[] = [];
  widths.forEach((width, i) => {
    const half = width / 2;
    const x = Math.min(Math.max((i + 0.5) * slot, half), w - half);
    const box = { i, x, left: x - half, right: x + half };
    if (i === widths.length - 1) while (kept.length > 0 && kept[kept.length - 1].right + LABEL_AIR > box.left + EPSILON) kept.pop();
    const last = kept[kept.length - 1];
    if (!last || box.left + EPSILON >= last.right + LABEL_AIR) kept.push(box);
  });
  return new Map(kept.map((b) => [b.i, b.x]));
}

/** Two small multiples (tasks, stories), one series each, a shared y scale, the median on every column cap (brief §4 #10). */
export function BarsBySprint({ panels }: { panels: CharsPanel[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const most = Math.max(1, ...panels.map((p) => p.columns.length));
  const W = useMeasuredWidth(ref, 2 * most * SLOT + GAP, FLOOR);
  const max = niceMax(Math.max(0, ...panels.flatMap((p) => p.columns.map((c) => c.median))));
  const y = linearScale(0, max, H - PAD.bottom, PAD.top);
  const caps = panels.map((p) => p.columns.map((c) => compactNumber(c.median)));
  const side = (W - GAP) / 2; // a panel's width side by side
  const stacked = caps.some((c) => capRoom(c) > side);
  return (
    <div ref={ref} className={`gt-cols${stacked ? ' gt-cols--stacked' : ''}`}>
      {panels.map((p, i) => <ColumnsPanel key={p.key} panel={p} caps={caps[i]} w={stacked ? W : side} y={y} />)}
    </div>
  );
}

function ColumnsPanel({ panel, caps, w, y }: { panel: CharsPanel; caps: string[]; w: number; y: (v: number) => number }) {
  const n = panel.columns.length;
  const slot = w / Math.max(n, 1);
  const barW = Math.min(BAR, slot * BAR_SHARE);
  const base = H - PAD.bottom;
  const capX = placeLabels(caps.map((c) => textWidth(c, 'semibold')), slot, w);
  const sprints = panel.columns.map((c) => c.label.replace('Sprint ', 'S'));
  const tickX = placeLabels(sprints.map((s) => textWidth(s, 'regular')), slot, w);
  const one = panel.overall.n === 1;
  const noun = panel.key === 'task' ? (one ? 'task' : 'tasks') : (one ? 'story' : 'stories');
  const summary = n === 0 ? 'no items' : panel.columns.map((c, i) => `${c.label} ${caps[i]}`).join(', ');
  return (
    <figure className="gt-cols__panel">
      <figcaption className="gt-cols__head">
        <span className="gt-cols__title">{panel.title}</span>
        <span className="gt-cols__meta">{`median ${compactNumber(panel.overall.median)} chars · ${compactNumber(panel.overall.n)} ${noun}`}</span>
      </figcaption>
      <svg className="gt-cols__svg gt-series--1" width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`${panel.title} by sprint: ${summary}`}>
        <line className="gt-cols__axis" x1={0} x2={w} y1={base} y2={base} />
        {panel.columns.map((c, i) => {
          const top = y(c.median);
          const cx = capX.get(i);
          const tx = tickX.get(i);
          return (
            <g key={c.label}>
              <path className="gt-cols__bar" d={roundedTopRect((i + 0.5) * slot - barW / 2, top, barW, base - top, 4)} />
              {cx !== undefined ? <text className="gt-cols__cap" x={cx} y={top - 4} textAnchor="middle">{caps[i]}</text> : null}
              {tx !== undefined ? <text className="gt-cols__tick" x={tx} y={H - 6} textAnchor="middle">{sprints[i]}</text> : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
