import type { KeyboardEvent } from 'react';
import type { AnalyticsUnit } from '@/lib/api/types';

export interface UnitToggleProps { value: AnalyticsUnit; onChange: (u: AnalyticsUnit) => void; labels?: [string, string] }

/** Tasks | Points. A segmented control: `aria-pressed` on each half, arrow keys move the selection. */
export function UnitToggle({ value, onChange, labels = ['Tasks', 'Points'] }: UnitToggleProps) {
  const units: AnalyticsUnit[] = ['count', 'points'];
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(value === 'count' ? 'points' : 'count');
    }
  };
  return (
    <div className="gt-unit-toggle" role="group" aria-label="Unit">
      {units.map((u, i) => (
        <button
          key={u}
          type="button"
          className={`gt-unit-toggle__option${u === value ? ' gt-unit-toggle__option--active' : ''}`}
          aria-pressed={u === value}
          onClick={() => onChange(u)}
          onKeyDown={onKey}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}
