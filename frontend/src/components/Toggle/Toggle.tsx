import { useId, type InputHTMLAttributes, type Ref } from 'react';
import './Toggle.scss';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> {
  label?: string;
  /** Muted second line under the label, linked with `aria-describedby`. */
  description?: string;
  /** A Toggle is always `role="switch"`. JSX would take a stray role, so it is declared `never`. */
  role?: never;
  ref?: Ref<HTMLInputElement>;
}

/**
 * On/off switch for settings that apply at once (email and notification preferences), ported from
 * design/components/primitives/Toggle.jsx: `role="switch"` on a native checkbox (Space toggles), a
 * green track when on. The hidden input covers the row; a description is linked with
 * `aria-describedby`, and the track then aligns to the first line. A choice saved with a form is a
 * Checkbox instead.
 *
 * Native props and `ref` reach the input, `className` the row. A caller's `aria-labelledby` and
 * `aria-describedby` are kept, ahead of its own. It works controlled (`checked`) or uncontrolled
 * (`defaultChecked`).
 */
export function Toggle({
  id, label, description, disabled = false, className = '',
  'aria-labelledby': labelledByProp, 'aria-describedby': describedByProp, ref, ...rest
}: ToggleProps) {
  const reactId = useId();
  const inputId = id || reactId;
  const labelId = label ? `${inputId}-label` : undefined;
  const descId = description ? `${inputId}-desc` : undefined;
  return (
    <label
      className={['gt-toggle', description ? 'gt-toggle--with-desc' : '', disabled ? 'gt-toggle--disabled' : '', className]
        .filter(Boolean).join(' ')}
      htmlFor={inputId}
    >
      <input
        {...rest}
        ref={ref}
        id={inputId}
        type="checkbox"
        role="switch"
        className="gt-toggle__input"
        disabled={disabled}
        aria-labelledby={[labelledByProp, labelId].filter(Boolean).join(' ') || undefined}
        aria-describedby={[describedByProp, descId].filter(Boolean).join(' ') || undefined}
      />
      <span className="gt-toggle__track" aria-hidden="true"><span className="gt-toggle__thumb" /></span>
      {(label || description) && (
        <span className="gt-toggle__text">
          {label && <span className="gt-toggle__label" id={labelId}>{label}</span>}
          {description && <span className="gt-toggle__desc" id={descId}>{description}</span>}
        </span>
      )}
    </label>
  );
}
