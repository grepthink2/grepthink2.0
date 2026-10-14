import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { SearchItem } from '../searchModel';

/** A list younger than this is served as is; opening the palette refetches an older one. */
const FRESH_MS = 30_000;

interface CacheEntry {
  items: SearchItem[];
  fetchedAt: number;
}

/** Per user, for the life of the tab. The palette ranks this list locally (spec §3). */
const cache = new Map<string, CacheEntry>();
const EMPTY: SearchItem[] = [];

export type IndexStatus = 'idle' | 'loading' | 'refetching' | 'ready' | 'error';

export interface SearchIndexState {
  items: SearchItem[];
  status: IndexStatus;
  /** Fetch when there is no fresh list (or always, with `force`). One request at a time. */
  refresh: (force?: boolean) => void;
}

/** Tests only. */
export function resetSearchIndexCache(): void {
  cache.clear();
}

/** Tests only. */
export function primeSearchIndexCache(userId: string, items: SearchItem[], fetchedAt: number): void {
  cache.set(userId, { items, fetchedAt });
}

export function useSearchIndex(userId: string | null): SearchIndexState {
  const [pendingFor, setPendingFor] = useState<string | null>(null); // user with a request in flight
  const [failedFor, setFailedFor] = useState<string | null>(null); // user whose last fetch failed
  const inflight = useRef<AbortController | null>(null);

  const entry = userId ? cache.get(userId) : undefined;
  let status: IndexStatus;
  if (entry) status = pendingFor === userId ? 'refetching' : 'ready';
  else if (pendingFor === userId && userId) status = 'loading';
  else if (failedFor === userId && userId) status = 'error';
  else status = 'idle';

  const refresh = useCallback(
    (force = false) => {
      if (!userId) return;
      const current = cache.get(userId);
      if (!force && current && Date.now() - current.fetchedAt < FRESH_MS) return;
      // Aborted means not in flight: StrictMode's simulated unmount aborts but keeps this ref.
      if (inflight.current && !inflight.current.signal.aborted) return;
      const controller = new AbortController();
      inflight.current = controller;
      setPendingFor(userId);
      api.getSearchIndex(controller.signal).then(
        (res) => {
          if (controller.signal.aborted) return;
          cache.set(userId, { items: res.items, fetchedAt: Date.now() });
          inflight.current = null;
          setFailedFor(null);
          setPendingFor(null);
        },
        () => {
          if (controller.signal.aborted) return;
          inflight.current = null;
          setFailedFor(userId);
          setPendingFor(null);
        },
      );
    },
    [userId],
  );

  useEffect(() => () => inflight.current?.abort(), []);

  return { items: entry?.items ?? EMPTY, status, refresh };
}
