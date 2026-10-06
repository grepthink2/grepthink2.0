/**
 * Assignment date utilities.
 *
 * The backend sends an assignment's deadline as an instant, `due_at` (the first
 * moment after `close_date` in the school's time zone), with an optional late
 * window, `accept_until`; the deadline helpers at the end of this file read them.
 * The legacy rule, kept for older backends that send only the dates, is
 * "11:59 PM America/Los_Angeles" on the stored calendar date: `toLA2359` converts
 * a bare YYYY-MM-DD string into that UTC instant.  date-fns format() renders
 * every instant in the *viewer's* local timezone automatically.
 *
 * No external timezone library is needed: we use the built-in
 * Intl.DateTimeFormat API to resolve the UTC offset for LA on the target date
 * (handling PST -8 / PDT -7 correctly), and date-fns format() for display.
 */
import { format } from 'date-fns';

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
 * Format a YYYY-MM-DD assignment due date for display.
 *
 * The canonical deadline is 11:59 PM America/Los_Angeles; the result is
 * rendered in the viewer's local timezone so everyone sees their local
 * equivalent of that moment.
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

/**
 * Start of the open day. Older backends send no instant for it; the school-zone generalization
 * lives in the backend (`due_at`), so the client assumes Pacific like the legacy rule.
 */
export function assignmentOpensAt(a: AssignmentDates): Date | null {
  if (!a.open_date) return null;
  // Midnight Pacific = 11:59 PM Pacific of the day before, plus one minute.
  const [y, m, d] = a.open_date.split('-').map(Number);
  const dayBefore = new Date(Date.UTC(y, m - 1, d - 1));
  const iso = dayBefore.toISOString().slice(0, 10);
  return new Date(toLA2359(iso).getTime() + 60_000);
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
