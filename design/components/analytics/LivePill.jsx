import React from 'react';

/** Marks a card that ignores the date range — the board as it is right now. No pulsing. */
export function LivePill({ label = 'Live', title = 'Shows the board as it is right now; the date range does not apply', className = '' }) {
  return (
    <span className={['gt-live-pill', className].filter(Boolean).join(' ')} title={title}>
      <span className="gt-live-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
