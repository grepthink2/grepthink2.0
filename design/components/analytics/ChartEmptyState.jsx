import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';

/** Per-card empty state — the system `.gt-empty` compacted with `--card`: icon, title, hint. No illustration. */
export function ChartEmptyState({ icon = 'inbox', title, hint, className = '' }) {
  return (
    <div className={['gt-empty', 'gt-empty--card', className].filter(Boolean).join(' ')} role="status">
      <span className="gt-empty__icon"><AnalyticsIcon name={icon} size={18} /></span>
      <span className="gt-empty__title">{title}</span>
      {hint && <p className="gt-empty__hint">{hint}</p>}
    </div>
  );
}
