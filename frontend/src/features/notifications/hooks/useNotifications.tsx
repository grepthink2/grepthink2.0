import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refetch = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      if (cancelled.current) return;
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
      setError(null);
      setLoading(false);
    } catch (err) {
      if (cancelled.current) return;
      setError((err as Error).message);
      setLoading(false);
    }
  }, []);

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

  const userId = session?.user?.id;

  useEffect(() => {
    cancelled.current = false;
    if (!session || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    // Point the realtime socket at this user's JWT so RLS only delivers
    // their own notification rows.
    supabase.realtime.setAuth(session.access_token);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refetch]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, error, refetch, markRead, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = (): NotificationsValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationsProvider');
  }
  return ctx;
};
