import { useRef } from 'react';
import { compactNumber } from '../utils/analyticsFormat';
import { linearScale, niceMax, roundedTopRect } from '../utils/chartGeometry';
import { useMeasuredWidth } from '../utils/useMeasuredWidth';

// Each panel draws 1:1 at its own width (useMeasuredWidth), so the 11px labels keep their size and the columns stay at most
// 24px wide on a phone card and on a wide one alike. Before the first measurement (and in jsdom) a panel is 40 units per
// column: the brief's geometry, 24px columns 16px apart.

export interface CharsPanel { key: string; title: string; overall: { median: number; n: number }; columns: { label: string; median: number; n: number }[] }

const H = 140;
const PAD = { top: 18, bottom: 22 };
/** A column's slot before the panel is measured. */
const SLOT = 40;
/** A column is at most 24px wide and takes at most 60 % of its slot (24 of 40). */
const BAR = 24;
const BAR_SHARE = 0.6;
/** A panel is half the chart, about 147px on a 375px phone; it draws 1:1 down to 120px. */
const FLOOR = 120;
/** Label widths at 11px Poppins: the regular tick labels run about 6.3px a character ("Backlog" is 43.7px, "S8" 13.4px); a semibold digit is at most 7.1px. */
const TICK_CHAR = 6.3;
const CAP_CHAR = 7.2;
/** The least space between two neighbouring labels. */
const LABEL_AIR = 4;

/** Which labels to draw, and their x: each centred on its column but kept inside the panel, drawn only when it clears the last drawn label by LABEL_AIR; the last column's label always, dropping any it would touch. */
function placeLabels(texts: string[], charWidth: number, slot: number, w: number): Map<number, number> {
  const kept: { i: number; x: number; left: number; right: number }[] = [];
  texts.forEach((text, i) => {
    const half = (text.length * charWidth) / 2;
    const x = Math.min(Math.max((i + 0.5) * slot, half), w - half);
    const box = { i, x, left: x - half, right: x + half };
    if (i === texts.length - 1) while (kept.length > 0 && kept[kept.length - 1].right + LABEL_AIR > box.left) kept.pop();
    const last = kept[kept.length - 1];
    if (!last || box.left >= last.right + LABEL_AIR) kept.push(box);
  });
  return new Map(kept.map((b) => [b.i, b.x]));
}

/** Two small multiples (tasks, stories), one series each, a shared y scale, the median on every cap that has room (brief §4 #10). */
export function BarsBySprint({ panels }: { panels: CharsPanel[] }) {
  const max = niceMax(Math.max(0, ...panels.flatMap((p) => p.columns.map((c) => c.median))));
  const y = linearScale(0, max, H - PAD.bottom, PAD.top);
  return (
    <div className="gt-cols">
      {panels.map((p) => <ColumnsPanel key={p.key} panel={p} y={y} />)}
    </div>
  );
}

function ColumnsPanel({ panel, y }: { panel: CharsPanel; y: (v: number) => number }) {
  const ref = useRef<HTMLElement>(null);
  const n = panel.columns.length;
  const w = useMeasuredWidth(ref, Math.max(n, 1) * SLOT, FLOOR);
  const slot = w / Math.max(n, 1);
  const barW = Math.min(BAR, slot * BAR_SHARE);
  const base = H - PAD.bottom;
  const medians = panel.columns.map((c) => compactNumber(c.median));
  const caps = placeLabels(medians, CAP_CHAR, slot, w);
  const sprints = panel.columns.map((c) => c.label.replace('Sprint ', 'S'));
  const ticks = placeLabels(sprints, TICK_CHAR, slot, w);
  const one = panel.overall.n === 1;
  const noun = panel.key === 'task' ? (one ? 'task' : 'tasks') : (one ? 'story' : 'stories');
  return (
    <figure ref={ref} className="gt-cols__panel">
      <figcaption className="gt-cols__head">
        <span className="gt-cols__title">{panel.title}</span>
        <span className="gt-cols__meta">{`median ${compactNumber(panel.overall.median)} chars · ${compactNumber(panel.overall.n)} ${noun}`}</span>
      </figcaption>
      <svg className="gt-cols__svg gt-series--1" width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`${panel.title} by sprint: ${panel.columns.map((c, i) => `${c.label} ${medians[i]}`).join(', ')}`}>
        <line className="gt-cols__axis" x1={0} x2={w} y1={base} y2={base} />
        {panel.columns.map((c, i) => {
          const top = y(c.median);
          const capX = caps.get(i);
          const tickX = ticks.get(i);
          return (
            <g key={c.label}>
              <path className="gt-cols__bar" d={roundedTopRect((i + 0.5) * slot - barW / 2, top, barW, base - top, 4)} />
              {capX !== undefined ? <text className="gt-cols__cap" x={capX} y={top - 4} textAnchor="middle">{medians[i]}</text> : null}
              {tickX !== undefined ? <text className="gt-cols__tick" x={tickX} y={H - 6} textAnchor="middle">{sprints[i]}</text> : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
