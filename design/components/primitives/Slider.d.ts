// Intentional addition: Slider — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'color'> {
  id?: string;
  /** Visible label (screen-reader-only with `hideLabel`) — the slider's name. */
  label: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** Controlled value. */
  value?: number;
  /** Uncontrolled start value. @default min */
  defaultValue?: number;
  /** Receives the new number (snapped to the steps from `min`; the top is the last step inside `max`). */
  onChange?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** @default 1 */
  step?: number;
  /** PageUp / PageDown jump. @default a tenth of the range (at least `step`) */
  pageStep?: number;
  /** Shown after the value and in `aria-valuetext` ("%", " pts"). */
  unit?: string;
  /** Replaces `${value}${unit}` beside the slider and in `aria-valuetext`. */
  formatValue?: (value: number) => string;
  /** Screen-reader text only ("25 percent of the work"). @default the shown value */
  valueText?: (value: number) => string;
  /** A paired number input (64px, compact) kept in sync, instead of the read-only value. @default false */
  withInput?: boolean;
  /** Fill and thumb colour — a token reference (`var(--gt-avatar-2)`) to match a legend swatch. @default var(--gt-primary) */
  color?: string;
  helperText?: React.ReactNode;
  /** Error line; turns fill and thumb red and sets `aria-invalid`. */
  error?: React.ReactNode;
  /** @default false */
  optional?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Labelled range with its value (or a paired number input). */
export function Slider(props: SliderProps): React.JSX.Element;
