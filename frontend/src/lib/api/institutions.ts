/** Schools: endpoint methods spread into the `api` object in lib/api.ts. */
import { API_BASE_URL } from './client';
import type { ApiInstitution } from './types';

export const institutionsApi = {
  /**
   * The schools GrepThink knows, or `null` when they could not be read: an error status (a 503
   * during a database outage), a body that is not the list, or a network failure. `[]` means the
   * backend has no schools. Public (SignUp checks school emails before sign-in), so this is a
   * plain fetch without the auth header.
   */
  getInstitutions: async (): Promise<ApiInstitution[] | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/institutions`);
      if (!response.ok) return null;
      const body = (await response.json()) as { institutions?: unknown } | null;
      return Array.isArray(body?.institutions) ? (body.institutions as ApiInstitution[]) : null;
    } catch {
      return null;
    }
  },
};
