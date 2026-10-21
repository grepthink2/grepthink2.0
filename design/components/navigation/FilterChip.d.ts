import * as React from 'react';

export interface FilterChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'aria-checked'> {
  children: React.ReactNode;
  /** Rendered as `aria-pressed` (toggle) or `aria-checked` (radio). @default false */
  selected?: boolean;
  /** Tertiary count after the label (white when selected). */
  count?: number;
  /** Leading 14px icon (replaced by a check while a toggle chip is selected). */
  icon?: React.ReactNode;
  /** sm 26px · md 32px (44 on phones). @default 'md' */
  size?: 'sm' | 'md';
  /** 'toggle' for multi-choice, 'radio' inside a single-choice group. @default 'toggle' */
  kind?: 'toggle' | 'radio';
  disabled?: boolean;
}

export interface FilterChipOption {
  value: string;
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Pointer hint, e.g. why the option is disabled ("Select a class first"). Not reachable by keyboard — say it in text too when it matters. */
  title?: string;
}

export interface FilterChipGroupProps {
  /** 'single' = radio group (one tab stop, arrows select) · 'multi' = pressed toggles. @default 'multi' */
  type?: 'single' | 'multi';
  /** Names the group ("Date range", "Filter by type"). */
  ariaLabel: string;
  options: FilterChipOption[];
  /** string for single, string[] for multi. */
  value: string | string[];
  onChange?: (value: any) => void;
  /** @default 'md' */
  size?: 'sm' | 'md';
  className?: string;
}

/** One filter chip (toggle or radio). */
export function FilterChip(props: FilterChipProps): React.JSX.Element;
/** A row of filter chips with the right group semantics. */
export function FilterChipGroup(props: FilterChipGroupProps): React.JSX.Element;
