import React from 'react';

/**
 * Progress bar. Green fill by default; `showLabel` adds a % readout.
 * Used for contribution percentages and completion meters.
 */
export function ProgressBar({
  value = 0,
  max = 100,
  tone = 'primary',
  size = 'md',
  showLabel = false,
  label,
  className = '',
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={['gt-progress', `gt-progress--${size}`, className].filter(Boolean).join(' ')}>
      {(label || showLabel) && (
        <div className="gt-progress__head">
          {label && <span className="gt-progress__label">{label}</span>}
          {showLabel && <span className="gt-progress__pct">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        className="gt-progress__track"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || 'progress'}
      >
        <div className={`gt-progress__fill gt-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
