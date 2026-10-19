import React from 'react';

/**
 * Pure schedule model: kinds, zone-aware day math, status, the Join window,
 * grouping, overlap detection and formatters. No UI.
 * The codebase ports this to `features/schedule/scheduleModel.ts`.
 */

export const SCHOOL_ZONE = 'America/Los_Angeles';
/** "Join Zoom" is prominent from 10 minutes before start until the end. */
export const JOIN_WINDOW_MS = 10 * 60 * 1000;
/** Final reviews show a countdown once they are less than a week away. */
export const COUNTDOWN_DAYS = 7;

/** Kind palette: icon + label always travel together; the tone names a (soft, text) token pair in schedule.css. */
export const SCHEDULE_KINDS = [
  { kind: 'ta_meeting',   label: 'TA meeting',   icon: 'video',           tone: 'green',   filterLabel: 'TA meetings' },
  { kind: 'final_review', label: 'Final review', icon: 'clipboard-check', tone: 'purple',  filterLabel: 'Final reviews' },
  { kind: 'meeting',      label: 'Meeting',      icon: 'users',           tone: 'blue',    filterLabel: 'Meetings' },
  { kind: 'lecture',      label: 'Lecture',      icon: 'book-open',       tone: 'gray',    filterLabel: 'Lectures' },
  { kind: 'office_hours', label: 'Office hours', icon: 'door-open',       tone: 'outline', filterLabel: 'Office hours' },
  { kind: 'deadline',     label: 'Deadline',     icon: 'flag',            tone: 'amber',   filterLabel: 'Deadlines' },
  { kind: 'sprint',       label: 'Sprint',       icon: null,              tone: null,      filterLabel: null },
];
const KIND_BY_ID = Object.fromEntries(SCHEDULE_KINDS.map((k) => [k.kind, k]));
export function kindMeta(kind) { return KIND_BY_ID[kind] || { kind, label: kind, icon: 'calendar-days', tone: 'gray' }; }

const toDate = (v) => (v instanceof Date ? v : new Date(v));
const fmtCache = new Map();
function fmt(zone, opts) {
  const k = zone + JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('en-US', { timeZone: zone, ...opts }));
  return fmtCache.get(k);
}

/* ── Day keys ('YYYY-MM-DD' in a zone) — all calendar math happens on keys, so DST never moves a day ── */
export function dayKey(when, zone = SCHOOL_ZONE) {
  const p = fmt(zone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(when));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function keyToDate(key) { return new Date(`${key}T12:00:00Z`); }
export function shiftKey(key, days) { const d = keyToDate(key); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
/** Mon…Sun keys of the week containing `anchorKey`. */
export function weekKeys(anchorKey) {
  const dow = (keyToDate(anchorKey).getUTCDay() + 6) % 7;
  const mon = shiftKey(anchorKey, -dow);
  return Array.from({ length: 7 }, (_, i) => shiftKey(mon, i));
}

/* ── Status ─────────────────────────────────────────────────── */
/** upcoming | live | past | cancelled | tbd. `cancelled`/`tbd` come from the data; the rest is derived from the clock. */
export function statusOf(item, now = new Date(), zone = SCHOOL_ZONE) {
  if (item.status === 'cancelled' || item.status === 'tbd') return item.status;
  if (item.kind === 'sprint') return 'upcoming';
  const n = toDate(now).getTime();
  const s = toDate(item.startsAt).getTime();
  if (item.allDay) return dayKey(s, zone) < dayKey(n, zone) ? 'past' : 'upcoming';
  const e = item.endsAt ? toDate(item.endsAt).getTime() : s;
  if (e <= n) return 'past';
  if (s <= n) return 'live';
  return 'upcoming';
}
/** True inside the Join window: 10 min before start → end, for items with a Zoom link. */
export function isJoinable(item, now = new Date()) {
  if (!item.zoomUrl || item.allDay || item.status === 'cancelled' || item.status === 'tbd') return false;
  const n = toDate(now).getTime(), s = toDate(item.startsAt).getTime(), e = item.endsAt ? toDate(item.endsAt).getTime() : s;
  return n >= s - JOIN_WINDOW_MS && n < e;
}
/** "today" | "tomorrow" | "in 3 days" when the item starts within COUNTDOWN_DAYS; otherwise null. */
export function countdown(item, now = new Date(), zone = SCHOOL_ZONE) {
  const today = dayKey(now, zone), day = dayKey(item.startsAt, zone);
  if (day < today) return null;
  const days = Math.round((keyToDate(day) - keyToDate(today)) / 86400000);
  if (days >= COUNTDOWN_DAYS) return null;
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

/* ── Order, groups, overlaps ────────────────────────────────── */
const rank = (it) => (it.kind === 'sprint' ? 0 : it.status === 'tbd' ? 3 : it.allDay ? 1 : 2);
/** Day, then: sprint edges → all-day → timed by start → Time TBD last. */
export function sortItems(items, zone = SCHOOL_ZONE) {
  return [...items].sort((a, b) => {
    const ka = dayKey(a.startsAt, zone), kb = dayKey(b.startsAt, zone);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const r = rank(a) - rank(b); if (r) return r;
    const d = toDate(a.startsAt) - toDate(b.startsAt); if (d) return d;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}
/** [{ key, isToday, dividers: sprint items, items: everything else }] in day order. */
export function groupByDay(items, { zone = SCHOOL_ZONE, now = new Date() } = {}) {
  const today = dayKey(now, zone);
  const map = new Map();
  for (const it of sortItems(items, zone)) {
    const key = dayKey(it.startsAt, zone);
    if (!map.has(key)) map.set(key, { key, isToday: key === today, dividers: [], items: [] });
    (it.kind === 'sprint' ? map.get(key).dividers : map.get(key).items).push(it);
  }
  return [...map.values()];
}
/** Map id → the other timed items it overlaps with (deadlines, sprint edges, cancelled and TBD never overlap). */
export function findOverlaps(items) {
  const timed = items.filter((it) => !it.allDay && it.endsAt && it.kind !== 'sprint' && it.kind !== 'deadline' && it.status !== 'cancelled' && it.status !== 'tbd');
  const out = new Map();
  const add = (a, b) => { if (!out.has(a.id)) out.set(a.id, []); out.get(a.id).push(b); };
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const a = timed[i], b = timed[j];
    if (toDate(a.startsAt) < toDate(b.endsAt) && toDate(b.startsAt) < toDate(a.endsAt)) { add(a, b); add(b, a); }
  }
  return out;
}
/** Where the "Now" line sits in a day's sorted items: before the first timed item that hasn't ended; -1 when the day has no timed items. */
export function nowIndex(dayItems, now = new Date()) {
  const n = toDate(now).getTime();
  let idx = -1, timed = false;
  for (let i = 0; i < dayItems.length; i++) {
    const it = dayItems[i];
    if (it.allDay || it.status === 'tbd' || it.kind === 'sprint') continue;
    timed = true;
    const e = it.endsAt ? toDate(it.endsAt).getTime() : toDate(it.startsAt).getTime();
    if (e > n) { idx = i; break; }
  }
  if (!timed) return -1;
  return idx === -1 ? dayItems.length : idx;
}
/** First non-sprint item that starts after `now` (for "Next up" in empty states). */
export function nextUp(items, now = new Date()) {
  const n = toDate(now).getTime();
  return sortItems(items).find((it) => it.kind !== 'sprint' && it.status !== 'cancelled' && toDate(it.startsAt).getTime() > n) || null;
}
/** Compact card: today's group, or the next day with something ("peek"), or nothing. */
export function todayOrPeek(items, now = new Date(), zone = SCHOOL_ZONE) {
  const today = dayKey(now, zone);
  const groups = groupByDay(items, { zone, now });
  const td = groups.find((g) => g.key === today);
  if (td && td.items.length) return { mode: 'today', day: td };
  const next = groups.find((g) => g.key > today && g.items.length);
  if (next) return { mode: 'peek', day: next, todayDividers: td ? td.dividers : [] };
  return { mode: 'none', day: null, todayDividers: td ? td.dividers : [] };
}

/* ── Formatters (viewer's zone unless told otherwise) ───────── */
export function fmtTime(when, zone = SCHOOL_ZONE) { return fmt(zone, { hour: 'numeric', minute: '2-digit' }).format(toDate(when)); }
/** "3:00 – 3:45 PM" (period shown once when both sides share it). */
export function fmtTimeRange(item, zone = SCHOOL_ZONE) {
  const a = fmtTime(item.startsAt, zone);
  if (!item.endsAt) return a;
  const b = fmtTime(item.endsAt, zone);
  const [at, ap] = a.split(' '), [, bp] = b.split(' ');
  return ap === bp ? `${at} – ${b}` : `${a} – ${b}`;
}
/** "45 min" · "1 h 5 min" · "2 h"; null without an end. */
export function fmtDuration(item) {
  if (!item.endsAt || item.allDay) return null;
  const mins = Math.round((toDate(item.endsAt) - toDate(item.startsAt)) / 60000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
/** ISO 8601 duration for <time datetime>: "PT45M", "PT1H5M". */
export function isoDuration(item) {
  if (!item.endsAt) return null;
  const mins = Math.round((toDate(item.endsAt) - toDate(item.startsAt)) / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`;
}
/** { title: 'Today' | 'Tomorrow' | 'Yesterday' | 'Thursday', date: 'Tue, Oct 20' | 'Oct 22' } */
export function fmtDayLabel(key, now = new Date(), zone = SCHOOL_ZONE) {
  const today = dayKey(now, zone);
  const d = keyToDate(key);
  const rel = key === today ? 'Today' : key === shiftKey(today, 1) ? 'Tomorrow' : key === shiftKey(today, -1) ? 'Yesterday' : null;
  if (rel) return { title: rel, date: fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }).format(d), isToday: key === today };
  return { title: fmt('UTC', { weekday: 'long' }).format(d), date: fmt('UTC', { month: 'short', day: 'numeric' }).format(d), isToday: false };
}
/** { title: 'This week' | 'Next week' | 'Last week' | null, range: 'Oct 19 – 25' | 'Oct 26 – Nov 1' | 'Dec 28 – Jan 3, 2027' } */
export function fmtWeekLabel(keys, now = new Date(), zone = SCHOOL_ZONE) {
  const thisMon = weekKeys(dayKey(now, zone))[0];
  const title = keys[0] === thisMon ? 'This week' : keys[0] === shiftKey(thisMon, 7) ? 'Next week' : keys[0] === shiftKey(thisMon, -7) ? 'Last week' : null;
  const a = keyToDate(keys[0]), b = keyToDate(keys[6]);
  const md = fmt('UTC', { month: 'short', day: 'numeric' });
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const year = b.getUTCFullYear() !== keyToDate(dayKey(now, zone)).getUTCFullYear() ? `, ${b.getUTCFullYear()}` : '';
  const range = sameMonth ? `${md.format(a)} – ${b.getUTCDate()}${year}` : `${md.format(a)} – ${md.format(b)}${year}`;
  return { title, range };
}
/** Short zone label: "PT", "ET", "GMT+5:30", "CET". */
export function zoneLabel(zone, when = new Date()) {
  const part = fmt(zone, { timeZoneName: 'short' }).formatToParts(toDate(when)).find((p) => p.type === 'timeZoneName');
  const v = part ? part.value : zone;
  return /^[PMCEAH][SD]T$/.test(v) ? `${v[0]}T` : v;
}
/** True when two zones have different UTC offsets at `when` (names alone would call PDT ≠ PST a difference). */
export function zoneDiffers(zoneA, zoneB, when = new Date()) {
  if (zoneA === zoneB) return false;
  const off = (z) => { const p = fmt(z, { timeZoneName: 'longOffset' }).formatToParts(toDate(when)).find((x) => x.type === 'timeZoneName'); return p ? p.value : z; };
  return off(zoneA) !== off(zoneB);
}
/** The viewer's IANA zone. */
export function viewerZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || SCHOOL_ZONE; } catch { return SCHOOL_ZONE; } }

/** Ticking clock (30s default) so Live / Join / the Now line move without a reload. */
export function useNow(ms = 30000, fixed) {
  const fixedMs = fixed ? toDate(fixed).getTime() : null;
  const [now, setNow] = React.useState(() => (fixedMs != null ? new Date(fixedMs) : new Date()));
  React.useEffect(() => {
    if (fixedMs != null) { setNow(new Date(fixedMs)); return undefined; }
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms, fixedMs]);
  return fixedMs != null && now.getTime() !== fixedMs ? new Date(fixedMs) : now;
}

export const ScheduleModel = {
  kinds: SCHEDULE_KINDS, kindMeta, dayKey, shiftKey, weekKeys, statusOf, isJoinable, countdown, sortItems, groupByDay,
  findOverlaps, nowIndex, nextUp, todayOrPeek, fmtTime, fmtTimeRange, fmtDuration, isoDuration, fmtDayLabel, fmtWeekLabel,
  zoneLabel, zoneDiffers, viewerZone, SCHOOL_ZONE, JOIN_WINDOW_MS, COUNTDOWN_DAYS,
};
