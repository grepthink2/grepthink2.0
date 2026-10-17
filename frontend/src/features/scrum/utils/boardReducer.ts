import type { ApiScrumStory, ApiScrumTask, ApiTaskRef } from '@/lib/api';
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
 * A single-task response over the board's copy. The response never carries what only the board load
 * supplies — `depends_on`, `blocks`, `comment_count` — and `update_task`'s carries no `moved_by_name`
 * (spec D11); those stay as the board had them. A move response's `moved_by_name` wins (it is resolved).
 *
 * The name is the one field the server may know less about than we do: a response without
 * `moved_by_name` (an older backend, a no-op move, any field edit) would otherwise blank the name the
 * board shows, and the card would flip to "Unknown" a beat after the drop.
 */
export function mergeTaskResponse(boardTask: ApiScrumTask, response: ApiScrumTask): ApiScrumTask {
  return {
    ...response,
    depends_on: boardTask.depends_on,
    blocks: boardTask.blocks,
    comment_count: boardTask.comment_count,
    moved_by_name: response.moved_by_name ?? boardTask.moved_by_name,
  };
}

/** Reconcile with the server's task row (authoritative moved_at / moved_by_name). */
export function confirmMove(
  stories: ApiScrumStory[],
  taskId: string,
  serverTask: ApiScrumTask,
): ApiScrumStory[] {
  return mapTask(stories, taskId, (prev) => mergeTaskResponse(prev, serverTask));
}

/**
 * A moved task's new status, written into every ref that names it (spec D9): its dependents'
 * `depends_on` and its dependencies' `blocks`. A move never refetches the board, so without this a
 * dependent would read its blocker as unfinished until the next load. Stories and tasks with no
 * such ref keep their identity.
 */
export function syncRefStatus(
  stories: ApiScrumStory[],
  taskId: string,
  status: BoardStatus,
): ApiScrumStory[] {
  const sync = (refs: ApiTaskRef[] | undefined) =>
    refs?.some((r) => r.id === taskId && r.status !== status)
      ? refs.map((r) => (r.id === taskId ? { ...r, status } : r))
      : refs;
  return stories.map((s) => {
    const tasks = s.tasks ?? [];
    let changed = false;
    const next = tasks.map((t) => {
      const dependsOn = sync(t.depends_on);
      const blocks = sync(t.blocks);
      if (dependsOn === t.depends_on && blocks === t.blocks) return t;
      changed = true;
      return { ...t, depends_on: dependsOn, blocks };
    });
    return changed ? { ...s, tasks: next } : s;
  });
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
