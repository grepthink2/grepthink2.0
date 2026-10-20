import React from 'react';

const SearchGlyph = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
);

/**
 * The one local filter input (roster, member manager, project assign, conversation list…),
 * promoted from the search layer. A visually hidden label names it — never the placeholder.
 * Debounce in the caller; this is presentational.
 */
export function SearchField({
  id, value = '', onChange, label = 'Search', placeholder = 'Search…', compact = false, fullWidth = false,
  disabled = false, onClear, className = '', ...rest
}) {
  const reactId = React.useId();
  const inputId = id || reactId;
  const ref = React.useRef(null);
  const cls = ['gt-search-field', compact ? 'gt-search-field--compact' : '', fullWidth ? 'gt-search-field--full' : '', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="search">
      <label className="gt-visually-hidden" htmlFor={inputId}>{label}</label>
      <span className="gt-search-field__icon"><SearchGlyph /></span>
      <input
        ref={ref}
        id={inputId}
        type="search"
        className="gt-search-field__input"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        {...rest}
      />
      {value && !disabled && (
        <button type="button" className="gt-search-field__clear" aria-label="Clear search"
          onClick={() => { if (onClear) onClear(); else if (onChange) onChange(''); if (ref.current) ref.current.focus(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}
