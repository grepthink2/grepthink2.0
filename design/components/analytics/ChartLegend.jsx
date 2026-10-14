import React from 'react';

/* Lucide-shaped 2px-stroke glyphs used by the analytics family.
   Production swaps these for lucide-react (same names). */
const PATHS = {
  'info': <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  'check-circle': <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>,
  'check-circle-2': <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  'clock': <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  'x-circle': <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
  'table': <><path d="M12 3v18M3 9h18M3 15h18" /><rect x="3" y="3" width="18" height="18" rx="2" /></>,
  'download': <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
  'bar-chart-3': <><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></>,
  'message-square': <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  'users': <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  'calendar': <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  'graduation-cap': <><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>,
  'layout-grid': <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  'activity': <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
  'kanban': <><path d="M6 5v11M12 5v6M18 5v14" /></>,
  'trending-up': <><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" /></>,
  'trending-down': <><path d="M22 17l-8.5-8.5-5 5L2 7" /><path d="M16 17h6v-6" /></>,
  'minus': <><path d="M5 12h14" /></>,
  'refresh-cw': <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  'alert-circle': <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>,
  'chevron-down': <><path d="m6 9 6 6 6-6" /></>,
  'arrow-up-down': <><path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" /></>,
  'arrow-up': <><path d="m5 12 7-7 7 7M12 19V5" /></>,
  'arrow-down': <><path d="M12 5v14M19 12l-7 7-7-7" /></>,
  'x': <><path d="M18 6 6 18M6 6l12 12" /></>,
  'shield-off': <><path d="M19.7 14a7 7 0 0 0 .3-2V5l-8-3-3.2 1.2" /><path d="m2 2 20 20" /><path d="M4.7 4.7 4 5v7c0 6 8 10 8 10a20 20 0 0 0 5.6-4.4" /></>,
  'inbox': <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
};

export function AnalyticsIcon({ name, size = 16, className = '', ...rest }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {PATHS[name] || null}
    </svg>
  );
}

/**
 * Chart legend (.gt-legend). Swatches: 14×3 lines (BurnupChart idiom) or 10×10 radius-2
 * rects, colored through the item's `seriesClass` ("gt-series--1", "gt-status--done").
 * With `onToggle` each item holds a `.gt-legend__button` (aria-pressed) that isolates its series.
 */
export function ChartLegend({ items = [], hidden = [], onToggle, className = '' }) {
  const off = new Set(hidden);
  return (
    <ul className={['gt-legend', className].filter(Boolean).join(' ')} aria-label="Legend">
      {items.map((it) => {
        const isOff = off.has(it.key);
        const inner = (
          <>
            {it.icon ? (
              <span className={`gt-legend__icon ${it.seriesClass || ''}`}><AnalyticsIcon name={it.icon} size={13} /></span>
            ) : (
              <span className={`gt-legend__swatch--${it.swatch || 'rect'} ${it.seriesClass || ''}`} aria-hidden="true" />
            )}
            <span className="gt-legend__label">{it.label}</span>
            {it.value !== undefined && <span className="gt-legend__value">{it.value}</span>}
          </>
        );
        return (
          <li key={it.key} className={['gt-legend__item', isOff ? 'gt-legend__item--off' : ''].filter(Boolean).join(' ')}>
            {onToggle ? (
              <button type="button" className="gt-legend__button" aria-pressed={!isOff} onClick={() => onToggle(it.key)}>{inner}</button>
            ) : (
              <span className="gt-legend__static">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
