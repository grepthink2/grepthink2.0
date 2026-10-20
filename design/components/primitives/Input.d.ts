import * as React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'prefix' | 'size'> {
  /** Visible label (or screen-reader-only with `hideLabel`). Never replace it with a placeholder. */
  label?: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** @default 'text' */
  type?: string;
  helperText?: React.ReactNode;
  /** Replaces the help line; sets `aria-invalid` and the error border. */
  error?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  /** Shows "(optional)" after the label. @default false */
  optional?: boolean;
  /** 16px icon inside the leading edge. */
  iconLeft?: React.ReactNode;
  /** Fixed text before the value ("linkedin.com/in/", "github.com/", "@"); linked with `aria-describedby`. Named `prefixText` because `prefix` is an HTML attribute (RDFa). */
  prefixText?: string;
  /** Trailing unit or note ("hrs", "PT"). */
  suffix?: React.ReactNode;
  /** Trailing interactive control (PasswordField's eye). */
  action?: React.ReactNode;
  /** 32px field for toolbars and filter rows (44 on phones). @default false */
  compact?: boolean;
  /** Soft limit: counter from 80% of it (or always with `showCount`); flagged past it, never truncated. */
  maxLength?: number;
  /** @default false */
  showCount?: boolean;
  inputClassName?: string;
}

/**
 * Labelled text input.
 */
export function Input(props: InputProps): React.JSX.Element;
