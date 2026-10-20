import * as React from 'react';

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  /** @default 4 */
  rows?: number;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  /** @default false */
  optional?: boolean;
  /** Soft limit — "n / max" counter; flagged past it, never truncated (no native maxlength). */
  maxLength?: number;
  /** Show the counter when `maxLength` is set. @default true */
  showCount?: boolean;
}

export function Textarea(props: TextareaProps): React.JSX.Element;
