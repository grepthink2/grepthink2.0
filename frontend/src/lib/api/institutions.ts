/** Schools: endpoint methods spread into the `api` object in lib/api.ts. */
import { API_BASE_URL } from './client';
import type { ApiInstitution } from './types';

/** A school row with what the client relies on: its id, its name and its email domains. */
function isInstitution(row: unknown): row is ApiInstitution {
  if (!row || typeof row !== 'object') return false;
  const { id, name, email_domains: domains } = row as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    typeof name === 'string' &&
    Array.isArray(domains) &&
    domains.every((domain) => typeof domain === 'string')
  );
}

export const institutionsApi = {
  /**
   * The schools GrepThink knows, or `null` when they could not be read: an error status (a 503
   * during a database outage, a 429 from the rate limiter), a body that is not the list or holds
   * a malformed school, or a network failure. `[]` means the backend has no schools, and a 404
   * answers that too: a backend older than this endpoint (a new web client on the backend it
   * replaces, during a deploy) has none, and `null` would keep Create Class from submitting.
   * Public (SignUp checks school emails before sign-in), so this is a plain fetch without the
   * auth header.
   */
  getInstitutions: async (): Promise<ApiInstitution[] | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/institutions`);
      if (response.status === 404) return [];
      if (!response.ok) return null;
      const body = (await response.json()) as { institutions?: unknown } | null;
      const list = body?.institutions;
      return Array.isArray(list) && list.every(isInstitution) ? list : null;
    } catch {
      return null;
    }
  },
};
