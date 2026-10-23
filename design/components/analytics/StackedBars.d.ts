// Intentional addition: BOARD_STATUSES, StackedBars — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export type BoardStatus = 'todo' | 'in_progress' | 'done';
export type Unit = 'count' | 'points';

export interface StackedBarSegment {
  status: BoardStatus;
  count: number;
  points: number;
}

export interface StackedBarRow {
  key: string;
  /** "Backlog", "Sprint 1" … (ordinal order, Backlog first). */
  label: string;
  /** Row meta "8 teams". */
  teams?: number;
  segments: StackedBarSegment[];
}

export interface StackedBarsProps {
  rows: StackedBarRow[];
  /** Swaps the measure; colors never change. @default 'count' */
  unit?: Unit;
  onRowClick?: (row: StackedBarRow) => void;
  /** @default 'chart' */
  view?: 'chart' | 'table';
  /** 14px bars; defaults to true when rows > 8. */
  dense?: boolean;
  /** Rows shown before "Show all (n)". @default 8 */
  maxRows?: number;
  className?: string;
}

/** Horizontal stacked bars by sprint — To do gray · In progress blue · Done green; counts in the `__value` column. */
export function StackedBars(props: StackedBarsProps): React.JSX.Element;

export const BOARD_STATUSES: { status: BoardStatus; label: string }[];
