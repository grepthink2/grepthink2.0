import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/Avatar/Avatar';
import { Badge } from '@/components/Badge/Badge';
import type { BadgeStatus } from '@/components/Badge/badgeStatus';
import { useNow } from '@/lib/useNow';
import {
  countdown,
  fmtDuration,
  fmtTime,
  fmtTimeRange,
  isJoinable,
  isoDuration,
  kindMeta,
  statusOf,
  viewerZone,
  zoneLabel,
  type ScheduleItemData,
  type ScheduleLens,
  type SchedulePerson,
} from '../scheduleModel';
import { ScheduleIcon } from './ScheduleIcon';
import '../schedule.scss';

/** A context-line token: the team or "Whole class" first (`primary`), places with their glyph. */
interface MetaPart {
  text: string;
  primary?: boolean;
  place?: 'map-pin' | 'video';
}

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
  onSetTime?: (item: ScheduleItemData) => void;
  /** Deadline titles with `href` call this instead of navigating. */
  onOpen?: (item: ScheduleItemData) => void;
  className?: string;
}

/**
 * One compact schedule row (an <li>): time cell · kind tile · title / context / organizer faces, with
 * Join Zoom under the context line inside the join window. Seat it in an `<ol class="gt-sched__items">`
 * inside `.gt-sched.gt-sched--compact`, which sets the row's grid. Port of design/components/schedule/
 * ScheduleItem.jsx, the compact variant only: the agenda row (actions column, people list, note,
 * expand toggle) and its MeetingCard panel wait for the schedule endpoint. A live row shows the kit's
 * `<Badge status="live" />` (blue: in progress) where the design draws a green pulsing pill.
 */
export function ScheduleItem({
  item, lens = 'student', now, zone = viewerZone(), schoolZone, showSchoolTime = false,
  overlaps = [], onJoin, onMarkAttendance, onSetTime, onOpen, className = '',
}: ScheduleItemProps) {
  const nowD = useNow(30000, now);
  const meta = kindMeta(item.kind);
  const status = statusOf(item, nowD, zone);
  const joinable = isJoinable(item, nowD);
  const marker = item.kind === 'deadline';
  const isTbd = status === 'tbd';
  const isAllDay = !!item.allDay && !isTbd;
  const staff = lens !== 'student';
  const title = item.title || meta.label;
  const kindInTitle = title.toLowerCase().includes(meta.label.toLowerCase());
  const cd = item.kind === 'final_review' && status === 'upcoming' ? countdown(item, nowD, zone) : null;
  const schoolTitle = showSchoolTime && schoolZone && !isAllDay && !isTbd ? `${fmtTimeRange(item, schoolZone)} ${zoneLabel(schoolZone, item.startsAt)}` : undefined;
  const dur = fmtDuration(item);

  // time strings
  const startFull = fmtTime(item.startsAt, zone);
  let startShort = startFull;
  let endStr: string | null = null;
  if (item.endsAt && !isAllDay) {
    endStr = fmtTime(item.endsAt, zone);
    const [at, ap] = startFull.split(' ');
    if (ap === endStr.split(' ')[1]) startShort = at;
  }

  // context line
  const parts: MetaPart[] = [];
  const primary = item.teamName || (item.kind === 'meeting' && item.scope === 'class' ? 'Whole class' : null);
  if (primary) parts.push({ text: primary, primary: true });
  if (item.classLabel && item.classLabel !== primary) parts.push({ text: item.classLabel });
  if (item.location) parts.push({ text: item.location, place: 'map-pin' });
  else if (item.zoomUrl && item.kind !== 'ta_meeting') parts.push({ text: item.kind === 'final_review' ? 'Shared Zoom room' : 'Zoom', place: 'video' });
  if (item.recurrenceLabel) parts.push({ text: item.recurrenceLabel });
  if (item.meetingsPerWeek && item.meetingsPerWeek > 1 && item.meetingIndex) parts.push({ text: `Meeting ${item.meetingIndex} of ${item.meetingsPerWeek} this week` });
  if (staff && item.kind === 'ta_meeting' && status === 'past' && item.attendance && typeof item.attendance === 'object') {
    parts.push({ text: `${item.attendance.present}/${item.attendance.total} present` });
  }

  // people: faces at the end of the context line (names in each one's title)
  const people: SchedulePerson[] = [];
  if (item.host && item.kind !== 'final_review') {
    people.push({ ...item.host, role: item.host.role || (item.kind === 'meeting' ? 'Organizer' : item.kind === 'ta_meeting' ? 'TA' : undefined) });
  }
  (item.reviewers ?? []).forEach((r) => people.push({ ...r, role: r.slot === 'home' ? 'Home TA' : 'Review TA' }));
  const personName = (p: SchedulePerson): string => (p.you ? 'You' : p.name);

  const att: BadgeStatus | null = item.kind === 'ta_meeting' && status === 'past' && typeof item.attendance === 'string'
    ? `attendance.${item.attendance}`
    : null;

  // actions (under the context line)
  const actions: ReactNode[] = [];
  if (joinable) {
    actions.push(
      <a
        key="join"
        className="gt-sched-item__action gt-sched-item__action--primary"
        href={item.zoomUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        onClick={onJoin ? () => onJoin(item) : undefined}
      >
        <ScheduleIcon name="video" size={15} />Join Zoom
      </a>,
    );
  }
  if (staff && item.kind === 'ta_meeting' && (status === 'live' || status === 'past') && onMarkAttendance) {
    actions.push(
      <button key="mark" type="button" className="gt-sched-item__action" onClick={() => onMarkAttendance(item)}>Mark attendance</button>,
    );
  }
  if (staff && isTbd && onSetTime && item.kind !== 'deadline') {
    actions.push(
      <button key="set" type="button" className="gt-sched-item__action" onClick={() => onSetTime(item)}>
        <ScheduleIcon name="clock" size={15} />Set time
      </button>,
    );
  }

  const cls = [
    'gt-sched-item', `gt-sched-item--${item.kind}`, `gt-sched-item--${status}`, marker ? 'gt-sched-item--marker' : '',
    isAllDay ? 'gt-sched-item--allday' : '', overlaps.length ? 'gt-sched-item--overlap' : '', className,
  ].filter(Boolean).join(' ');
  const sepBefore = (i: number): boolean => i > 0 || !kindInTitle;
  const overlapNames = overlaps.map((o) => o.title).join(', ');

  return (
    <li className={cls} aria-current={status === 'live' ? 'true' : undefined}>
      <div className="gt-sched-item__time">
        {isTbd ? (
          <span className="gt-sched-item__tbd"><ScheduleIcon name="clock" size={13} />Time TBD</span>
        ) : isAllDay ? (
          <span className="gt-sched-item__allday">All day</span>
        ) : (
          <>
            <span className="gt-sched-item__range" title={schoolTitle}>
              <time dateTime={item.startsAt}>{endStr ? startShort : startFull}</time>
              {endStr && <> – <time dateTime={item.endsAt ?? undefined}>{endStr}</time></>}
            </span>
            <time className="gt-sched-item__start" dateTime={item.startsAt} title={schoolTitle}>{startFull}</time>
            {dur ? <time className="gt-sched-item__dur" dateTime={isoDuration(item) ?? undefined}>{dur}</time> : marker ? <span className="gt-sched-item__due">Due</span> : null}
          </>
        )}
      </div>
      <span className="gt-sched-item__tile"><ScheduleIcon name={meta.icon || 'calendar-days'} size={14} /></span>
      <div className="gt-sched-item__main">
        <div className="gt-sched-item__head">
          <span className="gt-sched-item__title">
            {item.href ? (
              <a href={item.href} onClick={onOpen ? (e) => { e.preventDefault(); onOpen(item); } : undefined}>{title}</a>
            ) : title}
          </span>
          {status === 'live' && <Badge status="live" />}
          {cd && <span className="gt-sched-item__countdown">{cd}</span>}
          {att && <Badge status={att} />}
          {status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
          {overlaps.length > 0 && (
            <Badge tone="warning" title={`Overlaps with ${overlapNames}`}>
              Overlaps<span className="gt-sched-item__sr"> with {overlapNames}</span>
            </Badge>
          )}
        </div>
        <div className="gt-sched-item__meta">
          {!kindInTitle && <span className="gt-sched-item__kind">{meta.label}</span>}
          {parts.map((p, i) => (
            <Fragment key={i}>
              {sepBefore(i) && <span className="gt-sched-item__sep" aria-hidden="true">·</span>}
              <span className={p.primary ? 'gt-sched-item__meta-primary' : p.place ? 'gt-sched-item__place' : undefined}>
                {p.place && <ScheduleIcon name={p.place} size={12} />}{p.text}
              </span>
            </Fragment>
          ))}
          {people.length > 0 && (
            <span className="gt-sched-item__faces">
              {people.map((p, i) => (
                <Avatar key={i} size="xs" name={p.name} src={p.avatarUrl} title={`${personName(p)}${p.role ? ` · ${p.role}` : ''}`} />
              ))}
            </span>
          )}
        </div>
        {status === 'cancelled' && item.cancelReason && <p className="gt-sched-item__reason">{item.cancelReason}</p>}
        {actions.length > 0 && <div className="gt-sched-item__actions">{actions}</div>}
      </div>
    </li>
  );
}
