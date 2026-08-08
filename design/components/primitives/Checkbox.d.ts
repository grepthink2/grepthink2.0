import * as React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  label?: string;
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  /** Mixed state (e.g. "select all" with partial selection). @default false */
  indeterminate?: boolean;
  /** Muted second line under the label. */
  description?: string;
}

export function Checkbox(props: CheckboxProps): React.JSX.Element;
