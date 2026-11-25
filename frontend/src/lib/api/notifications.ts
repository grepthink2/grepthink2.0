/** Notifications: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type { ApiNotification } from './types';

export const notificationsApi = {

  // ----- Notifications -----------------------------------------------------

  getNotifications: async () => {
    return apiRequest<{ notifications: ApiNotification[]; unread_count: number }>(
      '/api/notifications',
    );
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
