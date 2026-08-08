import * as React from 'react';

export interface RadioOption {
  value: string;
  label: string;
  /** Muted second line. */
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Shared input name; auto-generated when omitted. */
  name?: string;
  /** Group label rendered as <legend>. */
  legend?: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** Lay options in a row instead of a column. @default false */
  inline?: boolean;
  className?: string;
}

export function RadioGroup(props: RadioGroupProps): React.JSX.Element;
