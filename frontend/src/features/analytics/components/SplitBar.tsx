import { compactNumber } from '../utils/analyticsFormat';
import { ChartLegend } from './ChartLegend';

export interface SplitSegment { key: string; label: string; value: number; note?: string; colorClass: string }

/** Team channels vs direct messages as one horizontal bar with 2px gaps — never a pie (brief §4 #6). */
export function SplitBar({ segments }: { segments: SplitSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const label = segments.map((s) => `${s.label} ${compactNumber(s.value)}`).join(', ');
  // A zero share draws nothing: an empty segment would still leave a 2px gap at the bar's end.
  const drawn = total === 0 ? segments : segments.filter((s) => s.value > 0);
  return (
    <div className="gt-split">
      <div className={`gt-split__bar${total === 0 ? ' gt-split--empty' : ''}`} role="img" aria-label={label}>
        {drawn.map((s) => (
          <div key={s.key} className={`gt-split__segment ${s.colorClass}`} style={{ flexGrow: total === 0 ? 1 : s.value }} />
        ))}
      </div>
      <ChartLegend items={segments.map((s) => ({ key: s.key, label: s.note ? `${s.label} (${s.note})` : s.label, swatch: 'rect', colorClass: s.colorClass, value: compactNumber(s.value) }))} />
    </div>
  );
}
