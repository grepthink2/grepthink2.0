import type { ApiConversationSummary } from '@/lib/api';

/** Raw `messages` row from a Supabase Realtime INSERT payload. */
export interface IncomingMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/** Realtime serializes timestamptz with a space and a short UTC offset
 *  ("+00"); ECMA-262 Date parsing needs the ISO 'T' and a full "+00:00".
 *  Normalize once at the ingestion boundary. */
export const normalizeTimestamp = (ts: string): string =>
  ts.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');

/** Numeric sort key — realtime rows are whole-second, refetch rows carry
 *  microseconds; string collation across the two formats misorders. */
const sortKey = (iso: string | null) => (iso ? Date.parse(iso) : -Infinity);

const byLatest = (a: ApiConversationSummary, b: ApiConversationSummary) =>
  sortKey(b.last_message_at) - sortKey(a.last_message_at);

/**
 * Pure delta-apply for an incoming message: patch that conversation's
 * preview/unread/sort in place. Returns unknownConversation=true when the
 * message references a conversation not in the list (new DM / new channel)
 * — the caller refetches the inbox once for that case.
 */
export function applyIncomingMessage(
  prev: ApiConversationSummary[],
  raw: IncomingMessageRow,
  meId: string,
): { next: ApiConversationSummary[]; unknownConversation: boolean } {
  const created_at = normalizeTimestamp(raw.created_at);
  const idx = prev.findIndex(c => c.id === raw.conversation_id);
  if (idx === -1) return { next: prev, unknownConversation: true };

  const target = prev[idx];
  const patched: ApiConversationSummary = {
    ...target,
    last_message: {
      id: raw.id, sender_id: raw.sender_id, body: raw.body, created_at,
    },
    last_message_at: created_at,
    unread_count: raw.sender_id === meId
      ? target.unread_count
      : target.unread_count + 1,
  };
  const next = [...prev.slice(0, idx), patched, ...prev.slice(idx + 1)].sort(byLatest);
  return { next, unknownConversation: false };
}
