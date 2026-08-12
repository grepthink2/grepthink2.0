import type { ApiMessage } from '@/lib/api';

/** Append a message if its id isn't present (dedupes realtime echoes of
 *  optimistic sends). Returns the same array reference on no-op. */
export function appendMessage(prev: ApiMessage[], msg: ApiMessage): ApiMessage[] {
  if (prev.some(x => x.id === msg.id)) return prev;
  return [...prev, msg];
}

/** True for the client-side ids minted by addOptimisticMessage. */
const isPending = (id: string) => id.startsWith('temp-');

/**
 * Apply a realtime INSERT.
 *
 * When the row is the echo of one of MY still-pending optimistic sends, swap
 * it into the temp's slot instead of appending. Otherwise the bubble renders
 * twice — temp + server row — until the POST response arrives to retire the
 * temp, which is exactly the flicker users see in group channels: send_message
 * fans notifications out to every participant before it returns, so the more
 * people in the channel, the slower the ack and the wider the double-render
 * window. Matching on (sender, body) is safe because the pairing only has to
 * survive until the ack; if we guess wrong, reconcileOptimistic still
 * converges on the server row.
 */
export function applyIncoming(
  prev: ApiMessage[],
  msg: ApiMessage,
  meId?: string,
): ApiMessage[] {
  if (prev.some(x => x.id === msg.id)) return prev;
  if (meId && msg.sender_id === meId) {
    const idx = prev.findIndex(
      x => isPending(x.id) && x.sender_id === meId && x.body === msg.body,
    );
    if (idx !== -1) {
      const next = [...prev];
      next[idx] = msg;
      return next;
    }
  }
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
