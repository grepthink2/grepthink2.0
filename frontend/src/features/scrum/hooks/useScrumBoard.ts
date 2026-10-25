import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  ApiBoardStatus, ApiCreateStoryBody, ApiCreateTaskBody, ApiEstimateScale,
  ApiScrumBoard, ApiScrumBurnupUnit, ApiScrumStory, ApiScrumTask, ApiUpdateStoryBody,
  ApiUpdateTaskBody,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import {
  applyOptimisticMove, applyPrStates, applyStoryPatch, applyTaskPatch,
  confirmMove, findStory, findTask, mapTask, mergeTaskResponse, rollbackMove, syncRefStatus,
} from '../utils/boardReducer';
import { blockedMessage, isBlocked } from '../utils/dependencies';

/** Transient user-facing message. F9 renders these as toasts. */
export interface BoardNotice {
  kind: 'error' | 'success' | 'info';
  message: string;
}

function noticeFor(err: unknown, fallback: string): BoardNotice {
  // Preview blocks are expected, not failures — calm tone, and the copy stays
  // owned by ReadOnlyPreviewError so it can't drift from the rest of the app.
  if (err instanceof ReadOnlyPreviewError) return { kind: 'info', message: err.message };
  return { kind: 'error', message: err instanceof Error ? err.message : fallback };
}

/** Whether a task edit changes what the burnup counts: its points or its hours, sent and different. */
function changesEstimate(task: ApiScrumTask, body: ApiUpdateTaskBody): boolean {
  return (body.points !== undefined && body.points !== task.points)
    || (body.estimate_hours !== undefined && body.estimate_hours !== task.estimate_hours);
}

/**
 * Board data layer: one aggregate GET, optimistic moves, and thin CRUD wrappers
 * that refetch on success. A monotonic request counter means only the newest
 * load may commit, so fast sprint switching can't resurrect stale data
 * (the pattern `useConversationMessages` established for message threads).
 */
export function useScrumBoard(
  projectId: string | undefined,
  viewerName: string,
  viewerId?: string,
) {
  const [board, setBoard] = useState<ApiScrumBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<BoardNotice | null>(null);

  // A different project starts from a blank board with the spinner up. Reset
  // during render (react.dev, "adjusting state when a prop changes") rather than
  // in the load effect, so that effect never sets state synchronously.
  const [boardFor, setBoardFor] = useState(projectId);
  if (boardFor !== projectId) {
    setBoardFor(projectId);
    setBoard(null);
    setError(null);
    setLoading(true);
  }

  /** Mirrors `board` so callbacks can read it without depending on it —
   *  a changing `moveTask` identity would re-render every card on every drop. */
  const boardRef = useRef<ApiScrumBoard | null>(null);
  useEffect(() => { boardRef.current = board; }, [board]);

  const requestSeq = useRef(0);
  /**
   * Per-entity write sequence. Field edits are optimistic, but a story PATCH
   * costs ~1s (the backend makes ~6 sequential Supabase round-trips, including
   * a burnup snapshot), so a fast second click lands while the first is still
   * in flight. Without this, the *earlier* response arrives last and overwrites
   * the newer value — picking 13 then 5 snapped back to 13. Only the response
   * to the newest write for a given id is allowed to touch state.
   */
  const writeSeq = useRef<Map<string, number>>(new Map());
  const nextWrite = (id: string) => {
    const seq = (writeSeq.current.get(id) ?? 0) + 1;
    writeSeq.current.set(id, seq);
    return seq;
  };
  const committedSeq = useRef(0);
  const prRefreshedFor = useRef<string | null>(null);
  /** Sprint currently being viewed; null = let the server pick the active one. */
  const sprintRef = useRef<string | null>(null);
  /**
   * The burnup unit asked for; null = the server's default (points when every task in the sprint has
   * them, else hours). A ref like `sprintRef`, not state: `load` reads it, and a `load` that changed
   * with it would rerun the mount effect below.
   */
  const unitRef = useRef<ApiScrumBurnupUnit | null>(null);

  /** Fetch the board. It never raises the spinner itself: the initial state,
   *  `selectSprint` and `setBurnupUnit` do, so the mount effect below sets no state synchronously. */
  const load = useCallback(
    (sprintId: string | null): Promise<void> => {
      if (!projectId) return Promise.resolve();
      const seq = ++requestSeq.current;
      // A promise chain, as classContext's loader: state changes only in its
      // callbacks, which react-hooks/set-state-in-effect accepts for the mount
      // effect below (it does not for an async function's catch/finally).
      return api
        .getScrumBoard(projectId, sprintId ?? undefined, unitRef.current ?? undefined)
        .then((next) => {
          if (seq < committedSeq.current) return; // a newer load already won
          committedSeq.current = seq;
          sprintRef.current = next.sprint_id;
          setBoard(next);
          setError(null);
        })
        .catch((err: unknown) => {
          if (seq < committedSeq.current) return;
          setError(err instanceof Error ? err.message : 'Failed to load the board');
        })
        .finally(() => {
          // The newest request ends loading. Background refreshes used to skip this,
          // so one that overtook a sprint switch left the spinner up for good.
          if (seq === requestSeq.current) setLoading(false);
        });
    },
    [projectId],
  );

  useEffect(() => {
    // `loading` is already true here: the initial state, or the reset above. Another project opens
    // in its default unit, as another sprint does.
    unitRef.current = null;
    void load(null);
  }, [load]);

  /** Refresh cached PR/MR states once per project, after the board is on screen. */
  useEffect(() => {
    if (!projectId || !board || prRefreshedFor.current === projectId) return;
    prRefreshedFor.current = projectId;
    void api
      .refreshScrumPrStates(projectId)
      .then(({ updated }) => {
        if (!updated || Object.keys(updated).length === 0) return;
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                stories: applyPrStates(prev.stories, updated),
                backlog: applyPrStates(prev.backlog, updated),
              }
            : prev,
        );
      })
      .catch(() => {
        /* Cached states stay as they are — never surfaced as a board error. */
      });
  }, [projectId, board]);

  /** Pick up teammates' changes when the tab regains focus (no realtime in v1, D11). */
  useEffect(() => {
    const onFocus = () => void load(sprintRef.current);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const refresh = useCallback(() => load(sprintRef.current), [load]);

  const selectSprint = useCallback(
    (sprintId: string) => {
      // Each sprint opens in its own default unit (points when every one of its tasks has them), not
      // in the one picked for the last sprint.
      unitRef.current = null;
      setLoading(true); // a sprint switch shows the spinner; background refreshes don't
      return load(sprintId);
    },
    [load],
  );

  /**
   * Redraw the burnup in `unit`: the shown sprint reloads as on a sprint switch, skeleton included.
   * Points goes as the server's default, not by name. It is the default whenever the sprint can draw
   * it, which is the only time the board offers it, and a named unit the sprint can no longer draw
   * (a teammate has just added a task without points) would fail the whole load with a 422. Hours can
   * always be drawn.
   */
  const setBurnupUnit = useCallback(
    (unit: ApiScrumBurnupUnit) => {
      unitRef.current = unit === 'hours' ? 'hours' : null;
      setLoading(true);
      return load(sprintRef.current);
    },
    [load],
  );

  /**
   * Optimistic status change; rolls the card back and explains if the write fails. Every step also
   * writes the task's status into the refs that name it, across the sprint and the backlog, so a
   * dependent reads its blocker's new column at once (spec D9).
   */
  const moveTask = useCallback(
    async (taskId: string, to: ApiBoardStatus) => {
      const current = boardRef.current;
      const snapshot = current ? findTask(current.stories, taskId) : null;
      if (!snapshot || snapshot.status === to) return;
      // A blocked task never leaves To do: refused before asking, so the card never moves. The
      // copy may be stale (a teammate finished the blocker), so the board reloads behind the toast.
      if (to !== 'todo' && isBlocked(snapshot)) {
        setNotice({ kind: 'error', message: blockedMessage(snapshot) });
        void refresh();
        return;
      }

      // Prefer the board's own member list: it carries the same display name
      // the server will reconcile with, whereas the auth token's metadata is
      // often just an email. Falls back to that when the viewer isn't a member
      // (an instructor or TA viewing a team's board).
      const mover = (viewerId && current?.members.find((m) => m.user_id === viewerId)?.name)
        || viewerName;
      setBoard((prev) => (prev ? {
        ...prev,
        stories: syncRefStatus(applyOptimisticMove(prev.stories, taskId, to, mover), taskId, to),
        backlog: syncRefStatus(prev.backlog, taskId, to),
      } : prev));
      try {
        const task = await api.moveScrumTask(taskId, to);
        setBoard((prev) => (prev ? {
          ...prev,
          stories: syncRefStatus(confirmMove(prev.stories, taskId, task), taskId, task.status),
          backlog: syncRefStatus(prev.backlog, taskId, task.status),
        } : prev));
      } catch (err) {
        setBoard((prev) => (prev ? {
          ...prev,
          stories: syncRefStatus(rollbackMove(prev.stories, snapshot), taskId, snapshot.status),
          backlog: syncRefStatus(prev.backlog, taskId, snapshot.status),
        } : prev));
        setNotice(noticeFor(err, `Couldn't move ${snapshot.key}`));
        // The server refused a block this copy did not show: reload it so the chip appears (D10).
        if (err instanceof ApiError && err.code === 'task_blocked') void refresh();
      }
    },
    [viewerName, viewerId, refresh],
  );

  /**
   * Field edits (points, title, tags…) apply locally first, then PATCH and
   * reconcile — the same lifecycle as a move. A full refresh here would freeze
   * the control for as long as the board's aggregate query takes (F16).
   */
  const patchStory = useCallback(async (storyId: string, body: ApiUpdateStoryBody) => {
    const current = boardRef.current;
    const snapshot = current
      ? findStory(current.stories, storyId) ?? findStory(current.backlog, storyId)
      : null;
    if (!snapshot) return null;

    const local = (patch: Partial<ApiScrumStory>) =>
      setBoard((prev) => (prev ? {
        ...prev,
        stories: applyStoryPatch(prev.stories, storyId, patch),
        backlog: applyStoryPatch(prev.backlog, storyId, patch),
      } : prev));

    const seq = nextWrite(storyId);
    local(body as Partial<ApiScrumStory>);
    try {
      const story = await api.updateStory(storyId, body);
      // A newer edit is already on screen and in flight — its response wins.
      if (writeSeq.current.get(storyId) !== seq) return story;
      // The PATCH response carries no children — keep the ones already loaded.
      local({ ...story, tasks: snapshot.tasks });
      return story;
    } catch (err) {
      // Rolling back to this snapshot would discard a newer pending edit.
      if (writeSeq.current.get(storyId) !== seq) return null;
      local(snapshot);
      setNotice(noticeFor(err, `Couldn’t save ${snapshot.key}`));
      return null;
    }
  }, []);

  const patchTask = useCallback(async (taskId: string, body: ApiUpdateTaskBody) => {
    const current = boardRef.current;
    // A task on a backlog story lives in `backlog`, not the sprint's `stories`.
    const snapshot = current
      ? findTask(current.stories, taskId) ?? findTask(current.backlog, taskId)
      : null;
    if (!snapshot) return null;

    const local = (patch: Partial<ApiScrumTask>) =>
      setBoard((prev) => (prev ? {
        ...prev,
        stories: applyTaskPatch(prev.stories, taskId, patch),
        backlog: applyTaskPatch(prev.backlog, taskId, patch),
      } : prev));

    const seq = nextWrite(taskId);
    local(body as Partial<ApiScrumTask>);
    try {
      const task = await api.updateScrumTask(taskId, body);
      if (writeSeq.current.get(taskId) !== seq) return task;   // superseded
      // The response has no dependency lists, comment count or mover's name: the board's stay.
      setBoard((prev) => (prev ? {
        ...prev,
        stories: mapTask(prev.stories, taskId, (t) => mergeTaskResponse(t, task)),
        backlog: mapTask(prev.backlog, taskId, (t) => mergeTaskResponse(t, task)),
      } : prev));
      // Points and hours feed what only the board load computes: the burnup and its unit, the points
      // nudge and the sprint picker's progress. Reload behind the patch, without the skeleton.
      if (changesEstimate(snapshot, body)) void refresh();
      return task;
    } catch (err) {
      if (writeSeq.current.get(taskId) !== seq) return null;   // superseded
      local(snapshot);
      setNotice(noticeFor(err, `Couldn’t save ${snapshot.key}`));
      return null;
    }
  }, [refresh]);

  /** Run a write, refresh on success, and turn any failure into a notice. */
  const mutate = useCallback(
    async <T>(action: () => Promise<T>, failure: string, success?: string): Promise<T | null> => {
      try {
        const result = await action();
        await refresh();
        if (success) setNotice({ kind: 'success', message: success });
        return result;
      } catch (err) {
        setNotice(noticeFor(err, failure));
        return null;
      }
    },
    [refresh],
  );

  const createStory = useCallback(
    (body: ApiCreateStoryBody) =>
      projectId ? mutate(() => api.createStory(projectId, body), 'Couldn’t create the story') : Promise.resolve(null),
    [mutate, projectId],
  );
  /** A sprint move still refetches — it reshuffles the lists. */
  const updateStory = useCallback(
    (storyId: string, body: ApiUpdateStoryBody) =>
      ('sprint_id' in body)
        ? mutate(() => api.updateStory(storyId, body), 'Couldn’t save the story')
        : patchStory(storyId, body),
    [mutate, patchStory],
  );
  /**
   * Delete a backlog story with its tasks. Resolves false when the write fails or is refused
   * (a story in a sprint, a read-only preview); the notice carries the reason.
   */
  const deleteStory = useCallback(
    (storyId: string): Promise<boolean> =>
      mutate(
        async () => { await api.deleteScrumStory(storyId); return true; },
        'Couldn’t delete the story',
        'Story deleted',
      ).then((ok) => ok === true),
    [mutate],
  );
  const createTask = useCallback(
    (storyId: string, body: ApiCreateTaskBody) =>
      mutate(() => api.createScrumTask(storyId, body), 'Couldn’t create the task'),
    [mutate],
  );
  const updateTask = useCallback(
    (taskId: string, body: ApiUpdateTaskBody) => patchTask(taskId, body),
    [patchTask],
  );
  const deleteTask = useCallback(
    (taskId: string) => mutate(() => api.deleteScrumTask(taskId), 'Couldn’t delete the task', 'Task deleted'),
    [mutate],
  );
  /** Both sides of the edge change (one task's depends_on, the other's blocks): reload the board. */
  const addDependency = useCallback(
    (taskId: string, dependsOnTaskId: string) =>
      mutate(() => api.addTaskDependency(taskId, dependsOnTaskId), 'Couldn’t add the dependency'),
    [mutate],
  );
  const removeDependency = useCallback(
    (taskId: string, dependsOnTaskId: string) =>
      mutate(() => api.removeTaskDependency(taskId, dependsOnTaskId), 'Couldn’t remove the dependency'),
    [mutate],
  );
  // No sprint writes: a team's sprints come from its class's sprint schedule (spec 2026-10-22, Part 0).
  const createSprint = useCallback(
    (body: { name: string; starts_at: string; ends_at: string }) =>
      projectId ? mutate(() => api.createSprint(projectId, body), 'Couldn’t create the sprint', 'Sprint created') : Promise.resolve(null),
    [mutate, projectId],
  );
  const updateSettings = useCallback(
    (scale: ApiEstimateScale) =>
      projectId ? mutate(() => api.updateScrumSettings(projectId, scale), 'Couldn’t change the estimate scale') : Promise.resolve(null),
    [mutate, projectId],
  );

  return {
    board,
    loading,
    error,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    /** Staff (instructors/TAs) read and comment but never mutate the board (D2). */
    canWrite: board?.access === 'member',
    refresh,
    selectSprint,
    setBurnupUnit,
    moveTask,
    createStory,
    updateStory,
    deleteStory,
    createTask,
    updateTask,
    deleteTask,
    addDependency,
    removeDependency,
    createSprint,
    updateSettings,
  };
}
