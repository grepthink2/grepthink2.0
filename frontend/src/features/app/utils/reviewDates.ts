/**
 * Timestamp formatter for institutional/roster records — enrollment,
 * team-join, and drop events. Pinned to America/Los_Angeles with an
 * explicit "PT" label, so the same event reads identically no matter the
 * viewer's own device timezone.
 *
 * This is deliberately a *different* idiom from `finalReviewTemplate.ts`'s
 * `formatReviewDay`/`formatReviewTime`, which intentionally format in the
 * *viewer's local* timezone (unlabeled, no fixed zone). Those describe a
 * live meeting the viewer has to show up to, so they must read in whatever
 * timezone the viewer's own clock is set to — delegating them to this
 * formatter would silently change a scheduled-meeting time into a
 * Pacific-pinned one for out-of-timezone viewers, which is the opposite of
 * what they're for. A roster timestamp, by contrast, is a historical
 * record of something that already happened server-side; pinning it avoids
 * a non-Pacific viewer seeing the wrong calendar day for a late-night
 * enrollment or drop.
 */
export function formatPacificTimestamp(iso: string | null): string {
  if (!iso) return '—';

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);

  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);

  return `${date}, ${time} PT`;
}
