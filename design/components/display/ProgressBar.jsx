import React from 'react';

/**
 * Progress / meter bar. Green fill by default; `showLabel` adds a % readout.
 * `inline`: the 4px bar for table cells, story cards and the sprint picker — mark it
 * `decorative` when the number is printed beside it. `meter` for a measurement
 * (contribution share) rather than progress toward done. `aria-valuenow` is the value clamped
 * to 0…max without rounding; a value that isn't a number counts as 0.
 */
export function ProgressBar({
  value = 0, max = 100, tone = 'primary', size = 'md', showLabel = false, label, valueText,
  inline = false, decorative = false, meter = false, className = '',
}) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const now = Math.max(0, Math.min(max, n));
  const pct = Math.max(0, Math.min(100, (n / (max || 1)) * 100));
  const track = (
    <div
      className="gt-progress__track"
      role={decorative ? undefined : meter ? 'meter' : 'progressbar'}
      aria-valuenow={decorative ? undefined : now}
      aria-valuemin={decorative ? undefined : 0}
      aria-valuemax={decorative ? undefined : max}
      aria-valuetext={decorative ? undefined : valueText}
      aria-label={decorative ? undefined : (label || 'Progress')}
      aria-hidden={decorative || undefined}
    >
      <div className={`gt-progress__fill gt-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
  if (inline) return <div className={['gt-progress', 'gt-progress--inline', className].filter(Boolean).join(' ')}>{track}</div>;
  return (
    <div className={['gt-progress', `gt-progress--${size}`, className].filter(Boolean).join(' ')}>
      {(label || showLabel) && (
        <div className="gt-progress__head" aria-hidden="true">
          {label && <span className="gt-progress__label">{label}</span>}
          {showLabel && <span className="gt-progress__pct">{Math.round(pct)}%</span>}
        </div>
      )}
      {track}
    </div>
  );
}
