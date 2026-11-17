import { format } from 'date-fns';

/**
 * Dates on a document's pages. An instant (a save, a hand-in) shows in the viewer's zone, as date-fns
 * formats it; a calendar day the API names (YYYY-MM-DD, a sprint report's `as_of`) shows as that day.
 *
 * The API's ISO strings are read with `Date` rather than date-fns' parseISO: importing parseISO here
 * made the build split it out of the entry chunk into a chunk of its own that every page preloads.
 */

/** An instant, or null for none or one that does not read. */
function instant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? null : when;
}

/** "Nov 17, 2026 at 3:05 PM" in the viewer's zone; '' for no time. */
export function formatWhen(iso: string | null | undefined): string {
  const when = instant(iso);
  return when ? format(when, "MMM d, yyyy 'at' h:mm a") : '';
}

/** "Nov 17, 2026" in the viewer's zone, for an instant; '' for none. */
export function formatDate(iso: string | null | undefined): string {
  const when = instant(iso);
  return when ? format(when, 'MMM d, yyyy') : '';
}

/** "Oct 18, 2026" for the calendar day "2026-10-18", whatever the viewer's zone. */
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return day;
  // Midnight that day on the viewer's clock, so the day formats as itself.
  return format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), 'MMM d, yyyy');
}
