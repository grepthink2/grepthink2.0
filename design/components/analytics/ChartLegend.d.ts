// Intentional addition: AnalyticsIcon, ChartLegend — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export type AnalyticsIconName =
  | 'info' | 'check-circle' | 'check-circle-2' | 'clock' | 'x-circle' | 'table' | 'download'
  | 'bar-chart-3' | 'message-square' | 'users' | 'calendar' | 'graduation-cap' | 'layout-grid'
  | 'activity' | 'kanban' | 'trending-up' | 'trending-down' | 'minus' | 'refresh-cw' | 'alert-circle'
  | 'chevron-down' | 'arrow-up-down' | 'arrow-up' | 'arrow-down' | 'x' | 'shield-off' | 'inbox';

export interface AnalyticsIconProps extends React.SVGProps<SVGSVGElement> {
  name: AnalyticsIconName;
  /** @default 16 */
  size?: number;
}

/** Lucide-shaped 2px-stroke glyph. Production uses lucide-react under the same names. */
export function AnalyticsIcon(props: AnalyticsIconProps): React.JSX.Element;

export interface ChartLegendItem {
  key: string;
  label: string;
  /** 14×3 line (series) or 10×10 radius-2 rect (bars). @default 'rect' */
  swatch?: 'rect' | 'line';
  /** Series identity class that sets `--series`: "gt-series--1".."--4", "gt-series--gray", "gt-status--done" … */
  seriesClass: string;
  /** Status legends pair the swatch with an icon (timeliness buckets). */
  icon?: AnalyticsIconName;
  /** Optional value shown after the label. */
  value?: string | number;
}

export interface ChartLegendProps {
  items: ChartLegendItem[];
  /** Keys currently hidden (isolated out). */
  hidden?: string[];
  /** Makes items `.gt-legend__button`s (aria-pressed). */
  onToggle?: (key: string) => void;
  className?: string;
}

export function ChartLegend(props: ChartLegendProps): React.JSX.Element;
