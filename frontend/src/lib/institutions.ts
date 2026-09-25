/** The public schools list, fetched once per page load and shared by every caller. */
import { useEffect, useState } from 'react';
import { api, type ApiInstitution } from './api';

let pending: Promise<ApiInstitution[]> | null = null;

/** The schools list. An empty answer is not kept (it may be an outage), so it is asked again. */
export function fetchInstitutions(): Promise<ApiInstitution[]> {
  if (!pending) {
    pending = api.getInstitutions().then((list) => {
      if (list.length === 0) pending = null;
      return list;
    });
  }
  return pending;
}

export function clearInstitutionsCache(): void {
  pending = null;
}

/** The schools list; empty until it arrives (and when there are none). */
export function useInstitutions(): ApiInstitution[] {
  const [institutions, setInstitutions] = useState<ApiInstitution[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchInstitutions().then((list) => {
      if (!cancelled) setInstitutions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return institutions;
}
