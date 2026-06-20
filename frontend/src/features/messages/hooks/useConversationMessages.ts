import { useEffect, useRef, useState, useCallback } from 'react';
import { api, type ApiMessage } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

interface State {
  messages: ApiMessage[];
  loading: boolean;
  error: string | null;
}

/**
 * Returns a thread's messages in chronological order (oldest first) for
 * direct render. Mounted only when a thread is open: loads once, then
 * subscribes to Supabase Realtime (postgres_changes INSERT on `messages`,
 * scoped to this conversation) and refetches when a new message lands — no
 * interval polling. The realtime socket's auth is already set by the
 * always-mounted ConversationsProvider above this hook.
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
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => refetch(conversationId),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch(conversationId);
      });
    return () => {
      cancelled.current = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, refetch]);

  return {
    ...state,
    refetch: () => conversationId ? refetch(conversationId) : Promise.resolve(),
  };
}
