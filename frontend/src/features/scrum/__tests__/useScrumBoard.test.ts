import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useScrumBoard } from '../hooks/useScrumBoard';
import { findTask } from '../utils/boardReducer';
import { isBlocked } from '../utils/dependencies';
import { storyHours } from '../utils/rollups';
import { ApiError } from '@/lib/api/client';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import type { ApiBoardStatus, ApiScrumBoard, ApiScrumStory, ApiScrumTask } from '@/lib/api';
import { makeBoard, makeRef, makeStory, makeTask } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    getScrumBoard: vi.fn(),
    moveScrumTask: vi.fn(),
    refreshScrumPrStates: vi.fn(),
    updateStory: vi.fn(),
    updateScrumTask: vi.fn(),
    deleteScrumStory: vi.fn(),
    addTaskDependency: vi.fn(),
    removeTaskDependency: vi.fn(),
  },
}));
const { api } = await import('@/lib/api');


beforeEach(() => {
  vi.mocked(api.getScrumBoard).mockReset().mockResolvedValue(makeBoard());
  vi.mocked(api.moveScrumTask).mockReset();
  vi.mocked(api.refreshScrumPrStates).mockReset().mockResolvedValue({ updated: {} });
  vi.mocked(api.deleteScrumStory).mockReset();
  vi.mocked(api.updateScrumTask).mockReset();
  vi.mocked(api.addTaskDependency).mockReset();
  vi.mocked(api.removeTaskDependency).mockReset();
});

/** The server's detail for a refused move (backend TASK_BLOCKED). */
const TASK_BLOCKED = 'Finish the tasks this one depends on first';

/**
 * GT-2 (task a, in To do, three comments) depends on GT-1 (task b), which is `blocker` on this copy
 * of the board: under way by default, so GT-2 is blocked.
 */
const dependencyBoard = (blocker: ApiBoardStatus = 'in_progress') => makeBoard({
  stories: [makeStory({
    points: 8,
    tasks: [
      makeTask({
        id: 'a', key: 'GT-2', status: 'todo', comment_count: 3, moved_by: 'u1', moved_by_name: 'Tony Wu',
        moved_at: '2026-08-20T12:00:00Z', depends_on: [makeRef({ id: 'b', key: 'GT-1', status: blocker })],
      }),
      makeTask({
        id: 'b', key: 'GT-1', status: blocker,
        blocks: [makeRef({ id: 'a', key: 'GT-2', status: 'todo' })],
      }),
    ],
  })],
});

/** One sprint story whose tasks carry `first` (3 unless given) and 2 hours. */
const hoursBoard = (first = 3) => makeBoard({
  stories: [makeStory({
    points: 8,
    tasks: [makeTask({ id: 't1', estimate_hours: first }), makeTask({ id: 't2', estimate_hours: 2 })],
  })],
});

/** What the task editor sends on Save: every field, the unchanged ones included. */
const editorBody = (task: ApiScrumTask) => ({
  title: task.title,
  description_md: task.description_md,
  tags: task.tags,
  points: task.points ?? undefined,
  estimate_hours: task.estimate_hours,
  assignee_id: task.assignee_id,
  pr_url: task.pr_url,
});

describe('useScrumBoard', () => {
  it('loads the board and reports member write access', async () => {
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board?.project.name).toBe('GrepThink');
    expect(result.current.canWrite).toBe(true);
  });

  it('denies write access to staff viewers', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(makeBoard({ access: 'staff' }));
    const { result } = renderHook(() => useScrumBoard('p1', 'TA'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canWrite).toBe(false);
  });

  it('moves optimistically then reconciles with the server row', async () => {
    const serverTask = makeTask({ status: 'done', moved_by_name: 'Tony W.', moved_at: '2026-08-28T12:00:00Z' });
    let resolveMove: (v: ApiScrumTask) => void = () => {};
    vi.mocked(api.moveScrumTask).mockReturnValue(
      new Promise((res) => { resolveMove = res; }) as ReturnType<typeof api.moveScrumTask>,
    );

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.moveTask('a', 'done'); });
    // optimistic: card already reads as done, attributed to the viewer
    await waitFor(() => expect(result.current.board!.stories[0].tasks[0].status).toBe('done'));
    expect(result.current.board!.stories[0].tasks[0].moved_by_name).toBe('Tony Wu');

    await act(async () => { resolveMove(serverTask); });
    expect(result.current.board!.stories[0].tasks[0].moved_by_name).toBe('Tony W.');
  });

  it('attributes the optimistic move to the board member name, not the auth fallback', async () => {
    vi.mocked(api.moveScrumTask).mockReturnValue(new Promise(() => {}) as ReturnType<typeof api.moveScrumTask>);
    // What the auth token actually carries for a student with no full_name set.
    const { result } = renderHook(() => useScrumBoard('p1', 'qa.student@grepthink.dev', 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.moveTask('a', 'done'); });
    await waitFor(() => expect(result.current.board!.stories[0].tasks[0].status).toBe('done'));
    expect(result.current.board!.stories[0].tasks[0].moved_by_name).toBe('Tony Wu');
  });

  it('falls back to the given name when the viewer is not a project member', async () => {
    vi.mocked(api.moveScrumTask).mockReturnValue(new Promise(() => {}) as ReturnType<typeof api.moveScrumTask>);
    const { result } = renderHook(() => useScrumBoard('p1', 'Dr. Instructor', 'staff-9'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.moveTask('a', 'done'); });
    await waitFor(() => expect(result.current.board!.stories[0].tasks[0].status).toBe('done'));
    expect(result.current.board!.stories[0].tasks[0].moved_by_name).toBe('Dr. Instructor');
  });

  it('a slow earlier points write cannot overwrite a newer one', async () => {
    // The reported bug: pick 13, then 5 before the first PATCH lands. The 13
    // response arrives last and used to snap the picker back to 13.
    const resolvers: Array<(v: ApiScrumStory) => void> = [];
    vi.mocked(api.updateStory).mockImplementation(
      () => new Promise((res) => { resolvers.push(res); }) as ReturnType<typeof api.updateStory>,
    );

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.updateStory('s1', { points: 13 }); });
    act(() => { void result.current.updateStory('s1', { points: 5 }); });
    // Optimistically the newest choice is on screen.
    expect(result.current.board!.stories[0].points).toBe(5);

    // Server answers out of order: the stale 13 lands last.
    await act(async () => { resolvers[1](makeStory({ points: 5 })); });
    await act(async () => { resolvers[0](makeStory({ points: 13 })); });

    expect(result.current.board!.stories[0].points).toBe(5);
  });

  it('a superseded failed write does not roll back the newer value', async () => {
    const resolvers: Array<{ rej: (e: Error) => void }> = [];
    vi.mocked(api.updateStory).mockImplementation(
      () => new Promise((_res, rej) => { resolvers.push({ rej }); }) as ReturnType<typeof api.updateStory>,
    );

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.updateStory('s1', { points: 13 }); });
    act(() => { void result.current.updateStory('s1', { points: 5 }); });
    await act(async () => { resolvers[0].rej(new Error('network down')); });

    // The stale failure must not restore the pre-13 snapshot over the live 5.
    expect(result.current.board!.stories[0].points).toBe(5);
  });

  it('a task save that changes its hours changes the story sum at once, before the board reloads', async () => {
    // The reload behind the save answers the server's sum.
    vi.mocked(api.getScrumBoard).mockResolvedValueOnce(hoursBoard()).mockResolvedValue(hoursBoard(8));
    let resolveSave: (v: ApiScrumTask) => void = () => {};
    vi.mocked(api.updateScrumTask).mockReturnValue(
      new Promise((res) => { resolveSave = res; }) as ReturnType<typeof api.updateScrumTask>,
    );

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(storyHours(result.current.board!.stories[0])).toBe(5);

    act(() => { void result.current.updateTask('t1', { estimate_hours: 8 }); });
    expect(storyHours(result.current.board!.stories[0])).toBe(10);   // optimistic
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);               // nothing waits for a reload

    await act(async () => { resolveSave(makeTask({ id: 't1', estimate_hours: 8 })); });
    expect(storyHours(result.current.board!.stories[0])).toBe(10);
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);   // then one quiet reload, for the burnup
  });

  it('reloads the board quietly once after a task save that changes its points, for the burnup', async () => {
    const before = makeTask();   // makeBoard()'s task: no points, no hours
    vi.mocked(api.updateScrumTask).mockResolvedValue(makeTask({ points: 3 }));
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.getScrumBoard).mockClear();   // count the reload only

    await act(async () => { await result.current.updateTask('a', { ...editorBody(before), points: 3 }); });

    // The burnup, its unit and the points nudge come from the board load alone.
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp1', undefined);
    expect(result.current.loading).toBe(false);   // no skeleton
  });

  it('reloads nothing after a task save that leaves its points and hours as they were', async () => {
    // One task with both estimates, one with neither: the editor sends no points for that one.
    const estimated = makeTask({ id: 'a', points: 3, estimate_hours: 4 });
    const bare = makeTask({ id: 'b', key: 'T-2' });
    vi.mocked(api.getScrumBoard).mockResolvedValue(makeBoard({ stories: [makeStory({ tasks: [estimated, bare] })] }));
    vi.mocked(api.updateScrumTask).mockImplementation(async (id, body) => ({
      ...(id === 'a' ? estimated : bare), title: body.title!,
    }));
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.getScrumBoard).mockClear();

    await act(async () => { await result.current.updateTask('a', { ...editorBody(estimated), title: 'Renamed' }); });
    await act(async () => { await result.current.updateTask('b', { ...editorBody(bare), title: 'Also renamed' }); });
    expect(findTask(result.current.board!.stories, 'a')!.title).toBe('Renamed');
    expect(findTask(result.current.board!.stories, 'b')!.title).toBe('Also renamed');
    expect(api.getScrumBoard).not.toHaveBeenCalled();
  });

  it('reloads nothing after a failed save that would have changed the points', async () => {
    vi.mocked(api.updateScrumTask).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.getScrumBoard).mockClear();

    await act(async () => { await result.current.updateTask('a', { points: 3 }); });
    expect(findTask(result.current.board!.stories, 'a')!.points).toBeNull();   // rolled back
    expect(api.getScrumBoard).not.toHaveBeenCalled();
  });

  it('a story points change keeps the story sum', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(hoursBoard());
    // A single-row story response: no tasks, and so no hours.
    vi.mocked(api.updateStory).mockResolvedValue(makeStory({ points: 13, estimate_hours: null }));

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.updateStory('s1', { points: 13 }); });
    expect(result.current.board!.stories[0].points).toBe(13);
    expect(storyHours(result.current.board!.stories[0])).toBe(5);
  });

  it('ends loading when a background refresh overtakes a sprint switch', async () => {
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let finishSwitch: (board: ApiScrumBoard) => void = () => {};
    vi.mocked(api.getScrumBoard)
      .mockReturnValueOnce(new Promise((res) => { finishSwitch = res; }))  // the switch: slow
      .mockResolvedValueOnce(makeBoard());                                  // the refresh: fast
    act(() => { void result.current.selectSprint('sp1'); });
    expect(result.current.loading).toBe(true);

    await act(async () => { await result.current.refresh(); });
    await act(async () => { finishSwitch(makeBoard()); });
    // Background refreshes used to leave loading alone, so this stayed true for good.
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous project\'s board while the next one loads', async () => {
    const { result, rerender } = renderHook(
      ({ pid }) => useScrumBoard(pid, 'Tony Wu'),
      { initialProps: { pid: 'p1' } },
    );
    await waitFor(() => expect(result.current.board).not.toBeNull());

    vi.mocked(api.getScrumBoard).mockReturnValueOnce(new Promise(() => {}));  // p2 never arrives
    rerender({ pid: 'p2' });
    expect(result.current.board).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('rolls the card back and explains when the move fails', async () => {
    vi.mocked(api.moveScrumTask).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.moveTask('a', 'done'); });

    expect(result.current.board!.stories[0].tasks[0].status).toBe('todo');
    expect(result.current.notice).toEqual({ kind: 'error', message: 'network down' });
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);   // an ordinary failure reloads nothing
    act(() => result.current.clearNotice());
    expect(result.current.notice).toBeNull();
  });

  it('surfaces read-only preview as a calm notice, not an error', async () => {
    vi.mocked(api.moveScrumTask).mockRejectedValue(new ReadOnlyPreviewError());
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.moveTask('a', 'done'); });

    expect(result.current.notice?.kind).toBe('info');
    expect(result.current.notice?.message).toMatch(/read-only preview/i);
    expect(result.current.board!.stories[0].tasks[0].status).toBe('todo');
  });

  it('ignores a stale load that resolves after a newer one', async () => {
    const slow = makeBoard({ project: { id: 'p1', name: 'STALE', estimate_scale: 'fibonacci' } });
    const fresh = makeBoard({ project: { id: 'p1', name: 'FRESH', estimate_scale: 'fibonacci' } });
    let resolveSlow: (b: ApiScrumBoard) => void = () => {};
    vi.mocked(api.getScrumBoard)
      .mockReturnValueOnce(new Promise((res) => { resolveSlow = res; }))
      .mockResolvedValueOnce(fresh);

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await act(async () => { await result.current.selectSprint('sp2'); });
    expect(result.current.board?.project.name).toBe('FRESH');

    // the first request finally lands — it must not overwrite the newer board
    await act(async () => { resolveSlow(slow); });
    expect(result.current.board?.project.name).toBe('FRESH');
  });

  it('deleteStory refetches, reports success and resolves true', async () => {
    vi.mocked(api.deleteScrumStory).mockResolvedValue(undefined);
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.getScrumBoard).mockClear();   // count the refetch only

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.deleteStory('s9'); });

    expect(ok).toBe(true);
    expect(api.deleteScrumStory).toHaveBeenCalledWith('s9');
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toEqual({ kind: 'success', message: 'Story deleted' });
  });

  it('a refused delete resolves false with the server\'s reason', async () => {
    vi.mocked(api.deleteScrumStory).mockRejectedValue(
      new Error('Move the story to the backlog before deleting it'),
    );
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.getScrumBoard).mockClear();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.deleteStory('s1'); });

    expect(ok).toBe(false);
    expect(api.getScrumBoard).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({
      kind: 'error', message: 'Move the story to the backlog before deleting it',
    });
  });

  it('patches cached PR states from the background refresh', async () => {
    vi.mocked(api.refreshScrumPrStates).mockResolvedValue({ updated: { a: 'merged' } });
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.board!.stories[0].tasks[0].pr_state).toBe('merged'));
  });

  it('never fails the board when the PR refresh errors', async () => {
    vi.mocked(api.refreshScrumPrStates).mockRejectedValue(new Error('github down'));
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBeNull();
  });
});

describe('useScrumBoard burnup unit', () => {
  const loaded = async () => {
    const hook = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook.result;
  };

  it('reloads the shown sprint in hours, with the skeleton, and keeps hours for background reloads', async () => {
    const result = await loaded();

    act(() => { void result.current.setBurnupUnit('hours'); });
    expect(result.current.loading).toBe(true);
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp1', 'hours');
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.refresh(); });
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp1', 'hours');
  });

  it('asks for points as the server default, which it is whenever the sprint can draw it', async () => {
    const result = await loaded();
    await act(async () => { await result.current.setBurnupUnit('hours'); });

    await act(async () => { await result.current.setBurnupUnit('points'); });
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp1', undefined);
  });

  it('opens another sprint in its own default unit, without the unit chosen for the last one', async () => {
    const result = await loaded();
    await act(async () => { await result.current.setBurnupUnit('hours'); });

    await act(async () => { await result.current.selectSprint('sp2'); });
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp2', undefined);
  });

  it('keeps a slow unit reload from overwriting the sprint switched to after it', async () => {
    const result = await loaded();
    let finishUnit: (board: ApiScrumBoard) => void = () => {};
    vi.mocked(api.getScrumBoard)
      .mockReturnValueOnce(new Promise((res) => { finishUnit = res; }))   // Sprint 1 in hours: slow
      .mockResolvedValueOnce(makeBoard({ sprint_id: 'sp2' }));            // the switch: fast

    act(() => { void result.current.setBurnupUnit('hours'); });
    await act(async () => { await result.current.selectSprint('sp2'); });
    await act(async () => { finishUnit(makeBoard({ sprint_id: 'sp1' })); });

    expect(result.current.board?.sprint_id).toBe('sp2');
    expect(result.current.loading).toBe(false);
  });
});

describe('useScrumBoard dependencies', () => {
  const renderBoard = async () => {
    const hook = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const task = (id: string) => findTask(hook.result.current.board!.stories, id)!;
    return { result: hook.result, task };
  };

  it('refuses to move a blocked task, explains, and reloads the board', async () => {
    vi.mocked(api.getScrumBoard)
      .mockResolvedValueOnce(dependencyBoard())          // this copy: GT-1 under way
      .mockResolvedValueOnce(dependencyBoard('done'));   // the reload: a teammate finished GT-1
    const { result, task } = await renderBoard();

    // To do → To do is no move at all, as ever.
    await act(async () => { await result.current.moveTask('a', 'todo'); });
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.moveTask('a', 'in_progress'); });
    expect(api.moveScrumTask).not.toHaveBeenCalled();
    expect(task('a').status).toBe('todo');
    expect(result.current.notice).toEqual({ kind: 'error', message: 'GT-2 is blocked by GT-1' });
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);
    // The copy was stale: the reload clears the block on its own.
    await waitFor(() => expect(isBlocked(task('a'))).toBe(false));
  });

  it('moving the blocker to done unblocks its dependent at once', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(dependencyBoard());
    let resolveMove: (v: ApiScrumTask) => void = () => {};
    vi.mocked(api.moveScrumTask)
      .mockReturnValueOnce(new Promise((res) => { resolveMove = res; }) as ReturnType<typeof api.moveScrumTask>)
      .mockReturnValueOnce(new Promise(() => {}) as ReturnType<typeof api.moveScrumTask>);
    const { result, task } = await renderBoard();

    act(() => { void result.current.moveTask('b', 'done'); });
    // Before the server answers, GT-2's copy of GT-1 already says Done…
    expect(task('a').depends_on![0].status).toBe('done');
    expect(isBlocked(task('a'))).toBe(false);
    // …so GT-2 goes through at once.
    act(() => { void result.current.moveTask('a', 'in_progress'); });
    expect(api.moveScrumTask).toHaveBeenLastCalledWith('a', 'in_progress');
    expect(result.current.notice).toBeNull();

    // GT-1's own response carries no lists: it still names GT-2 in its blocks.
    await act(async () => {
      resolveMove(makeTask({ id: 'b', key: 'GT-1', status: 'done' }));
    });
    expect(task('b').blocks!.map((r) => r.id)).toEqual(['a']);
    expect(task('a').depends_on![0].status).toBe('done');
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);   // patched, never refetched
  });

  it('a rolled-back move puts the ref’s status back', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(dependencyBoard());
    vi.mocked(api.moveScrumTask).mockRejectedValue(new Error('network down'));
    const { result, task } = await renderBoard();

    await act(async () => { await result.current.moveTask('b', 'done'); });
    expect(task('b').status).toBe('in_progress');
    expect(task('a').depends_on![0].status).toBe('in_progress');
    expect(isBlocked(task('a'))).toBe(true);
  });

  it('a 409 task_blocked rolls back, shows the server’s reason and reloads', async () => {
    vi.mocked(api.getScrumBoard)
      .mockResolvedValueOnce(dependencyBoard('done'))          // this copy: GT-1 done
      .mockResolvedValueOnce(dependencyBoard('in_progress'));  // the server's: GT-1 reopened
    vi.mocked(api.moveScrumTask).mockRejectedValue(
      new ApiError(409, TASK_BLOCKED, 'Request failed with status 409', 'task_blocked'),
    );
    const { result, task } = await renderBoard();

    await act(async () => { await result.current.moveTask('a', 'in_progress'); });
    expect(task('a').status).toBe('todo');
    expect(result.current.notice).toEqual({ kind: 'error', message: TASK_BLOCKED });
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(isBlocked(task('a'))).toBe(true));
  });

  it('a task save keeps its dependencies, comment count and mover', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(dependencyBoard());
    // update_task's response: no dependency rows, no comment count, no mover's name.
    vi.mocked(api.updateScrumTask).mockResolvedValue(
      makeTask({ id: 'a', key: 'GT-2', title: 'x', moved_by: 'u1', moved_at: '2026-08-20T12:00:00Z' }),
    );
    const { result, task } = await renderBoard();

    await act(async () => { await result.current.updateTask('a', { title: 'x' }); });
    expect(task('a').title).toBe('x');
    expect(task('a').depends_on!.map((r) => r.id)).toEqual(['b']);
    expect(task('a').comment_count).toBe(3);
    expect(task('a').moved_by_name).toBe('Tony Wu');
    expect(isBlocked(task('a'))).toBe(true);
  });

  it('adds and removes a dependency, reloading the board after each', async () => {
    vi.mocked(api.addTaskDependency).mockResolvedValue({ message: 'Dependency added', depends_on: [] });
    vi.mocked(api.removeTaskDependency).mockResolvedValue(undefined);
    const { result } = await renderBoard();

    await act(async () => { await result.current.addDependency('a', 'b'); });
    expect(api.addTaskDependency).toHaveBeenCalledWith('a', 'b');
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);

    await act(async () => { await result.current.removeDependency('a', 'b'); });
    expect(api.removeTaskDependency).toHaveBeenCalledWith('a', 'b');
    expect(api.getScrumBoard).toHaveBeenCalledTimes(3);
    expect(result.current.notice).toBeNull();
  });

  it('a refused dependency explains with the server’s reason', async () => {
    // A cycle deeper than the picker can see comes back from the server.
    const cycle = 'That would make the tasks depend on each other';
    vi.mocked(api.addTaskDependency).mockRejectedValue(
      new ApiError(409, cycle, 'Request failed with status 409'),
    );
    const { result } = await renderBoard();

    let out: unknown;
    await act(async () => { out = await result.current.addDependency('a', 'b'); });
    expect(out).toBeNull();
    expect(result.current.notice).toEqual({ kind: 'error', message: cycle });
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);
  });
});
