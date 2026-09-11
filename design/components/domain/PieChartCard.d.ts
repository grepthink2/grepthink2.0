import * as React from 'react';

export interface ChartDatum {
  name: string;
  value: number;
  /** Override the palette color. */
  color?: string;
}

export interface PieChartCardProps {
  data: ChartDatum[];
  /** Diameter in px. @default 140 */
  size?: number;
  /** Donut hole. @default true */
  donut?: boolean;
  /** @default true */
  showLegend?: boolean;
  className?: string;
}

export interface BarChartCardProps {
  data: ChartDatum[];
  /** Plot height in px. @default 140 */
  height?: number;
  /** Bar color. @default '#018156' */
  color?: string;
  /** @default true */
  showValues?: boolean;
  className?: string;
}

/** Token palette shared by charts — use for recharts fills in production. */
export const CHART_COLORS: string[];
export function PieChartCard(props: PieChartCardProps): React.JSX.Element;
export function BarChartCard(props: BarChartCardProps): React.JSX.Element;
