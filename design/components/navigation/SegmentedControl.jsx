import React from 'react';

/**
 * Segmented control — pill container with sliding selected segment.
 * For small view switches (e.g. Table/Cards, Week/Month).
 */
export function SegmentedControl({ options = [], value, onChange, size = 'md', className = '' }) {
  return (
    <div className={['gt-segmented', `gt-segmented--${size}`, className].filter(Boolean).join(' ')} role="radiogroup">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={['gt-segmented__option', active ? 'gt-segmented__option--active' : ''].filter(Boolean).join(' ')}
            onClick={() => onChange && onChange(opt.value)}
            disabled={opt.disabled}
          >
            {opt.icon && <span className="gt-segmented__icon">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
