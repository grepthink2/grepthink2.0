import React from 'react';

/**
 * Multi-line text field. Shares the field chrome with Input.
 * Used across TSR feedback, project descriptions, and scrum-master notes.
 */
export function Textarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  helperText,
  error,
  disabled = false,
  required = false,
  maxLength,
  showCount = false,
  className = '',
  ...rest
}) {
  const reactId = React.useId();
  const inputId = id || reactId;
  const count = typeof value === 'string' ? value.length : 0;

  return (
    <div className={['gt-field', error ? 'gt-field--error' : '', disabled ? 'gt-field--disabled' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="gt-field__label" htmlFor={inputId}>
          {label}
          {required && <span className="gt-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <textarea
        id={inputId}
        className="gt-textarea"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <div className="gt-field__footer">
        {error ? (
          <p className="gt-field__error">{error}</p>
        ) : helperText ? (
          <p className="gt-field__help">{helperText}</p>
        ) : <span />}
        {showCount && maxLength && (
          <span className="gt-field__count">{count}/{maxLength}</span>
        )}
      </div>
    </div>
  );
}
