import { fmtTime } from '../scheduleModel';
import '../schedule.scss';

export interface ScheduleNowLineProps {
  now: Date;
  /** The viewer's zone, the time's clock. */
  zone: string;
}

/** "Now · 3:12 PM" on a line between the rows that have ended and the first that has not. Lives in the day's <ol>. */
export function ScheduleNowLine({ now, zone }: ScheduleNowLineProps) {
  const time = fmtTime(now, zone);
  return (
    <li className="gt-sched__now" aria-label={`Now, ${time}`}>
      <span className="gt-sched__now-label">Now · {time}</span>
      <span className="gt-sched__now-line" aria-hidden="true" />
    </li>
  );
}
