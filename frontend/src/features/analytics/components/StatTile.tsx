import type { LucideIcon } from 'lucide-react';
import DashboardMetricCard, { type MetricAccent, type MetricDelta } from '@features/app/components/Dashboard/DashboardMetricCard';
import { compactNumber } from '../utils/analyticsFormat';

export interface StatTileProps {
  label: string; value: number | null; icon: LucideIcon; accent?: MetricAccent;
  delta?: MetricDelta; trend?: number[];
  hint?: string; loading?: boolean; onClick?: () => void;
}

/** A KPI tile: the Dashboard's metric card with compact figures, a delta and a sparkline (brief §4 #2). */
export function StatTile({ value, hint, ...rest }: StatTileProps) {
  return <DashboardMetricCard {...rest} value={compactNumber(value)} hint={hint} />;
}
