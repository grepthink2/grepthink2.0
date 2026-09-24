import * as React from 'react';

export interface ProgressBarProps {
  /** Current value. @default 0 */
  value: number;
  /** @default 100 */
  max?: number;
  /** @default 'primary' */
  tone?: 'primary' | 'blue' | 'warning' | 'error';
  /** Track height. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Show a % readout on the right. @default false */
  showLabel?: boolean;
  /** Label above the bar. */
  label?: string;
  className?: string;
}

export function ProgressBar(props: ProgressBarProps): React.JSX.Element;
