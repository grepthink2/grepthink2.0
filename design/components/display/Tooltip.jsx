import React from 'react';

/**
 * Tooltip on hover/focus. Dark bubble, small and quiet.
 * Wraps its child in a span trigger; position via `side`.
 */
export function Tooltip({ content, side = 'top', children, className = '' }) {
  const id = React.useId();
  return (
    <span className={['gt-tooltip', className].filter(Boolean).join(' ')}>
      <span className="gt-tooltip__trigger" tabIndex={0} aria-describedby={id}>
        {children}
      </span>
      <span className={`gt-tooltip__bubble gt-tooltip__bubble--${side}`} role="tooltip" id={id}>
        {content}
      </span>
    </span>
  );
}
