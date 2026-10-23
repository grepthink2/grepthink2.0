// Intentional addition: PasswordField — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { InputProps } from './Input';

export interface PasswordFieldProps extends Omit<InputProps, 'type' | 'action' | 'prefixText' | 'suffix'> {
  /** @default 'Password' */
  label?: React.ReactNode;
  /** 'current-password' on sign-in, 'new-password' on sign-up and reset. @default 'current-password' */
  autoComplete?: string;
}

/** Input with a show / hide password toggle (sign-in, sign-up, reset: 5 fields). */
export function PasswordField(props: PasswordFieldProps): React.JSX.Element;
