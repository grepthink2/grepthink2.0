/** Schedule: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type { ApiSchedule } from './types';

export const scheduleApi = {
  /**
   * The caller's schedule items in one class that overlap [from, to): TA meetings, team meetings,
   * final reviews, deadlines and sprint edges, as their role in the class sees them. At most 42
   * days; 422 otherwise.
   */
  getSchedule: async (classId: string, from: Date, to: Date, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      class_id: classId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return apiRequest<ApiSchedule>(`/api/schedule?${params.toString()}`, { signal });
  },
};
