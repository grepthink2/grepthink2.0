export interface ChartTooltipProps { title: string; rows: { label: string; value: string; colorClass?: string }[]; x: number | string; y: number | string }

/** Text only; positioned by the chart inside its own wrapper (`left`/`top` take px numbers or percentage strings: layout, not colour). */
export function ChartTooltip({ title, rows, x, y }: ChartTooltipProps) {
  return (
    <div className="gt-tooltip" role="tooltip" style={{ left: x, top: y }}>
      <div className="gt-tooltip__title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="gt-tooltip__row">
          {r.colorClass ? <span className={`gt-tooltip__key ${r.colorClass}`} aria-hidden="true" /> : null}
          <span className="gt-tooltip__label">{r.label}</span>
          <span className="gt-tooltip__value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
