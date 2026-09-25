/** Schools: endpoint methods spread into the `api` object in lib/api.ts. */
import { API_BASE_URL } from './client';
import type { ApiInstitution } from './types';

export const institutionsApi = {
  /**
   * The schools GrepThink knows. Public (SignUp checks school emails before sign-in), so this is
   * a plain fetch without the auth header. Any failure answers an empty list, which every caller
   * treats as "no schools" (".edu" still counts as a school email).
   */
  getInstitutions: async (): Promise<ApiInstitution[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/institutions`);
      if (!response.ok) return [];
      const body = (await response.json()) as { institutions?: ApiInstitution[] };
      return body.institutions ?? [];
    } catch {
      return [];
    }
  },
};
