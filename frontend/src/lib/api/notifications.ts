/** Notifications: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type { ApiNotificationsPage } from './types';

/** Which notifications a page lists: every unread one, or the last 30 days, read and unread. */
export interface NotificationsQuery {
  /** `unread`: every unread notification, whatever its age. `all` (the server's default): 30 days. */
  view?: 'unread' | 'all';
  /** The `next_cursor` of the page before. */
  cursor?: string;
  /** Page size, 1 to 100 (the server's default is 30). */
  limit?: number;
}

export const notificationsApi = {

  // ----- Notifications -----------------------------------------------------

  /** A page of the caller's notifications, newest first, with the unread count and the next cursor. */
  getNotifications: async (options: NotificationsQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (options.view) params.set('view', options.view);
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit != null) params.set('limit', String(options.limit));
    const query = params.toString();
    return apiRequest<ApiNotificationsPage>(`/api/notifications${query ? `?${query}` : ''}`, {
      signal,
    });
  },

  markNotificationRead: async (notificationId: string) => {
    return apiRequest<void>(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  /** Marks those of `ids` that are the caller's read, in one request (1 to 100 ids). */
  markNotificationsRead: async (ids: string[]) => {
    return apiRequest<void>('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  markAllNotificationsRead: async () => {
    return apiRequest<void>('/api/notifications/read-all', {
      method: 'POST',
    });
  },
};
