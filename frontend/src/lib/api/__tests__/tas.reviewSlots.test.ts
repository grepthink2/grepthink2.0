import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }));
vi.mock('@/lib/previewGuard', () => ({ assertWritableRequest: vi.fn() }));

import { tasApi } from '../tas';
import type { ApiReviewSlotBooking, ApiReviewSlots } from '../types';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The one request the call sent: its URL, its method (fetch's default is GET) and its parsed body. */
function sent() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method ?? 'GET',
    body: init.body === undefined ? undefined : JSON.parse(init.body as string),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

describe('final-review slot client', () => {
  it("getReviewSlots GETs the class's slots and answers them", async () => {
    const slots: ApiReviewSlots = {
      class_id: 'c1',
      signups_open: true,
      slots: [
        {
          id: 's1',
          starts_at: '2026-12-07T17:00:00+00:00',
          duration_minutes: 60,
          team: { project_id: 'p1', name: 'Team Alpha' },
        },
        { id: 's2', starts_at: '2026-12-07T18:00:00+00:00', duration_minutes: 60, team: null },
      ],
      my_team: null,
      unbooked_teams: [{ project_id: 'p2', name: 'Team Beta', product_owner: { user_id: 'u2', name: 'Bea' } }],
      review_zoom_url: 'https://ucsc.zoom.us/j/1',
    };
    fetchMock.mockResolvedValue(jsonResponse(200, slots));

    await expect(tasApi.getReviewSlots('c1')).resolves.toEqual(slots);
    expect(sent()).toEqual({ url: '/api/tas/classes/c1/review-slots', method: 'GET', body: undefined });
  });

  it('createReviewSlots POSTs the start times as starts_at and answers how many it created', async () => {
    const startsAt = ['2026-12-07T17:00:00.000Z', '2026-12-07T18:00:00.000Z'];
    fetchMock.mockResolvedValue(jsonResponse(200, { created: 2 }));

    await expect(tasApi.createReviewSlots('c1', startsAt)).resolves.toEqual({ created: 2 });
    expect(sent()).toEqual({
      url: '/api/tas/classes/c1/review-slots',
      method: 'POST',
      body: { starts_at: startsAt },
    });
  });

  it('deleteReviewSlot DELETEs the slot and answers nothing (204)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(tasApi.deleteReviewSlot('s1')).resolves.toBeUndefined();
    expect(sent()).toEqual({ url: '/api/tas/review-slots/s1', method: 'DELETE', body: undefined });
  });

  it('bookReviewSlot POSTs the team to the slot and answers the booking', async () => {
    const booking: ApiReviewSlotBooking = { status: 'moved', slot_id: 's2', starts_at: '2026-12-07T18:00:00+00:00' };
    fetchMock.mockResolvedValue(jsonResponse(200, booking));

    await expect(tasApi.bookReviewSlot('s2', 'p1')).resolves.toEqual(booking);
    expect(sent()).toEqual({ url: '/api/tas/review-slots/s2/book', method: 'POST', body: { project_id: 'p1' } });
  });

  it("releaseReviewSlot POSTs to the team's slot release with no body and answers whether it freed one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { released: true }));

    await expect(tasApi.releaseReviewSlot('p1')).resolves.toEqual({ released: true });
    expect(sent()).toEqual({ url: '/api/tas/projects/p1/review-slot/release', method: 'POST', body: undefined });
  });
});
