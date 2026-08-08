import React from 'react';

/**
 * Radio group. Renders a fieldset of custom radios;
 * pass `options` and control via `value`/`onChange`.
 */
export function RadioGroup({
  name,
  legend,
  options = [],
  value,
  onChange,
  disabled = false,
  inline = false,
  className = '',
}) {
  const reactId = React.useId();
  const groupName = name || reactId;

  return (
    <fieldset className={['gt-radio-group', inline ? 'gt-radio-group--inline' : '', className].filter(Boolean).join(' ')}>
      {legend && <legend className="gt-radio-group__legend">{legend}</legend>}
      {options.map((opt) => {
        const isDisabled = disabled || opt.disabled;
        return (
          <label
            key={opt.value}
            className={['gt-radio', isDisabled ? 'gt-radio--disabled' : ''].filter(Boolean).join(' ')}
          >
            <input
              type="radio"
              className="gt-radio__input"
              name={groupName}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange && onChange(opt.value)}
              disabled={isDisabled}
            />
            <span className="gt-radio__dot" aria-hidden="true" />
            <span className="gt-radio__text">
              <span className="gt-radio__label">{opt.label}</span>
              {opt.description && <span className="gt-radio__desc">{opt.description}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
