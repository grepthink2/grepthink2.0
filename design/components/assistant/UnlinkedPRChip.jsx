import React from 'react';

/**
 * Pill for a pull request that has no task on the board.
 * surface: 'app' (dashed hairline) · 'landing' (floating shadow) · 'bare' (no chrome — for embedding in a StageCard).
 */
export function UnlinkedPRChip({ pr = 'PR #44', onAdd, addLabel = 'Add task', surface = 'app', className = '', style }) {
  return (
    <span style={style} className={['gt-asst-unlinked', `gt-asst-unlinked--${surface}`, className].filter(Boolean).join(' ')}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2.5" />
        <path d="M6 9v6a3 3 0 003 3h6M18 15V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <b>{pr}</b> isn't on the board ·
      <button type="button" className="gt-asst__link" onClick={onAdd}>{addLabel}</button>
    </span>
  );
}
