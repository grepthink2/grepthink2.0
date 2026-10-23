// Intentional addition: BarsBySprint — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface SprintColumn {
  /** "Sprint 1" (rendered "S1" on the axis; ordinal 0 / "Backlog" stays "Backlog"). */
  label: string;
  ordinal?: number | null;
  median: number;
  n: number;
}

export interface SprintPanel {
  key: string;
  /** "Tasks" / "Stories". */
  title: string;
  /** Plural noun for the head line ("418 tasks"); defaults to the lower-cased title. */
  noun?: string;
  overall: { median: number; n: number };
  columns: SprintColumn[];
}

export interface BarsBySprintProps {
  /** Two panels side by side; y-scale is shared. */
  panels: SprintPanel[];
  /** @default 130 */
  height?: number;
  /** @default 'chars' */
  unitLabel?: string;
  /** @default 'chart' */
  view?: 'chart' | 'table';
  /** Force the one-column layout; otherwise automatic when a side-by-side panel cannot hold every median cap (< 36px per column). */
  stacked?: boolean;
  className?: string;
}

/** Small-multiple columns (one series, slot 1) with the median on each cap. */
export function BarsBySprint(props: BarsBySprintProps): React.JSX.Element;
