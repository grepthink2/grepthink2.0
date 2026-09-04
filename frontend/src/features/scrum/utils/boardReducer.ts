import type { ApiScrumStory, ApiScrumTask } from '@/lib/api';
import type { BoardStatus } from '../config/scrumTags';

/**
 * Pure board transforms. Tasks live nested inside stories, so every mutation
 * rebuilds only the touched story — keeping React's identity checks cheap and
 * the optimistic move trivially reversible (snapshot the task, restore it).
 */

export function findTask(stories: ApiScrumStory[], taskId: string): ApiScrumTask | null {
  for (const s of stories) {
    const t = (s.tasks ?? []).find((x) => x.id === taskId);
    if (t) return t;
  }
  return null;
}

/** Replace one task in place; stories without it keep their identity. */
export function mapTask(
  stories: ApiScrumStory[],
  taskId: string,
  fn: (task: ApiScrumTask) => ApiScrumTask,
): ApiScrumStory[] {
  return stories.map((s) => {
    const tasks = s.tasks ?? [];
    if (!tasks.some((t) => t.id === taskId)) return s;
    return { ...s, tasks: tasks.map((t) => (t.id === taskId ? fn(t) : t)) };
  });
}

/**
 * Optimistic move: flip the status and write a provisional audit line so the
 * card reads correctly the instant it lands, before the server confirms.
 */
export function applyOptimisticMove(
  stories: ApiScrumStory[],
  taskId: string,
  to: BoardStatus,
  moverName: string,
  now = new Date().toISOString(),
): ApiScrumStory[] {
  return mapTask(stories, taskId, (t) => ({
    ...t,
    status: to,
    moved_by_name: moverName,
    moved_at: now,
  }));
}

/**
 * Reconcile with the server's task row (authoritative moved_at / moved_by_name).
 *
 * The name is the one field the server may know less about than we do: a
 * response without `moved_by_name` (an older backend, a no-op move) would
 * otherwise blank the name the optimistic write just put on screen and the
 * card would flip to "Unknown" a beat after the drop. Keep what we had.
 */
export function confirmMove(
  stories: ApiScrumStory[],
  taskId: string,
  serverTask: ApiScrumTask,
): ApiScrumStory[] {
  return mapTask(stories, taskId, (prev) => ({
    ...serverTask,
    moved_by_name: serverTask.moved_by_name ?? prev.moved_by_name,
  }));
}

/** Undo a failed move by restoring the pre-move snapshot. */
export function rollbackMove(stories: ApiScrumStory[], snapshot: ApiScrumTask): ApiScrumStory[] {
  return mapTask(stories, snapshot.id, () => snapshot);
}

/** Merge fields into one story, leaving its tasks and every sibling untouched. */
export function applyStoryPatch(
  stories: ApiScrumStory[],
  storyId: string,
  patch: Partial<ApiScrumStory>,
): ApiScrumStory[] {
  return stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s));
}

/** Merge fields into one task (F16: field edits apply locally before the PATCH). */
export function applyTaskPatch(
  stories: ApiScrumStory[],
  taskId: string,
  patch: Partial<ApiScrumTask>,
): ApiScrumStory[] {
  return mapTask(stories, taskId, (t) => ({ ...t, ...patch }));
}

/** Find a story by id across the sprint and backlog lists. */
export function findStory(stories: ApiScrumStory[], storyId: string): ApiScrumStory | null {
  return stories.find((s) => s.id === storyId) ?? null;
}

/** Patch cached PR states from the throttled batch refresh ({task_id: state}). */
export function applyPrStates(
  stories: ApiScrumStory[],
  updated: Record<string, string>,
): ApiScrumStory[] {
  const ids = Object.keys(updated);
  if (ids.length === 0) return stories;
  return stories.map((s) => {
    const tasks = s.tasks ?? [];
    if (!tasks.some((t) => updated[t.id])) return s;
    return {
      ...s,
      tasks: tasks.map((t) => (updated[t.id] ? { ...t, pr_state: updated[t.id] } : t)),
    };
  });
}
