import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: {} } }));

import { institutionsApi } from '../institutions';

const fetchMock = vi.fn();
const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc', email_domains: ['ucsc.edu'] };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('getInstitutions', () => {
  it('asks without an auth header and answers the list', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { institutions: [UCSC] }));
    await expect(institutionsApi.getInstitutions()).resolves.toEqual([UCSC]);
    expect(fetchMock).toHaveBeenCalledWith('/api/institutions');
  });

  it('answers an empty list when the backend sends one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { institutions: [] }));
    await expect(institutionsApi.getInstitutions()).resolves.toEqual([]);
  });

  it('answers an empty list for a 404: a backend older than the endpoint has no schools', async () => {
    // A new web client on the backend it replaces, during a deploy.
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: 'Not Found' }));
    await expect(institutionsApi.getInstitutions()).resolves.toEqual([]);
  });

  it.each([
    ['a 503', () => jsonResponse(503, { detail: 'Database unavailable', code: 'database_unavailable' })],
    ['a 500', () => jsonResponse(500, { detail: 'Internal server error', code: 'internal_error' })],
    ['a 429 from the rate limiter', () => jsonResponse(429, { error: 'Rate limit exceeded: 60 per 1 minute' })],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['a body without the list', () => jsonResponse(200, {})],
    ['a school without email domains', () => jsonResponse(200, { institutions: [UCSC, { id: 'x', name: 'X', slug: 'x' }] })],
    ['a school with a domain that is not text', () => jsonResponse(200, { institutions: [{ ...UCSC, email_domains: [42] }] })],
  ])('answers null for %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(institutionsApi.getInstitutions()).resolves.toBeNull();
  });

  it('answers null when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(institutionsApi.getInstitutions()).resolves.toBeNull();
  });
});
