import React from 'react';

/** Spinning ring — the one loading indicator (14 / 16 / 20 / 24). */
export function Spinner({ size = 16, label = 'Loading', decorative = false, className = '' }) {
  const ring = <span className={['gt-spinner', `gt-spinner--${size}`, decorative ? className : ''].filter(Boolean).join(' ')} aria-hidden="true" />;
  if (decorative) return ring;
  return (
    <span className={['gt-spinner-wrap', className].filter(Boolean).join(' ')} role="status">
      {ring}
      <span className="gt-visually-hidden">{label}</span>
    </span>
  );
}
