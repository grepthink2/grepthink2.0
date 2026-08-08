import * as React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Visible field label. */
  label?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  /** @default 'text' */
  type?: string;
  /** Muted helper line under the field. */
  helperText?: string;
  /** Error message — replaces helper text and applies the error treatment. */
  error?: string;
  disabled?: boolean;
  required?: boolean;
  /** Icon shown inside the field, leading edge. */
  iconLeft?: React.ReactNode;
  /** Trailing content (unit, button, count). */
  suffix?: React.ReactNode;
}

/**
 * Labelled text input.
 * @startingPoint section="Primitives" subtitle="Text input with label, helper & error" viewport="700x180"
 */
export function Input(props: InputProps): React.JSX.Element;
