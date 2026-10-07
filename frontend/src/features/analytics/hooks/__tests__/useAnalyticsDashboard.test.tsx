import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import type { ApiAnalyticsDashboard, ApiAnalyticsScope } from '@/lib/api/types';

const getAnalyticsScope = vi.fn<() => Promise<ApiAnalyticsScope>>();
const getAnalyticsDashboard = vi.fn<(q: unknown) => Promise<ApiAnalyticsDashboard>>();
vi.mock('@/lib/api', () => ({ api: { getAnalyticsScope: (...a: unknown[]) => getAnalyticsScope(...(a as [])), getAnalyticsDashboard: (q: unknown) => getAnalyticsDashboard(q) } }));

import { useAnalyticsDashboard } from '../useAnalyticsDashboard';

const SCOPE: ApiAnalyticsScope = {
  institutions: [
    { id: 'i1', name: 'UC Santa Cruz', slug: 'ucsc', timezone: 'America/Los_Angeles', access: 'instructor',
      classes: [{ id: 'c1', name: 'CSE 115A', term: 'Fall 2026', start_date: '2026-09-21', label: 'CSE 115A · Fall 2026' }] },
  ],
};
const payload = (messages: number): ApiAnalyticsDashboard => ({
  meta: { institution: { id: 'i1', name: 'UC Santa Cruz', slug: 'ucsc', timezone: 'America/Los_Angeles' }, class: null,
          range: { preset: '30d', from: '2026-09-08', to: '2026-10-07', previous_from: '2026-08-09', previous_to: '2026-09-07' },
          generated_at: '2026-10-07T18:00:00+00:00', cached: false, k_anonymity: 3, rollup_as_of: null },
  overview: { active_classes: 1, teams: 1, students: 4, active_users_7d: null, messages, stories_created: 0, tasks_created: 0,
              story_points_created: 0, task_points_created: 0, on_time_rate: null, deltas: {}, trends: {} },
  conversations: { total: messages, team_members: messages, dm: 0, weekly: [], excluded: [] },
  scrum: { live_as_of: '2026-10-07T18:00:00+00:00', stories_created: 0, tasks_created: 0, story_points_created: 0, task_points_created: 0, by_sprint: [], chars: [] },
  timeliness: { on_time_rate: null, expected: 0, late: 0, missing: 0, edited_late: 0, bucket_order: ['early', 'on_time', 'late', 'missing', 'not_due'], rows: [] },
  trends: { as_of: null, panels: [] },
  breakdown: { kind: 'class', rows: [] },
  failures: [],
});

/** The router's query string as rendered; `search()` reads it back. */
function Probe() {
  return <output data-testid="search">{useLocation().search}</output>;
}
const search = () => screen.getByTestId('search').textContent;
const wrapper = (initial: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initial]}>
        <Probe />
        {children}
      </MemoryRouter>
    );
  };

beforeEach(() => {
  getAnalyticsScope.mockResolvedValue(SCOPE);
  getAnalyticsDashboard.mockResolvedValue(payload(10));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useAnalyticsDashboard', () => {
  it('reads the filters from the URL and fetches as soon as the URL names an institution, without waiting for the scope', async () => {
    getAnalyticsScope.mockReturnValue(new Promise(() => {})); // the scope never answers
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1&class=c1&window=class') });
    await waitFor(() => expect(result.current.data?.overview.messages).toBe(10));
    expect(getAnalyticsDashboard).toHaveBeenCalledWith({ institution_id: 'i1', class_id: 'c1', window: 'class', from: null, to: null, fresh: false });
    expect(result.current.filters).toEqual({ institutionId: 'i1', classId: 'c1', window: 'class', from: null, to: null });
  });

  it('picks the first institution in scope when the URL names none, and writes it to the URL', async () => {
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics') });
    await waitFor(() => expect(result.current.filters.institutionId).toBe('i1'));
    expect(search()).toBe('?institution=i1');
    expect(result.current.filters.window).toBe('30d');
  });

  it('writes filter changes to the URL and drops a class window when the class is cleared', async () => {
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1&class=c1&window=class') });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    act(() => result.current.setFilters({ classId: null }));
    await waitFor(() => expect(search()).toBe('?institution=i1')); // 30d is the default and is not written
    act(() => result.current.setFilters({ window: 'custom', from: '2026-09-01', to: '2026-09-30' }));
    await waitFor(() => expect(search()).toBe('?institution=i1&window=custom&from=2026-09-01&to=2026-09-30'));
  });

  it('does not fetch a custom range until both dates are set', async () => {
    renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1&window=custom&from=2026-09-01') });
    await waitFor(() => expect(getAnalyticsScope).toHaveBeenCalled());
    expect(getAnalyticsDashboard).not.toHaveBeenCalled();
  });

  it('reads a class window without a class as 30d', async () => {
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1&window=class') });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.filters.window).toBe('30d');
    expect(getAnalyticsDashboard).toHaveBeenCalledWith({ institution_id: 'i1', class_id: null, window: '30d', from: null, to: null, fresh: false });
  });

  it('pairs a class in the URL with its own institution', async () => {
    getAnalyticsScope.mockResolvedValue({
      institutions: [
        ...SCOPE.institutions,
        { id: 'i2', name: 'Example State University', slug: 'esu', timezone: 'America/New_York', access: 'instructor',
          classes: [{ id: 'c2', name: 'CS 401', term: 'Fall 2026', start_date: '2026-09-02', label: 'CS 401 · Fall 2026' }] },
      ],
    });
    const owned = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?class=c2') });
    await waitFor(() => expect(owned.result.current.data).toBeTruthy());
    expect(search()).toBe('?institution=i2&class=c2');
    owned.unmount();
    const unowned = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?class=zz&window=class') });
    await waitFor(() => expect(unowned.result.current.data).toBeTruthy());
    expect(search()).toBe('?institution=i1'); // a class no institution in scope owns is dropped, and its class window with it
  });

  it('keeps the previous payload while refetching and ignores a stale response', async () => {
    let resolveFirst!: (p: ApiAnalyticsDashboard) => void;
    getAnalyticsDashboard
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockResolvedValueOnce(payload(20));
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1));
    act(() => result.current.setFilters({ window: '7d' }));
    await waitFor(() => expect(result.current.data?.overview.messages).toBe(20));
    expect(result.current.refetching).toBe(false);
    await act(async () => { resolveFirst(payload(99)); });
    expect(result.current.data?.overview.messages).toBe(20); // the late first response never lands
  });

  it('ignores a superseded request that fails', async () => {
    let rejectFirst!: (e: unknown) => void;
    getAnalyticsDashboard
      .mockImplementationOnce(() => new Promise((_res, rej) => { rejectFirst = rej; }))
      .mockResolvedValueOnce(payload(20));
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1));
    act(() => result.current.setFilters({ window: '7d' }));
    await waitFor(() => expect(result.current.data?.overview.messages).toBe(20));
    await act(async () => { rejectFirst(new ApiError(500, 'Internal server error', 'Request failed with status 500', 'internal_error')); });
    expect(result.current.data?.overview.messages).toBe(20);
    expect(result.current.error).toBeNull();
  });

  it('reports refetching and holds the previous payload while a load is in flight: on mount, after a filter change, on refresh and on the interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let settle!: (p: ApiAnalyticsDashboard) => void;
    getAnalyticsDashboard.mockImplementation(() => new Promise((res) => { settle = res; }));
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    const inFlightThenSettled = async (shown: number | undefined, next: number) => {
      expect(result.current.refetching).toBe(true);
      expect(result.current.data?.overview.messages).toBe(shown); // the previous frame stays while the request runs
      await act(async () => settle(payload(next)));
      expect(result.current.refetching).toBe(false);
      expect(result.current.data?.overview.messages).toBe(next);
    };
    await inFlightThenSettled(undefined, 1);
    act(() => result.current.setFilters({ window: '7d' }));
    await inFlightThenSettled(1, 2);
    act(() => result.current.refresh());
    await inFlightThenSettled(2, 3);
    act(() => { vi.advanceTimersByTime(60_000); });
    await inFlightThenSettled(3, 4);
    expect(getAnalyticsDashboard).toHaveBeenCalledTimes(4);
  });

  it('exposes the status of a refused request and clears it on the next success', async () => {
    getAnalyticsDashboard.mockRejectedValueOnce(
      new ApiError(403, 'Analytics is available to instructors and maintainers', 'Request failed with status 403'),
    );
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    await waitFor(() => expect(result.current.error).toBe(403));
    expect(result.current.data).toBeNull();
    act(() => result.current.setFilters({ window: '7d' }));
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('refreshes with fresh=1 on demand and every 60 s while visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1));
    act(() => result.current.refresh());
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ fresh: true })));
    act(() => { vi.advanceTimersByTime(60_000); });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(3));
    expect(getAnalyticsDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ fresh: true }));  // the poll is fresh too
  });

  it('does not poll while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); // restored in afterEach
    renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1);
  });

  it('stops polling on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderHook(() => useAnalyticsDashboard(), { wrapper: wrapper('/app/analytics?institution=i1') });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1));
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(getAnalyticsDashboard).toHaveBeenCalledTimes(1);
  });
});
