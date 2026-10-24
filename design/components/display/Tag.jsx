import React from 'react';

/**
 * Chip for a picked value (skills, Combobox chips). Square-ish corners vs Badge's pill.
 * The remove × is a real button ("Remove {name}"), reachable by Tab.
 */
export function Tag({ children, onRemove, removeLabel, tone = 'neutral', className = '', ...rest }) {
  const name = removeLabel || `Remove ${typeof children === 'string' ? children : 'tag'}`;
  return (
    <span className={['gt-tag', `gt-tag--${tone}`, onRemove ? 'gt-tag--removable' : '', className].filter(Boolean).join(' ')} {...rest}>
      <span className="gt-tag__text">{children}</span>
      {onRemove && (
        <button type="button" className="gt-tag__remove" aria-label={name} onClick={onRemove}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
        </button>
      )}
    </span>
  );
}
