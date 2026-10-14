import React from 'react';
import { fmtCompact } from './ChartTooltip.jsx';

/**
 * Team channels vs direct messages (.gt-split) — one horizontal bar (slots 1–2,
 * 2px gaps), legend with counts; the direct segment carries its "school-wide"
 * note. `mixedScope` (a class is selected, so the two counts no longer share a
 * denominator) renders two stat lines instead — NOTES.md Q3. Zero total ⇒ `--empty`.
 */
export function SplitBar({ segments = [], mixedScope = false, className = '' }) {
  const [focus, setFocus] = React.useState(null);
  const total = segments.reduce((s, d) => s + (d.value || 0), 0);

  if (mixedScope) {
    return (
      <div className={['gt-split', className].filter(Boolean).join(' ')}>
        <div className="gt-split__lines">
          {segments.map((s) => (
            <div key={s.key} className="gt-split__line">
              <span>{s.label}{s.note && <span className="gt-split__note"> · {s.note}</span>}</span>
              <strong>{fmtCompact(s.value)}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={['gt-split', total ? '' : 'gt-split--empty', className].filter(Boolean).join(' ')}>
      <div className="gt-split__bar" role="img" aria-label={segments.map((s) => `${s.label} ${fmtCompact(s.value)}`).join(', ')}>
        {segments.map((s, i) => {
          const pct = total ? (s.value / total) * 100 : 0;
          return (
            <div
              key={s.key}
              className={`gt-split__segment gt-series--${i + 1}`}
              style={{ width: `${pct}%` }}
              tabIndex={0}
              title={`${s.label}: ${fmtCompact(s.value)} (${Math.round(pct)}%)`}
              onFocus={() => setFocus(s.key)}
              onBlur={() => setFocus(null)}
              aria-label={`${s.label}: ${fmtCompact(s.value)}, ${Math.round(pct)} percent`}
            />
          );
        })}
      </div>
      <div className="gt-split__legend">
        {segments.map((s, i) => {
          const pct = total ? Math.round((s.value / total) * 100) : 0;
          return (
            <span key={s.key} className="gt-split__item" style={{ fontWeight: focus === s.key ? 600 : undefined }}>
              <span className={`gt-legend__swatch--rect gt-series--${i + 1}`} aria-hidden="true" />
              {s.label} <strong>{fmtCompact(s.value)}</strong> <span className="gt-split__note">{pct}%{s.note ? ` · ${s.note}` : ''}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
