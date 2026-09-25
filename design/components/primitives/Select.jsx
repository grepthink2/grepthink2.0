import React from 'react';

/**
 * Native-select dropdown styled to match GrepThink fields.
 * Pass `options` as {value,label} or use children for full control.
 */
export function Select({
  id,
  label,
  value,
  onChange,
  options = [],
  placeholder,
  helperText,
  error,
  disabled = false,
  required = false,
  children,
  className = '',
  ...rest
}) {
  const reactId = React.useId();
  const inputId = id || reactId;

  return (
    <div className={['gt-field', error ? 'gt-field--error' : '', disabled ? 'gt-field--disabled' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="gt-field__label" htmlFor={inputId}>
          {label}
          {required && <span className="gt-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className="gt-select">
        <select
          id={inputId}
          className="gt-select__control"
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {children ||
            options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
        <svg className="gt-select__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {error ? (
        <p className="gt-field__error">{error}</p>
      ) : helperText ? (
        <p className="gt-field__help">{helperText}</p>
      ) : null}
    </div>
  );
}
