import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiConversationSummary } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';

interface ConversationsValue {
  conversations: ApiConversationSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  optimisticMarkRead: (conversationId: string) => void;
}

const ConversationsContext = createContext<ConversationsValue | undefined>(undefined);

/**
 * Single source of truth for the inbox AND the unread badge — both surfaces
 * read from this provider. Loads /api/messages/conversations once, then
 * subscribes to Supabase Realtime (postgres_changes on `conversations`,
 * scoped to this user via RLS) and refetches on any change — no interval
 * polling. The messages_bump_last_message trigger updates last_message_at on
 * every new message, so a participant gets a conversations UPDATE event and
 * the refetch picks up the new preview + unread count.
 *
 * Mounted once at the app root (via Layout) so the badge updates even
 * when the user isn't on the Messages page.
 */
export const ConversationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [conversations, setConversations] = useState<ApiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const optimisticMarkRead = useCallback((conversationId: string) => {
    setConversations(prev =>
      prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c),
    );
  }, []);

  const refetch = useCallback(async () => {
    try {
      const res = await api.getConversations();
      if (cancelled.current) return;
      setConversations(res.conversations);
      setError(null);
      setLoading(false);
    } catch (err) {
      if (cancelled.current) return;
      // Silent on poll: stale data > intrusive error.
      setError((err as Error).message);
      setLoading(false);
    }
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    cancelled.current = false;
    if (!session || !userId) {
      setConversations([]);
      setLoading(false);
      return;
    }
    supabase.realtime.setAuth(session.access_token);
    refetch();
    // postgres_changes allows one filter per handler, so attach one per
    // participant column (user_a / user_b) on the same channel. Any
    // conversation insert/update for this user triggers a refetch.
    const channel = supabase
      .channel(`conversations:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_a=eq.${userId}` },
        () => refetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_b=eq.${userId}` },
        () => refetch(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch();
      });
    return () => {
      cancelled.current = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refetch]);

  return (
    <ConversationsContext.Provider value={{ conversations, loading, error, refetch, optimisticMarkRead }}>
      {children}
    </ConversationsContext.Provider>
  );
};

export const useConversations = (): ConversationsValue => {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error('useConversations must be used inside ConversationsProvider');
  }
  return ctx;
};
