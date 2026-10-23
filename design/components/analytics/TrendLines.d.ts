// Intentional addition: TrendLines — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface TrendPoint {
  weekStart: string;
  /** null leaves a gap. */
  value: number | null;
}

export interface TrendPanel {
  key: 'team_messages_per_team' | 'tasks_per_team' | 'points_done_per_team' | 'on_time_rate' | string;
  title: string;
  unit: 'per team per week' | 'per team' | 'rate';
  current: TrendPoint[];
  /** The range of equal length just before; null for the 'all' preset. */
  previous?: TrendPoint[] | null;
}

export type TrendEmptyReason = 'no_rollup' | 'no_complete_week' | 'no_activity';

export interface TrendLinesProps {
  /** Three panels in the first release; the on-time panel joins with timeliness. Only complete weeks are drawn. */
  panels: TrendPanel[];
  /** Draw the previous range in gray. @default true */
  compare?: boolean;
  /** ISO date of the last nightly rollup — decides which weeks are complete; footer reads "as of Oct 6, 2026". null ⇒ "Trends appear after the first nightly rollup." */
  asOf?: string | null;
  /** Plot height per panel. @default 96 */
  height?: number;
  /** 'table': one row per complete week, one column per panel with its unit, "—" for a missing value. @default 'chart' */
  view?: 'chart' | 'table';
  /** Force one of the three empty states; otherwise derived (no asOf → no_rollup; no complete week → no_complete_week; all null/0 → no_activity). */
  emptyReason?: TrendEmptyReason;
  className?: string;
}

/** Small multiples; current = green 2px, previous = gray 2px, aligned by week index; markers on weeks no line reaches and on the latest week (end-labelled). */
export function TrendLines(props: TrendLinesProps): React.JSX.Element;
/** Keeps the Monday-start weeks whose Sunday is on or before `asOf`; [] when `asOf` is null. */
export function completeWeeks(points: TrendPoint[], asOf?: string | null): TrendPoint[];
