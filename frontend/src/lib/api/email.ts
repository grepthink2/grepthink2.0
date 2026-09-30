/** Email preferences and unsubscribe links: endpoint methods spread into the `api` object in lib/api.ts. */
import { API_BASE_URL, apiRequest } from './client';
import type { ApiEmailPreference, ApiUnsubscribeInfo, ApiUnsubscribeResult } from './types';

const UNSUBSCRIBE_FAILED = 'Could not unsubscribe. Try again later.';

/**
 * The statuses whose `detail` is written for the reader: a 400 says what is wrong with the link,
 * a 503 that the service is down for now. Any other failure's `detail` is a server message
 * ("Internal server error", "Not Found") that would only confuse them.
 */
const READABLE_DETAIL_STATUSES = [400, 503];

/** The answer to a link: either not valid, or valid with the category's name to show. */
function isUnsubscribeInfo(body: unknown): body is ApiUnsubscribeInfo {
  if (!body || typeof body !== 'object') return false;
  const { valid, category, label } = body as Record<string, unknown>;
  if (valid === false) return true;
  return valid === true && typeof category === 'string' && typeof label === 'string';
}

/** The unsubscribe endpoint for a link's token; the token travels in the query string. */
function unsubscribeUrl(token: string): string {
  return `${API_BASE_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export const emailApi = {
  // ----- Preferences (signed in) --------------------------------------------

  getEmailPreferences: async () => {
    return apiRequest<{ preferences: ApiEmailPreference[] }>('/api/email/preferences');
  },

  /** Saves the categories named in `preferences` (category to on/off); answers the full list. */
  updateEmailPreferences: async (preferences: Record<string, boolean>) => {
    return apiRequest<{ preferences: ApiEmailPreference[] }>('/api/email/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
  },

  // ----- Unsubscribe links (public) -----------------------------------------
  //
  // The link in an email opens the unsubscribe page signed out, so these are plain fetches
  // without the auth header: `apiRequest` needs a session and signs the user out on a 401.

  /**
   * What the link is for, or `null` when that could not be read: an error status, a body that is
   * not the answer, or a network failure. A link the backend does not accept is an answer
   * (`{ valid: false }`), not `null`.
   */
  getUnsubscribeInfo: async (token: string): Promise<ApiUnsubscribeInfo | null> => {
    try {
      const response = await fetch(unsubscribeUrl(token));
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return isUnsubscribeInfo(body) ? body : null;
    } catch {
      return null;
    }
  },

  /**
   * Turns off the link's category. Throws an `Error` whose message is fit to show: the backend's
   * `detail` for a 400 (a link it does not accept) or a 503, else a generic one.
   */
  confirmUnsubscribe: async (token: string): Promise<ApiUnsubscribeResult> => {
    let response: Response;
    try {
      response = await fetch(unsubscribeUrl(token), { method: 'POST' });
    } catch {
      throw new Error(UNSUBSCRIBE_FAILED);
    }
    const body = (await response.json().catch(() => null)) as
      | (Partial<ApiUnsubscribeResult> & { detail?: unknown })
      | null;
    if (!response.ok) {
      const detail = READABLE_DETAIL_STATUSES.includes(response.status) ? body?.detail : undefined;
      throw new Error(typeof detail === 'string' && detail ? detail : UNSUBSCRIBE_FAILED);
    }
    if (body?.unsubscribed !== true || typeof body.category !== 'string' || typeof body.label !== 'string') {
      throw new Error(UNSUBSCRIBE_FAILED);
    }
    return { unsubscribed: true, category: body.category, label: body.label };
  },
};
