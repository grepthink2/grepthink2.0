/**
 * A class's sprint schedule as calendar days: the arithmetic of backend/app/scrum/schedule.py, which
 * has the final word. Sprint k starts k-1 weeks after the first sprint's first day (weekly), 2(k-1)
 * weeks after it (biweekly), or on the same day of the month k-1 months later, clamped to that month's
 * last day (monthly). Each sprint ends the day before the next one starts, and the last one the day
 * before sprint count+1 would start.
 *
 * Days are 'yyyy-MM-dd', read and written in local time (date-fns `parseISO` and `format`), so a day
 * stays that day in every time zone; `new Date('yyyy-MM-dd')` would read UTC midnight, which is the
 * day before west of UTC.
 */
import { addDays, addMonths, endOfISOWeek, format, parseISO } from 'date-fns';
import type { ApiSprintFrequency } from '@/lib/api/types';

/** The fewest and the most sprints a class can have: the API's limits. */
export const MIN_SPRINTS = 1;
export const MAX_SPRINTS = 20;

/** The class forms' hint beside the count ("1–20"), and their error for a count they can't use. */
export const SPRINT_COUNT_HINT = `${MIN_SPRINTS}–${MAX_SPRINTS}`;
export const SPRINT_COUNT_ERROR = `Enter a whole number from ${MIN_SPRINTS} to ${MAX_SPRINTS}`;

/**
 * The schedule the class forms start from (Create Class, and Set up sprints in Class Settings): five
 * sprints of two weeks.
 */
export const DEFAULT_SPRINT_COUNT = 5;
export const DEFAULT_SPRINT_FREQUENCY: ApiSprintFrequency = 'biweekly';

/** The frequencies in the forms' words, which follow "Every". */
export const SPRINT_FREQUENCY_OPTIONS: { value: ApiSprintFrequency; label: string }[] = [
  { value: 'weekly', label: 'week' },
  { value: 'biweekly', label: 'two weeks' },
  { value: 'monthly', label: 'month' },
];

const DAY_FORMAT = 'yyyy-MM-dd';

/** The first day of sprint k (from 1); k = count+1 gives the day after the schedule. */
function sprintStart(firstDay: Date, k: number, frequency: ApiSprintFrequency): Date {
  switch (frequency) {
    case 'weekly':
      return addDays(firstDay, 7 * (k - 1));
    case 'biweekly':
      return addDays(firstDay, 14 * (k - 1));
    case 'monthly':
      // addMonths clamps to the month's last day (Jan 31 plus one month is Feb 28), as the API does.
      // Every sprint is counted from the first day, so a clamp never carries into the next month.
      return addMonths(firstDay, k - 1);
    default:
      throw new Error(`Unknown sprint frequency: ${String(frequency)}`);
  }
}

/** Sprints 1 to `count`, each from its first day to its last. `startOn` is the first sprint's first day. */
export function sprintWindows(
  startOn: string,
  count: number,
  frequency: ApiSprintFrequency,
): { startsAt: string; endsAt: string }[] {
  const firstDay = parseISO(startOn);
  const starts = Array.from({ length: count + 1 }, (_, i) => sprintStart(firstDay, i + 1, frequency));
  return starts.slice(0, count).map((start, i) => ({
    startsAt: format(start, DAY_FORMAT),
    endsAt: format(addDays(starts[i + 1], -1), DAY_FORMAT),
  }));
}

/** The last sprint's last day: the day before sprint count+1 would start. */
export function scheduleEnd(startOn: string, count: number, frequency: ApiSprintFrequency): string {
  return format(addDays(sprintStart(parseISO(startOn), count + 1, frequency), -1), DAY_FORMAT);
}

/**
 * The latest day a class's last sprint may end: the Sunday of the week (Monday to Sunday) that holds
 * `lastDay`, the last day of classes. Sprints that start on a Monday end on a Sunday, so a term whose
 * last day is a Friday keeps the sprint that ends two days later; a last day that is a Sunday ends its
 * own week. The API's rule (`latest_sprint_end` in backend/app/scrum/schedule.py).
 */
export function latestSprintEnd(lastDay: string): string {
  return format(endOfISOWeek(parseISO(lastDay)), DAY_FORMAT);
}

/**
 * The class forms' line about the last sprint: "Sprint 5 ends Dec 1", or, while it would end after the
 * Sunday that `latestSprintEnd` allows, "Sprint 5 would end after the last day of classes". `endsOn` is
 * its last day.
 */
export function lastSprintLine(count: number, endsOn: string, pastLastDay = false): string {
  return pastLastDay
    ? `Sprint ${count} would end after the last day of classes`
    : `Sprint ${count} ends ${format(parseISO(endsOn), 'MMM d')}`;
}

/** A sprint count as typed: a whole number from 1 to 20, or null for anything else, an empty box included. */
export function parseSprintCount(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return count >= MIN_SPRINTS && count <= MAX_SPRINTS ? count : null;
}
