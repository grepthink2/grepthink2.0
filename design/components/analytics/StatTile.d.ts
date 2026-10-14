import * as React from 'react';

export type MetricAccent = 'primary' | 'blue' | 'purple' | 'amber';

export interface StatTileDelta {
  /** Fractional change vs the previous range (0.18 = +18%). null hides the delta (e.g. the All preset). */
  value: number | null;
  /** "vs previous Sep 8 – Oct 7" — the previous range's dates, or "vs the 7 days before" for Active users. */
  vsLabel?: string;
  /** Whether an increase is good. Colors success-text / error-text. @default true */
  goodWhenUp?: boolean;
}

export interface StatTileProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> {
  label: string;
  /** Number (auto-compact: 1,284 / 12.9K) or null (renders "—"). */
  value: number | string | null;
  /** 'compact' (default) · 'percent' (0.82 → 82%) · 'raw' (string as given). */
  format?: 'compact' | 'percent' | 'raw';
  icon?: React.ReactNode;
  /** Icon-chip tint, as DashboardMetricCard. @default 'primary' */
  accent?: MetricAccent;
  delta?: StatTileDelta;
  /** Nightly-rollup history, oldest first — 2 to 12 points; omit before the first rollup. */
  trend?: number[];
  /** Muted line under the value; explains a null ("Appears once sign-ins are recorded"). */
  hint?: string;
  /** The tile's source is listed in `failures`: renders "—" with the hint "Could not load" (hint overrides), no delta or sparkline. @default false */
  failed?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

/**
 * KPI tile = DashboardMetricCard + `delta` + `trend` slots.
 * @startingPoint section="Analytics" subtitle="KPI tile with delta and sparkline" viewport="700x160"
 */
export function StatTile(props: StatTileProps): React.JSX.Element;
