import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }));

import { scrumApi } from '../scrum';
import type { ApiScrumBurnupUnit, ApiUpdateSprintBody } from '../types';

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

describe('getScrumBoard', () => {
  it.each<[string, string | undefined, ApiScrumBurnupUnit | undefined, string]>([
    ['the sprint it opens on, in its default unit', undefined, undefined, ''],
    ['a sprint', 's1', undefined, '?sprint_id=s1'],
    ['a burnup unit', undefined, 'points', '?unit=points'],
    ['a sprint and a burnup unit', 's1', 'hours', '?sprint_id=s1&unit=hours'],
  ])('GETs the board for %s', async (_case, sprintId, unit, query) => {
    const board = { sprint_id: 's1' };
    fetchMock.mockResolvedValue(jsonResponse(200, board));

    await expect(scrumApi.getScrumBoard('p1', sprintId, unit)).resolves.toEqual(board);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/projects/p1/scrum/board${query}`);
    expect(init.method ?? 'GET').toBe('GET'); // fetch's default
  });
});

describe('updateSprint', () => {
  it("takes no status, which follows the sprint's dates", () => {
    // @ts-expect-error: a sprint's status follows its dates
    const body: ApiUpdateSprintBody = { name: 'Sprint 1', status: 'active' };
    expect(body).toBeTruthy();
  });
});
