import * as React from 'react';

export interface SearchTriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Visible label. @default 'Search' */
  label?: string;
  /** Opens the CommandPalette. */
  onOpen?: () => void;
  /** 40px icon-only form for phone headers. @default false */
  iconOnly?: boolean;
}

export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value?: string;
  /** Receives the new string (not the event). */
  onChange?: (value: string) => void;
  /** @default 'Search…' */
  placeholder?: string;
  /** Falls back to placeholder. */
  ariaLabel?: string;
  /** @default 'md' (36px); 'sm' = 32px */
  size?: 'sm' | 'md';
  /** Remove the 320px max-width. @default false */
  fullWidth?: boolean;
  disabled?: boolean;
  onClear?: () => void;
}

/**
 * Header button that opens the global ⌘K search.
 * @startingPoint section="Search" subtitle="Header trigger for the ⌘K palette" viewport="700x120"
 */
export function SearchTrigger(props: SearchTriggerProps): React.JSX.Element;
/** The standard inline filter input for lists and tables. */
export function SearchField(props: SearchFieldProps): React.JSX.Element;
