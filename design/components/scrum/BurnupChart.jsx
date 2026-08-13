import React from 'react';

/**
 * Burnup chart — completed points (green line + soft area) climbing
 * toward total scope (dashed gray line, steps when scope changes).
 * Works per-sprint (days) or cumulatively (sprints) via `labels`.
 */
export function BurnupChart({
  labels = [],
  scope = [],
  completed = [],
  height = 150,
  title,
  subtitle,
  className = '',
}) {
  const W = 100, H = 100;
  const n = Math.max(labels.length, scope.length, completed.length);
  const maxY = Math.max(...scope, ...completed, 1);
  const x = (i) => (n > 1 ? (i / (n - 1)) * W : 0);
  const y = (v) => H - (v / maxY) * H;
  const pts = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const done = completed[completed.length - 1] ?? 0;
  const total = scope[scope.length - 1] ?? 0;

  return (
    <div className={['gt-burnup', className].filter(Boolean).join(' ')}>
      {(title || subtitle) && (
        <div className="gt-burnup__head">
          <div>
            {title && <span className="gt-burnup__title">{title}</span>}
            {subtitle && <span className="gt-burnup__subtitle">{subtitle}</span>}
          </div>
          <span className="gt-burnup__stat"><strong>{done}</strong>/{total} pts</span>
        </div>
      )}
      <svg
        className="gt-burnup__plot"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={`Burnup: ${done} of ${total} points complete`}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="gt-burnup__grid" vectorEffect="non-scaling-stroke" />
        ))}
        <polygon points={`0,${H} ${pts(completed)} ${x(completed.length - 1)},${H}`} className="gt-burnup__area" />
        <polyline points={pts(scope)} className="gt-burnup__scope" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(completed)} className="gt-burnup__line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="gt-burnup__axis">
        {labels.map((l) => <span key={l}>{l}</span>)}
      </div>
      <div className="gt-burnup__legend">
        <span><i className="gt-burnup__swatch gt-burnup__swatch--done" /> Completed</span>
        <span><i className="gt-burnup__swatch gt-burnup__swatch--scope" /> Scope</span>
      </div>
    </div>
  );
}
