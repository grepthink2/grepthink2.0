/**
 * What one schedule row shows, worked out once for both rows: the compact one (ScheduleItem, the team meetings card) and
 * the agenda's (ScheduleAgendaItem). Pure: the clock and the zones come in.
 */
import type { BadgeStatus } from '@/components/Badge/badgeStatus';
import {
  countdown,
  fmtDuration,
  fmtTime,
  fmtTimeRange,
  isJoinable,
  kindMeta,
  statusOf,
  zoneLabel,
  type ScheduleItemData,
  type ScheduleKindMeta,
  type ScheduleLens,
  type SchedulePerson,
  type ScheduleStatus,
} from './scheduleModel';

/** A context-line token: the team or "Whole class" first (`primary`), places with their glyph. */
export interface MetaPart {
  text: string;
  primary?: boolean;
  place?: 'map-pin' | 'video';
}

export interface ScheduleRow {
  meta: ScheduleKindMeta;
  status: ScheduleStatus;
  joinable: boolean;
  marker: boolean;
  isTbd: boolean;
  isAllDay: boolean;
  staff: boolean;
  title: string;
  /** The title already names the kind, so the context line has no kind eyebrow. */
  kindInTitle: boolean;
  /** Final reviews within a week: "today" / "tomorrow" / "in 3 days". */
  countdown: string | null;
  /** The campus time for each <time>'s title, when the viewer is elsewhere. */
  schoolTitle?: string;
  duration: string | null;
  startFull: string;
  /** The start without its AM/PM when the end shares it. */
  startShort: string;
  endStr: string | null;
  parts: MetaPart[];
  /** Host (with a role) and reviewers (Home TA / Review TA). */
  people: SchedulePerson[];
  /** A student's own status on a past TA meeting. */
  attendanceBadge: BadgeStatus | null;
}

export interface ScheduleRowOptions {
  lens: ScheduleLens;
  now: Date;
  /** The viewer's zone. */
  zone: string;
  schoolZone?: string;
  showSchoolTime?: boolean;
}

export function scheduleRow(item: ScheduleItemData, { lens, now, zone, schoolZone, showSchoolTime = false }: ScheduleRowOptions): ScheduleRow {
  const meta = kindMeta(item.kind);
  const status = statusOf(item, now, zone);
  const isTbd = status === 'tbd';
  const isAllDay = !!item.allDay && !isTbd;
  const staff = lens !== 'student';
  const title = item.title || meta.label;

  const startFull = fmtTime(item.startsAt, zone);
  let startShort = startFull;
  let endStr: string | null = null;
  if (item.endsAt && !isAllDay) {
    endStr = fmtTime(item.endsAt, zone);
    const [at, ap] = startFull.split(' ');
    if (ap === endStr.split(' ')[1]) startShort = at;
  }

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

  const people: SchedulePerson[] = [];
  if (item.host && item.kind !== 'final_review') {
    people.push({ ...item.host, role: item.host.role || (item.kind === 'meeting' ? 'Organizer' : item.kind === 'ta_meeting' ? 'TA' : undefined) });
  }
  (item.reviewers ?? []).forEach((r) => people.push({ ...r, role: r.slot === 'home' ? 'Home TA' : 'Review TA' }));

  return {
    meta,
    status,
    joinable: isJoinable(item, now),
    marker: item.kind === 'deadline',
    isTbd,
    isAllDay,
    staff,
    title,
    kindInTitle: title.toLowerCase().includes(meta.label.toLowerCase()),
    countdown: item.kind === 'final_review' && status === 'upcoming' ? countdown(item, now, zone) : null,
    schoolTitle: showSchoolTime && schoolZone && !isAllDay && !isTbd ? `${fmtTimeRange(item, schoolZone)} ${zoneLabel(schoolZone, item.startsAt)}` : undefined,
    duration: fmtDuration(item),
    startFull,
    startShort,
    endStr,
    parts,
    people,
    attendanceBadge: item.kind === 'ta_meeting' && status === 'past' && typeof item.attendance === 'string' ? `attendance.${item.attendance}` : null,
  };
}

/** "You" for the viewer, else the name. */
export const personName = (p: SchedulePerson): string => (p.you ? 'You' : p.name);

/** The row's classes: kind, status and the variants the stylesheet keys on. */
export function rowClassName(item: ScheduleItemData, row: ScheduleRow, overlaps: number, className = ''): string {
  return [
    'gt-sched-item', `gt-sched-item--${item.kind}`, `gt-sched-item--${row.status}`, row.marker ? 'gt-sched-item--marker' : '',
    row.isAllDay ? 'gt-sched-item--allday' : '', overlaps ? 'gt-sched-item--overlap' : '', className,
  ].filter(Boolean).join(' ');
}
