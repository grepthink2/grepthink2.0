// Intentional addition: DatePickerField — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

/**
 * The codebase's DatePickerField contract (features/app/components/Fields/DatePickerField.tsx,
 * 10 uses in 5 files), plus `error`, `helperText`, `required`, `optional`, `disabledAfter` and `id`.
 */
export interface DatePickerFieldProps {
  label: string;
  /**
   * Stored value string. `showTime=false`: 'yyyy-MM-dd' or ''. `showTime=true`: 'yyyy-MM-dd HH:mm' or ''.
   * Strings keep a date-only value from shifting across time zones.
   */
  value: string;
  onChange: (value: string) => void;
  /** Adds a labelled time input (15-minute steps, 08:00 until a time is chosen) and Cancel / Done to the calendar. @default false */
  showTime?: boolean;
  /** Days before this date are disabled. */
  disabledBefore?: Date;
  /** Days after this date are disabled. */
  disabledAfter?: Date;
  /** The trigger does not open the picker. @default false */
  disabled?: boolean;
  /** Announced with the trigger's name; no visible mark. @default false */
  required?: boolean;
  /** Shows "(optional)". @default false */
  optional?: boolean;
  error?: React.ReactNode;
  helperText?: React.ReactNode;
  /** @default 'Select a date' / 'Select date & time' */
  placeholder?: string;
  id?: string;
  className?: string;
}

export function DatePickerField(props: DatePickerFieldProps): React.JSX.Element;
/** Parse a DatePickerField value into a local Date and 'HH:mm' (or null). */
export function parseDateValue(value: string): { date: Date; time: string } | null;
