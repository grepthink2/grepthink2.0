import { useId, useState, type FieldsetHTMLAttributes, type Ref } from 'react';
import './RadioGroup.scss';

export interface RadioOption {
  value: string;
  /** Title (bold in the card variant). */
  label: string;
  /** Muted second line, linked with `aria-describedby`. */
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange' | 'children' | 'defaultValue' | 'aria-label'> {
  /** Shared input name; generated when omitted. */
  name?: string;
  /** Group label rendered as `<legend>`. */
  legend?: string;
  /** Group name when there is no visible legend. */
  ariaLabel?: string;
  /** Set from `ariaLabel`. JSX takes any hyphenated prop a type leaves out, so it is declared `never`. */
  'aria-label'?: never;
  options: RadioOption[];
  /** The chosen value, for a controlled group; `defaultValue` for an uncontrolled one. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** Options in a row (list variant only). @default false */
  inline?: boolean;
  /** 'card': bordered option cards in an auto-fit grid (min 200px) with a green selected border. @default 'list' */
  variant?: 'list' | 'card';
  ref?: Ref<HTMLFieldSetElement>;
}

/**
 * One-of-N choice, ported from design/components/primitives/RadioGroup.jsx: native radios in a
 * `<fieldset>` named by its `<legend>` (or `ariaLabel`). Tab enters the group at the checked option and
 * the arrow keys move and select, as the browser does. Each radio is named by its label and described
 * by its description. `variant="card"` turns each option into a bordered card with a title,
 * description and a green selected border (the Draft / Published status cards, the template picker);
 * the hidden input covers each row, so the whole card is the hit area.
 *
 * Native props and `ref` reach the fieldset. Codebase-side: it works uncontrolled too
 * (`defaultValue`), and its ids come from the option's position, so a value with a space ("product
 * owner") still gives valid ids.
 */
export function RadioGroup({
  name, legend, ariaLabel, options, value, defaultValue, onChange, disabled = false, inline = false, variant = 'list',
  className = '', ref, ...rest
}: RadioGroupProps) {
  const reactId = useId();
  const groupName = name || reactId;
  const [own, setOwn] = useState(defaultValue);
  const chosen = value ?? own;
  const card = variant === 'card';
  return (
    <fieldset
      {...rest}
      ref={ref}
      className={['gt-radio-group', inline && !card ? 'gt-radio-group--inline' : '', card ? 'gt-radio-group--card' : '', className]
        .filter(Boolean).join(' ')}
      aria-label={!legend ? ariaLabel : undefined}
    >
      {legend && <legend className="gt-radio-group__legend">{legend}</legend>}
      {options.map((opt, i) => {
        const isDisabled = disabled || !!opt.disabled;
        const checked = chosen === opt.value;
        const base = `${reactId}-${i}`;
        return (
          <label
            key={opt.value}
            className={['gt-radio', card ? 'gt-radio--card' : '', checked ? 'gt-radio--checked' : '', isDisabled ? 'gt-radio--disabled' : '']
              .filter(Boolean).join(' ')}
          >
            <input
              type="radio"
              className="gt-radio__input"
              name={groupName}
              value={opt.value}
              checked={checked}
              onChange={() => {
                if (value === undefined) setOwn(opt.value);
                onChange?.(opt.value);
              }}
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
