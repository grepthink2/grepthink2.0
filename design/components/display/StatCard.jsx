import React from 'react';
import { InfoPopover } from './InfoPopover.jsx';

const fmtCompact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
};
const fmtValue = (v, format) => (format === 'percent' ? `${Math.round(v * 100)}%` : format === 'compact' && typeof v === 'number' ? fmtCompact(v) : v);
const Trend = ({ dir }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'flat' ? <path d="M5 12h14" /> : dir === 'up' ? <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></> : <><path d="m22 17-8.5-8.5-5 5L2 7" /><path d="M16 17h6v-6" /></>}
  </svg>
);

/**
 * Metric card — one component for the Dashboard (DashboardMetricCard) and the analytics tiles
 * (`compact`; the StatTile alias left 2026-10-22). Uppercase label (+ an InfoPopover ⓘ via `info`), big value, tinted icon chip,
 * hint; optional `delta` (good / bad / flat against `goodWhenUp`; the tone follows the rounded
 * figure, so there is no green "0%") and a 2–12 point `trend` sparkline, decorative since the
 * figures are in the text. `failed` or a null value shows "—"; `loading` a skeleton. A clickable
 * card is a stretched button under the content, so the ⓘ stays its own control.
 */
export function StatCard({
  label, value, hint, icon = null, accent = 'primary', format = 'raw', delta, trend, info,
  failed = false, loading = false, compact = false, onClick, className = '', ...rest
}) {
  const isNull = failed || value === null || value === undefined;
  const shownHint = failed ? (hint || 'Could not load') : hint;
  const shown = isNull ? '—' : fmtValue(value, format);

  let deltaNode = null;
  if (!failed && !loading && delta && delta.value !== null && delta.value !== undefined) {
    const pct = Math.round(delta.value * 100);
    const up = pct > 0; const flat = pct === 0;
    const good = flat ? null : (delta.goodWhenUp !== false ? up : !up);
    deltaNode = (
      <span className={`gt-stat-card__delta gt-stat-card__delta--${flat ? 'flat' : good ? 'good' : 'bad'}`}>
        <Trend dir={flat ? 'flat' : up ? 'up' : 'down'} />
        <span className="gt-stat-card__delta-value">{`${pct > 0 ? '+' : ''}${pct}%`}</span>
        {delta.vsLabel && <span className="gt-stat-card__delta-vs">{delta.vsLabel}</span>}
      </span>
    );
  }
  let trendNode = null;
  if (!failed && !loading && Array.isArray(trend) && trend.length > 1) {
    const W = 84; const H = 24; const pad = 3;
    const max = Math.max(...trend, 1); const min = Math.min(...trend, 0);
    const x = (i) => pad + (i / (trend.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const last = trend.length - 1;
    trendNode = (
      <svg className="gt-stat-card__spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <path d={trend.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} className="gt-stat-card__spark-line" />
        <circle cx={x(last)} cy={y(trend[last])} r="3.5" className="gt-stat-card__spark-dot" />
      </svg>
    );
  }

  return (
    <div
      className={['gt-stat-card', `gt-stat-card--${accent}`, compact ? 'gt-stat-card--compact' : '', onClick ? 'gt-stat-card--clickable' : '', className].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
      {...rest}
    >
      {onClick && <button type="button" className="gt-stat-card__hit" onClick={onClick} aria-label={`${label}: ${shown}`} />}
      <div className="gt-stat-card__top">
        <span className="gt-stat-card__label-row">
          <span className="gt-stat-card__label">{label}</span>
          {info && <InfoPopover title={info.title || label} body={info.body} learnMoreHref={info.learnMoreHref} label={`About ${typeof label === 'string' ? label.toLowerCase() : 'this metric'}`} />}
        </span>
        {icon && <span className="gt-stat-card__icon" aria-hidden="true">{icon}</span>}
      </div>
      <span className={['gt-stat-card__value', isNull && !loading ? 'gt-stat-card__null' : ''].filter(Boolean).join(' ')}>
        {loading ? <span className="gt-skeleton" /> : shown}
      </span>
      {(deltaNode || trendNode || shownHint) && (
        <div className="gt-stat-card__bottom">
          <span className="gt-stat-card__meta">
            {deltaNode}
            {shownHint && <span className="gt-stat-card__hint">{shownHint}</span>}
          </span>
          {trendNode}
        </div>
      )}
    </div>
  );
}
