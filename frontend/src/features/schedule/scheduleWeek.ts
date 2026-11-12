/**
 * The agenda's week arithmetic, kept out of scheduleModel.ts and loaded with the week on Home, so the
 * entry chunk does not carry it: week keys (Monday to Sunday, on 'YYYY-MM-DD' keys in the viewer's
 * zone, the current week from today on), the week's label, the "Next up" pick and the `?day=`
 * parameter. Port of the agenda half of design/components/schedule/ScheduleModel.jsx.
 */
import { dayKey, itemDay, keyToDate, shiftKey, sortItems, type ScheduleItemData, type ScheduleKind } from './scheduleModel';

const md = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

/** The seven day keys, Monday first, of the week holding `anchorKey`. */
export function weekKeys(anchorKey: string): string[] {
  const dow = (keyToDate(anchorKey).getUTCDay() + 6) % 7;
  const monday = shiftKey(anchorKey, -dow);
  return Array.from({ length: 7 }, (_, i) => shiftKey(monday, i));
}

/**
 * The days of the week holding `anchorKey`, from `fromKey` on when it falls in that week (Home's
 * week starts at today, so nothing past sits above it); any other week runs Monday to Sunday.
 */
export function weekDaysFrom(anchorKey: string, fromKey: string | null): string[] {
  const keys = weekKeys(anchorKey);
  const at = fromKey ? keys.indexOf(fromKey) : -1;
  return at > 0 ? keys.slice(at) : keys;
}

/**
 * The label of the days shown, a whole week or one that starts at today:
 * { title: 'This week' | 'Next week' | 'Last week' | null, range: 'Nov 9 – 15' | 'Nov 30 – Dec 6' | 'Dec 28 – Jan 3, 2027' | 'Nov 15' }
 */
export function fmtWeekLabel(keys: string[], now: Date, zone: string): { title: string | null; range: string } {
  const thisMonday = weekKeys(dayKey(now, zone))[0];
  const monday = weekKeys(keys[0])[0];
  const title = monday === thisMonday
    ? 'This week'
    : monday === shiftKey(thisMonday, 7)
      ? 'Next week'
      : monday === shiftKey(thisMonday, -7) ? 'Last week' : null;
  const a = keyToDate(keys[0]);
  const b = keyToDate(keys[keys.length - 1]);
  const year = b.getUTCFullYear() !== keyToDate(dayKey(now, zone)).getUTCFullYear() ? `, ${b.getUTCFullYear()}` : '';
  let range: string;
  if (keys.length === 1) range = `${md.format(a)}${year}`;
  else if (a.getUTCMonth() === b.getUTCMonth()) range = `${md.format(a)} – ${b.getUTCDate()}${year}`;
  else range = `${md.format(a)} – ${md.format(b)}${year}`;
  return { title, range };
}

/** The first item (not a sprint edge, not cancelled) that starts after `now`, for "Next up". */
export function nextUp(items: ScheduleItemData[], now: Date, zone: string): ScheduleItemData | null {
  const at = now.getTime();
  return sortItems(items, zone).find(
    (it) => it.kind !== 'sprint' && it.status !== 'cancelled' && new Date(it.startsAt).getTime() > at,
  ) ?? null;
}

/** The years `?day=` may name: the week around any of their days stays inside the calendar's arithmetic. */
const FIRST_YEAR = 1970;
const LAST_YEAR = 9998;

/** `?day=` as a calendar day key, or null when it is missing, not a real 'YYYY-MM-DD' day, or outside 1970–9998. */
export function parseDayParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < FIRST_YEAR || year > LAST_YEAR) return null;
  const d = keyToDate(value);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

/** The kinds the schedule sends this round, each a filter chip in the agenda. */
export const AGENDA_KINDS: readonly ScheduleKind[] = ['ta_meeting', 'meeting', 'final_review', 'deadline', 'sprint'];

/** The id of an agenda day's heading, for `aria-labelledby` and for scrolling to `?day=`. */
export const agendaDayId = (key: string): string => `gt-sched-day-${key}`;

/** The longest range GET /api/schedule answers: 42 days of hours (app/schedule/models.py). */
export const MAX_RANGE_MS = 42 * 86_400_000;

/**
 * A request window cut to what the endpoint answers. Forty-two calendar days between two local
 * midnights are an hour longer than 42 days of hours across a fall-back change, which the endpoint
 * refuses; the end comes in to fit.
 */
export function fitRange(from: Date, to: Date): { from: Date; to: Date } {
  return to.getTime() - from.getTime() > MAX_RANGE_MS ? { from, to: new Date(from.getTime() + MAX_RANGE_MS) } : { from, to };
}

/** The items the agenda shows for the days shown: those whose day, in the viewer's zone, is one of `keys` (consecutive days). */
export function itemsInWeek(items: ScheduleItemData[], keys: string[], zone: string): ScheduleItemData[] {
  const first = keys[0];
  const last = keys[keys.length - 1];
  return items.filter((it) => {
    const day = itemDay(it, zone);
    return day >= first && day <= last;
  });
}
