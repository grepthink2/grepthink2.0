import React from 'react';
import { Kbd, modKey } from './Kbd.jsx';

const SearchGlyph = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);

/**
 * Header affordance that opens the ⌘K palette. Same footprint as the old
 * `.app-header__search-bar` (250px, white, 2.61px shadow) but it is a button.
 */
export function SearchTrigger({ label = 'Search', onOpen, iconOnly = false, className = '', ...rest }) {
  const cls = ['gt-search-trigger', iconOnly ? 'gt-search-trigger--icon' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onOpen} aria-label={`${label} (${modKey()} K)`} aria-haspopup="dialog" {...rest}>
      <span className="gt-search-trigger__icon"><SearchGlyph /></span>
      <span className="gt-search-trigger__label">{label}</span>
      <span className="gt-search-trigger__keys"><Kbd keys={[modKey(), 'K']} /></span>
    </button>
  );
}

/* SearchField — the inline filter input — moved to components/primitives/SearchField.jsx
   in the alignment round (2026-10-19); import it from there. */
