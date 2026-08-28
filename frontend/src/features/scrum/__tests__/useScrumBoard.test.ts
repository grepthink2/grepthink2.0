import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useScrumBoard } from '../hooks/useScrumBoard';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import type { ApiScrumBoard, ApiScrumTask } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    getScrumBoard: vi.fn(),
    moveScrumTask: vi.fn(),
    refreshScrumPrStates: vi.fn(),
    updateStory: vi.fn(),
  },
}));
const { api } = await import('@/lib/api');

const task = (over: Partial<ApiScrumTask> = {}): ApiScrumTask => ({
  id: 'a', story_id: 's1', key: 'T-1', title: 'Task', description_md: null,
  points: null, time_estimate: null, status: 'todo', reporter_id: 'u1',
  assignee_id: null, tags: [], pr_url: null, pr_provider: null, pr_state: null,
  moved_by: null, moved_by_name: null, moved_at: null, comment_count: 0, ...over,
});

const boardWith = (over: Partial<ApiScrumBoard> = {}): ApiScrumBoard => ({
  project: { id: 'p1', name: 'GrepThink', estimate_scale: 'fibonacci' },
  ai_enabled: false,
  sprints: [{ id: 'sp1', name: 'Sprint 1', starts_at: '2026-08-10', ends_at: '2026-08-23', status: 'active' }],
  sprint_id: 'sp1',
  stories: [{
    id: 's1', sprint_id: 'sp1', key: 'US-1', title: 'Story', description_md: null,
    points: 8, time_estimate: null, reporter_id: 'u1', assignee_id: null,
    archived_at: null, comment_count: 0, tasks: [task()],
  }],
  backlog: [],
  burnup: { sprint: null, cumulative: { labels: [], scope: [], completed: [], subtitle: null } },
  members: [{ user_id: 'u1', name: 'Tony Wu', image_url: null, project_role: 'owner' }],
  access: 'member',
  ...over,
});

beforeEach(() => {
  vi.mocked(api.getScrumBoard).mockReset().mockResolvedValue(boardWith());
  vi.mocked(api.moveScrumTask).mockReset();
  vi.mocked(api.refreshScrumPrStates).mockReset().mockResolvedValue({ updated: {} });
});

describe('useScrumBoard', () => {
  it('loads the board and reports member write access', async () => {
    const { result } = renderHook(() => useScrumBoard('p1', 'Tony Wu'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board?.project.name).toBe('GrepThink');
    expect(result.current.canWrite).toBe(true);
  });

  it('denies write access to staff viewers', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(boardWith({ access: 'staff' }));
    const { result } = renderHook(() => useScrumBoard('p1', 'TA'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canWrite).toBe(false);
  });

  it('moves optimistically then reconciles with the server row', async () => {
    const serverTask = task({ status: 'done', moved_by_name: 'Tony W.', moved_at: '2026-08-28T12:00:00Z' });
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
    const slow = boardWith({ project: { id: 'p1', name: 'STALE', estimate_scale: 'fibonacci' } });
    const fresh = boardWith({ project: { id: 'p1', name: 'FRESH', estimate_scale: 'fibonacci' } });
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
