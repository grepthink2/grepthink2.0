/**
 * Pure schedule model: kinds, zone-aware day math, status, the Join window, grouping and the
 * formatters. Port of design/components/schedule/ScheduleModel.jsx (the handoff in
 * design/design_handoff_schedule/), the subset the compact row and the team-meetings card use. Left
 * for the schedule endpoint: the week helpers (weekKeys, fmtWeekLabel), findOverlaps, nowIndex,
 * nextUp, todayOrPeek and the ScheduleModel bundle object.
 *
 * Times render in the viewer's zone; every calendar-day computation happens on 'YYYY-MM-DD' keys,
 * so a daylight-saving change never moves a day.
 */
import { SCHOOL_ZONE } from '@/lib/schoolZone';

export type ScheduleKind = 'ta_meeting' | 'final_review' | 'meeting' | 'lecture' | 'office_hours' | 'deadline' | 'sprint';
export type ScheduleStatus = 'upcoming' | 'live' | 'past' | 'cancelled' | 'tbd';
export type ScheduleLens = 'student' | 'ta' | 'instructor';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'unmarked';

export interface SchedulePerson {
  id?: string;
  name: string;
  /** Optional photo; initials otherwise. */
  avatarUrl?: string;
  /** "TA", "Instructor", "Scrum Master": shown after the name. */
  role?: string;
  /** Render as "You" (the viewer hosts / reviews). */
  you?: boolean;
}

export interface ScheduleReviewer extends SchedulePerson {
  /** Final-review role: the team's Home TA or the claimed Review TA. */
  slot: 'home' | 'review';
}

/** One schedule item: the data contract (design/design_handoff_schedule/README.md, Data contract). */
export interface ScheduleItemData {
  id: string;
  kind: ScheduleKind;
  /** Headline: the kind for recurring structure ("TA meeting", "Lecture", "Office hours", "Final review"), the given title for one-off meetings, "TSR 4 due" for deadlines, the sprint name for sprint edges. */
  title: string;
  /** ISO 8601 instant (UTC). For all-day items and sprint edges: midnight in the school zone. */
  startsAt: string;
  /** ISO 8601 instant; null for deadlines (a point in time) and all-day items. */
  endsAt?: string | null;
  allDay?: boolean;
  classLabel?: string;
  classId?: string;
  teamName?: string;
  projectId?: string;
  /** Room, or a short place label; omitted when the item is on Zoom. */
  location?: string;
  zoomUrl?: string | null;
  /** TA for TA meetings, organizer for one-off meetings, host for office hours. */
  host?: SchedulePerson;
  /** Final review: both reviewers (Home TA + Review TA). */
  reviewers?: ScheduleReviewer[];
  /** "Weekly · Tue" */
  recurrenceLabel?: string;
  /** "Meeting 2 of 2 this week" when `meetingsPerWeek` > 1. */
  meetingIndex?: number;
  meetingsPerWeek?: number;
  /** Student lens: the viewer's own status for a past TA meeting. Staff lens: the team tally. */
  attendance?: AttendanceStatus | { present: number; total: number };
  /** Attendee names for the expanded MeetingCard. */
  attendees?: string[];
  /** Only `cancelled` and `tbd` are authoritative here; `upcoming | live | past` are derived from the clock. */
  status?: ScheduleStatus;
  cancelReason?: string;
  /** One-off meetings: optional note. */
  note?: string;
  /** 'team' | 'class': one-off meeting scope. */
  scope?: 'team' | 'class';
  /** Sprint edge (kind 'sprint'): rendered as the day's rule, never as a row. */
  sprint?: { name: string; edge: 'start' | 'end' };
  /** Deadlines: where the title links. */
  href?: string;
}

export interface ScheduleKindMeta {
  kind: ScheduleKind;
  label: string;
  icon: string | null;
  tone: string | null;
  filterLabel: string | null;
}

export interface ScheduleDayGroup {
  key: string;
  isToday: boolean;
  dividers: ScheduleItemData[];
  items: ScheduleItemData[];
}

/** What the time formatters read from an item. */
type TimeSpan = Pick<ScheduleItemData, 'startsAt' | 'endsAt' | 'allDay'>;

/** "Join Zoom" is prominent from 10 minutes before start until the end. */
export const JOIN_WINDOW_MS = 10 * 60 * 1000;
/** Final reviews show a countdown once they are less than a week away. */
export const COUNTDOWN_DAYS = 7;

const DAY_MS = 86_400_000;

/** Kind palette: icon + label always travel together; the tone names a (soft, text) token pair in schedule.scss. */
const KINDS: readonly ScheduleKindMeta[] = [
  { kind: 'ta_meeting', label: 'TA meeting', icon: 'video', tone: 'green', filterLabel: 'TA meetings' },
  { kind: 'final_review', label: 'Final review', icon: 'clipboard-check', tone: 'purple', filterLabel: 'Final reviews' },
  { kind: 'meeting', label: 'Meeting', icon: 'users', tone: 'blue', filterLabel: 'Meetings' },
  { kind: 'lecture', label: 'Lecture', icon: 'book-open', tone: 'gray', filterLabel: 'Lectures' },
  { kind: 'office_hours', label: 'Office hours', icon: 'door-open', tone: 'outline', filterLabel: 'Office hours' },
  { kind: 'deadline', label: 'Deadline', icon: 'flag', tone: 'amber', filterLabel: 'Deadlines' },
  { kind: 'sprint', label: 'Sprint', icon: null, tone: null, filterLabel: null },
];
const KIND_BY_ID = new Map<string, ScheduleKindMeta>(KINDS.map((k) => [k.kind, k]));

/** A kind this client does not know yet (a newer server) reads as a gray calendar. */
export function kindMeta(kind: string): ScheduleKindMeta {
  return KIND_BY_ID.get(kind) ?? { kind: kind as ScheduleKind, label: kind, icon: 'calendar-days', tone: 'gray', filterLabel: null };
}

const toDate = (v: string | number | Date): Date => (v instanceof Date ? v : new Date(v));

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = zone + JSON.stringify(opts);
  let format = fmtCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, ...opts });
    fmtCache.set(key, format);
  }
  return format;
}

const partOf = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((p) => p.type === type)?.value ?? '';

/* ── Day keys ('YYYY-MM-DD' in a zone): all calendar math happens on keys, so DST never moves a day ── */
export function dayKey(when: string | Date, zone: string = viewerZone()): string {
  const parts = fmt(zone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(when));
  return `${partOf(parts, 'year')}-${partOf(parts, 'month')}-${partOf(parts, 'day')}`;
}
export function keyToDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}
export function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ── Status ──────────────────────────────────────────────────── */
/** upcoming | live | past | cancelled | tbd. `cancelled`/`tbd` come from the data; the rest is derived from the clock. */
export function statusOf(item: ScheduleItemData, now: Date = new Date(), zone: string = viewerZone()): ScheduleStatus {
  if (item.status === 'cancelled' || item.status === 'tbd') return item.status;
  if (item.kind === 'sprint') return 'upcoming';
  const at = toDate(now);
  const start = toDate(item.startsAt);
  if (item.allDay) return dayKey(start, zone) < dayKey(at, zone) ? 'past' : 'upcoming';
  const end = item.endsAt ? toDate(item.endsAt).getTime() : start.getTime();
  if (end <= at.getTime()) return 'past';
  if (start.getTime() <= at.getTime()) return 'live';
  return 'upcoming';
}

/** True inside the Join window: 10 min before start → end, for items with a Zoom link. */
export function isJoinable(item: ScheduleItemData, now: Date = new Date()): boolean {
  if (!item.zoomUrl || item.allDay || item.status === 'cancelled' || item.status === 'tbd') return false;
  const at = toDate(now).getTime();
  const start = toDate(item.startsAt).getTime();
  const end = item.endsAt ? toDate(item.endsAt).getTime() : start;
  return at >= start - JOIN_WINDOW_MS && at < end;
}

/** "today" | "tomorrow" | "in 3 days" when the item starts within COUNTDOWN_DAYS; otherwise null. */
export function countdown(item: ScheduleItemData, now: Date = new Date(), zone: string = viewerZone()): string | null {
  const today = dayKey(now, zone);
  const day = dayKey(item.startsAt, zone);
  if (day < today) return null;
  const days = Math.round((keyToDate(day).getTime() - keyToDate(today).getTime()) / DAY_MS);
  if (days >= COUNTDOWN_DAYS) return null;
  if (days === 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/* ── Order and groups ────────────────────────────────────────── */
const rank = (it: ScheduleItemData): number => (it.kind === 'sprint' ? 0 : it.status === 'tbd' ? 3 : it.allDay ? 1 : 2);

/** Day, then: sprint edges → all-day → timed by start → Time TBD last. */
export function sortItems(items: ScheduleItemData[], zone: string = viewerZone()): ScheduleItemData[] {
  return [...items].sort((a, b) => {
    const ka = dayKey(a.startsAt, zone);
    const kb = dayKey(b.startsAt, zone);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    const byStart = toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime();
    if (byStart) return byStart;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

/** [{ key, isToday, dividers: sprint items, items: everything else }] in day order. */
export function groupByDay(items: ScheduleItemData[], { zone = viewerZone(), now = new Date() }: { zone?: string; now?: Date } = {}): ScheduleDayGroup[] {
  const today = dayKey(now, zone);
  const groups = new Map<string, ScheduleDayGroup>();
  for (const it of sortItems(items, zone)) {
    const key = dayKey(it.startsAt, zone);
    let group = groups.get(key);
    if (!group) {
      group = { key, isToday: key === today, dividers: [], items: [] };
      groups.set(key, group);
    }
    (it.kind === 'sprint' ? group.dividers : group.items).push(it);
  }
  return [...groups.values()];
}

/* ── Formatters (viewer's zone unless told otherwise) ─────────── */
/**
 * Intl may write the space before AM/PM as U+202F (narrow no-break space; Firefox and Safari do).
 * Every time string here, and the code that splits one at its space, uses a plain space.
 */
const plainSpace = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ');

export function fmtTime(when: string | Date, zone: string = viewerZone()): string {
  return plainSpace(fmt(zone, { hour: 'numeric', minute: '2-digit' }).format(toDate(when)));
}

/** "3:00 – 3:45 PM" (period shown once when both sides share it). */
export function fmtTimeRange(item: TimeSpan, zone: string = viewerZone()): string {
  const a = fmtTime(item.startsAt, zone);
  if (!item.endsAt) return a;
  const b = fmtTime(item.endsAt, zone);
  const [at, ap] = a.split(' ');
  const bp = b.split(' ')[1];
  return ap === bp ? `${at} – ${b}` : `${a} – ${b}`;
}

/** "45 min" · "1 h 5 min" · "2 h"; null without an end. */
export function fmtDuration(item: TimeSpan): string | null {
  if (!item.endsAt || item.allDay) return null;
  const mins = Math.round((toDate(item.endsAt).getTime() - toDate(item.startsAt).getTime()) / 60000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** ISO 8601 duration for <time datetime>: "PT45M", "PT1H5M". */
export function isoDuration(item: TimeSpan): string | null {
  if (!item.endsAt) return null;
  const mins = Math.round((toDate(item.endsAt).getTime() - toDate(item.startsAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`;
}

/** { title: 'Today' | 'Tomorrow' | 'Yesterday' | 'Thursday', date: 'Tue, Oct 20' | 'Oct 22' } */
export function fmtDayLabel(key: string, now: Date = new Date(), zone: string = viewerZone()): { title: string; date: string; isToday: boolean } {
  const today = dayKey(now, zone);
  const d = keyToDate(key);
  const rel = key === today ? 'Today' : key === shiftKey(today, 1) ? 'Tomorrow' : key === shiftKey(today, -1) ? 'Yesterday' : null;
  if (rel) return { title: rel, date: fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }).format(d), isToday: key === today };
  return { title: fmt('UTC', { weekday: 'long' }).format(d), date: fmt('UTC', { month: 'short', day: 'numeric' }).format(d), isToday: false };
}

/** Short zone label: "PT", "ET", "GMT+5:30", "CET". */
export function zoneLabel(zone: string, when: string | Date = new Date()): string {
  const part = fmt(zone, { timeZoneName: 'short' }).formatToParts(toDate(when)).find((p) => p.type === 'timeZoneName');
  const v = part ? part.value : zone;
  return /^[PMCEAH][SD]T$/.test(v) ? `${v[0]}T` : v;
}

/** True when two zones have different UTC offsets at `when` (names alone would call PDT ≠ PST a difference). */
export function zoneDiffers(zoneA: string, zoneB: string, when: string | Date = new Date()): boolean {
  if (zoneA === zoneB) return false;
  const offset = (zone: string): string => {
    const part = fmt(zone, { timeZoneName: 'longOffset' }).formatToParts(toDate(when)).find((p) => p.type === 'timeZoneName');
    return part ? part.value : zone;
  };
  return offset(zoneA) !== offset(zoneB);
}

/** The viewer's IANA zone: the browser's, else `SCHOOL_ZONE` when the browser cannot say. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SCHOOL_ZONE;
  } catch {
    return SCHOOL_ZONE;
  }
}
