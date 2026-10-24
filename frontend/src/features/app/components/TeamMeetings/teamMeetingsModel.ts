/**
 * Pure model for a team's own one-off meetings (the Edit Project Meetings tab and the project-page
 * "Team meetings" card). No UI. Port of design/components/domain/TeamMeetingsModel.jsx (the handoff
 * in design/design_handoff_team_meetings/): the upcoming/past split, the schedule-item conversion,
 * viewer-clock ↔ instant conversion, the campus-time hint and form validation.
 *
 * Everything here is camelCase and times are ISO instants; the API's snake_case rows are mapped
 * to this shape at the edge of the feature, never in here.
 */
import {
  dayKey,
  fmtTime,
  fmtTimeRange,
  viewerZone,
  zoneLabel,
  type ScheduleItemData,
  type SchedulePerson,
} from '@features/schedule/scheduleModel';

/** One team meeting as the API stores it (times are ISO instants). */
export interface TeamMeeting {
  id: string;
  projectId: string;
  title: string;
  /** ISO 8601 instant (UTC). */
  startsAt: string;
  /** 15-minute steps; 60 by default. */
  durationMinutes: number;
  /** A room ("E2 room 180"); null when online-only. */
  location?: string | null;
  /** Full https URL; rendered as "Zoom" and as the Join action inside the 10-minute window. */
  zoomUrl?: string | null;
  /** ≤ 500 chars, one line in lists. */
  note?: string | null;
  /** User id of the Product Owner who created it (or the person object when the API joins it). */
  createdBy?: string | SchedulePerson;
  updatedAt?: string;
}

/** What the form edits: date and time are read on the viewer's clock. */
export interface TeamMeetingDraft {
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' (24h) */
  time: string;
  durationMinutes: number;
  location: string;
  zoomUrl: string;
  note: string;
}

/** What `onCreate` / `onUpdate` receive. */
export interface TeamMeetingPayload {
  title: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  zoomUrl: string | null;
  note: string | null;
}

export interface TeamMeetingValidation {
  valid: boolean;
  errors: Partial<Record<'title' | 'date' | 'time' | 'zoomUrl' | 'note', string>>;
  value: TeamMeetingPayload | null;
}

export const TEAM_MEETING_TITLE_MAX = 80;
export const TEAM_MEETING_NOTE_MAX = 500;
export const TEAM_MEETING_DEFAULT_DURATION = 60;
/** 15-minute steps to 2 h, then the common long slots. */
export const TEAM_MEETING_DURATIONS: number[] = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240];

const toDate = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));

/** "45 min" · "1 h" · "1 h 15 min" */
export function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** ISO 8601 duration for <time datetime>: "PT1H15M" */
export function isoMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`;
}

export function endsAtOf(m: Pick<TeamMeeting, 'startsAt' | 'durationMinutes'>): string {
  return new Date(toDate(m.startsAt).getTime() + (Number(m.durationMinutes) || 0) * 60000).toISOString();
}

/** From the start up to, not including, the end. */
export function isLive(m: TeamMeeting, now: Date = new Date()): boolean {
  const at = toDate(now).getTime();
  return toDate(m.startsAt).getTime() <= at && at < toDate(endsAtOf(m)).getTime();
}

export function isPast(m: TeamMeeting, now: Date = new Date()): boolean {
  return toDate(endsAtOf(m)).getTime() <= toDate(now).getTime();
}

/** { upcoming: soonest first (a meeting in progress counts as upcoming), past: most recent first } */
export function splitMeetings(meetings: TeamMeeting[], now: Date = new Date()): { upcoming: TeamMeeting[]; past: TeamMeeting[] } {
  const upcoming: TeamMeeting[] = [];
  const past: TeamMeeting[] = [];
  for (const m of meetings) (isPast(m, now) ? past : upcoming).push(m);
  upcoming.sort(
    (a, b) => toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime() || String(a.title || '').localeCompare(String(b.title || '')),
  );
  past.sort((a, b) => toDate(b.startsAt).getTime() - toDate(a.startsAt).getTime());
  return { upcoming, past };
}

/** TeamMeeting → ScheduleItemData (kind 'meeting') for ScheduleItem rows and the schedule feed. `people` maps createdBy → person. */
export function toScheduleItem(
  m: TeamMeeting,
  { teamName, people = {}, href }: { teamName?: string; people?: Record<string, SchedulePerson>; href?: string } = {},
): ScheduleItemData {
  const host: SchedulePerson | undefined = typeof m.createdBy === 'object' ? m.createdBy : m.createdBy ? people[m.createdBy] : undefined;
  return {
    id: m.id,
    kind: 'meeting',
    title: m.title,
    startsAt: toDate(m.startsAt).toISOString(),
    endsAt: endsAtOf(m),
    allDay: false,
    scope: 'team',
    teamName,
    projectId: m.projectId,
    location: m.location || undefined,
    zoomUrl: m.zoomUrl || undefined,
    note: m.note || undefined,
    host: host ? { id: host.id, name: host.name, avatarUrl: host.avatarUrl, you: host.you, role: 'Organizer' } : undefined,
    href,
  };
}

/* ── Wall clock ↔ instant (the viewer's zone; two-pass offset correction, DST-safe) ─────────── */
function wallParts(d: Date, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour === '24' ? '00' : hour}:${get('minute')}` };
}

/** 'YYYY-MM-DD' + 'HH:MM' read on `zone`'s clock → the instant. */
export function zonedToInstant(date: string, time: string, zone: string = viewerZone()): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = wallParts(new Date(t), zone);
    const [py, pm, pd] = p.date.split('-').map(Number);
    const [ph, pmi] = p.time.split(':').map(Number);
    t += wall - Date.UTC(py, pm - 1, pd, ph, pmi);
  }
  return new Date(t);
}

/** Date/ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } on `zone`'s clock. */
export function instantToZoned(when: string | Date, zone: string = viewerZone()): { date: string; time: string } {
  return wallParts(toDate(when), zone);
}

/** "3:00 PM PT" (+ " · Wed" when the campus day differs) for a date + time typed on the viewer's clock (`zone`); null until both are set. `schoolZone` is the class's school's, never a guess. */
export function campusTimeOf(date: string, time: string, zone: string, schoolZone: string): string | null {
  if (!date || !time) return null;
  const inst = zonedToInstant(date, time, zone);
  const sameDay = dayKey(inst, zone) === dayKey(inst, schoolZone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: schoolZone, weekday: 'short' }).format(inst);
  return `${fmtTime(inst, schoolZone)} ${zoneLabel(schoolZone, inst)}${sameDay ? '' : ` · ${weekday}`}`;
}

/** { day: 'Tue, Oct 20' (adds the year when it isn't this one), start: '3:00', end: '4:00 PM', range: '3:00 – 4:00 PM' } */
export function fmtMeetingWhen(
  m: TeamMeeting,
  zone: string = viewerZone(),
  now: Date = new Date(),
): { day: string; start: string; end: string; range: string } {
  const s = toDate(m.startsAt);
  const endsAt = endsAtOf(m);
  const year = (d: Date): string => new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric' }).format(d);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(year(s) === year(toDate(now)) ? {} : { year: 'numeric' as const }),
  }).format(s);
  const a = fmtTime(s, zone);
  const b = fmtTime(endsAt, zone);
  const [at, ap] = a.split(' ');
  const bp = b.split(' ')[1];
  return { day, start: ap === bp ? at : a, end: b, range: fmtTimeRange({ startsAt: s.toISOString(), endsAt }, zone) };
}

/* ── Form draft + validation ───────────────────────────────────────────────────────────────── */
export function draftFrom(m: TeamMeeting | null, zone: string = viewerZone()): TeamMeetingDraft {
  if (!m) return { title: '', date: '', time: '', durationMinutes: TEAM_MEETING_DEFAULT_DURATION, location: '', zoomUrl: '', note: '' };
  const z = instantToZoned(m.startsAt, zone);
  return {
    title: m.title || '',
    date: z.date,
    time: z.time,
    durationMinutes: Number(m.durationMinutes) || TEAM_MEETING_DEFAULT_DURATION,
    location: m.location || '',
    zoomUrl: m.zoomUrl || '',
    note: m.note || '',
  };
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate a draft typed on the viewer's clock.
 * → { valid, errors: { title?, date?, time?, zoomUrl?, note? }, value: API payload { title, startsAt, durationMinutes, location, zoomUrl, note } | null }
 * `creating` adds the no-past-start rule; edits may keep (or move) a time that has passed.
 */
export function validateTeamMeeting(
  draft: TeamMeetingDraft,
  { now = new Date(), zone = viewerZone(), creating = true }: { now?: Date; zone?: string; creating?: boolean } = {},
): TeamMeetingValidation {
  const errors: TeamMeetingValidation['errors'] = {};
  const title = (draft.title || '').trim();
  if (!title) errors.title = 'Give the meeting a title.';
  else if (title.length > TEAM_MEETING_TITLE_MAX) errors.title = `Keep it under ${TEAM_MEETING_TITLE_MAX} characters.`;
  if (!draft.date) errors.date = 'Pick a date.';
  if (!draft.time) errors.time = 'Pick a start time.';
  let startsAt: Date | null = null;
  if (draft.date && draft.time) {
    startsAt = zonedToInstant(draft.date, draft.time, zone);
    if (creating && startsAt.getTime() < toDate(now).getTime()) errors.time = 'That time has already passed.';
  }
  const zoomUrl = (draft.zoomUrl || '').trim();
  if (zoomUrl && !isHttpUrl(zoomUrl)) errors.zoomUrl = 'Enter the full link, like https://ucsc.zoom.us/j/…';
  const note = (draft.note || '').trim();
  if (note.length > TEAM_MEETING_NOTE_MAX) errors.note = `Keep the note under ${TEAM_MEETING_NOTE_MAX} characters.`;
  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    value:
      valid && startsAt
        ? {
            title,
            startsAt: startsAt.toISOString(),
            durationMinutes: Number(draft.durationMinutes) || TEAM_MEETING_DEFAULT_DURATION,
            location: (draft.location || '').trim() || null,
            zoomUrl: zoomUrl || null,
            note: note || null,
          }
        : null,
  };
}

/** Should the project page render the card? Members see it once a meeting exists; the Product Owner also gets the quiet "Add one" line. */
export function showTeamMeetingsCard(
  meetings: TeamMeeting[],
  { canManage = false, status = 'ready' }: { canManage?: boolean; status?: 'ready' | 'loading' | 'error' } = {},
): boolean {
  return status !== 'ready' || meetings.length > 0 || canManage;
}
