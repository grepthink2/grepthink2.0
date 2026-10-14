import React from 'react';
import { ChartTooltip, useChartTip, useMeasure, niceScale } from './ChartTooltip.jsx';

const M = { top: 18, right: 6, bottom: 20, left: 6 }, COL = 22;
const shortLabel = (c) => (c.ordinal === 0 || /^backlog$/i.test(c.label) ? 'Backlog' : c.label.replace(/^Sprint\s+/i, 'S'));

function Panel({ panel, top, ticks, height, unitLabel }) {
  const [ref, width] = useMeasure(240);
  const { tip, show, hide } = useChartTip();
  const cols = panel.columns || [];
  const iw = Math.max(10, width - M.left - M.right);
  const ih = Math.max(10, height - M.top - M.bottom);
  const slot = cols.length ? iw / cols.length : iw;
  const y = (v) => M.top + ih - (v / top) * ih;
  return (
    <div className="gt-cols__panel">
      <div className="gt-cols__head">
        <span className="gt-cols__title">{panel.title}</span>
        <span className="gt-cols__meta">median <strong>{panel.overall?.median ?? '—'} {unitLabel}</strong>{panel.overall?.n !== undefined && <> · {panel.overall.n.toLocaleString('en-US')} {panel.noun || panel.title.toLowerCase()}</>}</span>
      </div>
      <div className="gt-plot" ref={ref} style={{ height }}>
        <svg className="gt-cols__svg" width={width} height={height} role="img" aria-label={`${panel.title}: ${cols.map((c) => `${c.label} median ${c.median}`).join(', ')}`} onMouseLeave={hide}>
          {ticks.map((t) => <line key={t} className="gt-cols__grid" x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} />)}
          <line className="gt-cols__axis" x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} />
          {cols.map((c, i) => {
            const cx = M.left + slot * i + slot / 2;
            const hgt = Math.max(2, (c.median / top) * ih);
            const yTop = M.top + ih - hgt;
            const r = Math.min(4, COL / 2, hgt);
            const rows = [{ label: 'Median', value: `${c.median} ${unitLabel}` }, { label: 'Items', value: c.n }];
            return (
              <g key={c.label}>
                <path className="gt-cols__bar gt-series--1" tabIndex={0} aria-label={`${c.label}: median ${c.median} ${unitLabel}, ${c.n} items`}
                  d={`M${cx - COL / 2},${M.top + ih} v${-(hgt - r)} a${r},${r} 0 0 1 ${r},${-r} h${COL - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${hgt - r} Z`}
                  onMouseEnter={() => show(cx, yTop, c.label, rows)} onFocus={() => show(cx, yTop, c.label, rows)} onBlur={hide} />
                <text className="gt-cols__cap" x={cx} y={yTop - 5}>{c.median}</text>
                <text className="gt-cols__tick" x={cx} y={height - 5}>{shortLabel(c)}</text>
              </g>
            );
          })}
        </svg>
        {tip && <ChartTooltip {...tip} />}
      </div>
    </div>
  );
}

/**
 * Characters per task / per story (.gt-cols) — two small multiples side by side,
 * one green series each, columns ≤ 24px with the median on each cap, a shared
 * y-scale so the panels compare. Columns are labelled "Backlog", "S1", "S2"….
 * `--stacked` (prop `stacked`, or automatic) is the one-column layout used when a
 * side-by-side panel cannot hold every median cap (< 36px per column).
 */
export function BarsBySprint({ panels = [], height = 130, unitLabel = 'chars', view = 'chart', stacked, className = '' }) {
  const [ref, width] = useMeasure(480);
  const maxV = Math.max(0, ...panels.flatMap((p) => (p.columns || []).map((c) => c.median)));
  const [top, ticks] = niceScale(maxV * 1.12, 3);
  const maxCols = Math.max(1, ...panels.map((p) => (p.columns || []).length));
  const perCol = panels.length ? ((width - 20 * (panels.length - 1)) / panels.length - M.left - M.right) / maxCols : width;
  const isStacked = stacked ?? perCol < 36;
  if (view === 'table') {
    const labels = panels[0]?.columns?.map((c) => c.label) || [];
    return (
      <div className="gt-chart-table__wrap">
        <table className="gt-chart-table">
          <caption className="gt-table__caption">Median characters per item, by sprint</caption>
          <thead><tr><th>Sprint</th>{panels.map((p) => <th key={p.key} className="gt-table__num">{p.title} · median {unitLabel} (n)</th>)}</tr></thead>
          <tbody>
            <tr><td>All sprints</td>{panels.map((p) => <td key={p.key} className="gt-table__num">{p.overall?.median ?? '—'} ({p.overall?.n ?? '—'})</td>)}</tr>
            {labels.map((l, i) => <tr key={l}><td>{l}</td>{panels.map((p) => <td key={p.key} className="gt-table__num">{p.columns[i]?.median ?? '—'} ({p.columns[i]?.n ?? '—'})</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div ref={ref} className={['gt-cols', isStacked ? 'gt-cols--stacked' : '', className].filter(Boolean).join(' ')}>
      {panels.map((p) => <Panel key={p.key} panel={p} top={top} ticks={ticks} height={height} unitLabel={unitLabel} />)}
    </div>
  );
}
