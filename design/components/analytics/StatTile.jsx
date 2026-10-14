import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';
import { fmtCompact, fmtDelta, fmtPct } from './ChartTooltip.jsx';

/**
 * KPI tile — the app's DashboardMetricCard (.metric-card ≙ .gt-stat-card) with two
 * optional slots: `delta` (__delta --good/--bad/--flat, __delta-value, __delta-vs)
 * and `trend` (__spark: gray history line, green last point with a white ring).
 * Sparklines may hold 2–12 points; fewer than 2 renders no sparkline.
 * Proportional figures; a null value renders "—" with the hint explaining why;
 * `failed` (the tile's source is listed in `failures`) renders "—" + "Could not load".
 */
export function StatTile({
  label,
  value,
  format = 'compact',
  icon = null,
  accent = 'primary',
  delta,
  trend,
  hint,
  failed = false,
  loading = false,
  onClick,
  className = '',
  ...rest
}) {
  const El = onClick ? 'button' : 'div';
  const isNull = failed || value === null || value === undefined;
  const shownHint = failed ? (hint || 'Could not load') : hint;
  const shown = isNull ? '—' : format === 'percent' ? fmtPct(value) : format === 'raw' ? value : fmtCompact(value);

  let deltaNode = null;
  if (!failed && delta && delta.value !== null && delta.value !== undefined) {
    const up = delta.value > 0, flat = delta.value === 0;
    const good = flat ? null : (delta.goodWhenUp !== false ? up : !up);
    const tone = flat ? 'flat' : good ? 'good' : 'bad';
    deltaNode = (
      <span className={`gt-stat-card__delta gt-stat-card__delta--${tone}`}>
        <AnalyticsIcon name={flat ? 'minus' : up ? 'trending-up' : 'trending-down'} size={12} />
        <span className="gt-stat-card__delta-value">{fmtDelta(delta.value)}</span>
        {delta.vsLabel && <span className="gt-stat-card__delta-vs">{delta.vsLabel}</span>}
      </span>
    );
  }

  let trendNode = null;
  if (!failed && Array.isArray(trend) && trend.length > 1) {
    const W = 84, H = 24, pad = 3;
    const max = Math.max(...trend, 1), min = Math.min(...trend, 0);
    const x = (i) => pad + (i / (trend.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const d = trend.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = trend.length - 1;
    trendNode = (
      <svg className="gt-stat-card__spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${trend.length}-week trend, latest ${fmtCompact(trend[last])}`}>
        <path d={d} className="gt-stat-card__spark-line" />
        <circle cx={x(last)} cy={y(trend[last])} r="3.5" className="gt-stat-card__spark-dot" />
      </svg>
    );
  }

  return (
    <El
      className={['gt-stat-card', 'gt-stat-card--tile', `gt-stat-card--${accent}`, onClick ? 'gt-stat-card--clickable' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      <div className="gt-stat-card__top">
        <span className="gt-stat-card__label">{label}</span>
        {icon && <span className="gt-stat-card__icon">{icon}</span>}
      </div>
      <span className={['gt-stat-card__value', isNull ? 'gt-stat-card__null' : ''].filter(Boolean).join(' ')}>
        {loading ? <span className="gt-skeleton" /> : shown}
      </span>
      {(deltaNode || trendNode || shownHint) && (
        <div className="gt-stat-card__bottom">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {!loading && deltaNode}
            {shownHint && <span className="gt-stat-card__hint">{shownHint}</span>}
          </span>
          {!loading && trendNode}
        </div>
      )}
    </El>
  );
}
