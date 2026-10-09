/** Analytics: endpoint methods spread into the `api` object in lib/api.ts (spec §6.3). */
import { apiRequest } from './client';
import type { AnalyticsDashboardQuery, ApiAnalyticsDashboard, ApiAnalyticsScope } from './types';

/** `institution_id` and `window` always; `class_id` when set; `from`/`to` only for a custom range; `fresh=1` on demand. */
export function analyticsQueryString(q: AnalyticsDashboardQuery): string {
  const params = new URLSearchParams({ institution_id: q.institution_id, window: q.window });
  if (q.class_id) params.set('class_id', q.class_id);
  if (q.window === 'custom' && q.from && q.to) {
    params.set('from', q.from);
    params.set('to', q.to);
  }
  if (q.fresh) params.set('fresh', '1');
  return params.toString();
}

export const analyticsApi = {
  /** The institutions (and their classes) the signed-in user may see; empty for students and TAs. */
  getAnalyticsScope: async () => apiRequest<ApiAnalyticsScope>('/api/analytics/scope'),
  /** One payload for the whole page. 403 outside the user's scope; 422 for a bad range. */
  getAnalyticsDashboard: async (query: AnalyticsDashboardQuery) =>
    apiRequest<ApiAnalyticsDashboard>(`/api/analytics/dashboard?${analyticsQueryString(query)}`),
};
