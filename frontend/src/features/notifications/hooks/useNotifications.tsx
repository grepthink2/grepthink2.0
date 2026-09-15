import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiNotification } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';

interface NotificationsValue {
  notifications: ApiNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | undefined>(undefined);

/**
 * Powers the header bell dropdown. Loads GET /api/notifications once, then
 * subscribes to Supabase Realtime (postgres_changes on the `notifications`
 * table, scoped to this user via RLS) and refetches whenever a row for this
 * user is inserted or updated — no interval polling.
 */
export const NotificationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Signed out, there is nothing to load.
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  // Signing out empties the dropdown. Adjusted while rendering; the effect
  // below only loads and subscribes.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
    }
  }

  // State is committed in the promise callbacks, once the request settles.
  const refetch = useCallback(
    () =>
      api
        .getNotifications()
        .then((res) => {
          if (cancelled.current) return;
          setNotifications(res.notifications);
          setUnreadCount(res.unread_count);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled.current) return;
          setError((err as Error).message);
          setLoading(false);
        }),
    [],
  );

  const markRead = useCallback(async (notificationId: string) => {
    await api.markNotificationRead(notificationId);
    if (cancelled.current) return;
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    if (cancelled.current) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })));
    setUnreadCount(0);
  }, []);

  // Point the realtime socket at this user's JWT so RLS only delivers their
  // own notification rows. Read through an Effect Event so a token refresh
  // doesn't tear down and rebuild the channel.
  const authorizeRealtime = useEffectEvent(() => {
    if (session) supabase.realtime.setAuth(session.access_token);
  });

  useEffect(() => {
    cancelled.current = false;
    if (!userId) return;
    authorizeRealtime();
    refetch();
    // INSERT = new notification; UPDATE = read_at synced from another tab/device.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => refetch(),
      )
      .subscribe((status) => {
        // Catch up on anything missed while disconnected.
        if (status === 'SUBSCRIBED') refetch();
      });
    return () => {
      cancelled.current = true;
      supabase.removeChannel(channel);
    };
    // Keyed on userId (not the whole session) so a token refresh doesn't tear
    // down and rebuild the channel.
  }, [userId, refetch]);

  const value = useMemo<NotificationsValue>(
    () => ({ notifications, unreadCount, loading, error, refetch, markRead, markAllRead }),
    [notifications, unreadCount, loading, error, refetch, markRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export const useNotifications = (): NotificationsValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationsProvider');
  }
  return ctx;
};
