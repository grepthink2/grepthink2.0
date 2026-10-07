import { useId, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { compactNumber, weekLabel } from '../utils/analyticsFormat';
import { linePath, linearScale, niceMax, tickLabel, ticks } from '../utils/chartGeometry';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip } from './ChartTooltip';

// The tooltip stays inside the chart: its anchor (`left`) is clamped to 10–90 % of the width, and the box moves left by
// the same share of its own width (left 90 % → --tip-shift −90 %), so it always ends inside the chart (it only has to be
// narrower than the chart): a hover on the first or last week never pushes it past the card, nor makes a phone scroll sideways.

export interface WeeklySeries { key: string; label: string; colorClass: string; points: { weekStart: string; value: number }[] }
export interface WeeklyLineProps { series: WeeklySeries[]; height?: number; ariaLabel: string }

const W = 600;
const PAD = { top: 16, right: 56, bottom: 28, left: 40 };
/** The least distance between the two end labels' baselines: the 11px label plus a unit of air. */
const LABEL_GAP = 12;
/** Left/Right step a week, Home/End jump to either end: the keyboard's way to the same tooltip as hover. */
const KEY_MOVES = new Map<string, (at: number, last: number) => number>([
  ['ArrowLeft', (at) => at - 1], ['ArrowRight', (at) => at + 1], ['Home', () => 0], ['End', (_at, last) => last],
]);

/** Messages per week, one or two series (brief §4 #5): 2px round-joined lines, series 1 with a 10 % wash, hairline gridlines, a crosshair that snaps to the nearest week, one tooltip for every series. */
export function WeeklyLine({ series, height = 220, ariaLabel }: WeeklyLineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const weeks = series[0]?.points.map((p) => p.weekStart) ?? [];
  const n = weeks.length;
  const at = hover !== null && hover < n ? hover : null; // a refresh can drop the week under the pointer
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value))));
  const x = linearScale(0, Math.max(n - 1, 1), PAD.left, W - PAD.right);
  const y = linearScale(0, max, height - PAD.bottom, PAD.top);
  const plotBottom = height - PAD.bottom;
  const tipLeft = at === null ? 0 : Math.min(90, Math.max(10, (x(at) / W) * 100));

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
    const idx = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * Math.max(n - 1, 1));
    setHover(Math.min(Math.max(idx, 0), n - 1));
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const move = KEY_MOVES.get(e.key);
    if (!move || n === 0) return;
    e.preventDefault();
    setHover(Math.min(Math.max(move(at ?? n - 1, n - 1), 0), n - 1));
  };

  return (
    <div className="gt-line" style={at === null ? undefined : ({ '--tip-shift': `-${tipLeft}%` } as CSSProperties)}>
      <svg className="gt-line__svg" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onFocus={() => { if (at === null && n > 0) setHover(n - 1); }} onBlur={() => setHover(null)} onKeyDown={onKeyDown} tabIndex={0}>
        <defs><clipPath id={clipId}><rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={plotBottom - PAD.top} /></clipPath></defs>
        {ticks(max).map((t) => (
          <g key={t}>
            <line className="gt-line__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="gt-line__tick" x={PAD.left - 6} y={y(t) + 3} textAnchor="end">{tickLabel(t)}</text>
          </g>
        ))}
        <line className="gt-line__axis" x1={PAD.left} x2={W - PAD.right} y1={plotBottom} y2={plotBottom} />
        {weeks.map((w, i) => (i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0) && (
          <text key={w} className="gt-line__tick" x={x(i)} y={height - 8} textAnchor="middle">{weekLabel(w)}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.points.map((p, i) => [x(i), y(p.value)] as [number, number]);
          const last = pts[pts.length - 1];
          return (
            <g key={s.key} className={s.colorClass}>
              {si === 0 && pts.length > 1 ? (
                <path className="gt-line__area" clipPath={`url(#${clipId})`} d={`${linePath(pts)}L${last[0]} ${plotBottom}L${pts[0][0]} ${plotBottom}Z`} />
              ) : null}
              <path className="gt-line__path" d={linePath(pts)} />
              {pts.map(([px, py], i) => (
                <circle key={i} className={`gt-line__marker${at === i ? ' gt-line__marker--hot' : ''}`} cx={px} cy={py} r={4} />
              ))}
              {last ? <text className="gt-line__end-label" x={last[0] + 8} y={endY[si]}>{compactNumber(s.points[s.points.length - 1].value)}</text> : null}
            </g>
          );
        })}
        {at !== null ? <line className="gt-line__crosshair" x1={x(at)} x2={x(at)} y1={PAD.top} y2={plotBottom} /> : null}
      </svg>
      {at !== null ? (
        <ChartTooltip title={weekLabel(weeks[at])} x={`${tipLeft}%`} y={PAD.top} rows={series.map((s) => ({ label: s.label, value: compactNumber(s.points[at]?.value ?? 0), colorClass: s.colorClass }))} />
      ) : null}
      {series.length > 1 ? <ChartLegend items={series.map((s) => ({ key: s.key, label: s.label, swatch: 'line', colorClass: s.colorClass }))} /> : null}
    </div>
  );
}
