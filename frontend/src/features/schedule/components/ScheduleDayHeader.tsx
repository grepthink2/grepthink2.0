import type { ElementType, ReactNode } from 'react';
import { useNow } from '@/lib/useNow';
import { SCHOOL_ZONE, fmtDayLabel } from '../scheduleModel';
import '../schedule.scss';

export interface ScheduleDayHeaderProps {
  /** 'YYYY-MM-DD': derives "Today / Tomorrow / Thursday" + the date. */
  dayKey?: string;
  now?: Date;
  /** @default 'America/Los_Angeles' */
  zone?: string;
  /** Custom heading instead of the derived one (e.g. "Next"). */
  title?: ReactNode;
  date?: ReactNode;
  /** Forces the today treatment (green title). */
  isToday?: boolean;
  /** Right-aligned muted text. */
  aside?: ReactNode;
  /** id for aria-labelledby on the day's list. */
  id?: string;
  /** Heading element. @default 'h3' */
  as?: ElementType<{ className?: string; id?: string; children?: ReactNode }>;
  className?: string;
}

/**
 * Day heading: "Today · Tue, Oct 20" / "Thursday · Oct 22". Pass `dayKey` to derive the label, or
 * `title` + `date` for a custom heading ("Next · Monday, Oct 26").
 */
export function ScheduleDayHeader({
  dayKey, now, zone = SCHOOL_ZONE, title, date, isToday, aside, id, as: Tag = 'h3', className = '',
}: ScheduleDayHeaderProps) {
  const nowD = useNow(30000, now);
  const derived = dayKey ? fmtDayLabel(dayKey, nowD, zone) : null;
  const heading: ReactNode = title !== undefined ? title : derived?.title;
  const when: ReactNode = date !== undefined ? date : derived?.date;
  const today = isToday !== undefined ? isToday : (derived?.isToday ?? false);
  return (
    <div className={['gt-sched-day', today ? 'gt-sched-day--today' : '', className].filter(Boolean).join(' ')}>
      <Tag className="gt-sched-day__title" id={id}>{heading}</Tag>
      {when ? <span className="gt-sched-day__date">{when}</span> : null}
      {aside ? <span className="gt-sched-day__aside">{aside}</span> : null}
    </div>
  );
}
