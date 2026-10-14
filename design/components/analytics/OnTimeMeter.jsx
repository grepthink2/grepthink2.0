import React from 'react';
import { fmtPct } from './ChartTooltip.jsx';

/**
 * Headline timeliness rate (.gt-ontime) — 8px meter, green fill on the green-50
 * track (same ramp), with the counts spelled out. null ⇒ "No deadlines in this range".
 * Ships with Timeliness (sub-project C).
 */
export function OnTimeMeter({ rate, late = 0, missing = 0, expected = 0, editedLate, className = '' }) {
  if (rate === null || rate === undefined) {
    return <div className={['gt-ontime', className].filter(Boolean).join(' ')}><span className="gt-ontime__none">No deadlines in this range</span></div>;
  }
  const pct = Math.max(0, Math.min(100, rate * 100));
  return (
    <div className={['gt-ontime', className].filter(Boolean).join(' ')}>
      <div className="gt-ontime__label">
        <strong>{fmtPct(rate)} on time</strong>
        <span className="gt-ontime__sep">·</span><span>{late} late</span>
        <span className="gt-ontime__sep">·</span><span>{missing} missing</span>
        {editedLate !== undefined && editedLate !== null && <><span className="gt-ontime__sep">·</span><span>{editedLate} edited late</span></>}
        {expected > 0 && <><span className="gt-ontime__sep">·</span><span>{expected} expected</span></>}
      </div>
      <div className="gt-ontime__track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="On-time rate">
        <div className="gt-ontime__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
