import type { LucideIcon } from 'lucide-react';

export interface LegendItem { key: string; label: string; swatch: 'rect' | 'line'; colorClass: string; icon?: LucideIcon; value?: string }
export interface ChartLegendProps { items: LegendItem[]; hidden?: string[]; onToggle?: (key: string) => void }

/** Swatches 14×3 for lines, 10×10 for bars; colours only through the series classes. Toggling isolates a series. */
export function ChartLegend({ items, hidden = [], onToggle }: ChartLegendProps) {
  return (
    <ul className="gt-legend">
      {items.map(({ key, label, swatch, colorClass, icon: Icon, value }) => {
        const off = hidden.includes(key);
        const body = (
          <>
            <span className={`gt-legend__swatch gt-legend__swatch--${swatch} ${colorClass}`} aria-hidden="true" />
            {Icon ? <Icon size={12} aria-hidden="true" /> : null}
            <span className="gt-legend__label">{label}</span>
            {value !== undefined ? <span className="gt-legend__value">{value}</span> : null}
          </>
        );
        return (
          <li key={key} className={`gt-legend__item${off ? ' gt-legend__item--off' : ''}`}>
            {onToggle ? (
              <button type="button" className="gt-legend__button" aria-pressed={!off} onClick={() => onToggle(key)}>
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
