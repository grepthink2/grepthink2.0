import { useState, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { FieldShell } from '@/components/FieldShell/FieldShell';
// The design writes Input and Textarea as one block, which Input's stylesheet holds.
import '@/components/Input/Input.scss';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'aria-invalid'> {
  label?: ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** The value, for a controlled textarea; `defaultValue` for an uncontrolled one. */
  value?: string;
  /** @default 4 */
  rows?: number;
  helperText?: ReactNode;
  /** Replaces the help line; sets `aria-invalid` and the error border. */
  error?: ReactNode;
  /** Shows "(optional)" after the label. @default false */
  optional?: boolean;
  /** Soft limit: the "n / max" counter; past it the field is flagged, never truncated. Not the native attribute. */
  maxLength?: number;
  /** Shows the counter when `maxLength` is set. @default true */
  showCount?: boolean;
  /** Set from `error` and the soft limit. JSX takes any hyphenated prop a type leaves out, so it is declared `never`. */
  'aria-invalid'?: never;
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * Multi-line text field in the field shell, ported from design/components/primitives/Textarea.jsx (TSR
 * feedback, descriptions, notes). With `maxLength` the counter always shows ("128 / 500"); past the
 * limit the text is kept, the counter and border turn red, the field is marked invalid, and the
 * form's validation blocks the save. The native `maxlength` is never set, so pasted text is never
 * cut. Help, error and counter are linked with `aria-describedby`, after any ids the caller passes.
 *
 * Native props and `ref` reach the `<textarea>`, `className` the field. Codebase-side: it works
 * uncontrolled too (`defaultValue`), counting what is typed.
 */
export function Textarea({
  id, label, hideLabel = false, value, defaultValue, onChange, rows = 4, helperText, error, disabled = false,
  optional = false, maxLength, showCount = true, className = '', 'aria-describedby': describedByProp, ref, ...rest
}: TextareaProps) {
  const [typed, setTyped] = useState(() => String(defaultValue ?? '').length);
  const count = value !== undefined ? value.length : typed;
  const counter = maxLength != null && showCount;
  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      optional={optional}
      helperText={helperText}
      error={error}
      count={counter ? count : undefined}
      max={counter ? maxLength : undefined}
      disabled={disabled}
      className={className}
    >
      {({ id: inputId, describedBy, invalid }) => (
        <textarea
          {...rest}
          ref={ref}
          id={inputId}
          className="gt-textarea"
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            if (value === undefined) setTyped(e.target.value.length);
            onChange?.(e);
          }}
          rows={rows}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedByProp, describedBy].filter(Boolean).join(' ') || undefined}
        />
      )}
    </FieldShell>
  );
}
