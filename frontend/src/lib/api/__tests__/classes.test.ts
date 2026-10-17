import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }));
vi.mock('@/lib/previewGuard', () => ({ assertWritableRequest: vi.fn() }));

import { classesApi } from '../classes';

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

describe("updateClassExternalTasksUrl (the class's Tasks - External link)", () => {
  const updated = { id: 'c1', name: 'JOB-191', created_by: 'me', created_at: '', external_tasks_url: null };

  it.each([
    ['sets', 'https://job191.yeterly.ai/'],
    ['removes', null],
  ])('%s it with a PATCH naming the link, and answers the updated class', async (_, link) => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { message: 'Tasks link updated', class: { ...updated, external_tasks_url: link } }),
    );
    const result = await classesApi.updateClassExternalTasksUrl('c1', link);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/classes/c1/external-tasks-url');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ external_tasks_url: link });
    expect(result.class.external_tasks_url).toBe(link);
  });
});
