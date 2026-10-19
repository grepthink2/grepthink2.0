import { ScheduleModel, SCHOOL_ZONE } from '../schedule/ScheduleModel.jsx';

const { dayKey, fmtTime, fmtTimeRange, zoneLabel } = ScheduleModel;

/**
 * Pure model for a team's own one-off meetings (Edit Project → Meetings tab, the project-page
 * "Team meetings" card). No UI. Ports to `features/project/teamMeetingsModel.ts`.
 * Data shape: { id, projectId, title, startsAt (ISO instant), durationMinutes, location, zoomUrl, note, createdBy, updatedAt }
 */
export const TEAM_MEETING_TITLE_MAX = 80;
export const TEAM_MEETING_NOTE_MAX = 500;
export const TEAM_MEETING_DEFAULT_DURATION = 60;
/** 15-minute steps to 2 h, then the common long slots. */
export const TEAM_MEETING_DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240];

const toDate = (v) => (v instanceof Date ? v : new Date(v));

/** "45 min" · "1 h" · "1 h 15 min" */
export function fmtMinutes(mins) { const h = Math.floor(mins / 60), m = mins % 60; return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; }
/** ISO 8601 duration for <time datetime>: "PT1H15M" */
export function isoMinutes(mins) { const h = Math.floor(mins / 60), m = mins % 60; return `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`; }
export function endsAtOf(m) { return new Date(toDate(m.startsAt).getTime() + (Number(m.durationMinutes) || 0) * 60000).toISOString(); }
export function isLive(m, now = new Date()) { const n = toDate(now).getTime(); return toDate(m.startsAt).getTime() <= n && n < toDate(endsAtOf(m)).getTime(); }
export function isPast(m, now = new Date()) { return toDate(endsAtOf(m)).getTime() <= toDate(now).getTime(); }

/** { upcoming: soonest first (a meeting in progress counts as upcoming), past: most recent first } */
export function splitMeetings(meetings = [], now = new Date()) {
  const upcoming = [], past = [];
  for (const m of meetings) (isPast(m, now) ? past : upcoming).push(m);
  upcoming.sort((a, b) => toDate(a.startsAt) - toDate(b.startsAt) || String(a.title || '').localeCompare(String(b.title || '')));
  past.sort((a, b) => toDate(b.startsAt) - toDate(a.startsAt));
  return { upcoming, past };
}

/** TeamMeeting → ScheduleItemData (kind 'meeting') for ScheduleItem rows and the schedule feed. `people` maps createdBy → person. */
export function toScheduleItem(m, { teamName, people = {}, href } = {}) {
  const host = m.createdBy && typeof m.createdBy === 'object' ? m.createdBy : people[m.createdBy];
  return {
    id: m.id, kind: 'meeting', title: m.title, startsAt: toDate(m.startsAt).toISOString(), endsAt: endsAtOf(m), allDay: false, scope: 'team',
    teamName, projectId: m.projectId, location: m.location || undefined, zoomUrl: m.zoomUrl || undefined, note: m.note || undefined,
    host: host ? { id: host.id, name: host.name, avatarUrl: host.avatarUrl, you: host.you, role: 'Organizer' } : undefined, href,
  };
}

/* ── Wall clock ↔ instant (the viewer's zone; two-pass offset correction, DST-safe) ─────────── */
const wallParts = (d, zone) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
};
/** 'YYYY-MM-DD' + 'HH:MM' read on `zone`'s clock → Date. */
export function zonedToInstant(date, time, zone = SCHOOL_ZONE) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = wallParts(new Date(t), zone);
    const [py, pm, pd] = p.date.split('-').map(Number), [ph, pmi] = p.time.split(':').map(Number);
    t += wall - Date.UTC(py, pm - 1, pd, ph, pmi);
  }
  return new Date(t);
}
/** Date/ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } on `zone`'s clock. */
export function instantToZoned(when, zone = SCHOOL_ZONE) { return wallParts(toDate(when), zone); }

/** "3:00 PM PT" (+ " · Wed" when the campus day differs) for a date + time typed on the viewer's clock; null until both are set. */
export function campusTimeOf(date, time, zone, schoolZone = SCHOOL_ZONE) {
  if (!date || !time) return null;
  const inst = zonedToInstant(date, time, zone);
  const sameDay = dayKey(inst, zone) === dayKey(inst, schoolZone);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: schoolZone, weekday: 'short' }).format(inst);
  return `${fmtTime(inst, schoolZone)} ${zoneLabel(schoolZone, inst)}${sameDay ? '' : ` · ${wd}`}`;
}

/** { day: 'Tue, Oct 20' (adds the year when it isn't this one), start: '3:00', end: '4:00 PM', range: '3:00 – 4:00 PM' } */
export function fmtMeetingWhen(m, zone = SCHOOL_ZONE, now = new Date()) {
  const s = toDate(m.startsAt), e = toDate(endsAtOf(m));
  const yr = (d) => new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric' }).format(d);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', ...(yr(s) === yr(toDate(now)) ? {} : { year: 'numeric' }) }).format(s);
  const a = fmtTime(s, zone), b = fmtTime(e, zone);
  const [at, ap] = a.split(' '), [, bp] = b.split(' ');
  return { day, start: ap === bp ? at : a, end: b, range: fmtTimeRange({ startsAt: s, endsAt: e }, zone) };
}

/* ── Form draft + validation ───────────────────────────────────────────────────────────────── */
export function draftFrom(m, zone = SCHOOL_ZONE) {
  if (!m) return { title: '', date: '', time: '', durationMinutes: TEAM_MEETING_DEFAULT_DURATION, location: '', zoomUrl: '', note: '' };
  const z = instantToZoned(m.startsAt, zone);
  return { title: m.title || '', date: z.date, time: z.time, durationMinutes: Number(m.durationMinutes) || TEAM_MEETING_DEFAULT_DURATION, location: m.location || '', zoomUrl: m.zoomUrl || '', note: m.note || '' };
}
export function isHttpUrl(s) { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
/**
 * Validate a draft typed on the viewer's clock.
 * → { valid, errors: { title?, date?, time?, zoomUrl?, note? }, value: API payload { title, startsAt, durationMinutes, location, zoomUrl, note } | null }
 * `creating` adds the no-past-start rule; edits may keep (or move) a time that has passed.
 */
export function validateTeamMeeting(draft, { now = new Date(), zone = SCHOOL_ZONE, creating = true } = {}) {
  const errors = {};
  const title = (draft.title || '').trim();
  if (!title) errors.title = 'Give the meeting a title.';
  else if (title.length > TEAM_MEETING_TITLE_MAX) errors.title = `Keep it under ${TEAM_MEETING_TITLE_MAX} characters.`;
  if (!draft.date) errors.date = 'Pick a date.';
  if (!draft.time) errors.time = 'Pick a start time.';
  let startsAt = null;
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
    valid, errors,
    value: valid ? { title, startsAt: startsAt.toISOString(), durationMinutes: Number(draft.durationMinutes) || TEAM_MEETING_DEFAULT_DURATION, location: (draft.location || '').trim() || null, zoomUrl: zoomUrl || null, note: note || null } : null,
  };
}
/** Should the project page render the card? Members see it once a meeting exists; the Product Owner also gets the quiet "Add one" line. */
export function showTeamMeetingsCard(meetings = [], { canManage = false, status = 'ready' } = {}) { return status !== 'ready' || meetings.length > 0 || canManage; }

export const TeamMeetingsModel = {
  TEAM_MEETING_TITLE_MAX, TEAM_MEETING_NOTE_MAX, TEAM_MEETING_DEFAULT_DURATION, TEAM_MEETING_DURATIONS,
  fmtMinutes, isoMinutes, endsAtOf, isLive, isPast, splitMeetings, toScheduleItem, zonedToInstant, instantToZoned, campusTimeOf, fmtMeetingWhen,
  draftFrom, isHttpUrl, validateTeamMeeting, showTeamMeetingsCard,
};
