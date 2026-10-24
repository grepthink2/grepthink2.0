import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { APP_VERSION } from '../version';

type Store = typeof import('../seenStore');
type Hook = typeof import('../useWhatsNew');
let store: Store;
let hook: Hook;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  store = await import('../seenStore');
  hook = await import('../useWhatsNew');
});

afterEach(() => {
  localStorage.clear();
});

describe('useWhatsNew', () => {
  it('reads unseen in every place, and an opening clears all of them', () => {
    const first = renderHook(() => hook.useWhatsNew());
    const second = renderHook(() => hook.useWhatsNew());
    expect(first.result.current).toEqual({ unseen: true, lastSeen: null });
    expect(second.result.current).toEqual({ unseen: true, lastSeen: null });

    act(() => {
      store.openWhatsNew();
    });
    expect(first.result.current).toEqual({ unseen: false, lastSeen: APP_VERSION });
    expect(second.result.current).toEqual({ unseen: false, lastSeen: APP_VERSION });
  });

  it('follows an opening in another tab', () => {
    const { result } = renderHook(() => hook.useWhatsNew());
    expect(result.current.unseen).toBe(true);
    act(() => {
      localStorage.setItem(store.SEEN_KEY, APP_VERSION);
      window.dispatchEvent(new StorageEvent('storage', { key: store.SEEN_KEY }));
    });
    expect(result.current).toEqual({ unseen: false, lastSeen: APP_VERSION });
  });
});
