import React from 'react';

/**
 * On/off toggle switch (settings, dark mode, notification prefs).
 * Green track when on, matching the app's Toggle-Switch component.
 */
export function Toggle({
  id,
  label,
  checked = false,
  onChange,
  disabled = false,
  description,
  className = '',
  ...rest
}) {
  const reactId = React.useId();
  const inputId = id || reactId;

  return (
    <label className={['gt-toggle', disabled ? 'gt-toggle--disabled' : '', className].filter(Boolean).join(' ')} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className="gt-toggle__input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <span className="gt-toggle__track" aria-hidden="true">
        <span className="gt-toggle__thumb" />
      </span>
      {(label || description) && (
        <span className="gt-toggle__text">
          {label && <span className="gt-toggle__label">{label}</span>}
          {description && <span className="gt-toggle__desc">{description}</span>}
        </span>
      )}
    </label>
  );
}
