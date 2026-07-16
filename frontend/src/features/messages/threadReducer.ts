import type { ApiMessage } from '@/lib/api';

/** Append a message if its id isn't present (dedupes realtime echoes of
 *  optimistic sends). Returns the same array reference on no-op. */
export function appendMessage(prev: ApiMessage[], msg: ApiMessage): ApiMessage[] {
  if (prev.some(x => x.id === msg.id)) return prev;
  return [...prev, msg];
}

/** Replace an optimistic temp message with the server row (or append if the
 *  temp was already dropped), never duplicating the server id. */
export function reconcileOptimistic(
  prev: ApiMessage[],
  tempId: string,
  real: ApiMessage,
): ApiMessage[] {
  if (prev.some(x => x.id === real.id)) {
    return prev.filter(x => x.id !== tempId);
  }
  const idx = prev.findIndex(x => x.id === tempId);
  if (idx === -1) return [...prev, real];
  const next = [...prev];
  next[idx] = real;
  return next;
}

/** Prepend an older (chronological) page, dropping any overlap with the
 *  current window. */
export function prependOlder(prev: ApiMessage[], older: ApiMessage[]): ApiMessage[] {
  const seen = new Set(prev.map(x => x.id));
  return [...older.filter(x => !seen.has(x.id)), ...prev];
}
