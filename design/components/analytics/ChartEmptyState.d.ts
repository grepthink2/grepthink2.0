import * as React from 'react';
import { AnalyticsIconName } from './ChartLegend';

export interface ChartEmptyStateProps {
  /** @default 'inbox' */
  icon?: AnalyticsIconName;
  title: string;
  hint?: string;
  className?: string;
}

/**
 * Per-card empty state: `.gt-empty.gt-empty--card` (the system EmptyState, compacted).
 * Named ChartEmptyState because the design system already exports the page-level `EmptyState`;
 * the port may call it EmptyState inside the analytics feature.
 */
export function ChartEmptyState(props: ChartEmptyStateProps): React.JSX.Element;
