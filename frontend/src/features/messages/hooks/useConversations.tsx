import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiConversationSummary } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { applyIncomingMessage, type IncomingMessageRow } from '../inboxReducer';

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
 * subscribes to Supabase Realtime (postgres_changes INSERT on `messages`,
 * scoped to this user server-side by the participant RLS SELECT policy) and
 * delta-applies each incoming row via applyIncomingMessage — patching the
 * affected conversation's preview/unread/sort in place. No refetch per
 * event; we only refetch on (re)connect (the initial SUBSCRIBED callback,
 * which also covers reconnects after a dropped socket) or when a message
 * arrives for a conversation not yet in the list (new DM / new channel).
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

  // Monotonic ticket per refetch: only the latest-issued request may commit,
  // so a stale late-resolving response can't clobber fresher delta state.
  const requestSeq = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await api.getConversations();
      if (cancelled.current || seq !== requestSeq.current) return;
      setConversations(res.conversations);
      setError(null);
      setLoading(false);
    } catch (err) {
      if (cancelled.current || seq !== requestSeq.current) return;
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
    // No column filter: the B1 migration's participant RLS SELECT policy on
    // `messages` scopes delivery to rows this user can see server-side.
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as IncomingMessageRow;
          setConversations(prev => {
            const { next, unknownConversation } = applyIncomingMessage(prev, row, userId);
            if (unknownConversation) void refetch();
            return next;
          });
        },
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
