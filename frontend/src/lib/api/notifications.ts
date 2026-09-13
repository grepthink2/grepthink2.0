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

  markAllNotificationsRead: async () => {
    return apiRequest<void>('/api/notifications/read-all', {
      method: 'POST',
    });
  },
};
