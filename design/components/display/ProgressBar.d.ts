// Intentional addition: ProgressBar — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface ProgressBarProps {
  /** `aria-valuenow` is this clamped to 0…max, unrounded; anything that isn't a number counts as 0. */
  value: number;
  /** @default 100 */
  max?: number;
  /** @default 'primary' */
  tone?: 'primary' | 'blue' | 'warning' | 'error';
  /** Track height 4 / 8 / 12 (ignored when `inline`). @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Show the % readout. @default false */
  showLabel?: boolean;
  /** Visible label and the accessible name. */
  label?: string;
  /** `aria-valuetext` ("5 of 8 tasks"). */
  valueText?: string;
  /** 4px bar with no label (table cells, story cards, sprint picker). @default false */
  inline?: boolean;
  /** `aria-hidden`: the number is printed beside it. @default false */
  decorative?: boolean;
  /** `role="meter"` for a measurement instead of progress toward done. @default false */
  meter?: boolean;
  className?: string;
}

export function ProgressBar(props: ProgressBarProps): React.JSX.Element;
