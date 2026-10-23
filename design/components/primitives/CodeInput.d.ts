// Intentional addition: CodeInput — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface CodeInputProps {
  id?: string;
  /** One label for the whole group ("Class code", "Verification code"). */
  label: React.ReactNode;
  /** 8 for a class join code, 6 for an email verification code. @default 6 */
  length?: number;
  /** Contiguous, cleaned value (A–Z 0–9 uppercased, or digits). */
  value?: string;
  onChange?: (value: string) => void;
  /** Called once per new full code (submit or verify here); an edit that leaves the code as it was does not call it again. */
  onComplete?: (value: string) => void;
  /** Digits only + numeric keyboard. @default false */
  numeric?: boolean;
  /** Draws a short rule after every n boxes (4 → "ABCD – 1234"). Decorative. */
  groupSize?: number;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  /** Focus the first empty box on mount. @default false */
  autoFocus?: boolean;
  className?: string;
}

/** One-time code boxes (class join code, email verification). */
export function CodeInput(props: CodeInputProps): React.JSX.Element;
