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

/**
 * The one local filter input (roster, member manager, project assign,
 * conversation list…). Debounce in the caller; this is presentational.
 */
export function SearchField({ value = '', onChange, placeholder = 'Search…', ariaLabel, size = 'md', fullWidth = false, disabled = false, onClear, className = '', ...rest }) {
  const cls = ['gt-search-field', size === 'sm' ? 'gt-search-field--sm' : '', fullWidth ? 'gt-search-field--full' : '', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <span className="gt-search-field__icon"><SearchGlyph size={15} /></span>
      <input
        type="search"
        className="gt-search-field__input"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        {...rest}
      />
      {value && !disabled && (
        <button type="button" className="gt-search-field__clear" aria-label="Clear search" onClick={() => { onChange && onChange(''); onClear && onClear(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  );
}
