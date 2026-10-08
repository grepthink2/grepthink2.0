import { useRef } from 'react';
import type { ApiAnalyticsTrendPanel } from '@/lib/api/types';
import { dateLabel, percent, weekLabel } from '../utils/analyticsFormat';
import { linePath, linearScale, niceMax, textWidth, tickLabel } from '../utils/chartGeometry';
import { useMeasuredWidth } from '../utils/useMeasuredWidth';
import { CardTable } from './CardTable';
import { ChartLegend } from './ChartLegend';

// Each panel draws 1:1 at its own width (useMeasuredWidth), so its 2px lines, 8px markers and 11px end label keep their
// sizes in a 200px column and in a 345px one alike. W is a panel's width before the first measurement (and in jsdom).

export interface TrendLinesProps { panels: ApiAnalyticsTrendPanel[]; compare: boolean; asOf: string | null }
export interface TrendTableProps { panels: ApiAnalyticsTrendPanel[]; asOf: string | null }

type Point = [number, number] | null;

const W = 260;
const H = 120;
const PAD = { top: 10, bottom: 10, left: 10 };
/** Every panel's right margin holds the widest end label among them, so the weeks line up across panels: 40px, or that label's estimated width plus its 8px offset and 4px of air when that is more. */
const MIN_RIGHT = 40;
/** `.gt-trend__panels` never makes a column narrower than 200px. */
const FLOOR = 200;

/** A rate reads as a percentage; a per-team figure keeps up to two decimals. */
function valueLabel(panel: ApiAnalyticsTrendPanel, v: number): string {
  return panel.key === 'on_time_rate' ? percent(v) : tickLabel(v);
}

/** This range's latest week that has a value. */
function latestWeek(weeks: ApiAnalyticsTrendPanel['current']): { index: number; week_start: string; value: number } | null {
  for (let i = weeks.length - 1; i >= 0; i -= 1) {
    const { week_start, value } = weeks[i];
    if (value !== null) return { index: i, week_start, value };
  }
  return null;
}

/**
 * What the card says in place of its weeks, or null when a week has a value: before the first nightly rollup; once it
 * has run, while the range holds no complete week (the backend leaves out the week in progress); or when no class was in
 * session in any of its weeks.
 */
function emptyNote(panels: ApiAnalyticsTrendPanel[], asOf: string | null): string | null {
  if (panels.some((p) => p.current.some((c) => c.value !== null))) return null;
  if (!asOf) return 'Trends appear after the first nightly rollup.';
  if (panels.every((p) => p.current.length === 0)) return 'No complete week in this range yet.';
  return 'No team activity in this range.';
}

function AsOf({ asOf }: { asOf: string | null }) {
  return asOf ? <span className="gt-trend__asof">{`as of ${dateLabel(asOf)}`}</span> : null;
}

/** The points that get a marker: each one no neighbour connects to (its bare moveto would paint nothing), and the one at `also`. */
function markedPoints(pts: Point[], also = -1): [number, number][] {
  return pts.filter((p, i): p is [number, number] => p !== null && (i === also || (!pts[i - 1] && !pts[i + 1])));
}

/** Small multiples over the range; the previous range is a gray context line aligned by week index (brief §4 #11). Null weeks leave gaps; a week no line reaches gets a marker; this range's latest week is marked and labelled. */
export function TrendLines({ panels, compare, asOf }: TrendLinesProps) {
  const note = emptyNote(panels, asOf);
  if (note) return <p className="gt-trend__empty">{note}</p>;
  const showsPrevious = compare && panels.some((p) => p.previous?.some((c) => c.value !== null));
  const right = Math.max(MIN_RIGHT, ...panels.map((p) => {
    const latest = latestWeek(p.current);
    return latest ? textWidth(valueLabel(p, latest.value), 'semibold') + 12 : 0;
  }));
  return (
    <div className="gt-trend">
      <div className="gt-trend__panels">
        {panels.map((p) => <TrendPanel key={p.key} panel={p} compare={compare} right={right} />)}
      </div>
      <div className="gt-trend__foot">
        <ChartLegend items={[{ key: 'cur', label: 'This range', swatch: 'line', colorClass: 'gt-series--1' }, ...(showsPrevious ? [{ key: 'prev', label: 'Previous range', swatch: 'line' as const, colorClass: 'gt-series--gray' }] : [])]} />
        <AsOf asOf={asOf} />
      </div>
    </div>
  );
}

/** The Trends card's Table twin: one row per complete week of this range, one column per panel with its unit in the header. */
export function TrendTable({ panels, asOf }: TrendTableProps) {
  const note = emptyNote(panels, asOf);
  if (note) return <p className="gt-trend__empty">{note}</p>;
  const weeks = [...new Set(panels.flatMap((p) => p.current.map((c) => c.week_start)))].sort();
  return (
    <div className="gt-trend">
      <CardTable
        caption="Trends by week"
        columns={[{ key: 'week', label: 'Week' }, ...panels.map((p) => ({ key: p.key, label: `${p.title} (${p.unit})`, numeric: true }))]}
        rows={weeks.map((weekStart) => ({
          key: weekStart,
          cells: [dateLabel(weekStart), ...panels.map((p) => {
            const value = p.current.find((c) => c.week_start === weekStart)?.value ?? null;
            return value === null ? '—' : valueLabel(p, value);
          })],
        }))}
      />
      <div className="gt-trend__foot"><AsOf asOf={asOf} /></div>
    </div>
  );
}

function TrendPanel({ panel, compare, right }: { panel: ApiAnalyticsTrendPanel; compare: boolean; right: number }) {
  const ref = useRef<HTMLElement>(null);
  const w = useMeasuredWidth(ref, W, FLOOR);
  const prev = compare && panel.previous ? panel.previous : null;
  const values = [...panel.current, ...(prev ?? [])].map((c) => c.value ?? 0);
  const max = niceMax(Math.max(0, ...values));
  const latest = latestWeek(panel.current);
  const latestText = latest ? valueLabel(panel, latest.value) : '';
  const n = Math.max(panel.current.length, prev?.length ?? 0, 2);
  const x = linearScale(0, n - 1, PAD.left, w - right);
  const y = linearScale(0, max, H - PAD.bottom, PAD.top);
  const toPts = (pts: { value: number | null }[]): Point[] => pts.map((c, i) => (c.value === null ? null : [x(i), y(c.value)]));
  const current = toPts(panel.current);
  const previous = prev ? toPts(prev) : [];
  const previousAtLatest = latest && prev ? prev[latest.index]?.value ?? null : null;
  const weeks = panel.current.length === 1 ? '1 week' : `${panel.current.length} weeks`;
  const summary = `${panel.title}, ${weeks}`
    + (latest ? `; week of ${weekLabel(latest.week_start)}: ${latestText}` : '')
    + (previousAtLatest !== null ? `; previous range: ${valueLabel(panel, previousAtLatest)}` : '');
  return (
    <figure ref={ref} className="gt-trend__panel">
      <figcaption className="gt-trend__title">{panel.title}<span className="gt-trend__unit">{panel.unit}</span></figcaption>
      <svg className="gt-trend__svg" width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label={summary}>
        <line className="gt-trend__axis" x1={PAD.left} x2={w - right} y1={H - PAD.bottom} y2={H - PAD.bottom} />
        {prev ? <path className="gt-trend__previous gt-series--gray" d={linePath(previous)} /> : null}
        <path className="gt-trend__current gt-series--1" d={linePath(current)} />
        {markedPoints(previous).map(([cx, cy]) => <circle key={`p${cx}`} className="gt-trend__marker gt-series--gray" cx={cx} cy={cy} r={4} />)}
        {markedPoints(current, latest?.index).map(([cx, cy]) => <circle key={`c${cx}`} className="gt-trend__marker gt-series--1" cx={cx} cy={cy} r={4} />)}
        {latest ? <text className="gt-trend__end-label" x={x(latest.index) + 8} y={y(latest.value) + 4}>{latestText}</text> : null}
      </svg>
    </figure>
  );
}
