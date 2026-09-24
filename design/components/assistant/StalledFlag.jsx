import React from 'react';

/**
 * Stalled-work flag: a task that has sat in a column with no repository
 * activity. Amber label, task key + title, the evidence line, and a nudge.
 */
export function StalledFlag({
  taskKey,
  title,
  status = 'In Progress',
  days = 6,
  detail = 'no commits',
  assignee,
  onNudge,
  surface = 'app',
  className = '',
  style,
}) {
  return (
    <div style={style} className={['gt-asst', 'gt-asst-stalled', `gt-asst--${surface}`, className].filter(Boolean).join(' ')} role="group" aria-label={`Stalled: ${taskKey}`}>
      <span className="gt-asst-stalled__label"><i aria-hidden="true" />Stalled</span>
      <h4 className="gt-asst-stalled__title"><code>{taskKey}</code>{title}</h4>
      <p className="gt-asst-stalled__detail">{status} for {days} {days === 1 ? 'day' : 'days'} · {detail}</p>
      {assignee && (
        <button type="button" className="gt-asst__link" onClick={onNudge}>Nudge {assignee} →</button>
      )}
    </div>
  );
}
