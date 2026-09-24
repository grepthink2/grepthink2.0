import React from 'react';

const Tick = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Bang = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/**
 * Staff-only: a week's status reports compared with the work each student
 * actually closed. Rows either match (green) or need review (amber).
 * It flags, never accuses — rows state the numbers and offer "Review".
 */
export function ReportCheckCard({
  week = 'Week 5',
  project,
  rows = [],
  surface = 'app',
  className = '',
  style,
}) {
  return (
    <div style={style} className={['gt-asst', 'gt-asst-report', `gt-asst--${surface}`, className].filter(Boolean).join(' ')} role="group" aria-label={`${week} status reports`}>
      <div className="gt-asst__head">
        <span className="gt-asst__title">{week} status reports</span>
        {project && <span className="gt-asst__time">{project}</span>}
      </div>
      <ul className="gt-asst-report__rows">
        {rows.map((r, i) => (
          <li key={i} className={`gt-asst-report__row gt-asst-report__row--${r.kind || 'match'}`}>
            <span className={`gt-asst-report__mark gt-asst-report__mark--${r.kind || 'match'}`} aria-hidden="true">
              {r.kind === 'review' ? <Bang /> : <Tick />}
            </span>
            <span className="gt-asst-report__text">{r.text}</span>
            {r.kind === 'review' && (
              <button type="button" className="gt-asst-report__review" onClick={r.onReview}>Review</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
