import React from 'react';
import { ChartTooltip, useChartTip, useMeasure, fmtWeek, fmtPct, niceScale } from './ChartTooltip.jsx';
import { ChartLegend } from './ChartLegend.jsx';
import { EmptyState } from '../feedback/EmptyState.jsx';
import { AnalyticsIcon } from './ChartLegend.jsx';

const M = { top: 12, right: 10, bottom: 20, left: 6 };
const UNIT_SHORT = { 'per team per week': '/team/wk', 'per team': '/team', rate: 'rate' };
const EMPTY_COPY = {
  no_rollup: 'Trends appear after the first nightly rollup.',
  no_complete_week: 'No complete week in this range yet.',
  no_activity: 'No team activity in this range.',
};

function fmtUnit(v, unit) {
  if (v === null || v === undefined) return '—';
  if (unit === 'rate') return fmtPct(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
const isNum = (v) => v !== null && v !== undefined;

/** A Monday-start week is complete once its Sunday is on or before the rollup's `asOf` day. */
export function completeWeeks(points = [], asOf) {
  if (!asOf) return [];
  const end = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10); };
  return points.filter((p) => p && p.weekStart && end(p.weekStart) <= asOf);
}

function Panel({ panel, compare, height }) {
  const [ref, width] = useMeasure(220);
  const { tip, show, hide } = useChartTip();
  const [hoverI, setHoverI] = React.useState(null);
  const cur = panel.current || [];
  const prev = compare && panel.previous ? panel.previous : null;
  const n = Math.max(cur.length, prev ? prev.length : 0);
  const maxV = Math.max(0, ...cur.map((p) => p.value ?? 0), ...(prev ? prev.map((p) => p.value ?? 0) : []));
  const [top, ticks] = niceScale(panel.unit === 'rate' ? Math.max(maxV, 1) : maxV, 3);
  const iw = Math.max(10, width - M.left - M.right);
  const ih = Math.max(10, height - M.top - M.bottom);
  const x = (i) => M.left + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v) => M.top + ih - (v / top) * ih;
  const path = (pts) => pts.reduce((acc, p, i) => {
    if (!isNum(p.value)) return acc;
    const prevOk = i > 0 && isNum(pts[i - 1]?.value);
    return `${acc}${prevOk ? ' L' : ' M'}${x(i)},${y(p.value)}`;
  }, '').trim();
  let latestI = -1;
  cur.forEach((p, i) => { if (isNum(p.value)) latestI = i; });
  // A week no line reaches: a value whose neighbours are both missing.
  const isolated = (i) => isNum(cur[i]?.value) && !isNum(cur[i - 1]?.value) && !isNum(cur[i + 1]?.value);

  const rowsAt = (i) => {
    const rows = [{ key: 'cur', label: 'This range', value: fmtUnit(cur[i]?.value, panel.unit), seriesClass: 'gt-series--1' }];
    if (prev) rows.push({ key: 'prev', label: 'Previous range', value: fmtUnit(prev[i]?.value, panel.unit), seriesClass: 'gt-series--gray' });
    return rows;
  };
  const showAt = (i) => { setHoverI(i); show(x(i), M.top, `Week ${i + 1} · ${fmtWeek((cur[i] || prev?.[i])?.weekStart)}`, rowsAt(i)); };
  const clear = () => { setHoverI(null); hide(); };
  const onMove = (e) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left - M.left) / iw) * (n - 1))));
    if (i !== hoverI) showAt(i);
  };

  return (
    <div className="gt-trend__panel">
      <span className="gt-trend__title">{panel.title}<span className="gt-trend__unit">{UNIT_SHORT[panel.unit] || panel.unit}</span></span>
      <div className="gt-plot" ref={ref} style={{ height }}>
        <svg className="gt-trend__svg" width={width} height={height} role="img" aria-label={`${panel.title}, ${n} complete weeks${latestI >= 0 ? `, latest ${fmtUnit(cur[latestI].value, panel.unit)}` : ''}${prev ? ', with the previous range in gray' : ''}`} onMouseMove={onMove} onMouseLeave={clear}>
          {ticks.map((t) => <line key={t} className="gt-trend__grid" x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} />)}
          <line className="gt-trend__axis" x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} />
          {Array.from({ length: n }).map((_, i) => (i === 0 || i === n - 1 ? <text key={i} className="gt-trend__tick" x={x(i)} y={height - 5} style={{ textAnchor: i === 0 ? 'start' : 'end' }}>{fmtWeek((cur[i] || prev?.[i])?.weekStart)}</text> : null))}
          {hoverI !== null && <line className="gt-trend__crosshair" x1={x(hoverI)} x2={x(hoverI)} y1={M.top} y2={M.top + ih} />}
          {prev && <path className="gt-trend__previous" d={path(prev)} />}
          <path className="gt-trend__current" d={path(cur)} />
          {cur.map((p, i) => ((i === latestI || isolated(i) || hoverI === i) && isNum(p.value) ? <circle key={i} className="gt-trend__marker" cx={x(i)} cy={y(p.value)} r={hoverI === i ? 5 : 4} /> : null))}
          {latestI >= 0 && (
            <text className="gt-trend__end-label" x={x(latestI) + (latestI >= n / 2 ? 2 : -2)} y={y(cur[latestI].value) - 8} style={{ textAnchor: latestI >= n / 2 ? 'end' : 'start' }}>{fmtUnit(cur[latestI].value, panel.unit)}</text>
          )}
          {Array.from({ length: n }).map((_, i) => (
            <rect key={i} className="gt-plot__hit" x={x(i) - (n > 1 ? iw / (n - 1) / 2 : iw / 2)} y={M.top} width={n > 1 ? iw / (n - 1) : iw} height={ih}
              tabIndex={0} role="button" aria-label={`Week ${i + 1}: ${rowsAt(i).map((r) => `${r.label} ${r.value}`).join(', ')}`} onFocus={() => showAt(i)} onBlur={clear} />
          ))}
        </svg>
        {tip && <ChartTooltip {...tip} />}
      </div>
    </div>
  );
}

/**
 * Small multiples (.gt-trend) — this range (green) with the previous range (gray)
 * as context, aligned by week index; null points leave gaps. Only COMPLETE weeks
 * are drawn (`completeWeeks(points, asOf)`); the week in progress appears once it
 * ends. `__marker` dots each week no line reaches and this range's latest week,
 * which `__end-label` labels. Three empty states: before the first rollup, no
 * complete week in range, no team activity. Footer: legend + "as of Oct 6, 2026".
 * `view="table"`: one row per complete week, one column per panel with its unit, "—" for a missing value.
 */
export function TrendLines({ panels = [], compare = true, asOf, height = 96, view = 'chart', emptyReason, className = '' }) {
  const complete = panels.map((p) => ({ ...p, current: completeWeeks(p.current || [], asOf), previous: p.previous ? completeWeeks(p.previous, asOf) : null }));
  let empty = emptyReason || null;
  if (!empty) {
    if (!asOf || !panels.length) empty = 'no_rollup';
    else if (complete.every((p) => p.current.length === 0)) empty = 'no_complete_week';
    else if (complete.every((p) => p.current.every((pt) => !isNum(pt.value) || pt.value === 0))) empty = 'no_activity';
  }
  if (empty) {
    return <div className="gt-trend__empty"><EmptyState variant="card" titleAs="p" icon={<AnalyticsIcon name="trending-up" size={18} />} title={EMPTY_COPY[empty] || empty} /></div>;
  }
  const anyPrev = compare && complete.some((p) => p.previous && p.previous.length);
  if (view === 'table') {
    const weeks = [...new Set(complete.flatMap((p) => p.current.map((pt) => pt.weekStart)))].sort();
    return (
      <div className="gt-chart-table__wrap">
        <table className="gt-chart-table">
          <caption className="gt-table__caption">Trends, week by week{anyPrev ? ', this range and the previous range' : ''}</caption>
          <thead><tr><th scope="col">Week</th>{complete.map((p) => <th key={p.key} scope="col" className="gt-table__num">{p.title} ({UNIT_SHORT[p.unit] || p.unit}){anyPrev && p.previous ? ' · this / previous' : ''}</th>)}</tr></thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w}><td>{fmtWeek(w)}</td>
                {complete.map((p) => {
                  const c = p.current.find((pt) => pt.weekStart === w);
                  const pv = anyPrev && p.previous ? p.previous[i] : null;
                  return <td key={p.key} className="gt-table__num">{fmtUnit(c?.value, p.unit)}{anyPrev && p.previous ? ` / ${fmtUnit(pv?.value, p.unit)}` : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className={['gt-trend', className].filter(Boolean).join(' ')}>
      <div className="gt-trend__panels" style={{ '--trend-cols': Math.min(complete.length, 4) }}>
        {complete.map((p) => <Panel key={p.key} panel={p} compare={compare} height={height} />)}
      </div>
      <div className="gt-trend__foot">
        <ChartLegend items={[
          { key: 'cur', label: 'This range', swatch: 'line', seriesClass: 'gt-series--1' },
          ...(anyPrev ? [{ key: 'prev', label: 'Previous range', swatch: 'line', seriesClass: 'gt-series--gray' }] : []),
        ]} />
        {asOf && <span className="gt-trend__asof">as of {fmtWeek(asOf, true)}</span>}
      </div>
    </div>
  );
}
