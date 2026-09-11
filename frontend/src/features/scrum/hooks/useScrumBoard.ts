import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  ApiBoardStatus, ApiCreateStoryBody, ApiCreateTaskBody, ApiEstimateScale,
  ApiScrumBoard, ApiScrumStory, ApiScrumTask, ApiUpdateStoryBody, ApiUpdateTaskBody,
} from '@/lib/api';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import {
  applyOptimisticMove, applyPrStates, applyStoryPatch, applyTaskPatch,
  confirmMove, findStory, findTask, rollbackMove,
} from '../utils/boardReducer';

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

  const load = useCallback(
    async (sprintId: string | null, opts: { quiet?: boolean } = {}) => {
      if (!projectId) return;
      const seq = ++requestSeq.current;
      if (!opts.quiet) setLoading(true);
      try {
        const next = await api.getScrumBoard(projectId, sprintId ?? undefined);
        if (seq < committedSeq.current) return; // a newer load already won
        committedSeq.current = seq;
        sprintRef.current = next.sprint_id;
        setBoard(next);
        setError(null);
      } catch (err) {
        if (seq < committedSeq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load the board');
      } finally {
        if (seq === requestSeq.current && !opts.quiet) setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
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
    const onFocus = () => void load(sprintRef.current, { quiet: true });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const refresh = useCallback(
    () => load(sprintRef.current, { quiet: true }),
    [load],
  );

  const selectSprint = useCallback((sprintId: string) => load(sprintId), [load]);

  /** Optimistic status change; rolls the card back and explains if the write fails. */
  const moveTask = useCallback(
    async (taskId: string, to: ApiBoardStatus) => {
      const current = boardRef.current;
      const snapshot = current ? findTask(current.stories, taskId) : null;
      if (!snapshot || snapshot.status === to) return;

      // Prefer the board's own member list: it carries the same display name
      // the server will reconcile with, whereas the auth token's metadata is
      // often just an email. Falls back to that when the viewer isn't a member
      // (an instructor or TA viewing a team's board).
      const mover = (viewerId && current?.members.find((m) => m.user_id === viewerId)?.name)
        || viewerName;
      setBoard((prev) =>
        prev ? { ...prev, stories: applyOptimisticMove(prev.stories, taskId, to, mover) } : prev,
      );
      try {
        const { task } = await api.moveScrumTask(taskId, to);
        setBoard((prev) => (prev ? { ...prev, stories: confirmMove(prev.stories, taskId, task) } : prev));
      } catch (err) {
        setBoard((prev) => (prev ? { ...prev, stories: rollbackMove(prev.stories, snapshot) } : prev));
        setNotice(noticeFor(err, `Couldn't move ${snapshot.key}`));
      }
    },
    [viewerName, viewerId],
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
      const { story } = await api.updateStory(storyId, body);
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
    const snapshot = current ? findTask(current.stories, taskId) : null;
    if (!snapshot) return null;

    const local = (patch: Partial<ApiScrumTask>) =>
      setBoard((prev) => (prev ? { ...prev, stories: applyTaskPatch(prev.stories, taskId, patch) } : prev));

    const seq = nextWrite(taskId);
    local(body as Partial<ApiScrumTask>);
    try {
      const { task } = await api.updateScrumTask(taskId, body);
      if (writeSeq.current.get(taskId) !== seq) return task;   // superseded
      local(task);
      return task;
    } catch (err) {
      if (writeSeq.current.get(taskId) !== seq) return null;   // superseded
      local(snapshot);
      setNotice(noticeFor(err, `Couldn’t save ${snapshot.key}`));
      return null;
    }
  }, []);

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
  /** Structural edits (sprint move, archive) still refetch — they reshuffle lists. */
  const updateStory = useCallback(
    (storyId: string, body: ApiUpdateStoryBody) =>
      ('sprint_id' in body || 'archived' in body)
        ? mutate(() => api.updateStory(storyId, body), 'Couldn’t save the story')
        : patchStory(storyId, body),
    [mutate, patchStory],
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
  const createSprint = useCallback(
    (body: { name: string; starts_at: string; ends_at: string }) =>
      projectId ? mutate(() => api.createSprint(projectId, body), 'Couldn’t create the sprint', 'Sprint created') : Promise.resolve(null),
    [mutate, projectId],
  );
  const updateSprint = useCallback(
    (sprintId: string, body: Parameters<typeof api.updateSprint>[1]) =>
      mutate(() => api.updateSprint(sprintId, body), 'Couldn’t save the sprint'),
    [mutate],
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
    moveTask,
    createStory,
    updateStory,
    createTask,
    updateTask,
    deleteTask,
    createSprint,
    updateSprint,
    updateSettings,
  };
}
