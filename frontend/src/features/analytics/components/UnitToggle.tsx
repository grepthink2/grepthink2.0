import type { AnalyticsUnit } from '@/lib/api/types';

export interface UnitToggleProps { value: AnalyticsUnit; onChange: (u: AnalyticsUnit) => void; labels?: [string, string] }

/** Tasks | Points: two `aria-pressed` buttons, each its own tab stop. Pressing the unpressed half switches the unit; the pressed half does nothing. */
export function UnitToggle({ value, onChange, labels = ['Tasks', 'Points'] }: UnitToggleProps) {
  const units: AnalyticsUnit[] = ['count', 'points'];
  return (
    <div className="gt-unit-toggle" role="group" aria-label="Unit">
      {units.map((u, i) => (
        <button
          key={u}
          type="button"
          className={`gt-unit-toggle__option${u === value ? ' gt-unit-toggle__option--active' : ''}`}
          aria-pressed={u === value}
          onClick={() => {
            if (u !== value) onChange(u);
          }}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}
