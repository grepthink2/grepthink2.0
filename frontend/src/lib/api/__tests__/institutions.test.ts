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

  it('answers an empty list only when the backend sends one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { institutions: [] }));
    await expect(institutionsApi.getInstitutions()).resolves.toEqual([]);
  });

  it.each([
    ['a 503', () => jsonResponse(503, { detail: 'Database unavailable', code: 'database_unavailable' })],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['a body without the list', () => jsonResponse(200, {})],
  ])('answers null for %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(institutionsApi.getInstitutions()).resolves.toBeNull();
  });

  it('answers null when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(institutionsApi.getInstitutions()).resolves.toBeNull();
  });
});
