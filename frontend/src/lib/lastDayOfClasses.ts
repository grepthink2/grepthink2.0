/**
 * A class's last day of classes: the bound the API puts on it (backend/app/classes/terms.py,
 * `latest_last_day`). It falls from the first week of term to 370 days after it, the end of week 53,
 * so a mistyped year is caught before Create Class is sent. Days are YYYY-MM-DD, as the date picker
 * gives them.
 */

/** The most days after the first week of term that the last day of classes may fall: 53 weeks less a day. */
export const MAX_DAYS_AFTER_FIRST_WEEK = 370;

const DAY_MS = 86_400_000;

/**
 * A YYYY-MM-DD day as a count of days since 1970-01-01. Counted in UTC, so that no clock change
 * (or the leap day) skews a span of days; NaN when the text is not a day.
 */
function dayNumber(day: string): number {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, dayOfMonth) / DAY_MS;
}

/**
 * Whether `lastDay` falls more than `MAX_DAYS_AFTER_FIRST_WEEK` days after `firstDay`, which the
 * API refuses (422 when a class is created, 400 when its last day is changed). False when either is
 * not a day, or when the last day is not after the first: other checks refuse those, and the API
 * has the final word.
 */
export function isPastLatestLastDay(firstDay: string, lastDay: string): boolean {
  return dayNumber(lastDay) - dayNumber(firstDay) > MAX_DAYS_AFTER_FIRST_WEEK;
}
