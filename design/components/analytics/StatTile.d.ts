import * as React from 'react';
import type { StatCardProps } from '../display/StatCard';

export interface StatTileProps extends Omit<StatCardProps, 'compact'> {
  /** @default 'compact' */
  format?: 'raw' | 'compact' | 'percent';
}

/** Analytics KPI tile — `<StatCard compact format="compact">`. */
export function StatTile(props: StatTileProps): React.JSX.Element;
