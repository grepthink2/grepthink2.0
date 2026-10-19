import React from 'react';
import { SCHOOL_ZONE, fmtDayLabel } from './ScheduleModel.jsx';

/**
 * Day heading — "Today · Tue, Oct 20" / "Thursday · Oct 22". Sticky inside the agenda.
 * Pass `dayKey` to derive the label, or `title` + `date` for custom headings ("Next · Monday, Oct 26").
 */
export function ScheduleDayHeader({ dayKey, now, zone = SCHOOL_ZONE, title, date, isToday, aside, id, as: Tag = 'h3', className = '' }) {
  const lbl = dayKey ? fmtDayLabel(dayKey, now || new Date(), zone) : { title, date, isToday: !!isToday };
  const today = isToday !== undefined ? isToday : lbl.isToday;
  return (
    <div className={['gt-sched-day', today ? 'gt-sched-day--today' : '', className].filter(Boolean).join(' ')}>
      <Tag className="gt-sched-day__title" id={id}>{title !== undefined ? title : lbl.title}</Tag>
      {(date !== undefined ? date : lbl.date) && <span className="gt-sched-day__date">{date !== undefined ? date : lbl.date}</span>}
      {aside && <span className="gt-sched-day__aside">{aside}</span>}
    </div>
  );
}
