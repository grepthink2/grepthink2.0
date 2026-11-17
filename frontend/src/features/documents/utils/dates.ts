import { format, isValid, parseISO } from 'date-fns';

/**
 * Dates on a document's pages. An instant (a save, a hand-in) shows in the viewer's zone, as date-fns
 * formats it; a calendar day the API names (YYYY-MM-DD, a sprint report's `as_of`) shows as that day.
 */

/** "Nov 17, 2026 at 3:05 PM" in the viewer's zone; '' for no time. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const when = parseISO(iso);
  return isValid(when) ? format(when, "MMM d, yyyy 'at' h:mm a") : '';
}

/** "Nov 17, 2026" in the viewer's zone, for an instant; '' for none. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const when = parseISO(iso);
  return isValid(when) ? format(when, 'MMM d, yyyy') : '';
}

/** "Oct 18, 2026" for the calendar day "2026-10-18", whatever the viewer's zone. */
export function formatDay(day: string): string {
  const parsed = parseISO(day.slice(0, 10));
  return isValid(parsed) ? format(parsed, 'MMM d, yyyy') : day;
}
