import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiSearchIndex } from '@/lib/api/types';
import type { SearchItem } from '../searchModel';

vi.mock('@/lib/api', () => ({ api: { getSearchIndex: vi.fn() } }));
const { api } = await import('@/lib/api');
const { usePaletteHotkey } = await import('../hooks/usePaletteHotkey');
const { useSearchIndex, resetSearchIndexCache, primeSearchIndexCache } = await import('../hooks/useSearchIndex');
const { pushRecent, readRecents, RECENTS_LIMIT } = await import('../recents');

const item = (id: string, over: Partial<SearchItem> = {}): SearchItem => ({
  id, type: 'project', title: `Project ${id}`, href: `/app/projects/${id}`, ...over,
});

const index = (ids: string[]): ApiSearchIndex => ({ items: ids.map((id) => item(id)), generated_at: '2026-10-13T00:00:00Z' });

/** Dispatch the chord on window, as a browser would. `prevented` models a listener that ran first. */
function chord(init: KeyboardEventInit & { prevented?: boolean } = {}) {
  const { prevented, ...rest } = init;
  const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true, ...rest });
  if (prevented) event.preventDefault();
  act(() => { window.dispatchEvent(event); });
  return event;
}

describe('usePaletteHotkey', () => {
  it('toggles on ⌘K and Ctrl+K and claims the key', () => {
    const onToggle = vi.fn();
    renderHook(() => usePaletteHotkey(onToggle));
    const meta = chord();
    chord({ metaKey: false, ctrlKey: true, key: 'K' });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(meta.defaultPrevented).toBe(true);
  });

  it('ignores a chord another listener handled, key repeats, Shift/Alt, and plain k', () => {
    const onToggle = vi.fn();
    renderHook(() => usePaletteHotkey(onToggle));
    chord({ prevented: true });
    chord({ repeat: true });
    chord({ shiftKey: true });
    chord({ altKey: true });
    chord({ metaKey: false });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does nothing while disabled and unsubscribes on unmount', () => {
    const onToggle = vi.fn();
    const { unmount, rerender } = renderHook(({ enabled }) => usePaletteHotkey(onToggle, enabled), { initialProps: { enabled: false } });
    chord();
    rerender({ enabled: true });
    chord();
    unmount();
    chord();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('useSearchIndex', () => {
  beforeEach(() => {
    resetSearchIndexCache();
    vi.mocked(api.getSearchIndex).mockReset();
  });

  it('starts idle, loads once on refresh, and is ready with the items', async () => {
    vi.mocked(api.getSearchIndex).mockResolvedValue(index(['a', 'b']));
    const { result } = renderHook(() => useSearchIndex('me'));
    expect(result.current.status).toBe('idle');
    act(() => result.current.refresh());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(api.getSearchIndex).toHaveBeenCalledTimes(1);
  });

  // In the browser the loading state from refresh() renders in a later task, so an answer that is
  // already there settles first, in the same batch: the two pending-state updates cancel out.
  // refresh() is called inside an async act for that order; act renders an update made by a mount
  // effect before any promise settles, so a mount effect cannot show this.
  it('renders an answer that settles in the same batch as its loading state', async () => {
    vi.mocked(api.getSearchIndex).mockResolvedValue(index(['a', 'b', 'c']));
    const { result } = renderHook(() => useSearchIndex('me'));
    await act(async () => { result.current.refresh(); });
    expect(result.current.items).toHaveLength(3);
    expect(result.current.status).toBe('ready');
  });

  it('serves a fresh cache without a request, refetches a stale one while keeping the old list', async () => {
    primeSearchIndexCache('me', [item('old')], Date.now());
    const { result } = renderHook(() => useSearchIndex('me'));
    act(() => result.current.refresh());
    expect(api.getSearchIndex).not.toHaveBeenCalled();
    expect(result.current.status).toBe('ready');

    primeSearchIndexCache('me', [item('old')], Date.now() - 31_000);
    vi.mocked(api.getSearchIndex).mockResolvedValue(index(['new']));
    act(() => result.current.refresh());
    expect(result.current.status).toBe('refetching');
    expect(result.current.items.map((i) => i.id)).toEqual(['old']);
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['new']));
    expect(result.current.status).toBe('ready');
  });

  it('forces a refetch when asked, and runs one request at a time', async () => {
    primeSearchIndexCache('me', [item('old')], Date.now());
    vi.mocked(api.getSearchIndex).mockResolvedValue(index(['new']));
    const { result } = renderHook(() => useSearchIndex('me'));
    act(() => { result.current.refresh(true); result.current.refresh(true); });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['new']));
    expect(api.getSearchIndex).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh(true)); // the next request runs once that one has settled
    expect(api.getSearchIndex).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('reports an error only when there is nothing cached, and keeps a cached list on failure', async () => {
    vi.mocked(api.getSearchIndex).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSearchIndex('me'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.items).toEqual([]);

    primeSearchIndexCache('me', [item('kept')], Date.now() - 31_000);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items.map((i) => i.id)).toEqual(['kept']);
  });

  it('is per user and inert without one', () => {
    primeSearchIndexCache('me', [item('mine')], Date.now());
    const { result, rerender } = renderHook(({ userId }) => useSearchIndex(userId), { initialProps: { userId: 'me' as string | null } });
    expect(result.current.items.map((i) => i.id)).toEqual(['mine']);
    rerender({ userId: 'you' });
    expect(result.current.items).toEqual([]);
    expect(result.current.status).toBe('idle');
    rerender({ userId: null });
    act(() => result.current.refresh());
    expect(api.getSearchIndex).not.toHaveBeenCalled();
  });

  it('aborts the request in flight on unmount', () => {
    vi.mocked(api.getSearchIndex).mockReturnValue(new Promise<ApiSearchIndex>(() => {}));
    const { result, unmount } = renderHook(() => useSearchIndex('me'));
    act(() => result.current.refresh());
    unmount();
    expect(vi.mocked(api.getSearchIndex).mock.calls[0][0]?.aborted).toBe(true);
  });

  it('starts a new request after an unmount aborted the one in flight', async () => {
    let settle: (value: ApiSearchIndex) => void = () => {};
    vi.mocked(api.getSearchIndex)
      .mockImplementationOnce((signal) => new Promise<ApiSearchIndex>((_, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }))
      .mockImplementationOnce(() => new Promise<ApiSearchIndex>((resolve) => { settle = resolve; }));
    // StrictMode mounts, unmounts and remounts the same instance, refs and state kept: the mount
    // effect's request is aborted, and the remount's refresh() must not wait on it.
    const { result } = renderHook(() => {
      const state = useSearchIndex('me');
      const { refresh } = state;
      useEffect(() => { refresh(); }, [refresh]);
      return state;
    }, { reactStrictMode: true });
    expect(api.getSearchIndex).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.getSearchIndex).mock.calls[0][0]?.aborted).toBe(true);
    expect(result.current.status).toBe('loading');
    settle(index(['a']));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('recents', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('puts the newest first, drops an older copy, keeps 8, and persists per user', () => {
    let list: SearchItem[] = [];
    for (let i = 0; i < 10; i += 1) list = pushRecent('me', item(`p${i}`), list);
    list = pushRecent('me', item('p5'), list);
    expect(list).toHaveLength(RECENTS_LIMIT);
    expect(list.map((i) => i.id)).toEqual(['p5', 'p9', 'p8', 'p7', 'p6', 'p4', 'p3', 'p2']);
    expect(readRecents('me').map((i) => i.id)).toEqual(list.map((i) => i.id));
    expect(readRecents('you')).toEqual([]);
    expect(readRecents(null)).toEqual([]);
  });

  it('drops a stored entry without a type or a title, and reads back at most 8', () => {
    // A stored row without a title would crash every row renderer on each open.
    localStorage.setItem('gt.search.recent.me', JSON.stringify([
      { id: 'untitled', type: 'project', href: '/app/projects/untitled' },
      { id: 'untyped', title: 'No type', href: '/app/projects/untyped' },
      item('kept'),
    ]));
    expect(readRecents('me').map((i) => i.id)).toEqual(['kept']);

    localStorage.setItem('gt.search.recent.me', JSON.stringify(Array.from({ length: 9 }, (_, i) => item(`p${i}`))));
    expect(readRecents('me').map((i) => i.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  it('reads corrupt storage as empty and survives storage that throws', () => {
    localStorage.setItem('gt.search.recent.me', '{not json');
    expect(readRecents('me')).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(readRecents('me')).toEqual([]);
    expect(pushRecent('me', item('x'), []).map((i) => i.id)).toEqual(['x']);
  });
});
