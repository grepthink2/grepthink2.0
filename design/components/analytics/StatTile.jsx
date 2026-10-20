import React from 'react';
import { StatCard } from '../display/StatCard.jsx';

/**
 * Analytics KPI tile = the shared StatCard, `compact` with compact number formatting.
 * StatTile's delta / trend / failed / loading / format moved into StatCard in the alignment
 * round (2026-10-19); this name stays so analytics call sites and the port's map are stable.
 */
export function StatTile({ format = 'compact', ...props }) {
  return <StatCard compact format={format} {...props} />;
}
