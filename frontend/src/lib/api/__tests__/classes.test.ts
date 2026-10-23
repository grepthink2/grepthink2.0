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

describe("updateClassEndDate (the class's last day of classes)", () => {
  it('sets it with a PATCH naming the day, and answers the updated class', async () => {
    const updated = { id: 'c1', name: 'CSE 115A', created_by: 'me', created_at: '', end_date: '2026-12-04' };
    fetchMock.mockResolvedValue(jsonResponse(200, updated));
    const result = await classesApi.updateClassEndDate('c1', '2026-12-04');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/classes/c1/end-date');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ end_date: '2026-12-04' });
    expect(result).toEqual(updated);
  });

  it("throws the API's reason when the day is refused", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { detail: "The last day of classes can't be before the first week of term." }),
    );
    await expect(classesApi.updateClassEndDate('c1', '2026-09-01')).rejects.toMatchObject({
      status: 400,
      message: "The last day of classes can't be before the first week of term.",
    });
  });
});

describe('createClass (a class and its sprint schedule)', () => {
  it('needs the sprint count and frequency', () => {
    // @ts-expect-error: a class is created with its sprint schedule
    const noSchedule: Parameters<typeof classesApi.createClass>[0] = {
      name: 'CSE 115A', term: 'Fall', start_date: '2026-09-21', end_date: '2026-12-04',
    };
    expect(noSchedule).toBeTruthy();
  });
});

describe("updateClassSprints (the class's sprint schedule)", () => {
  const schedule = { sprint_count: 5, sprint_frequency: 'biweekly', sprints_start_on: '2026-09-21' } as const;

  it('sets it with a PATCH naming the schedule, and answers the class and the sprints written across its teams', async () => {
    const answer = {
      class: { id: 'c1', name: 'CSE 115A', created_by: 'me', created_at: '', ...schedule },
      teams: 2,
      created: 10,
      updated: 0,
      deleted: 0,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, answer));
    const result = await classesApi.updateClassSprints('c1', schedule);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/classes/c1/sprints');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual(schedule);
    expect(result).toEqual(answer);
  });

  it("throws the API's reason when a team still has a story in a sprint the change would delete", async () => {
    const inUse = 'Trailhead already uses Sprint 5; lower the count after they move their stories or delete that plan';
    fetchMock.mockResolvedValue(jsonResponse(409, { detail: inUse }));
    await expect(
      classesApi.updateClassSprints('c1', { ...schedule, sprint_count: 4 }),
    ).rejects.toMatchObject({ status: 409, message: inUse });
  });
});
