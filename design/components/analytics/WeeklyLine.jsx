import React from 'react';
import { ChartTooltip, useChartTip, useMeasure, fmtCompact, fmtWeek, niceScale } from './ChartTooltip.jsx';
import { ChartLegend } from './ChartLegend.jsx';

const M = { top: 14, right: 52, bottom: 26, left: 40 };

/**
 * Weekly line chart (.gt-line), one or two series. Series 1 = green with a 10%
 * wash, series 2 = blue without. Hairline solid gridlines; markers r4 (8px) with
 * a 2px white ring; end-labelled last points; crosshair snapping to the nearest
 * week with one tooltip listing every series; per-week focusable hit columns.
 * `view="table"` renders the three-column week table (Week · series…).
 */
export function WeeklyLine({ series = [], height = 200, ariaLabel, view = 'chart', valueFormat = fmtCompact, className = '' }) {
  const [ref, width] = useMeasure();
  const { tip, show, hide } = useChartTip();
  const [hidden, setHidden] = React.useState([]);
  const [hoverI, setHoverI] = React.useState(null);

  const visible = series.filter((s) => !hidden.includes(s.key));
  const weeks = (series[0]?.points || []).map((p) => p.weekStart);
  const n = weeks.length;
  const maxV = Math.max(0, ...visible.flatMap((s) => s.points.map((p) => p.value ?? 0)));
  const [top, ticks] = niceScale(maxV, 5);
  const iw = Math.max(10, width - M.left - M.right);
  const ih = Math.max(10, height - M.top - M.bottom);
  const x = (i) => M.left + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v) => M.top + ih - (v / top) * ih;
  const cls = (si) => `gt-series--${si + 1}`;

  const legend = series.map((s, i) => ({ key: s.key, label: s.label, swatch: 'line', seriesClass: cls(i) }));
  const toggle = (k) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));

  if (view === 'table') {
    return (
      <div className="gt-chart-table__wrap">
        <table className="gt-chart-table">
          <thead><tr><th>Week</th>{series.map((s) => <th key={s.key} className="gt-table__num">{s.label}</th>)}</tr></thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w}><td>{fmtWeek(w)}</td>{series.map((s) => <td key={s.key} className="gt-table__num">{valueFormat(s.points[i]?.value)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rowsAt = (i) => visible.map((s) => ({ key: s.key, label: s.label, value: valueFormat(s.points[i]?.value), seriesClass: cls(series.indexOf(s)) }));
  const showAt = (i) => { setHoverI(i); show(x(i), M.top, `Week of ${fmtWeek(weeks[i])}`, rowsAt(i)); };
  const clear = () => { setHoverI(null); hide(); };
  const onMove = (e) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left - M.left) / iw) * (n - 1))));
    if (i !== hoverI) showAt(i);
  };
  const path = (s) => s.points.reduce((acc, p, i, arr) => {
    if (p.value === null || p.value === undefined) return acc;
    const prevOk = i > 0 && arr[i - 1].value !== null && arr[i - 1].value !== undefined;
    return `${acc}${prevOk ? ' L' : ' M'}${x(i)},${y(p.value)}`;
  }, '').trim();
  const lastIdx = (s) => s.points.map((p, i) => (p.value === null || p.value === undefined ? -1 : i)).filter((i) => i >= 0).pop();

  return (
    <div className={['gt-line', className].filter(Boolean).join(' ')}>
      <div className="gt-plot" ref={ref} style={{ height }}>
        <svg className="gt-line__svg" width={width} height={height} role="img" aria-label={ariaLabel || `${series.map((s) => s.label).join(' and ')} per week`} onMouseMove={onMove} onMouseLeave={clear}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gt-line__grid" x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} />
              <text className="gt-line__tick gt-plot__tick--y" x={M.left - 8} y={y(t) + 4}>{valueFormat(t)}</text>
            </g>
          ))}
          <line className="gt-line__axis" x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} />
          {weeks.map((w, i) => <text key={w} className="gt-line__tick gt-plot__tick--x" x={x(i)} y={height - 8}>{fmtWeek(w)}</text>)}
          {hoverI !== null && <line className="gt-line__crosshair" x1={x(hoverI)} x2={x(hoverI)} y1={M.top} y2={M.top + ih} />}
          {series.map((s, si) => {
            if (hidden.includes(s.key)) return null;
            const d = path(s), li = lastIdx(s);
            return (
              <g key={s.key} className={cls(si)}>
                {si === 0 && d && li !== undefined && <path className="gt-line__area" d={`${d} L${x(li)},${y(0)} L${x(0)},${y(0)} Z`} />}
                <path className="gt-line__path" d={d} />
                {s.points.map((p, i) => (p.value === null || p.value === undefined ? null : (
                  <circle key={i} className={['gt-line__marker', hoverI === i ? 'gt-line__marker--hot' : ''].filter(Boolean).join(' ')} cx={x(i)} cy={y(p.value)} r={hoverI === i ? 5 : 4} />
                )))}
                {li !== undefined && <text className="gt-line__end-label" x={x(li) + 9} y={y(s.points[li].value) + 4}>{valueFormat(s.points[li].value)}</text>}
              </g>
            );
          })}
          {weeks.map((w, i) => (
            <g key={`hit-${w}`}>
              <rect className="gt-plot__hit" x={x(i) - (n > 1 ? iw / (n - 1) / 2 : iw / 2)} y={M.top} width={n > 1 ? iw / (n - 1) : iw} height={ih}
                tabIndex={0} role="button" aria-label={`Week of ${fmtWeek(w)}: ${rowsAt(i).map((r) => `${r.label} ${r.value}`).join(', ')}`}
                onFocus={() => showAt(i)} onBlur={clear} />
              {hoverI === i && <circle className="gt-plot__focus" cx={x(i)} cy={M.top + ih} r={5} />}
            </g>
          ))}
        </svg>
        {tip && <ChartTooltip {...tip} />}
      </div>
      {series.length > 1 && <ChartLegend items={legend} hidden={hidden} onToggle={toggle} />}
    </div>
  );
}
