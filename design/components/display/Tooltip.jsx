import React from 'react';

/**
 * Hover / focus tooltip: a dark bubble, small and quiet, shown at once by CSS instead of after
 * the browser's `title` delay. `focusable={false}` when the trigger sits inside another control
 * (the codebase's addition) — the bubble then shows when that control has keyboard focus.
 * Short one-line labels only; explanations are InfoPopovers.
 */
export function Tooltip({ content, side = 'top', focusable = true, children, className = '' }) {
  const id = React.useId();
  return (
    <span className={['gt-tooltip', className].filter(Boolean).join(' ')}>
      <span className="gt-tooltip__trigger" tabIndex={focusable ? 0 : undefined} aria-describedby={id}>{children}</span>
      <span className={`gt-tooltip__bubble gt-tooltip__bubble--${side}`} role="tooltip" id={id}>{content}</span>
    </span>
  );
}
