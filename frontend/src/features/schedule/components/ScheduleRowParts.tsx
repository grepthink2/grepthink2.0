import { Fragment } from 'react';
import { Avatar } from '@/components/Avatar/Avatar';
import { Badge } from '@/components/Badge/Badge';
import { isoDuration, type ScheduleItemData } from '../scheduleModel';
import { personName, type ScheduleRow } from '../scheduleRow';
import { ScheduleIcon } from './ScheduleIcon';
import '../schedule.scss';

/** The time cell: "Time TBD", "All day", or the range / start, the duration (or "Due") under it. */
export function ScheduleRowTime({ item, row }: { item: ScheduleItemData; row: ScheduleRow }) {
  return (
    <div className="gt-sched-item__time">
      {row.isTbd ? (
        <span className="gt-sched-item__tbd"><ScheduleIcon name="clock" size={13} />Time TBD</span>
      ) : row.isAllDay ? (
        <span className="gt-sched-item__allday">All day</span>
      ) : (
        <>
          <span className="gt-sched-item__range" title={row.schoolTitle}>
            <time dateTime={item.startsAt}>{row.endStr ? row.startShort : row.startFull}</time>
            {row.endStr && <> – <time dateTime={item.endsAt ?? undefined}>{row.endStr}</time></>}
          </span>
          <time className="gt-sched-item__start" dateTime={item.startsAt} title={row.schoolTitle}>{row.startFull}</time>
          {row.duration ? (
            <time className="gt-sched-item__dur" dateTime={isoDuration(item) ?? undefined}>{row.duration}</time>
          ) : row.marker ? (
            <span className="gt-sched-item__due">Due</span>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Title (a link for a deadline with `href`) and the pills: Live, the countdown, attendance, Cancelled, Overlaps. */
export function ScheduleRowHead({
  item, row, overlaps, onOpen,
}: {
  item: ScheduleItemData;
  row: ScheduleRow;
  overlaps: ScheduleItemData[];
  onOpen?: (item: ScheduleItemData) => void;
}) {
  const overlapNames = overlaps.map((o) => o.title).join(', ');
  return (
    <div className="gt-sched-item__head">
      <span className="gt-sched-item__title">
        {item.href ? (
          <a href={item.href} onClick={onOpen ? (e) => { e.preventDefault(); onOpen(item); } : undefined}>{row.title}</a>
        ) : row.title}
      </span>
      {row.status === 'live' && <Badge status="live" />}
      {row.countdown && <span className="gt-sched-item__countdown">{row.countdown}</span>}
      {row.attendanceBadge && <Badge status={row.attendanceBadge} />}
      {row.status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
      {overlaps.length > 0 && (
        <Badge tone="warning" title={`Overlaps with ${overlapNames}`}>
          Overlaps<span className="gt-sched-item__sr"> with {overlapNames}</span>
        </Badge>
      )}
    </div>
  );
}

/** The context line: the kind eyebrow when the title does not say it, the parts, and (compact) the people's faces. */
export function ScheduleRowMeta({ row, faces }: { row: ScheduleRow; faces: boolean }) {
  const sepBefore = (i: number): boolean => i > 0 || !row.kindInTitle;
  return (
    <div className="gt-sched-item__meta">
      {!row.kindInTitle && <span className="gt-sched-item__kind">{row.meta.label}</span>}
      {row.parts.map((p, i) => (
        <Fragment key={i}>
          {sepBefore(i) && <span className="gt-sched-item__sep" aria-hidden="true">·</span>}
          <span className={p.primary ? 'gt-sched-item__meta-primary' : p.place ? 'gt-sched-item__place' : undefined}>
            {p.place && <ScheduleIcon name={p.place} size={12} />}{p.text}
          </span>
        </Fragment>
      ))}
      {faces && row.people.length > 0 && (
        <span className="gt-sched-item__faces">
          {row.people.map((p, i) => (
            <Avatar key={i} size="xs" name={p.name} src={p.avatarUrl} title={`${personName(p)}${p.role ? ` · ${p.role}` : ''}`} />
          ))}
        </span>
      )}
    </div>
  );
}

/** The Zoom link: primary "Join Zoom" inside the join window, a quiet outlined "Zoom" before it. */
export function ScheduleZoomLink({
  item, primary, onJoin,
}: {
  item: ScheduleItemData;
  primary: boolean;
  onJoin?: (item: ScheduleItemData) => void;
}) {
  return (
    <a
      className={primary ? 'gt-sched-item__action gt-sched-item__action--primary' : 'gt-sched-item__action'}
      href={item.zoomUrl ?? undefined}
      target="_blank"
      rel="noreferrer"
      onClick={onJoin ? () => onJoin(item) : undefined}
    >
      <ScheduleIcon name="video" size={15} />{primary ? 'Join Zoom' : 'Zoom'}
    </a>
  );
}
