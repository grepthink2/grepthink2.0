import type { ApiScrumTask, ApiTaskRef } from '@/lib/api';

/**
 * Task dependencies as the board reads them (spec 2026-10-16, D1–D2): the card's chip, the
 * editor's Status select and the board's drag and drop all ask these, about the same
 * `depends_on` list, so they never disagree. Each tolerates a task from a backend older than
 * this client, which sends no `depends_on` at all.
 */

/** The tasks that keep `task` in To do: its dependencies that are not done. */
export function blockers(task: Pick<ApiScrumTask, 'depends_on'>): ApiTaskRef[] {
  return (task.depends_on ?? []).filter((d) => d.status !== 'done');
}

/** Blocked = in To do with an unfinished dependency (spec D1). */
export function isBlocked(task: Pick<ApiScrumTask, 'status' | 'depends_on'>): boolean {
  return task.status === 'todo' && blockers(task).length > 0;
}

/** "GT-15 is blocked by GT-12" / "… by GT-12 and GT-13" / "… by GT-12, GT-13 and GT-14". */
export function blockedMessage(task: Pick<ApiScrumTask, 'key' | 'depends_on'>): string {
  const keys = blockers(task).map((d) => d.key);
  const named = keys.length > 1
    ? `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`
    : keys.join('');
  return `${task.key} is blocked by ${named}`;
}
