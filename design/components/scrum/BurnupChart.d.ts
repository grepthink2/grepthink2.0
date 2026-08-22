import * as React from 'react';

export interface BurnupChartProps {
  /** X-axis labels — days for a sprint ("Mon"…), sprints cumulatively ("S1"…). */
  labels: string[];
  /** Total scope in points at each step (steps up when scope grows). */
  scope: number[];
  /** Completed points at each step. */
  completed: number[];
  /** Plot height in px. @default 150 */
  height?: number;
  /** e.g. "Sprint 3 burnup". */
  title?: string;
  /** e.g. "Jan 12 – Jan 25". */
  subtitle?: string;
  className?: string;
}

/**
 * Sprint / cumulative burnup chart.
 * @startingPoint section="Scrum" subtitle="Completed vs scope, per sprint or cumulative" viewport="700x260"
 */
export function BurnupChart(props: BurnupChartProps): React.JSX.Element;
