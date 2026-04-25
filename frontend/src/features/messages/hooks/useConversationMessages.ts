import { useEffect, useRef, useState, useCallback } from 'react';
import { api, type ApiMessage } from '@/lib/api';

const POLL_INTERVAL_MS = 3_000;

interface State {
  messages: ApiMessage[];
  loading: boolean;
  error: string | null;
}

/**
 * Polls /api/messages/conversations/:id/messages every 3s. Returns
 * messages in chronological order (oldest first) for direct render.
 *
 * Mounted only when a thread is open. Re-fetches the latest 50 each tick
 * — for the recruitment-DM use case (≤ 10 messages typical), this is
 * trivial overhead and dramatically simpler than diffing/cursoring.
 */
export function useConversationMessages(conversationId: string | null) {
  const [state, setState] = useState<State>({
    messages: [],
    loading: true,
    error: null,
  });
  const cancelled = useRef(false);

  const refetch = useCallback(async (id: string) => {
    try {
      const res = await api.getMessages(id);
      if (cancelled.current) return;
      // Backend returns newest-first; reverse for chronological display.
      const ordered = [...res.messages].reverse();
      setState({ messages: ordered, loading: false, error: null });
    } catch (err) {
      if (cancelled.current) return;
      setState(prev => ({ ...prev, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (!conversationId) {
      setState({ messages: [], loading: false, error: null });
      return;
    }
    refetch(conversationId);
    const intervalId = window.setInterval(() => refetch(conversationId), POLL_INTERVAL_MS);
    return () => {
      cancelled.current = true;
      window.clearInterval(intervalId);
    };
  }, [conversationId, refetch]);

  return {
    ...state,
    refetch: () => conversationId ? refetch(conversationId) : Promise.resolve(),
  };
}
