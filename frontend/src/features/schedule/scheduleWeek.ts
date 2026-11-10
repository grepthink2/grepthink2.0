/**
 * The agenda's week arithmetic, kept out of scheduleModel.ts so Home's entry chunk does not carry it:
 * week keys (Monday to Sunday, on 'YYYY-MM-DD' keys in the viewer's zone), the week's label, the
 * "Next up" pick and the `?day=` parameter. Port of the agenda half of
 * design/components/schedule/ScheduleModel.jsx.
 */
import { dayKey, keyToDate, shiftKey, sortItems, type ScheduleItemData, type ScheduleKind } from './scheduleModel';

const md = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

/** The seven day keys, Monday first, of the week holding `anchorKey`. */
export function weekKeys(anchorKey: string): string[] {
  const dow = (keyToDate(anchorKey).getUTCDay() + 6) % 7;
  const monday = shiftKey(anchorKey, -dow);
  return Array.from({ length: 7 }, (_, i) => shiftKey(monday, i));
}

/** { title: 'This week' | 'Next week' | 'Last week' | null, range: 'Nov 9 – 15' | 'Nov 30 – Dec 6' | 'Dec 28 – Jan 3, 2027' } */
export function fmtWeekLabel(keys: string[], now: Date, zone: string): { title: string | null; range: string } {
  const thisMonday = weekKeys(dayKey(now, zone))[0];
  const title = keys[0] === thisMonday
    ? 'This week'
    : keys[0] === shiftKey(thisMonday, 7)
      ? 'Next week'
      : keys[0] === shiftKey(thisMonday, -7) ? 'Last week' : null;
  const a = keyToDate(keys[0]);
  const b = keyToDate(keys[6]);
  const year = b.getUTCFullYear() !== keyToDate(dayKey(now, zone)).getUTCFullYear() ? `, ${b.getUTCFullYear()}` : '';
  const range = a.getUTCMonth() === b.getUTCMonth()
    ? `${md.format(a)} – ${b.getUTCDate()}${year}`
    : `${md.format(a)} – ${md.format(b)}${year}`;
  return { title, range };
}

/** The first item (not a sprint edge, not cancelled) that starts after `now`, for "Next up". */
export function nextUp(items: ScheduleItemData[], now: Date, zone: string): ScheduleItemData | null {
  const at = now.getTime();
  return sortItems(items, zone).find(
    (it) => it.kind !== 'sprint' && it.status !== 'cancelled' && new Date(it.startsAt).getTime() > at,
  ) ?? null;
}

/** `?day=` as a calendar day key, or null when it is missing or not a real 'YYYY-MM-DD' day. */
export function parseDayParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = keyToDate(value);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

/** The kinds the schedule sends this round, each a filter chip in the agenda. */
export const AGENDA_KINDS: readonly ScheduleKind[] = ['ta_meeting', 'meeting', 'final_review', 'deadline', 'sprint'];

/** The id of an agenda day's heading, for `aria-labelledby` and for scrolling to `?day=`. */
export const agendaDayId = (key: string): string => `gt-sched-day-${key}`;
