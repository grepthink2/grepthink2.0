import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/Avatar/Avatar';
import type { ScheduleItemData, ScheduleLens } from '../scheduleModel';
import { personName, rowClassName, scheduleRow } from '../scheduleRow';
import { ScheduleIcon } from './ScheduleIcon';
import { ScheduleRowHead, ScheduleRowMeta, ScheduleRowTime, ScheduleZoomLink } from './ScheduleRowParts';
import './scheduleAgenda.scss';

export interface ScheduleAgendaItemProps {
  item: ScheduleItemData;
  lens: ScheduleLens;
  now: Date;
  /** The viewer's zone. */
  zone: string;
  schoolZone: string;
  showSchoolTime: boolean;
  overlaps: ScheduleItemData[];
  /** Staff: where "Mark attendance" on a live or past TA meeting goes. */
  markAttendanceHref: string;
  onOpen?: (item: ScheduleItemData) => void;
}

/**
 * One agenda row (an <li>): the range and duration, the kind tile, title / context / the people by
 * name / the note, and an actions column: "Join Zoom" inside the join window, a quiet outlined "Zoom"
 * before it, and "Mark attendance" for staff on a live or past TA meeting. Port of the agenda variant
 * of design/components/schedule/ScheduleItem.jsx, without the MeetingCard expansion and its toggle.
 */
export function ScheduleAgendaItem({
  item, lens, now, zone, schoolZone, showSchoolTime, overlaps, markAttendanceHref, onOpen,
}: ScheduleAgendaItemProps) {
  const row = scheduleRow(item, { lens, now, zone, schoolZone, showSchoolTime });
  const { status, staff } = row;

  const actions: ReactNode[] = [];
  if (row.joinable) actions.push(<ScheduleZoomLink key="zoom" item={item} primary />);
  else if (item.zoomUrl && status === 'upcoming') actions.push(<ScheduleZoomLink key="zoom" item={item} primary={false} />);
  if (staff && item.kind === 'ta_meeting' && (status === 'live' || status === 'past')) {
    actions.push(<Link key="mark" className="gt-sched-item__action" to={markAttendanceHref}>Mark attendance</Link>);
  }

  return (
    <li className={rowClassName(item, row, overlaps.length)} aria-current={status === 'live' ? 'true' : undefined}>
      <ScheduleRowTime item={item} row={row} />
      <span className="gt-sched-item__tile"><ScheduleIcon name={row.meta.icon || 'calendar-days'} size={16} /></span>
      <div className="gt-sched-item__main">
        <ScheduleRowHead item={item} row={row} overlaps={overlaps} onOpen={onOpen} />
        <ScheduleRowMeta row={row} faces={false} />
        {row.people.length > 0 && (
          <div className="gt-sched-item__people">
            {row.people.map((p, i) => (
              <span key={i} className="gt-sched-item__person">
                <Avatar size="xs" name={p.name} src={p.avatarUrl} />
                {personName(p)}
                {p.role && <span className="gt-sched-item__person-role">· {p.role}</span>}
              </span>
            ))}
          </div>
        )}
        {item.note && status !== 'cancelled' && <p className="gt-sched-item__note">{item.note}</p>}
        {status === 'cancelled' && item.cancelReason && <p className="gt-sched-item__reason">{item.cancelReason}</p>}
      </div>
      {actions.length > 0 && <div className="gt-sched-item__actions">{actions}</div>}
    </li>
  );
}
