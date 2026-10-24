// Intentional addition: WeeklyLine — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface WeeklyPoint {
  /** Monday, ISO date. */
  weekStart: string;
  value: number | null;
}

export interface WeeklySeries {
  key: string;
  label: string;
  points: WeeklyPoint[];
}

export interface WeeklyLineProps {
  /** One or two series. Slot 1 green + 10% wash, slot 2 blue. */
  series: WeeklySeries[];
  /** Plot height incl. axis band. @default 200 */
  height?: number;
  ariaLabel?: string;
  /** 'table' renders the table twin. @default 'chart' */
  view?: 'chart' | 'table';
  valueFormat?: (v: number | null | undefined) => string;
  className?: string;
}

/** Weekly line chart with crosshair tooltip, end labels and a toggling legend. */
export function WeeklyLine(props: WeeklyLineProps): React.JSX.Element;
