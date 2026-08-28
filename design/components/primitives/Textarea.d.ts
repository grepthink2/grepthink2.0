import * as React from 'react';

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  /** @default 4 */
  rows?: number;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  /** Show a live `n/max` character counter (requires maxLength). @default false */
  showCount?: boolean;
}

export function Textarea(props: TextareaProps): React.JSX.Element;
