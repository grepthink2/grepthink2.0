import { useMemo } from 'react';
import { useConversations } from './useConversations';

/**
 * Total unread message count across all conversations. Drives the sidebar
 * badge AND the browser tab title prefix.
 *
 * Sums per-conversation counts from the inbox; the inbox is polled every
 * 15s so this value is at most that stale.
 */
export function useUnreadTotal(): number {
  const { conversations } = useConversations();
  return useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations],
  );
}
