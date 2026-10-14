import React from 'react';
import { ChartTooltip, useChartTip, useMeasure, fmtCompact, niceScale } from './ChartTooltip.jsx';
import { ChartLegend } from './ChartLegend.jsx';

export const BOARD_STATUSES = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
];

const GAP = 2, R = 4;

/** Horizontal segment path: square left edge, 4px rounded right edge when `roundEnd`. */
function segPath(x, w, h, roundEnd) {
  if (w <= 0) return '';
  if (!roundEnd || w < R) return `M${x},0 h${w} v${h} h${-w} Z`;
  return `M${x},0 h${w - R} a${R},${R} 0 0 1 ${R},${R} v${h - 2 * R} a${R},${R} 0 0 1 ${-R},${R} h${-(w - R)} Z`;
}

/**
 * Live task snapshot by sprint (.gt-stack) — horizontal stacked bars, Backlog
 * first, labels "Backlog", "Sprint 1"… with "8 teams" meta under each. Colors
 * follow the board (.gt-status--todo gray · --in_progress blue · --done green)
 * and never change with the unit. Direct labels sit in the row's `__value`
 * column in text tokens (white on the blue segment is 4.29:1 — too low for
 * in-bar text); the table twin always exists. ≥ 8 rows ⇒ `--dense` + "Show all".
 */
export function StackedBars({ rows = [], unit = 'count', onRowClick, view = 'chart', dense, maxRows = 8, className = '' }) {
  const [ref, width] = useMeasure(480);
  const { tip, show, hide } = useChartTip();
  const [hidden, setHidden] = React.useState([]);
  const [all, setAll] = React.useState(false);
  const val = (seg) => (unit === 'points' ? seg.points : seg.count) || 0;
  const unitWord = unit === 'points' ? 'pts' : 'tasks';
  const isDense = dense ?? rows.length > 8;
  const shown = all || rows.length <= maxRows ? rows : rows.slice(0, maxRows);
  const rowTotal = (r) => r.segments.filter((s) => !hidden.includes(s.status)).reduce((a, s) => a + val(s), 0);
  const max = Math.max(0, ...rows.map(rowTotal));
  const [top, ticks] = niceScale(max, 4);
  const toggle = (k) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  const legend = BOARD_STATUSES.map((s) => ({ key: s.status, label: s.label, swatch: 'rect', seriesClass: `gt-status--${s.status}` }));
  const segOf = (r, status) => r.segments.find((x) => x.status === status);

  if (view === 'table') {
    return (
      <div className="gt-chart-table__wrap">
        <table className="gt-chart-table">
          <thead><tr><th>Sprint</th><th className="gt-table__num">Teams</th>{BOARD_STATUSES.map((s) => <th key={s.status} className="gt-table__num">{s.label} ({unitWord})</th>)}<th className="gt-table__num">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><td>{r.label}</td><td className="gt-table__num">{r.teams ?? '—'}</td>
                {BOARD_STATUSES.map((s) => { const seg = segOf(r, s.status); return <td key={s.status} className="gt-table__num">{seg ? fmtCompact(val(seg)) : '—'}</td>; })}
                <td className="gt-table__num">{fmtCompact(r.segments.reduce((a, s) => a + val(s), 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rowsFor = (r) => BOARD_STATUSES.map((s) => { const seg = segOf(r, s.status); return { key: s.status, label: s.label, value: `${fmtCompact(seg ? val(seg) : 0)} ${unitWord}`, seriesClass: `gt-status--${s.status}` }; });
  const plotLeft = () => (ref.current ? ref.current.offsetLeft : 148);

  return (
    <div className={['gt-stack', 'gt-plot', isDense ? 'gt-stack--dense' : '', className].filter(Boolean).join(' ')}>
      <div className="gt-stack__rows" role="list">
        {shown.map((r) => {
          const visibleSegs = BOARD_STATUSES.map((s) => segOf(r, s.status)).filter((s) => s && !hidden.includes(s.status) && val(s) > 0);
          let cursor = 0;
          const content = (
            <>
              <span className="gt-stack__meta">
                <span className="gt-stack__label">{r.label}</span>
                {r.teams !== undefined && <span className="gt-stack__teams">{r.teams} teams</span>}
              </span>
              <span ref={ref} style={{ minWidth: 0 }}>
                <svg className="gt-stack__bar" width={width} role="img" aria-label={`${r.label}: ${rowsFor(r).map((x) => `${x.label} ${x.value}`).join(', ')}`} onMouseLeave={hide}>
                  {visibleSegs.map((seg, i) => {
                    const w = top ? (val(seg) / top) * width - (i < visibleSegs.length - 1 ? GAP : 0) : 0;
                    const x = cursor; cursor += w + GAP;
                    const h = isDense ? 14 : 20;
                    return (
                      <path key={seg.status} className={`gt-stack__segment gt-status--${seg.status}`} d={segPath(x, Math.max(w, 2), h, i === visibleSegs.length - 1)} tabIndex={0}
                        aria-label={`${BOARD_STATUSES.find((b) => b.status === seg.status).label}: ${fmtCompact(val(seg))} ${unitWord}`}
                        onMouseEnter={() => show(plotLeft() + x + w / 2, 0, r.label, rowsFor(r))} onFocus={() => show(plotLeft() + x + w / 2, 0, r.label, rowsFor(r))} onBlur={hide} />
                    );
                  })}
                </svg>
              </span>
              <span className="gt-stack__value" aria-hidden="true">
                {BOARD_STATUSES.map((s) => { const seg = segOf(r, s.status); return <span key={s.status} className={`gt-status--${s.status}`}><i /><b style={{ fontWeight: 500 }}>{fmtCompact(seg ? val(seg) : 0)}</b></span>; })}
              </span>
            </>
          );
          return onRowClick ? (
            <button key={r.key} type="button" role="listitem" className="gt-stack__row gt-stack__button" onClick={() => onRowClick(r)}>{content}</button>
          ) : (
            <div key={r.key} role="listitem" className="gt-stack__row">{content}</div>
          );
        })}
      </div>
      <div className="gt-stack__axis" aria-hidden="true">{ticks.map((t) => <span key={t}>{fmtCompact(t)}</span>)}</div>
      <div className="gt-stack__legend">
        <ChartLegend items={legend} hidden={hidden} onToggle={toggle} />
        {rows.length > maxRows && <button type="button" className="gt-stack__more" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all (${rows.length})`}</button>}
      </div>
      {tip && <ChartTooltip {...tip} placement="below" x={tip.x} y={8} />}
    </div>
  );
}
