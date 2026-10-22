// Intentional addition: UnitToggle — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export type Unit = 'count' | 'points';

export interface UnitToggleOption<T extends string = Unit> {
  value: T;
  label: string;
}

export interface UnitToggleProps<T extends string = Unit> {
  value: T;
  onChange: (value: T) => void;
  /** @default Tasks | Points */
  options?: UnitToggleOption<T>[];
  /** @default 'Measure' */
  ariaLabel?: string;
  className?: string;
}

/** 28px segmented control that swaps the measure of a chart. Colors never change with it. */
export function UnitToggle<T extends string = Unit>(props: UnitToggleProps<T>): React.JSX.Element;
