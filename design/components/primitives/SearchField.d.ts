// Intentional addition: SearchField — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value?: string;
  /** Receives the new string (not the event). */
  onChange?: (value: string) => void;
  /** Screen-reader label (visually hidden). Name what is searched: "Search classmates". @default 'Search' */
  label?: string;
  /** @default 'Search…' */
  placeholder?: string;
  /** 32px instead of 36px (44 on phones). Replaces the search layer's `size="sm"`. @default false */
  compact?: boolean;
  /** Drop the 320px cap. @default false */
  fullWidth?: boolean;
  disabled?: boolean;
  /** Called by the clear (×) button; defaults to `onChange('')`. Focus returns to the input. */
  onClear?: () => void;
}

/** The standard inline filter input for lists and tables. */
export function SearchField(props: SearchFieldProps): React.JSX.Element;
