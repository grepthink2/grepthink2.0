import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiDocumentStory } from '@/lib/api';
import { useProjectStories } from '../hooks/useProjectStories';

vi.mock('@/lib/api', () => ({ api: { getDocumentStories: vi.fn() } }));
const { api } = await import('@/lib/api');

const story = (over: Partial<ApiDocumentStory> = {}): ApiDocumentStory => ({
  id: 's1', key: 'US-1', title: 'Trail search', acceptance_criteria: ['Works'],
  sprint_id: 'sp1', sprint_name: 'Sprint 1', completed: true, ...over,
});

const STORIES: Record<string, ApiDocumentStory[]> = {
  p1: [story(), story({ id: 's2', key: 'US-2', sprint_id: 'sp2', sprint_name: 'Sprint 2', completed: false })],
  p2: [story({ id: 't1', key: 'US-1', title: 'Another team’s story' })],
};

beforeEach(() => {
  vi.mocked(api.getDocumentStories).mockReset()
    .mockImplementation((projectId: string) => Promise.resolve({ stories: STORIES[projectId] ?? [] }));
});

describe('useProjectStories', () => {
  it('reads nothing until it is enabled, or without a project', () => {
    const { result, rerender } = renderHook(({ id, on }) => useProjectStories(id, on), {
      initialProps: { id: 'p1' as string | undefined, on: false },
    });
    expect(result.current.status).toBe('idle');
    rerender({ id: undefined, on: true });
    expect(result.current.status).toBe('idle');
    expect(api.getDocumentStories).not.toHaveBeenCalled();
  });

  it("holds the project's stories once read, by id too", async () => {
    const { result } = renderHook(() => useProjectStories('p1', true));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.stories.map((s) => s.key)).toEqual(['US-1', 'US-2']);
    expect(result.current.byId.get('s2')?.sprint_name).toBe('Sprint 2');
    expect(api.getDocumentStories).toHaveBeenCalledWith('p1');
  });

  it('reads once per project: turning it off and on again keeps what it read', async () => {
    const { result, rerender } = renderHook(({ on }) => useProjectStories('p1', on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ on: false });
    expect(result.current.status).toBe('ready');
    expect(result.current.stories).toHaveLength(2);
    rerender({ on: true });
    expect(result.current.status).toBe('ready');
    expect(api.getDocumentStories).toHaveBeenCalledTimes(1);
  });

  it("reads another project's stories for another project, never showing the first one's", async () => {
    const { result, rerender } = renderHook(({ id }) => useProjectStories(id, true), { initialProps: { id: 'p1' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ id: 'p2' });
    expect(result.current.status).toBe('loading');
    expect(result.current.stories).toEqual([]);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.stories.map((s) => s.title)).toEqual(['Another team’s story']);
    expect(api.getDocumentStories).toHaveBeenLastCalledWith('p2');
  });

  it('says it failed, and reads again on retry', async () => {
    vi.mocked(api.getDocumentStories).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useProjectStories('p1', true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.getDocumentStories).toHaveBeenCalledTimes(2);
  });

  it('answers which stories the board no longer holds, reading them afresh, and keeps the fresh read', async () => {
    const { result } = renderHook(() => useProjectStories('p1', false));
    let missing: string[] = [];
    await act(async () => { missing = await result.current.findMissing(['s1', 'gone']); });
    expect(missing).toEqual(['gone']);
    expect(result.current.status).toBe('ready');
    await act(async () => { missing = await result.current.findMissing([]); });
    expect(missing).toEqual([]);
    expect(api.getDocumentStories).toHaveBeenCalledTimes(1);
  });
});
