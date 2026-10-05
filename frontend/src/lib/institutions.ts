/**
 * The public schools list, fetched once per page load and shared by every caller. It has three
 * states: `undefined` while it loads (the hook only), `null` when it could not be read, and the
 * list, which is empty when GrepThink has no schools.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, type ApiInstitution } from './api';

let pending: Promise<ApiInstitution[] | null> | null = null;

/**
 * The schools list, or `null` when it could not be read. A list is kept (an empty one included);
 * a failure is not, so the next call asks again.
 */
export function fetchInstitutions(): Promise<ApiInstitution[] | null> {
  if (!pending) {
    const request = api.getInstitutions().then((list) => {
      if (list === null && pending === request) pending = null;
      return list;
    });
    pending = request;
  }
  return pending;
}

export function clearInstitutionsCache(): void {
  pending = null;
}

/**
 * The schools list (`undefined` while it loads, `null` when it could not be read, else the list)
 * and `retry`, which asks again: after a failure it sends a new request (a failure is not kept),
 * and the list is `undefined` until that one answers.
 */
export function useInstitutionsWithRetry(): {
  institutions: ApiInstitution[] | null | undefined;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  // The answer to the attempt it belongs to: an older attempt's answer reads as still loading.
  const [answer, setAnswer] = useState<{ attempt: number; list: ApiInstitution[] | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchInstitutions().then((list) => {
      if (!cancelled) setAnswer({ attempt, list });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { institutions: answer?.attempt === attempt ? answer.list : undefined, retry };
}

/** The schools list: `undefined` while it loads, `null` when it could not be read, else the list. */
export function useInstitutions(): ApiInstitution[] | null | undefined {
  return useInstitutionsWithRetry().institutions;
}
