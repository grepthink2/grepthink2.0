import React from 'react';

/**
 * Text input field with label, helper/error text, and optional icon/prefix slots.
 * Focus shows the accent-blue ring; `error` swaps to the error treatment.
 */
export function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  helperText,
  error,
  disabled = false,
  required = false,
  iconLeft = null,
  suffix = null,
  className = '',
  ...rest
}) {
  const reactId = React.useId();
  const inputId = id || reactId;
  const describedBy = error ? `${inputId}-err` : helperText ? `${inputId}-help` : undefined;

  return (
    <div className={['gt-field', error ? 'gt-field--error' : '', disabled ? 'gt-field--disabled' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="gt-field__label" htmlFor={inputId}>
          {label}
          {required && <span className="gt-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className="gt-field__control">
        {iconLeft && <span className="gt-field__icon">{iconLeft}</span>}
        <input
          id={inputId}
          className={['gt-input', iconLeft ? 'gt-input--has-icon' : ''].filter(Boolean).join(' ')}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {suffix && <span className="gt-field__suffix">{suffix}</span>}
      </div>
      {error ? (
        <p className="gt-field__error" id={`${inputId}-err`}>{error}</p>
      ) : helperText ? (
        <p className="gt-field__help" id={`${inputId}-help`}>{helperText}</p>
      ) : null}
    </div>
  );
}
