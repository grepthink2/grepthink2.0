import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { makeBoard, makeSprint, makeStory, makeTask } from '@features/scrum/__tests__/fixtures';
import { readBoardStories, useBoardStories } from '../hooks/useBoardStories';

vi.mock('@/lib/api', () => ({ api: { getScrumBoard: vi.fn() } }));
const { api } = await import('@/lib/api');

const SPRINTS = [makeSprint(), makeSprint({ id: 'sp2', name: 'Sprint 2', starts_at: '2026-08-24', ends_at: '2026-09-06' })];

/** The board on Sprint 2 by default; Sprint 1 when asked for it. */
function boards(projectId: string, sprintId?: string) {
  void projectId;
  if (sprintId === 'sp1') {
    return Promise.resolve(makeBoard({
      sprints: SPRINTS,
      sprint_id: 'sp1',
      stories: [makeStory({ id: 's1', key: 'US-1', acceptance_criteria: ['Works'], tasks: [makeTask({ status: 'done' })] })],
      backlog: [makeStory({ id: 's9', key: 'US-9', sprint_id: null })],
    }));
  }
  return Promise.resolve(makeBoard({
    sprints: SPRINTS,
    sprint_id: 'sp2',
    stories: [makeStory({ id: 's2', key: 'US-2', sprint_id: 'sp2', tasks: [makeTask({ status: 'done' }), makeTask({ id: 'b', status: 'todo' })] })],
    backlog: [makeStory({ id: 's9', key: 'US-9', sprint_id: null })],
  }));
}

beforeEach(() => {
  vi.mocked(api.getScrumBoard).mockReset().mockImplementation(boards);
});

describe('readBoardStories', () => {
  it('reads the board, then each other sprint, and lists every story sprint by sprint, then the backlog', async () => {
    const stories = await readBoardStories('p1');
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);
    expect(api.getScrumBoard).toHaveBeenCalledWith('p1', 'sp1');
    expect(stories.map((s) => [s.key, s.sprintName, s.completed])).toEqual([
      ['US-1', 'Sprint 1', true],
      ['US-2', 'Sprint 2', false],
      ['US-9', null, false],
    ]);
    expect(stories[0].acceptance_criteria).toEqual(['Works']);
  });
});

describe('useBoardStories', () => {
  it('reads nothing until it is enabled', () => {
    const { result } = renderHook(() => useBoardStories('p1', false));
    expect(result.current.status).toBe('idle');
    expect(api.getScrumBoard).not.toHaveBeenCalled();
  });

  it('holds the stories once read, by id too', async () => {
    const { result } = renderHook(() => useBoardStories('p1', true));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.byId.get('s2')?.key).toBe('US-2');
  });

  it('says it failed, and reads again on retry', async () => {
    vi.mocked(api.getScrumBoard).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useBoardStories('p1', true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('answers which stories the board no longer holds, reading it afresh', async () => {
    const { result } = renderHook(() => useBoardStories('p1', false));
    let missing: string[] = [];
    await act(async () => { missing = await result.current.findMissing(['s1', 'gone']); });
    expect(missing).toEqual(['gone']);
    await act(async () => { missing = await result.current.findMissing([]); });
    expect(missing).toEqual([]);
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);
  });
});
