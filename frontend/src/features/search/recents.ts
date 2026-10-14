import { itemKey, type SearchItem } from './searchModel';

export const RECENTS_LIMIT = 8;

const storageKey = (userId: string) => `gt.search.recent.${userId}`;

/** Last opened items, newest first. Storage that is missing, corrupt or throwing reads as empty. */
export function readRecents(userId: string | null): SearchItem[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is SearchItem => Boolean(r) && typeof r.id === 'string' && typeof r.href === 'string',
    );
  } catch {
    return [];
  }
}

/** `item` first (an older copy dropped), at most 8, persisted best-effort. Returns the new list. */
export function pushRecent(
  userId: string | null,
  item: SearchItem,
  current: SearchItem[] = readRecents(userId),
): SearchItem[] {
  const next = [item, ...current.filter((r) => itemKey(r) !== itemKey(item))].slice(0, RECENTS_LIMIT);
  if (userId) {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // private mode / quota: the in-memory list still works for this open
    }
  }
  return next;
}
