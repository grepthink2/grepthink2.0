import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useScrumBoard } from '../hooks/useScrumBoard';
import { storyHours } from '../utils/rollups';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import type { ApiScrumBoard, ApiScrumStory, ApiScrumTask } from '@/lib/api';
import { makeBoard, makeStory, makeTask } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    getScrumBoard: vi.fn(),
    moveScrumTask: vi.fn(),
    refreshScrumPrStates: vi.fn(),
    updateStory: vi.fn(),
    updateScrumTask: vi.fn(),
    deleteScrumStory: vi.fn(),
  },
}));
const { api } = await import('@/lib/api');


beforeEach(() => {
  vi.mocked(api.getScrumBoard).mockReset().mockResolvedValue(makeBoard());
  vi.mocked(api.moveScrumTask).mockReset();
  vi.mocked(api.refreshScrumPrStates).mockReset().mockResolvedValue({ updated: {} });
  vi.mocked(api.deleteScrumStory).mockReset();
  vi.mocked(api.updateScrumTask).mockReset();
});

/** One sprint story whose tasks carry 3 and 2 hours. */
const hoursBoard = () => makeBoard({
  stories: [makeStory({
    points: 8,
    tasks: [makeTask({ id: 't1', estimate_hours: 3 }), makeTask({ id: 't2', estimate_hours: 2 })],
  })],
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
    let resolveMove: (v: { message: string; task: ApiScrumTask }) => void = () => {};
    vi.mocked(api.moveScrumTask).mockReturnValue(
      new Promise((res) => { resolveMove = res; }) as ReturnType<typeof api.moveScrumTask>,
    );

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.moveTask('a', 'done'); });
    // optimistic: card already reads as done, attributed to the viewer
    await waitFor(() => expect(result.current.board!.stories[0].tasks[0].status).toBe('done'));
    expect(result.current.board!.stories[0].tasks[0].moved_by_name).toBe('Tony Wu');

    await act(async () => { resolveMove({ message: 'ok', task: serverTask }); });
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
    const resolvers: Array<(v: { message: string; story: ApiScrumStory }) => void> = [];
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
    await act(async () => { resolvers[1]({ message: 'ok', story: makeStory({ points: 5 }) }); });
    await act(async () => { resolvers[0]({ message: 'ok', story: makeStory({ points: 13 }) }); });

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

  it('a task save that changes its hours changes the story sum at once, without a reload', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(hoursBoard());
    let resolveSave: (v: { message: string; task: ApiScrumTask }) => void = () => {};
    vi.mocked(api.updateScrumTask).mockReturnValue(
      new Promise((res) => { resolveSave = res; }) as ReturnType<typeof api.updateScrumTask>,
    );

    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(storyHours(result.current.board!.stories[0])).toBe(5);

    act(() => { void result.current.updateTask('t1', { estimate_hours: 8 }); });
    expect(storyHours(result.current.board!.stories[0])).toBe(10);   // optimistic

    await act(async () => { resolveSave({ message: 'ok', task: makeTask({ id: 't1', estimate_hours: 8 }) }); });
    expect(storyHours(result.current.board!.stories[0])).toBe(10);
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);   // the first load only
  });

  it('a story points change keeps the story sum', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(hoursBoard());
    // A single-row story response: no tasks, and so no hours.
    vi.mocked(api.updateStory).mockResolvedValue({
      message: 'ok', story: makeStory({ points: 13, estimate_hours: null }),
    });

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
