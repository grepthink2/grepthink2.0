import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }));

import { scrumApi } from '../scrum';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

describe('getScrumSummary', () => {
  it("GETs the project's sprint summary and answers it", async () => {
    const summary = { sprint: null, counts: { todo: 0, in_progress: 0, done: 0 }, backlog_stories: 0 };
    fetchMock.mockResolvedValue(jsonResponse(200, summary));

    await expect(scrumApi.getScrumSummary('p1')).resolves.toEqual(summary);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/scrum/summary');
    expect(init.method ?? 'GET').toBe('GET'); // fetch's default
  });
});
