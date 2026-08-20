import React from 'react';

/** Token palette used by both charts — mirror this in recharts props. */
export const CHART_COLORS = ['#018156', '#2771FF', '#54B999', '#B26A00', '#7D3C98', '#8A8A8A'];

/**
 * Donut/pie chart themed to the tokens. Lightweight SVG stand-in for
 * the app's recharts <PieChart>; production code should pass the same
 * data shape and CHART_COLORS to recharts.
 */
export function PieChartCard({ data = [], size = 140, donut = true, showLegend = true, className = '' }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2;
  const inner = donut ? r * 0.62 : 0;
  let angle = -Math.PI / 2;

  const arcs = data.map((d, i) => {
    const frac = d.value / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = r + r * Math.cos(a0), y0 = r + r * Math.sin(a0);
    const x1 = r + r * Math.cos(a1), y1 = r + r * Math.sin(a1);
    const xi0 = r + inner * Math.cos(a1), yi0 = r + inner * Math.sin(a1);
    const xi1 = r + inner * Math.cos(a0), yi1 = r + inner * Math.sin(a0);
    const path = donut
      ? `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`
      : `M ${r} ${r} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    return { path, color: d.color || CHART_COLORS[i % CHART_COLORS.length], name: d.name, value: d.value };
  });

  return (
    <div className={['gt-chart', className].filter(Boolean).join(' ')}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Pie chart">
        {arcs.map((a) => <path key={a.name} d={a.path} fill={a.color} stroke="#fff" strokeWidth="1.5" />)}
      </svg>
      {showLegend && (
        <ul className="gt-chart__legend">
          {arcs.map((a) => (
            <li key={a.name} className="gt-chart__legend-item">
              <span className="gt-chart__swatch" style={{ backgroundColor: a.color }} />
              <span className="gt-chart__legend-name">{a.name}</span>
              <span className="gt-chart__legend-value">{Math.round((a.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Vertical bar chart themed to the tokens. Stand-in for recharts <BarChart>.
 */
export function BarChartCard({ data = [], height = 140, color = '#018156', showValues = true, className = '' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={['gt-chart gt-chart--bars', className].filter(Boolean).join(' ')}>
      <div className="gt-chart__bars" style={{ height }}>
        {data.map((d) => (
          <div key={d.name} className="gt-chart__bar-col">
            {showValues && <span className="gt-chart__bar-value">{d.value}</span>}
            <div
              className="gt-chart__bar"
              style={{ height: `${(d.value / max) * 100}%`, backgroundColor: d.color || color }}
              role="img"
              aria-label={`${d.name}: ${d.value}`}
            />
            <span className="gt-chart__bar-label">{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
