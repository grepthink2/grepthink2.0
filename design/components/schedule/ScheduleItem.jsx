import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';
import { MeetingCard } from '../domain/MeetingCard.jsx';
import { SCHOOL_ZONE, kindMeta, statusOf, isJoinable, countdown, fmtTime, fmtTimeRange, fmtDuration, isoDuration, fmtDayLabel, dayKey, zoneLabel } from './ScheduleModel.jsx';

/* Lucide paths (24 viewBox, stroke 2, round caps) — the production app imports lucide-react. */
const PATHS = {
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>',
  'clipboard-check': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'door-open': '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.562Z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'calendar-days': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  'calendar-plus': '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};

/** Lucide-shaped inline icon used across the schedule family. */
export function ScheduleIcon({ name, size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" className={className} dangerouslySetInnerHTML={{ __html: PATHS[name] || PATHS['calendar-days'] }} />
  );
}

const ATTENDANCE = { present: ['success', 'Present'], late: ['warning', 'Late'], absent: ['error', 'Absent'], unmarked: ['neutral', 'Not marked'] };

/**
 * One schedule row: time cell · kind tile · title/meta/people · actions.
 * Same component for the compact card and the agenda; `lens` only changes which actions appear.
 */
export function ScheduleItem({
  item, variant = 'agenda', lens = 'student', now, zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, showSchoolTime = false,
  overlaps = [], expandable, expanded = false, onToggle, onJoin, onMarkAttendance, onSetTime, onOpen, className = '',
}) {
  const nowD = now || new Date();
  const meta = kindMeta(item.kind);
  const status = statusOf(item, nowD, zone);
  const joinable = isJoinable(item, nowD);
  const compact = variant === 'compact';
  const marker = item.kind === 'deadline';
  const isTbd = status === 'tbd';
  const isAllDay = !!item.allDay && !isTbd;
  const staff = lens !== 'student';
  const title = item.title || meta.label;
  const kindInTitle = title.toLowerCase().includes(meta.label.toLowerCase());
  const cd = item.kind === 'final_review' && status === 'upcoming' ? countdown(item, nowD, zone) : null;
  const schoolTitle = showSchoolTime && !isAllDay && !isTbd ? `${fmtTimeRange(item, schoolZone)} ${zoneLabel(schoolZone, item.startsAt)}` : undefined;
  const dur = fmtDuration(item);
  const canExpand = expandable !== undefined ? expandable : (!compact && item.kind === 'ta_meeting' && status !== 'cancelled' && !isTbd);
  const panelId = `gt-sched-panel-${item.id}`;

  // time strings
  const startFull = fmtTime(item.startsAt, zone);
  let startShort = startFull, endStr = null;
  if (item.endsAt && !isAllDay) {
    endStr = fmtTime(item.endsAt, zone);
    const [at, ap] = startFull.split(' '), [, bp] = endStr.split(' ');
    if (ap === bp) startShort = at;
  }

  // context line
  const parts = [];
  const primary = item.teamName || (item.kind === 'meeting' && item.scope === 'class' ? 'Whole class' : null);
  if (primary) parts.push({ text: primary, primary: true });
  if (item.classLabel && item.classLabel !== primary) parts.push({ text: item.classLabel });
  if (item.location) parts.push({ text: item.location, place: 'map-pin' });
  else if (item.zoomUrl && item.kind !== 'ta_meeting') parts.push({ text: item.kind === 'final_review' ? 'Shared Zoom room' : 'Zoom', place: 'video' });
  if (item.recurrenceLabel) parts.push({ text: item.recurrenceLabel });
  if (item.meetingsPerWeek > 1 && item.meetingIndex) parts.push({ text: `Meeting ${item.meetingIndex} of ${item.meetingsPerWeek} this week` });
  if (staff && item.kind === 'ta_meeting' && status === 'past' && item.attendance && typeof item.attendance === 'object') parts.push({ text: `${item.attendance.present}/${item.attendance.total} present` });

  // people
  const people = [];
  if (item.host && item.kind !== 'final_review') people.push({ ...item.host, role: item.host.role || (item.kind === 'meeting' ? 'Organizer' : item.kind === 'ta_meeting' ? 'TA' : undefined) });
  (item.reviewers || []).forEach((r) => people.push({ ...r, role: r.slot === 'home' ? 'Home TA' : 'Review TA' }));
  const personName = (p) => (p.you ? 'You' : p.name);

  const att = item.kind === 'ta_meeting' && status === 'past' && typeof item.attendance === 'string' ? ATTENDANCE[item.attendance] : null;

  // actions
  const actions = [];
  if (joinable) {
    actions.push(<a key="join" className="gt-sched-item__action gt-sched-item__action--primary" href={item.zoomUrl} target="_blank" rel="noreferrer" onClick={onJoin ? () => onJoin(item) : undefined}><ScheduleIcon name="video" size={15} />Join Zoom</a>);
  } else if (!compact && item.zoomUrl && status === 'upcoming') {
    actions.push(<a key="zoom" className="gt-sched-item__action" href={item.zoomUrl} target="_blank" rel="noreferrer" onClick={onJoin ? () => onJoin(item) : undefined}><ScheduleIcon name="video" size={15} />Zoom</a>);
  }
  if (staff && item.kind === 'ta_meeting' && (status === 'live' || status === 'past') && onMarkAttendance) {
    actions.push(<button key="mark" type="button" className="gt-sched-item__action" onClick={() => onMarkAttendance(item)}>Mark attendance</button>);
  }
  if (staff && isTbd && onSetTime && item.kind !== 'deadline') {
    actions.push(<button key="set" type="button" className="gt-sched-item__action" onClick={() => onSetTime(item)}><ScheduleIcon name="clock" size={15} />Set time</button>);
  }
  if (canExpand) {
    actions.push(
      <button key="more" type="button" className="gt-sched-item__toggle" aria-expanded={expanded} aria-controls={panelId}
        aria-label={expanded ? 'Hide meeting details' : 'Show meeting details'} onClick={() => onToggle && onToggle(item)}>
        <ScheduleIcon name="chevron-down" size={16} />
      </button>,
    );
  }

  let panel = null;
  if (canExpand && expanded) {
    const d = fmtDayLabel(dayKey(item.startsAt, zone), nowD, zone);
    const when = `${d.title === 'Today' || d.title === 'Tomorrow' || d.title === 'Yesterday' ? d.date : `${d.title.slice(0, 3)}, ${d.date}`} · ${fmtTimeRange(item, zone)}`;
    panel = (
      <div id={panelId} className="gt-sched-item__panel">
        <MeetingCard team={item.teamName || title} time={when} zoomUrl={item.zoomUrl || undefined} attendees={item.attendees || []}
          attendance={item.attendance && typeof item.attendance === 'object' ? item.attendance : undefined}
          status={status === 'past' ? (item.attendance === 'absent' ? 'missed' : 'completed') : 'upcoming'}
          onMarkAttendance={staff && onMarkAttendance ? () => onMarkAttendance(item) : undefined} />
      </div>
    );
  }

  const cls = ['gt-sched-item', `gt-sched-item--${item.kind}`, `gt-sched-item--${status}`, marker ? 'gt-sched-item--marker' : '', isAllDay ? 'gt-sched-item--allday' : '',
    overlaps.length ? 'gt-sched-item--overlap' : '', expanded ? 'gt-sched-item--expanded' : '', className].filter(Boolean).join(' ');
  const sepBefore = (i) => i > 0 || !kindInTitle;
  const overlapTitle = overlaps.length ? `Overlaps with ${overlaps.map((o) => o.title).join(', ')}` : undefined;

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
              {endStr && <> – <time dateTime={item.endsAt}>{endStr}</time></>}
            </span>
            <time className="gt-sched-item__start" dateTime={item.startsAt} title={schoolTitle}>{startFull}</time>
            {dur ? <time className="gt-sched-item__dur" dateTime={isoDuration(item)}>{dur}</time> : marker ? <span className="gt-sched-item__due">Due</span> : null}
          </>
        )}
      </div>
      <span className="gt-sched-item__tile"><ScheduleIcon name={meta.icon || 'calendar-days'} size={compact ? 14 : 16} /></span>
      <div className="gt-sched-item__main">
        <div className="gt-sched-item__head">
          <span className="gt-sched-item__title">
            {item.href ? <a href={item.href} onClick={onOpen ? (e) => { e.preventDefault(); onOpen(item); } : undefined}>{title}</a> : title}
          </span>
          {status === 'live' && <Badge status="live" />}
          {cd && <span className="gt-sched-item__countdown">{cd}</span>}
          {att && <Badge tone={att[0]}>{att[1]}</Badge>}
          {status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
          {overlaps.length > 0 && <Badge tone="warning" title={overlapTitle}>Overlaps<span className="gt-sched-item__sr"> with {overlaps.map((o) => o.title).join(', ')}</span></Badge>}
        </div>
        <div className="gt-sched-item__meta">
          {!kindInTitle && <span className="gt-sched-item__kind">{meta.label}</span>}
          {parts.map((p, i) => (
            <React.Fragment key={i}>
              {sepBefore(i) && <span className="gt-sched-item__sep" aria-hidden="true">·</span>}
              <span className={p.primary ? 'gt-sched-item__meta-primary' : p.place ? 'gt-sched-item__place' : undefined}>
                {p.place && <ScheduleIcon name={p.place} size={12} />}{p.text}
              </span>
            </React.Fragment>
          ))}
          {compact && people.length > 0 && (
            <span className="gt-sched-item__faces">
              {people.map((p, i) => <Avatar key={i} size="xs" name={p.name} src={p.avatarUrl} title={`${personName(p)}${p.role ? ` · ${p.role}` : ''}`} />)}
            </span>
          )}
        </div>
        {!compact && people.length > 0 && (
          <div className="gt-sched-item__people">
            {people.map((p, i) => (
              <span key={i} className="gt-sched-item__person">
                <Avatar size="xs" name={p.name} src={p.avatarUrl} />{personName(p)}{p.role && <span className="gt-sched-item__person-role">· {p.role}</span>}
              </span>
            ))}
          </div>
        )}
        {!compact && item.note && status !== 'cancelled' && <p className="gt-sched-item__note">{item.note}</p>}
        {status === 'cancelled' && item.cancelReason && <p className="gt-sched-item__reason">{item.cancelReason}</p>}
        {compact && actions.length > 0 && <div className="gt-sched-item__actions">{actions}</div>}
      </div>
      {!compact && actions.length > 0 && <div className="gt-sched-item__actions">{actions}</div>}
      {panel}
    </li>
  );
}
