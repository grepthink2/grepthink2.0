// Intentional addition: Select — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = { label: string; options: SelectOption[] };

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  /** Options or `optgroup` groups. Ignored when children are passed. */
  options?: Array<SelectOption | SelectGroup>;
  /** Disabled first option shown while `value` is ''. */
  placeholder?: string;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  /** @default false */
  optional?: boolean;
  /** 32px for toolbars and filter rows (the analytics and schedule filters). @default false */
  compact?: boolean;
  children?: React.ReactNode;
}

export function Select(props: SelectProps): React.JSX.Element;
