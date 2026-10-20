import * as React from 'react';

export interface StepperStep {
  id?: string;
  label: string;
  /** Overrides the state derived from `current` (use 'error' for a step that failed validation). */
  state?: 'done' | 'current' | 'upcoming' | 'error';
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step; earlier steps are done, later upcoming. @default 0 */
  current?: number;
  /** Makes done and error steps buttons back to that step. Upcoming steps never are. */
  onStepClick?: (id: string | number, index: number) => void;
  /** Names the <nav>. @default 'Progress' */
  ariaLabel?: string;
  className?: string;
}

/** Ordered form steps (TSR); "Step n of N" on phones. */
export function Stepper(props: StepperProps): React.JSX.Element;
