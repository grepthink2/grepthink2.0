import React from 'react';

/**
 * Segmented control for a measure swap (Tasks | Points). 28px tall, radius 7;
 * active = solid green. Arrow keys move the selection; each option carries aria-pressed.
 */
export function UnitToggle({
  value = 'count',
  onChange,
  options = [{ value: 'count', label: 'Tasks' }, { value: 'points', label: 'Points' }],
  ariaLabel = 'Measure',
  className = '',
}) {
  const refs = React.useRef([]);
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = options.length;
    const j = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
    onChange && onChange(options[j].value);
    refs.current[j] && refs.current[j].focus();
  };
  return (
    <div className={['gt-unit-toggle', className].filter(Boolean).join(' ')} role="group" aria-label={ariaLabel}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          className={['gt-unit-toggle__option', o.value === value ? 'gt-unit-toggle__option--active' : ''].filter(Boolean).join(' ')}
          aria-pressed={o.value === value}
          onClick={() => onChange && onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
