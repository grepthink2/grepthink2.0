/**
 * Assignment date utilities.
 *
 * All assignment due dates are canonically "11:59 PM America/Los_Angeles" on
 * the stored calendar date.  The helpers here convert a bare YYYY-MM-DD string
 * from the backend into the correct UTC instant, then let date-fns format()
 * render it in the *viewer's* local timezone automatically.
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
