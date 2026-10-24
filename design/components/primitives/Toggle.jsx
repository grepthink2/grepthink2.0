import React from 'react';

/**
 * On/off switch (`role="switch"`) for settings that apply at once — email preferences,
 * notification prefs. Green track when on. The native input covers the row; a description is
 * linked with `aria-describedby`.
 */
export function Toggle({ id, label, checked = false, onChange, disabled = false, description, className = '', ...rest }) {
  const reactId = React.useId();
  const inputId = id || reactId;
  return (
    <label className={['gt-toggle', description ? 'gt-toggle--with-desc' : '', disabled ? 'gt-toggle--disabled' : '', className].filter(Boolean).join(' ')} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className="gt-toggle__input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={label ? `${inputId}-label` : undefined}
        aria-describedby={description ? `${inputId}-desc` : undefined}
        {...rest}
      />
      <span className="gt-toggle__track" aria-hidden="true"><span className="gt-toggle__thumb" /></span>
      {(label || description) && (
        <span className="gt-toggle__text">
          {label && <span className="gt-toggle__label" id={`${inputId}-label`}>{label}</span>}
          {description && <span className="gt-toggle__desc" id={`${inputId}-desc`}>{description}</span>}
        </span>
      )}
    </label>
  );
}
