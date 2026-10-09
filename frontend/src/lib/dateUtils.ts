/**
 * Assignment date utilities.
 *
 * The backend sends an assignment's deadline as an instant, `due_at` (the first
 * moment after `close_date` in the school's time zone), with an optional late
 * window, `accept_until`; the deadline helpers at the end of this file read them.
 * No field carries the opening instant: `assignmentOpensAt` works it out from
 * `open_date` in the school's zone, as the server does.
 *
 * America/Los_Angeles is the zone whenever no other is known: the default for
 * the opening instant, and for the deadline of an assignment sent without
 * `due_at`, 11:59 PM Pacific on the stored calendar date (`toLA2359` converts a
 * bare YYYY-MM-DD string into that UTC instant). date-fns format() renders every
 * instant in the *viewer's* local timezone automatically.
 *
 * No external timezone library is needed: the built-in Intl.DateTimeFormat API
 * resolves a zone's UTC offset on the target date (daylight saving included),
 * and date-fns format() handles display.
 */
import { format, isValid, parse } from 'date-fns';

/**
 * Convert a YYYY-MM-DD date string to a JS Date representing 23:59:00
 * America/Los_Angeles time on that date.
 *
 * Works correctly across PST (UTC-8) and PDT (UTC-7).
 */
export function toLA2359(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Noon UTC is always 4 AM or 5 AM in LA, so it is always on the correct
  // calendar day in LA regardless of the PST/PDT offset.
  const pivotUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  // Ask Intl what LA's clock reads at pivotUtc.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(pivotUtc);

  const laHour   = Number(parts.find((p) => p.type === 'hour')!.value);
  const laMinute = Number(parts.find((p) => p.type === 'minute')!.value);

  // Advance pivotUtc by the number of minutes from laHour:laMinute to 23:59.
  const deltaMin = (23 - laHour) * 60 + (59 - laMinute);
  return new Date(pivotUtc.getTime() + deltaMin * 60_000);
}

/**
 * Format a YYYY-MM-DD close date as the legacy deadline label: 11:59 PM
 * America/Los_Angeles on that date, rendered in the viewer's local timezone so
 * everyone sees their local equivalent of that moment. Assignment deadlines come
 * from `due_at` now; `formatDeadline` shows them.
 *
 * Examples (same instant, different viewers):
 *   PST (UTC-8): "Jan 12, 2026 at 11:59 PM"
 *   EST (UTC-5): "Jan 13, 2026 at 2:59 AM"
 */
export function formatAssignmentDueDate(dateStr: string): string {
  return format(toLA2359(dateStr), "MMM d, yyyy 'at' h:mm a");
}

/** The fields the deadline helpers read; `ApiAssignment` satisfies it. */
export interface AssignmentDates {
  open_date: string;
  close_date: string;
  due_at?: string | null;
  accept_until?: string | null;
}

const DAY_MS = 86_400_000;

/** Midnight at the start of `dateStr` (YYYY-MM-DD) in the IANA zone `zone`, as a UTC instant. */
export function startOfDayIn(zone: string, dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  // The zone's UTC offset at an instant: its wall clock read as if it were UTC, minus the instant.
  const offsetAt = (instant: number): number => {
    const parts = clock.formatToParts(instant);
    const field = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)!.value);
    const wall = Date.UTC(
      field('year'), field('month') - 1, field('day'), field('hour') % 24, field('minute'), field('second'),
    );
    return wall - instant;
  };
  // 00:00 that day written as if it were UTC, then read with the offset in force before the day
  // and, when the clocks have changed by then, with the one after it. The offset at another hour
  // of the day is not enough: a daylight-saving change between midnight and that hour shifts it.
  const wall = Date.UTC(year, month - 1, day);
  const before = offsetAt(wall - DAY_MS);
  const early = wall - before;
  if (offsetAt(early) === before) return new Date(early);
  const after = offsetAt(wall + DAY_MS);
  const late = wall - after;
  // Where the clocks skip midnight neither reading is on the zone's clock; the earlier offset
  // lands on the change itself, the day's first moment, as on the server (zoneinfo, fold=0).
  return new Date(offsetAt(late) === after ? late : early);
}

/**
 * When the assignment opens: midnight starting `open_date` in the school's zone, Pacific when no
 * zone is known. The server computes the opening instant the same way, from `open_date` in the
 * school's zone; no backend field carries it.
 */
export function assignmentOpensAt(a: AssignmentDates, zone = 'America/Los_Angeles'): Date | null {
  if (!a.open_date) return null;
  return startOfDayIn(zone, a.open_date);
}

/** The deadline: `due_at` from the backend, else 11:59 PM Pacific on `close_date`. */
export function assignmentDeadline(a: AssignmentDates): Date | null {
  if (a.due_at) return new Date(a.due_at);
  if (!a.close_date) return null;
  return toLA2359(a.close_date);
}

/** When submissions stop being accepted: the late window when set, else the deadline. */
export function assignmentClosesAt(a: AssignmentDates): Date | null {
  if (a.accept_until) return new Date(a.accept_until);
  return assignmentDeadline(a);
}

/**
 * The status an instructor sees: a draft stays a draft; anything else is closed once submissions
 * stop (`assignmentClosesAt`: the late window when one is set, else the deadline) and active until then.
 */
export function assignmentStatus(
  a: AssignmentDates & { status?: string | null },
  now: Date = new Date(),
): 'draft' | 'active' | 'closed' {
  if (a.status === 'draft') return 'draft';
  const closes = assignmentClosesAt(a);
  return closes && closes <= now ? 'closed' : 'active';
}

/** The date picker's text (DatePickerField's DATETIME_FORMAT): a wall-clock time in the viewer's zone. */
const PICKER_TEXT_FORMAT = 'yyyy-MM-dd HH:mm';

/** Date-picker text as an ISO instant, read in the viewer's local time; null when incomplete or malformed. */
export function pickerTextToIso(text: string): string | null {
  const parsed = parse(text, PICKER_TEXT_FORMAT, new Date());
  return isValid(parsed) ? parsed.toISOString() : null;
}

/** An instant for display, in the viewer's local time: "Oct 7, 2026 at 11:59 PM". */
export function formatInstant(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

/** The deadline for display. The backend's instant is one minute past the legacy 11:59 PM label,
 *  so it is shown one minute earlier, matching what students have always read. */
export function formatDeadline(a: AssignmentDates): string {
  const deadline = assignmentDeadline(a);
  if (!deadline) return '—';
  const shown = a.due_at ? new Date(deadline.getTime() - 60_000) : deadline;
  return formatInstant(shown);
}
