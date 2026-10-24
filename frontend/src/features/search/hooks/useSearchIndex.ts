import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import type { SearchItem } from '../searchModel';

/** A list younger than this is served as is; opening the palette refetches an older one. */
const FRESH_MS = 30_000;

interface CacheEntry {
  items: SearchItem[];
  fetchedAt: number;
}

/**
 * Per user, for the life of the tab. The palette ranks this list locally (spec §3).
 *
 * The cache is an external store: every write goes through writeCache or resetSearchIndexCache,
 * which tell the subscribed hooks, and a render reads it with useSyncExternalStore. A render that
 * read the Map directly would stay correct only while nothing memoizes it: a memoized render (the
 * React Compiler's) would keep the entry it first saw for the same userId and show a stale list.
 */
const cache = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();
const EMPTY: SearchItem[] = [];

function notify(): void {
  for (const listener of listeners) listener();
}

function writeCache(userId: string, entry: CacheEntry): void {
  cache.set(userId, entry);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server renders no list. */
const getServerSnapshot = (): CacheEntry | undefined => undefined;

export type IndexStatus = 'idle' | 'loading' | 'refetching' | 'ready' | 'error';

export interface SearchIndexState {
  items: SearchItem[];
  status: IndexStatus;
  /** Fetch when there is no fresh list (or always, with `force`). One request at a time. */
  refresh: (force?: boolean) => void;
}

/** Tests only. A mounted hook sees the change, as it would a fetched list. */
export function resetSearchIndexCache(): void {
  cache.clear();
  notify();
}

/** Tests only. A mounted hook sees the change, as it would a fetched list. */
export function primeSearchIndexCache(userId: string, items: SearchItem[], fetchedAt: number): void {
  writeCache(userId, { items, fetchedAt });
}

export function useSearchIndex(userId: string | null): SearchIndexState {
  const [pendingFor, setPendingFor] = useState<string | null>(null); // user with a request in flight
  const [failedFor, setFailedFor] = useState<string | null>(null); // user whose last fetch failed
  const inflight = useRef<AbortController | null>(null);

  // The snapshot is the entry itself, the same object until the cache changes. A write re-renders
  // the hook even when the answer settles in the same batch as refresh()'s own setPendingFor(userId):
  // those two pending-state updates cancel out, and React bails out of a render only they asked for.
  const getSnapshot = () => (userId ? cache.get(userId) : undefined);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
          writeCache(userId, { items: res.items, fetchedAt: Date.now() });
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
