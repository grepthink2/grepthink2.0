import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiConversationSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const POLL_INTERVAL_MS = 15_000;

interface ConversationsValue {
  conversations: ApiConversationSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const ConversationsContext = createContext<ConversationsValue | undefined>(undefined);

/**
 * Polls /api/messages/conversations every 15s. Single source of truth for
 * the inbox AND the unread badge — both surfaces read from this provider.
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

  useEffect(() => {
    cancelled.current = false;
    if (!session) {
      setConversations([]);
      setLoading(false);
      return;
    }
    refetch();
    const id = window.setInterval(refetch, POLL_INTERVAL_MS);
    return () => {
      cancelled.current = true;
      window.clearInterval(id);
    };
  }, [session, refetch]);

  return (
    <ConversationsContext.Provider value={{ conversations, loading, error, refetch }}>
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
