import * as React from 'react';

export interface DatePickerFieldProps {
  label?: string;
  /** Selected date, or null when empty. */
  value?: Date | null;
  onChange?: (date: Date) => void;
  /** @default 'Select date' */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePickerField(props: DatePickerFieldProps): React.JSX.Element;
