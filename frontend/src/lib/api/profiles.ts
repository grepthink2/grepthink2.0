/** Profiles of other people: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type { ApiPersonProfile } from './types';

export const profilesApi = {
  /**
   * One person as the caller may see them: someone they share a class with, or themself. A 404
   * answers an id that names nobody, a malformed id and someone the caller shares no class with:
   * the same answer for all three.
   */
  getPersonProfile: async (userId: string, signal?: AbortSignal) =>
    apiRequest<ApiPersonProfile>(`/api/profiles/${encodeURIComponent(userId)}`, { signal }),
};
