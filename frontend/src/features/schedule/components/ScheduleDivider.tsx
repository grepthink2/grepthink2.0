import type { ScheduleItemData } from '../scheduleModel';
import '../schedule.scss';

export interface ScheduleDividerProps {
  /** A sprint edge (kind 'sprint'); its `sprint` names the sprint and the edge. */
  item: ScheduleItemData;
  /** On today the label says so: "Sprint 2 ends today". */
  isToday?: boolean;
  className?: string;
}

/**
 * A sprint edge: a muted label on a dashed rule at the top of its day, between the day header and
 * the day's list. Not an event (never an <li>), so it has no time, action or card. Port of
 * design/components/schedule/ScheduleDivider.jsx.
 */
export function ScheduleDivider({ item, isToday = false, className = '' }: ScheduleDividerProps) {
  const name = item.sprint?.name || item.title || 'Sprint';
  const label = `${name} ${item.sprint?.edge === 'end' ? 'ends' : 'starts'}${isToday ? ' today' : ''}`;
  return (
    <div className={['gt-sched-divider', className].filter(Boolean).join(' ')}>
      <span className="gt-sched-divider__label">{label}</span>
      <hr className="gt-sched-divider__rule" aria-hidden="true" />
    </div>
  );
}
