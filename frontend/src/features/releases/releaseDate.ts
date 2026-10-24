const FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/**
 * A release's date written out ("2026-10-23" → "October 23, 2026"). It is a calendar date, not an
 * instant, so it reads the same in every time zone: built from its parts and formatted in UTC.
 */
export function formatReleaseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return FORMAT.format(new Date(Date.UTC(year, month - 1, day)));
}
