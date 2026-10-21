import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { FieldShell } from '@/components/FieldShell/FieldShell';
import './Input.scss';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size' | 'value' | 'aria-invalid'> {
  /** Visible label (or screen-reader-only with `hideLabel`). Never replace it with a placeholder. */
  label?: ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** The value, for a controlled input; `defaultValue` for an uncontrolled one. */
  value?: string;
  /** @default 'text' */
  type?: string;
  helperText?: ReactNode;
  /** Replaces the help line; sets `aria-invalid` and the error border. */
  error?: ReactNode;
  /** Shows "(optional)" after the label. @default false */
  optional?: boolean;
  /** 16px icon inside the leading edge. */
  iconLeft?: ReactNode;
  /** Fixed text before the value ("linkedin.com/in/", "github.com/", "@"); linked with `aria-describedby`. Named `prefixText` because `prefix` is an HTML attribute (RDFa). */
  prefixText?: string;
  /** Trailing unit or note ("hrs", "PT"). */
  suffix?: ReactNode;
  /** Trailing interactive control (PasswordField's eye). */
  action?: ReactNode;
  /** 32px field for toolbars and filter rows (44 on phones). @default false */
  compact?: boolean;
  /** Soft limit: the counter shows from 80% of it (or always with `showCount`); past it the field is flagged, never truncated. Not the native attribute. */
  maxLength?: number;
  /** @default false */
  showCount?: boolean;
  /** Classes for the `<input>` itself; `className` goes on the field around it. */
  inputClassName?: string;
  /** Set from `error` and the soft limit. JSX takes any hyphenated prop a type leaves out, so it is declared `never`. */
  'aria-invalid'?: never;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Labelled text input in the field shell, ported from design/components/primitives/Input.jsx. The
 * adornments (`iconLeft`, `prefixText`, `suffix`, `action`) sit inside one bordered input group, which
 * takes the focus ring. `maxLength` is a soft limit: the counter appears at 80% (or always with
 * `showCount`), and past the limit the field is flagged and marked invalid, never cut. Help, error,
 * counter and text prefix are linked with `aria-describedby`, after any ids the caller passes.
 *
 * Native props and `ref` reach the `<input>`, `className` the field. Codebase-side: it works
 * uncontrolled too (`defaultValue`), counting what is typed.
 */
export function Input({
  id, label, hideLabel = false, value, defaultValue, onChange, type = 'text', helperText, error, disabled = false,
  optional = false, iconLeft, prefixText, suffix, action, compact = false, maxLength, showCount = false, className = '',
  inputClassName = '', 'aria-describedby': describedByProp, ref, ...rest
}: InputProps) {
  const [typed, setTyped] = useState(() => String(defaultValue ?? '').length);
  const count = value !== undefined ? value.length : typed;
  const counter = maxLength != null && (showCount || count >= maxLength * 0.8);
  const grouped = iconLeft || prefixText || suffix || action;
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
      {({ id: inputId, describedBy, invalid }) => {
        const prefixId = prefixText ? `${inputId}-prefix` : undefined;
        const input = (
          <input
            {...rest}
            ref={ref}
            id={inputId}
            className={['gt-input', compact ? 'gt-input--compact' : '', inputClassName].filter(Boolean).join(' ')}
            type={type}
            value={value}
            defaultValue={defaultValue}
            onChange={(e) => {
              if (value === undefined) setTyped(e.target.value.length);
              onChange?.(e);
            }}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={[prefixId, describedByProp, describedBy].filter(Boolean).join(' ') || undefined}
          />
        );
        if (!grouped) return input;
        return (
          <div
            className={['gt-input-group', compact ? 'gt-input-group--compact' : '', disabled ? 'gt-input-group--disabled' : '']
              .filter(Boolean).join(' ')}
          >
            {iconLeft && <span className="gt-input-group__icon" aria-hidden="true">{iconLeft}</span>}
            {prefixText && <span className="gt-input-group__prefix" id={prefixId}>{prefixText}</span>}
            {input}
            {suffix && <span className="gt-input-group__suffix">{suffix}</span>}
            {action && <span className="gt-input-group__action">{action}</span>}
          </div>
        );
      }}
    </FieldShell>
  );
}
