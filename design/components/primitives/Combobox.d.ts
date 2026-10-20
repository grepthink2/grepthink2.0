import * as React from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line (email, team, project code). */
  description?: string;
  /** Group heading this option sits under (options keep their order; groups appear in first-seen order). */
  group?: string;
  /** Person rows: a name, or { name, src }. Rendered as a 28px decorative Avatar. */
  avatar?: string | { name: string; src?: string };
  /** Non-person rows: a 16px icon. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface ComboboxProps {
  id?: string;
  label: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** @default false */
  optional?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** 32px control for toolbars (44 on phones). @default false */
  compact?: boolean;
  /** Static options, filtered client-side with `filter`. Ignored when `loadOptions` is set. */
  options?: ComboboxOption[];
  /** string for single select, string[] with `multiple`. */
  value?: string | string[] | null;
  onChange?: (value: any) => void;
  /** Chips (Tag) in the control; Backspace in an empty input removes the last. @default false */
  multiple?: boolean;
  /** Cap for `multiple`; options beyond it are disabled with a note. */
  max?: number;
  /** Async results for a query (debounced). Rejecting shows the error row. */
  loadOptions?: (query: string) => Promise<ComboboxOption[]>;
  /** @default 250 */
  debounceMs?: number;
  /** Below this many characters `loadOptions` is not called ("Type to search"). @default 1 */
  minQueryLength?: number;
  /** Offer an "Add “query”" row when nothing matches exactly. @default false */
  creatable?: boolean;
  /** Return an error message to block the entry ("Enter a full email address."), or null. */
  validateCreate?: (query: string) => string | null;
  /** Called with a created entry, before `onChange` adds it. */
  onCreate?: (query: string) => void;
  /** @default (q) => `Add “${q}”` */
  createLabel?: (query: string) => string;
  /** @default 'No matches' */
  emptyText?: string;
  /** @default 'Searching…' */
  loadingText?: string;
  errorText?: string;
  /** @default 'Type to search' */
  minQueryText?: string;
  filter?: (option: ComboboxOption, query: string) => boolean;
  /** Start open (galleries and docs; closes on blur like any open list). @default false */
  defaultOpen?: boolean;
  className?: string;
}

/** Shared combobox: single, multi with chips, async, creatable, grouped, avatar / icon rows. */
export function Combobox(props: ComboboxProps): React.JSX.Element;
/** Default filter: case-insensitive substring on label or description. */
export function comboFilter(option: ComboboxOption, query: string): boolean;
