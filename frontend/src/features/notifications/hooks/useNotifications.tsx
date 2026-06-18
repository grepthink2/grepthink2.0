import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, type ApiNotification } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const POLL_INTERVAL_MS = 15_000;

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
 * Polls GET /api/notifications every 15s. Powers the header bell dropdown.
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

  useEffect(() => {
    cancelled.current = false;
    if (!session) {
      setNotifications([]);
      setUnreadCount(0);
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
