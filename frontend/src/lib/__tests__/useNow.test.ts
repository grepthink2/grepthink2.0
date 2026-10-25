import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNow } from '@/lib/useNow';

/** Tue Oct 20, 2026, 3:12 PM PT. */
const NOW = new Date('2026-10-20T22:12:00Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('starts at the current time and moves on every tick', () => {
    vi.useFakeTimers({ now: NOW });
    const { result } = renderHook(() => useNow(30_000));
    expect(result.current.toISOString()).toBe('2026-10-20T22:12:00.000Z');
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current.toISOString()).toBe('2026-10-20T22:12:00.000Z');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toISOString()).toBe('2026-10-20T22:12:30.000Z');
  });

  it('ticks every 30 seconds unless told otherwise', () => {
    vi.useFakeTimers({ now: NOW });
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.toISOString()).toBe('2026-10-20T22:12:30.000Z');
  });

  it('hands back the same Date until the clock moves', () => {
    vi.useFakeTimers({ now: NOW });
    const { result, rerender } = renderHook(() => useNow(30_000));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('stays on a pinned time, with no timer running', () => {
    vi.useFakeTimers({ now: NOW });
    const pinned = new Date('2026-10-24T17:00:00Z');
    const { result } = renderHook(() => useNow(30_000, pinned));
    expect(result.current.toISOString()).toBe('2026-10-24T17:00:00.000Z');
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.toISOString()).toBe('2026-10-24T17:00:00.000Z');
  });

  it('stops its timer when the component goes away', () => {
    vi.useFakeTimers({ now: NOW });
    const { unmount } = renderHook(() => useNow(30_000));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
