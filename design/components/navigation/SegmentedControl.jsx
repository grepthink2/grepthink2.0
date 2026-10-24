import React from 'react';

/**
 * Segmented control — switches the view or unit of the same content (Table / Cards,
 * Tasks / Points, Week / Month). WAI-ARIA radio group: roving tabindex, arrow keys (and Home /
 * End) move and select; pressing the checked option, or arrowing back onto it, reports no change,
 * as with native radios. Sizes to its options; full width on phones or with `fullWidth`.
 */
export function SegmentedControl({ options = [], value, onChange, ariaLabel, size = 'md', fullWidth = false, className = '' }) {
  const refs = React.useRef({});
  const enabled = options.filter((o) => !o.disabled);
  const hasSelection = options.some((o) => o.value === value && !o.disabled);
  const onKeyDown = (e, opt) => {
    const i = enabled.findIndex((o) => o.value === opt.value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(i + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    if (refs.current[next.value]) refs.current[next.value].focus();
    if (onChange && next.value !== value) onChange(next.value);
  };
  return (
    <div
      className={['gt-segmented', `gt-segmented--${size}`, fullWidth ? 'gt-segmented--full' : '', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => { refs.current[opt.value] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            tabIndex={active || (!hasSelection && opt === enabled[0]) ? 0 : -1}
            className={['gt-segmented__option', active ? 'gt-segmented__option--active' : ''].filter(Boolean).join(' ')}
            onClick={() => { if (!active && onChange) onChange(opt.value); }}
            onKeyDown={(e) => onKeyDown(e, opt)}
            disabled={opt.disabled}
          >
            {opt.icon && <span className="gt-segmented__icon" aria-hidden="true">{opt.icon}</span>}
            {opt.label}
            {opt.count != null && <span className="gt-segmented__count">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
