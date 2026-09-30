import { beforeEach, describe, expect, it, vi } from 'vitest';

// The client is replaced so the two signed-in methods can be checked at the `apiRequest` seam, and
// so the public ones can be shown never to go through it (it needs a session and signs the user
// out on a 401, neither of which an emailed link's reader has).
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../api/client', () => ({ API_BASE_URL: 'https://api.example.test', apiRequest }));

import { emailApi } from '../api/email';

const fetchMock = vi.fn();
const PREFERENCES = [
  {
    category: 'reminders',
    label: 'Deadline reminders',
    description: 'Emails before a TSR or another deadline closes.',
    enabled: true,
  },
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  apiRequest.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('getEmailPreferences and updateEmailPreferences (signed in)', () => {
  it('reads the preferences through apiRequest', async () => {
    apiRequest.mockResolvedValue({ preferences: PREFERENCES });
    await expect(emailApi.getEmailPreferences()).resolves.toEqual({ preferences: PREFERENCES });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/api/email/preferences');
  });

  it('PUTs the categories it is given as { preferences } and answers the full list', async () => {
    const saved = [{ ...PREFERENCES[0], enabled: false }];
    apiRequest.mockResolvedValue({ preferences: saved });

    await expect(emailApi.updateEmailPreferences({ reminders: false })).resolves.toEqual({ preferences: saved });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/email/preferences');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ preferences: { reminders: false } });
  });

  it('lets a failure through for the screen to show', async () => {
    apiRequest.mockRejectedValue(new Error('Email preferences are not available yet'));
    await expect(emailApi.updateEmailPreferences({ digests: true })).rejects.toThrow(
      'Email preferences are not available yet',
    );
  });

  it('never makes a plain fetch: the auth header comes from apiRequest', async () => {
    apiRequest.mockResolvedValue({ preferences: [] });
    await emailApi.getEmailPreferences();
    await emailApi.updateEmailPreferences({ reminders: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getUnsubscribeInfo (public)', () => {
  it('GETs the token, URL-encoded, in the query string with no auth header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { valid: false }));
    await emailApi.getUnsubscribeInfo('a+b/c=d e');
    // One argument: no method override and no headers.
    expect(fetchMock.mock.calls).toEqual([
      ['https://api.example.test/api/email/unsubscribe?token=a%2Bb%2Fc%3Dd%20e'],
    ]);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('answers what the link is for', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { valid: true, category: 'reminders', label: 'Deadline reminders' }),
    );
    await expect(emailApi.getUnsubscribeInfo('t')).resolves.toEqual({
      valid: true,
      category: 'reminders',
      label: 'Deadline reminders',
    });
  });

  it('answers a link the backend does not accept as an answer, not as a failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { valid: false }));
    await expect(emailApi.getUnsubscribeInfo('t')).resolves.toEqual({ valid: false });
  });

  it.each([
    ['a 404', () => jsonResponse(404, { detail: 'Not Found' })],
    ['a 429 from the rate limiter', () => jsonResponse(429, { error: 'Rate limit exceeded: 30 per 1 minute' })],
    ['a 500', () => jsonResponse(500, { detail: 'Internal server error' })],
    ['a 503', () => jsonResponse(503, { detail: 'Database unavailable', code: 'database_unavailable' })],
  ])('answers null for %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(emailApi.getUnsubscribeInfo('t')).resolves.toBeNull();
  });

  it.each([
    ['a body that is not JSON', () => new Response('<!doctype html>', { status: 200 })],
    ['a body that is null', () => jsonResponse(200, null)],
    ['a body without valid', () => jsonResponse(200, {})],
    ['a valid that is not a boolean', () => jsonResponse(200, { valid: 'yes' })],
    ['a valid link without its category', () => jsonResponse(200, { valid: true })],
    ['a valid link whose label is not text', () => jsonResponse(200, { valid: true, category: 'reminders', label: 7 })],
  ])('answers null for %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(emailApi.getUnsubscribeInfo('t')).resolves.toBeNull();
  });

  it('answers null when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(emailApi.getUnsubscribeInfo('t')).resolves.toBeNull();
  });
});

describe('confirmUnsubscribe (public)', () => {
  const GENERIC = 'Could not unsubscribe. Try again later.';

  it('POSTs the token in the query string with no body and no auth header', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { unsubscribed: true, category: 'digests', label: 'Unread message digests' }),
    );

    await emailApi.confirmUnsubscribe('a+b/c=d e');

    expect(fetchMock.mock.calls).toEqual([
      ['https://api.example.test/api/email/unsubscribe?token=a%2Bb%2Fc%3Dd%20e', { method: 'POST' }],
    ]);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('answers the category it turned off', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { unsubscribed: true, category: 'reminders', label: 'Deadline reminders' }),
    );
    await expect(emailApi.confirmUnsubscribe('t')).resolves.toEqual({
      unsubscribed: true,
      category: 'reminders',
      label: 'Deadline reminders',
    });
  });

  it("throws the backend's own words for a link it does not accept", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { detail: "This unsubscribe link isn't valid." }));
    await expect(emailApi.confirmUnsubscribe('t')).rejects.toThrow("This unsubscribe link isn't valid.");
  });

  it.each([
    ['a detail that is not text', () => jsonResponse(422, { detail: [{ loc: ['query', 'token'], msg: 'Field required' }] })],
    ['an empty detail', () => jsonResponse(400, { detail: '' })],
    ['a body that is not JSON', () => new Response('<html>Bad gateway</html>', { status: 502 })],
    ['a rate limit', () => jsonResponse(429, { error: 'Rate limit exceeded: 30 per 1 minute' })],
    ['a 500', () => jsonResponse(500, {})],
  ])('throws a generic message for %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(emailApi.confirmUnsubscribe('t')).rejects.toThrow(GENERIC);
  });

  it.each([
    ['a body that is not JSON', () => new Response('<!doctype html>', { status: 200 })],
    ['an answer that says nothing was unsubscribed', () => jsonResponse(200, { unsubscribed: false, category: 'reminders', label: 'Deadline reminders' })],
    ['an answer without the category', () => jsonResponse(200, { unsubscribed: true })],
  ])('throws a generic message for a 200 with %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(emailApi.confirmUnsubscribe('t')).rejects.toThrow(GENERIC);
  });

  it('throws a generic message, not the browser\'s, when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(emailApi.confirmUnsubscribe('t')).rejects.toThrow(GENERIC);
  });
});
