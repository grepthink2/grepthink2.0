import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNow } from '@/lib/useNow';
import { viewerZone, type ScheduleItemData, type ScheduleLens } from '../scheduleModel';
import { rowClassName, scheduleRow } from '../scheduleRow';
import { ScheduleIcon } from './ScheduleIcon';
import { ScheduleRowHead, ScheduleRowMeta, ScheduleRowTime, ScheduleZoomLink } from './ScheduleRowParts';
import '../schedule.scss';

export interface ScheduleItemProps {
  item: ScheduleItemData;
  /** Only changes which actions render (Mark attendance / Set time for staff). @default 'student' */
  lens?: ScheduleLens;
  /** Clock used for status + the Join window; defaults to one that ticks every 30 s (useNow). */
  now?: Date;
  /** Viewer's IANA zone (times render in it). @default the browser's zone */
  zone?: string;
  /** The school's IANA zone, for the hover title `showSchoolTime` asks for. Without it there is no campus time to show. */
  schoolZone?: string;
  /** Put the school-zone time in each <time>'s title. */
  showSchoolTime?: boolean;
  /** Items this one overlaps with (ScheduleModel.findOverlaps): renders the "Overlaps" pill. */
  overlaps?: ScheduleItemData[];
  onJoin?: (item: ScheduleItemData) => void;
  onMarkAttendance?: (item: ScheduleItemData) => void;
  /** Staff: "Mark attendance" on a live or past TA meeting is a link here (in-app) instead of the `onMarkAttendance` button. */
  markAttendanceHref?: string;
  onSetTime?: (item: ScheduleItemData) => void;
  /** Deadline titles with `href` call this instead of navigating. */
  onOpen?: (item: ScheduleItemData) => void;
  className?: string;
}

/**
 * One compact schedule row (an <li>): time cell · kind tile · title / context / organizer faces, with
 * Join Zoom under the context line inside the join window. Seat it in an `<ol class="gt-sched__items">`
 * inside `.gt-sched.gt-sched--compact`, which sets the row's grid. Port of design/components/schedule/
 * ScheduleItem.jsx, the compact variant; the agenda's row is ScheduleAgendaItem, which shares the row
 * model (scheduleRow.ts) and the parts (ScheduleRowParts). A live row shows the kit's
 * `<Badge status="live" />` (blue: in progress) where the design draws a green pulsing pill.
 */
export function ScheduleItem({
  item, lens = 'student', now, zone = viewerZone(), schoolZone, showSchoolTime = false,
  overlaps = [], onJoin, onMarkAttendance, markAttendanceHref, onSetTime, onOpen, className = '',
}: ScheduleItemProps) {
  const nowD = useNow(30000, now);
  const row = scheduleRow(item, { lens, now: nowD, zone, schoolZone, showSchoolTime });
  const { status, staff } = row;

  // actions (under the context line)
  const actions: ReactNode[] = [];
  if (row.joinable) actions.push(<ScheduleZoomLink key="join" item={item} primary onJoin={onJoin} />);
  if (staff && item.kind === 'ta_meeting' && (status === 'live' || status === 'past')) {
    if (markAttendanceHref) {
      actions.push(<Link key="mark" className="gt-sched-item__action" to={markAttendanceHref}>Mark attendance</Link>);
    } else if (onMarkAttendance) {
      actions.push(
        <button key="mark" type="button" className="gt-sched-item__action" onClick={() => onMarkAttendance(item)}>Mark attendance</button>,
      );
    }
  }
  if (staff && row.isTbd && onSetTime && item.kind !== 'deadline') {
    actions.push(
      <button key="set" type="button" className="gt-sched-item__action" onClick={() => onSetTime(item)}>
        <ScheduleIcon name="clock" size={15} />Set time
      </button>,
    );
  }

  return (
    <li className={rowClassName(item, row, overlaps.length, className)} aria-current={status === 'live' ? 'true' : undefined}>
      <ScheduleRowTime item={item} row={row} />
      <span className="gt-sched-item__tile"><ScheduleIcon name={row.meta.icon || 'calendar-days'} size={14} /></span>
      <div className="gt-sched-item__main">
        <ScheduleRowHead item={item} row={row} overlaps={overlaps} onOpen={onOpen} />
        <ScheduleRowMeta row={row} faces />
        {status === 'cancelled' && item.cancelReason && <p className="gt-sched-item__reason">{item.cancelReason}</p>}
        {actions.length > 0 && <div className="gt-sched-item__actions">{actions}</div>}
      </div>
    </li>
  );
}
