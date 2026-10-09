import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { compactNumber, weekLabel } from '../utils/analyticsFormat';
import { linePath, linearScale, niceMax, tickLabel, ticks } from '../utils/chartGeometry';
import { useMeasuredWidth } from '../utils/useMeasuredWidth';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip } from './ChartTooltip';

// The chart draws 1:1: its width is the card's (useMeasuredWidth), so one user unit is one CSS pixel and the 11px text,
// 2px lines and r = 4 markers keep their sizes at every width. The tooltip's anchor is its point's share of the width, and
// --tip-shift moves the box left by that same share of its own width, so wherever it points it ends inside the chart.

export interface WeeklySeries { key: string; label: string; colorClass: string; points: { weekStart: string; value: number }[] }
export interface WeeklyLineProps { series: WeeklySeries[]; height?: number; ariaLabel: string }

const PAD = { top: 16, right: 56, bottom: 28, left: 40 };
/** The least distance between the two end labels' baselines: the 11px label plus a unit of air. */
const LABEL_GAP = 12;
/** The least distance between two week labels ("Sep 14" is about 34px at 11px). */
const WEEK_LABEL_SPACING = 48;
/** Points at least this far apart each carry a marker (10px with its ring, plus air); closer, only each series' last point and the hovered week do. */
const MARKER_SPACING = 14;
/** Left/Right step a week, Home/End jump to either end: the keyboard's way to the same tooltip as hover. */
const KEY_MOVES = new Map<string, (at: number, last: number) => number>([
  ['ArrowLeft', (at) => at - 1], ['ArrowRight', (at) => at + 1], ['Home', () => 0], ['End', (_at, last) => last],
]);

/** The weeks that carry an axis label: at most one per 48px of plot (never fewer than two), the first and the last always, and no thinned label within a step of the last. */
function labelledWeeks(n: number, plotW: number): Set<number> {
  const most = Math.max(2, Math.floor(plotW / WEEK_LABEL_SPACING));
  const step = Math.max(1, Math.ceil((n - 1) / (most - 1)));
  const shown = new Set<number>();
  for (let i = 0; i <= n - 1 - step; i += step) shown.add(i);
  if (n > 0) shown.add(n - 1);
  return shown;
}

/** Messages per week, one or two series (brief §4 #5): 2px round-joined lines, series 1 with a 10 % wash, hairline gridlines, a crosshair that snaps to the nearest week, one tooltip for every series. */
export function WeeklyLine({ series, height = 220, ariaLabel }: WeeklyLineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = useMeasuredWidth(wrapRef);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const weeks = series[0]?.points.map((p) => p.weekStart) ?? [];
  const n = weeks.length;
  const at = hover !== null && hover < n ? hover : null; // a refresh can drop the week under the pointer
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value))));
  const plotW = W - PAD.left - PAD.right;
  const x = linearScale(0, Math.max(n - 1, 1), PAD.left, W - PAD.right);
  const y = linearScale(0, max, height - PAD.bottom, PAD.top);
  const plotBottom = height - PAD.bottom;
  const labelled = labelledWeeks(n, plotW);
  const markEvery = plotW / Math.max(n - 1, 1) >= MARKER_SPACING;
  const tipShare = at === null ? 0 : Math.round((x(at) / W) * 10000) / 100; // the hovered point's share of the width, in %
  const summary = n === 0 ? ariaLabel
    : `${ariaLabel}; week of ${weekLabel(weeks[n - 1])}: ${series.map((s) => `${s.label} ${compactNumber(s.points[n - 1]?.value ?? 0)}`).join(', ')}`;

  // Each series' last value sits beside its last point; two labels that would overlap move apart around their midpoint, the higher line's on top.
  const endY = series.map((s) => y(s.points[s.points.length - 1]?.value ?? 0) + 4);
  if (endY.length === 2 && Math.abs(endY[0] - endY[1]) < LABEL_GAP) {
    const mid = (endY[0] + endY[1]) / 2;
    const [upper, lower] = endY[1] < endY[0] ? [1, 0] : [0, 1]; // a tie puts series 1 on top
    endY[upper] = mid - LABEL_GAP / 2;
    endY[lower] = mid + LABEL_GAP / 2;
  }

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((px - PAD.left) / plotW) * Math.max(n - 1, 1));
    setHover(Math.min(Math.max(idx, 0), n - 1));
  };
  const onFocus = () => {
    if (at === null && n > 0) setHover(n - 1);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const move = KEY_MOVES.get(e.key);
    if (!move || n === 0) return;
    e.preventDefault();
    setHover(Math.min(Math.max(move(at ?? n - 1, n - 1), 0), n - 1));
  };

  return (
    <div ref={wrapRef} className="gt-line" style={at === null ? undefined : ({ '--tip-shift': `-${tipShare}%` } as CSSProperties)}>
      <svg className="gt-line__svg" width="100%" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onFocus={onFocus} onBlur={() => setHover(null)} onKeyDown={onKeyDown} tabIndex={0}>
        <defs><clipPath id={clipId}><rect x={PAD.left} y={PAD.top} width={plotW} height={plotBottom - PAD.top} /></clipPath></defs>
        {ticks(max).map((t) => (
          <g key={t}>
            <line className="gt-line__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="gt-line__tick" x={PAD.left - 6} y={y(t) + 3} textAnchor="end">{tickLabel(t)}</text>
          </g>
        ))}
        <line className="gt-line__axis" x1={PAD.left} x2={W - PAD.right} y1={plotBottom} y2={plotBottom} />
        {weeks.map((w, i) => (labelled.has(i) ? (
          <text key={w} className="gt-line__tick" x={x(i)} y={height - 8} textAnchor="middle">{weekLabel(w)}</text>
        ) : null))}
        {series.map((s, si) => {
          const pts = s.points.map((p, i) => [x(i), y(p.value)] as [number, number]);
          const last = pts[pts.length - 1];
          return (
            <g key={s.key} className={s.colorClass}>
              {si === 0 && pts.length > 1 ? (
                <path className="gt-line__area" clipPath={`url(#${clipId})`} d={`${linePath(pts)}L${last[0]} ${plotBottom}L${pts[0][0]} ${plotBottom}Z`} />
              ) : null}
              <path className="gt-line__path" d={linePath(pts)} />
              {pts.map(([px, py], i) => (markEvery || i === pts.length - 1 || i === at ? (
                <circle key={i} className={`gt-line__marker${at === i ? ' gt-line__marker--hot' : ''}`} cx={px} cy={py} r={4} />
              ) : null))}
              {last ? <text className="gt-line__end-label" x={last[0] + 8} y={endY[si]}>{compactNumber(s.points[s.points.length - 1].value)}</text> : null}
            </g>
          );
        })}
        {at !== null ? <line className="gt-line__crosshair" x1={x(at)} x2={x(at)} y1={PAD.top} y2={plotBottom} /> : null}
      </svg>
      {at !== null ? (
        <ChartTooltip title={weekLabel(weeks[at])} x={`${tipShare}%`} y={PAD.top} rows={series.map((s) => ({ label: s.label, value: compactNumber(s.points[at]?.value ?? 0), colorClass: s.colorClass }))} />
      ) : null}
      {series.length > 1 ? <ChartLegend items={series.map((s) => ({ key: s.key, label: s.label, swatch: 'line', colorClass: s.colorClass }))} /> : null}
    </div>
  );
}
