import React from 'react';

/**
 * Removable tag chip (skills, filters). Square-ish corners vs Badge's pill.
 */
export function Tag({ children, onRemove, tone = 'neutral', className = '', ...rest }) {
  return (
    <span className={['gt-tag', `gt-tag--${tone}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
      {onRemove && (
        <button type="button" className="gt-tag__remove" aria-label={`Remove ${typeof children === 'string' ? children : 'tag'}`} onClick={onRemove}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
