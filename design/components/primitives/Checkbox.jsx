import React from 'react';

/**
 * Checkbox with label. Custom-drawn box, green when checked,
 * accent-blue focus ring, indeterminate support.
 */
export function Checkbox({
  id,
  label,
  checked = false,
  onChange,
  disabled = false,
  indeterminate = false,
  description,
  className = '',
  ...rest
}) {
  const reactId = React.useId();
  const inputId = id || reactId;
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={['gt-check', disabled ? 'gt-check--disabled' : '', className].filter(Boolean).join(' ')} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="gt-check__input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <span className="gt-check__box" aria-hidden="true">
        <svg className="gt-check__mark" width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="gt-check__dash" />
      </span>
      {(label || description) && (
        <span className="gt-check__text">
          {label && <span className="gt-check__label">{label}</span>}
          {description && <span className="gt-check__desc">{description}</span>}
        </span>
      )}
    </label>
  );
}
