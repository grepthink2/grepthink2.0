import { addDays, format, max, parseISO, startOfDay } from 'date-fns';
import type { ApiScrumSprint } from '@/lib/api';

/** Shared by the board's sprint picker and the project page's sprint card. */
export const STATUS_LABELS: Record<ApiScrumSprint['status'], string> = {
  active: 'Active',
  planned: 'Planned',
  completed: 'Completed',
};

/** "Sep 7 – Sep 20" from the sprint's ISO dates. */
export function sprintDates({ starts_at, ends_at }: Pick<ApiScrumSprint, 'starts_at' | 'ends_at'>): string {
  return `${format(parseISO(starts_at), 'MMM d')} – ${format(parseISO(ends_at), 'MMM d')}`;
}

/** A new sprint's length in days, its first and last day included. */
export const SPRINT_DAYS = 14;

/**
 * The New sprint form's starting values: "Sprint N" after the sprints so far, running two weeks from
 * today, or from the day after the last sprint ends when that is later.
 */
export function newSprintDraft(
  sprints: Pick<ApiScrumSprint, 'ends_at'>[],
  today: Date,
): { name: string; starts_at: string; ends_at: string } {
  const lastEnd = sprints.reduce<string | null>((latest, s) => (latest && latest > s.ends_at ? latest : s.ends_at), null);
  const start = max([startOfDay(today), ...(lastEnd ? [addDays(parseISO(lastEnd), 1)] : [])]);
  return {
    name: `Sprint ${sprints.length + 1}`,
    starts_at: format(start, 'yyyy-MM-dd'),
    ends_at: format(addDays(start, SPRINT_DAYS - 1), 'yyyy-MM-dd'),
  };
}

/** 0–100 share of `total` that is `done`, rounded; 0 when there is nothing to count. */
export function percentDone(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}
