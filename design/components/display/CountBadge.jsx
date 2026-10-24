import React from 'react';

/** Neutral count pill — tab counts, list totals. Unread items use UnreadBadge. */
export function CountBadge({ count = 0, max = 99, label, showZero = true, className = '' }) {
  if (!showZero && !count) return null;
  const shown = count > max ? `${max}+` : count;
  return (
    <span className={['gt-count', className].filter(Boolean).join(' ')}>
      {label ? <><span aria-hidden="true">{shown}</span><span className="gt-visually-hidden">{label}</span></> : shown}
    </span>
  );
}
