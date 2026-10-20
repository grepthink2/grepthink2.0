import React from 'react';

/**
 * Radio group — a fieldset of native radios (arrow keys move and select, as the browser does).
 * `variant="card"` turns each option into a bordered card with a title, description and a
 * green selected border: the Draft / Published status cards and the template picker.
 */
export function RadioGroup({
  name, legend, ariaLabel, options = [], value, onChange, disabled = false, inline = false, variant = 'list', className = '',
}) {
  const reactId = React.useId();
  const groupName = name || reactId;
  const card = variant === 'card';
  return (
    <fieldset
      className={['gt-radio-group', inline && !card ? 'gt-radio-group--inline' : '', card ? 'gt-radio-group--card' : '', className].filter(Boolean).join(' ')}
      aria-label={!legend ? ariaLabel : undefined}
    >
      {legend && <legend className="gt-radio-group__legend">{legend}</legend>}
      {options.map((opt) => {
        const isDisabled = disabled || opt.disabled;
        const checked = value === opt.value;
        const base = `${groupName}-${opt.value}`;
        return (
          <label
            key={opt.value}
            className={['gt-radio', card ? 'gt-radio--card' : '', checked ? 'gt-radio--checked' : '', isDisabled ? 'gt-radio--disabled' : ''].filter(Boolean).join(' ')}
          >
            <input
              type="radio"
              className="gt-radio__input"
              name={groupName}
              value={opt.value}
              checked={checked}
              onChange={() => onChange && onChange(opt.value)}
              disabled={isDisabled}
              aria-labelledby={`${base}-label`}
              aria-describedby={opt.description ? `${base}-desc` : undefined}
            />
            <span className="gt-radio__dot" aria-hidden="true" />
            <span className="gt-radio__text">
              <span className="gt-radio__label" id={`${base}-label`}>{opt.label}</span>
              {opt.description && <span className="gt-radio__desc" id={`${base}-desc`}>{opt.description}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
