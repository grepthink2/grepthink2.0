import React from 'react';

const Check = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;

/**
 * Filter chip — narrows a list. sm 26px (palette scopes, schedule kinds), md 32px (analytics
 * range). Alone it is a pressed toggle (`aria-pressed`); inside a single-choice FilterChipGroup
 * it is a radio. Selected = solid green, white text (multi-choice chips also show a check). A space
 * before the count, so the name reads "TA meetings 3".
 */
export function FilterChip({
  children, selected = false, onClick, count, icon, size = 'md', kind = 'toggle', disabled = false, className = '', ...rest
}) {
  const radio = kind === 'radio';
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? selected : undefined}
      aria-pressed={radio ? undefined : selected}
      className={['gt-filter-chip', size === 'sm' ? 'gt-filter-chip--sm' : '', selected ? 'gt-filter-chip--selected' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {selected && !radio ? <span className="gt-filter-chip__icon"><Check /></span> : icon && <span className="gt-filter-chip__icon" aria-hidden="true">{icon}</span>}
      {children}
      {count != null && <> <span className="gt-filter-chip__count">{count}</span></>}
    </button>
  );
}

/**
 * A row of FilterChips. `type="single"`: a radio group (one choice, arrow keys move and select,
 * one tab stop; pressing the checked chip, or arrowing back onto it, reports no change, as with
 * native radios). `type="multi"`: a group of pressed toggles, each in the tab order.
 */
export function FilterChipGroup({ type = 'multi', ariaLabel, options = [], value, onChange, size = 'md', className = '' }) {
  const rootRef = React.useRef(null);
  const single = type === 'single';
  const selected = single ? [value] : (Array.isArray(value) ? value : []);
  const enabled = options.filter((o) => !o.disabled);
  const onKeyDown = (e, opt) => {
    if (!single) return;
    const i = enabled.findIndex((o) => o.value === opt.value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(i + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    const el = rootRef.current && rootRef.current.querySelector(`[data-value="${String(next.value).replace(/"/g, '\\"')}"]`);
    if (el) el.focus();
    if (onChange && next.value !== value) onChange(next.value);
  };
  const hasSel = options.some((o) => selected.includes(o.value) && !o.disabled);
  return (
    <div ref={rootRef} className={['gt-filter-chips', className].filter(Boolean).join(' ')} role={single ? 'radiogroup' : 'group'} aria-label={ariaLabel}>
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <FilterChip
            key={opt.value}
            data-value={opt.value}
            kind={single ? 'radio' : 'toggle'}
            size={size}
            selected={on}
            count={opt.count}
            icon={opt.icon}
            disabled={opt.disabled}
            title={opt.title}
            tabIndex={single ? (on || (!hasSel && opt === enabled[0]) ? 0 : -1) : undefined}
            onKeyDown={(e) => onKeyDown(e, opt)}
            onClick={() => {
              if (!onChange) return;
              if (single) { if (!on) onChange(opt.value); }
              else onChange(on ? selected.filter((v) => v !== opt.value) : [...selected, opt.value]);
            }}
          >
            {opt.label}
          </FilterChip>
        );
      })}
    </div>
  );
}
