// Intentional addition: RadioGroup — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface RadioOption {
  value: string;
  /** Title (bold in the card variant). */
  label: string;
  /** Muted second line, linked with `aria-describedby`. */
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Shared input name; auto-generated when omitted. */
  name?: string;
  /** Group label rendered as <legend>. */
  legend?: string;
  /** Group name when there is no visible legend. */
  ariaLabel?: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** Options in a row (list variant only). @default false */
  inline?: boolean;
  /** 'card': bordered option cards in an auto-fit grid (min 200px) with a green selected border. @default 'list' */
  variant?: 'list' | 'card';
  className?: string;
}

export function RadioGroup(props: RadioGroupProps): React.JSX.Element;
