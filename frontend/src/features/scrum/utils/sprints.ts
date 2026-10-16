import { format, parseISO } from 'date-fns';
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

/** 0–100 share of `total` that is `done`, rounded; 0 when there is nothing to count. */
export function percentDone(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}
