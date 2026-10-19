import React from 'react';

/**
 * Sprint edge: a dashed rule with an inline muted label at the top of its day.
 * Not an event — no time, no button, no card.
 */
export function ScheduleDivider({ item, sprint, isToday = false, className = '' }) {
  const s = sprint || (item && item.sprint) || {};
  const label = `${s.name || 'Sprint'} ${s.edge === 'end' ? 'ends' : 'starts'}${isToday ? ' today' : ''}`;
  return (
    <div className={['gt-sched-divider', className].filter(Boolean).join(' ')}>
      <span className="gt-sched-divider__label">{label}</span>
      <hr className="gt-sched-divider__rule" aria-hidden="true" />
    </div>
  );
}
