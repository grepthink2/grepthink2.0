import { useEffect, useId, useImperativeHandle, useRef, type InputHTMLAttributes, type Ref } from 'react';
import { Check } from 'lucide-react';
import './Checkbox.scss';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  /** Mixed state (a "select all" with part of the list selected). @default false */
  indeterminate?: boolean;
  /** Muted second line under the label, linked with `aria-describedby`. */
  description?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Checkbox with a label, ported from design/components/primitives/Checkbox.jsx: a native
 * `<input type="checkbox">` (Space toggles) under a custom-drawn box, green when checked, with the
 * accent ring on keyboard focus. The hidden input covers the whole row, so clicks, taps and the
 * screen-reader cursor all land on it. The name is the label alone; the description is linked with
 * `aria-describedby`. `indeterminate` is set on the input through a ref.
 *
 * Native props and `ref` reach the input, `className` the row. A caller's `aria-labelledby` (for a
 * box named by its table row) and `aria-describedby` are kept, ahead of its own. It works controlled
 * (`checked`) or uncontrolled (`defaultChecked`).
 */
export function Checkbox({
  id, label, indeterminate = false, description, disabled = false, className = '',
  'aria-labelledby': labelledByProp, 'aria-describedby': describedByProp, ref, ...rest
}: CheckboxProps) {
  const reactId = useId();
  const inputId = id || reactId;
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const labelId = label ? `${inputId}-label` : undefined;
  const descId = description ? `${inputId}-desc` : undefined;
  return (
    <label className={['gt-check', disabled ? 'gt-check--disabled' : '', className].filter(Boolean).join(' ')} htmlFor={inputId}>
      <input
        {...rest}
        ref={inputRef}
        id={inputId}
        type="checkbox"
        className="gt-check__input"
        disabled={disabled}
        aria-labelledby={[labelledByProp, labelId].filter(Boolean).join(' ') || undefined}
        aria-describedby={[describedByProp, descId].filter(Boolean).join(' ') || undefined}
      />
      <span className="gt-check__box" aria-hidden="true">
        <Check className="gt-check__mark" size={14} strokeWidth={3} />
        <span className="gt-check__dash" />
      </span>
      {(label || description) && (
        <span className="gt-check__text">
          {label && <span className="gt-check__label" id={labelId}>{label}</span>}
          {description && <span className="gt-check__desc" id={descId}>{description}</span>}
        </span>
      )}
    </label>
  );
}
