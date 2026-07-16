import { useEffect, useRef, useState, useCallback } from 'react';
import { api, type ApiMessage } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { appendMessage, prependOlder, reconcileOptimistic } from '../threadReducer';
import { normalizeTimestamp, type IncomingMessageRow } from '../inboxReducer';

interface State {
  messages: ApiMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string | null;
}

/**
 * A thread's messages in chronological order (oldest first). Loads the
 * latest page once, then applies realtime INSERTs as deltas (deduped by id
 * against optimistic sends) — no refetch per event. loadOlder() pages
 * history upward via the keyset cursor. The cursor is OPAQUE: echo it
 * byte-for-byte; never parse or re-serialize it.
 */
export function useConversationMessages(conversationId: string | null) {
  const [state, setState] = useState<State>({
    messages: [], loading: true, loadingOlder: false, hasMore: false, error: null,
  });
  const cursor = useRef<string | null>(null);
  const cancelled = useRef(false);

  const loadInitial = useCallback(async (id: string) => {
    try {
      const res = await api.getMessages(id);
      if (cancelled.current) return;
      cursor.current = res.next_cursor;
      setState({
        messages: [...res.messages].reverse(), // newest-first → chronological
        loading: false, loadingOlder: false,
        hasMore: res.next_cursor != null, error: null,
      });
    } catch (err) {
      if (cancelled.current) return;
      setState(prev => ({ ...prev, loading: false, error: (err as Error).message }));
    }
  }, []);

  const loadOlder = useCallback(async () => {
    const before = cursor.current;
    if (!conversationId || !before) return;
    setState(prev => prev.loadingOlder ? prev : { ...prev, loadingOlder: true });
    try {
      const res = await api.getMessages(conversationId, { before });
      if (cancelled.current) return;
      cursor.current = res.next_cursor;
      setState(prev => ({
        ...prev,
        messages: prependOlder(prev.messages, [...res.messages].reverse()),
        loadingOlder: false,
        hasMore: res.next_cursor != null,
      }));
    } catch {
      if (!cancelled.current) {
        setState(prev => ({ ...prev, loadingOlder: false }));
      }
    }
  }, [conversationId]);

  useEffect(() => {
    cancelled.current = false;
    cursor.current = null;
    if (!conversationId) {
      setState({ messages: [], loading: false, loadingOlder: false, hasMore: false, error: null });
      return;
    }
    setState(prev => ({ ...prev, loading: true }));
    loadInitial(conversationId);
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as IncomingMessageRow;
          const msg: ApiMessage = {
            id: row.id, sender_id: row.sender_id, body: row.body,
            created_at: normalizeTimestamp(row.created_at),
          };
          setState(prev => {
            const next = appendMessage(prev.messages, msg);
            return next === prev.messages ? prev : { ...prev, messages: next };
          });
        },
      )
      .subscribe((status) => {
        // On (re)connect, reload the latest page — events may have been missed.
        if (status === 'SUBSCRIBED') loadInitial(conversationId);
      });
    return () => {
      cancelled.current = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadInitial]);

  const addOptimisticMessage = useCallback((msg: ApiMessage) => {
    setState(prev => ({ ...prev, messages: [...prev.messages, msg] }));
  }, []);

  const confirmOptimistic = useCallback((tempId: string, real: ApiMessage) => {
    setState(prev => ({
      ...prev,
      messages: reconcileOptimistic(prev.messages, tempId, real),
    }));
  }, []);

  const dropOptimistic = useCallback((tempId: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== tempId),
    }));
  }, []);

  return { ...state, loadOlder, addOptimisticMessage, confirmOptimistic, dropOptimistic };
}
