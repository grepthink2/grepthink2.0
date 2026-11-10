import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiSchedule } from '@/lib/api';

const api = vi.hoisted(() => ({ getSchedule: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

import { TodaySchedule } from '../components/TodaySchedule';
import { useSchedule } from '../hooks/useSchedule';

const ZONE = 'Etc/GMT+8';
const FROM = new Date('2026-11-10T08:00:00Z');
const TO = new Date('2026-11-25T08:00:00Z');

const answer = (title: string): ApiSchedule => ({
  lens: 'student',
  items: [
    {
      id: title,
      kind: 'meeting',
      title,
      starts_at: '2026-11-10T23:00:00Z',
      ends_at: '2026-11-10T23:30:00Z',
      all_day: false,
    },
  ],
});

/** A promise the test settles. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  api.getSchedule.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSchedule', () => {
  it('asks nothing without a class or while not enabled', () => {
    const none = renderHook(() => useSchedule(null, FROM, TO));
    expect(none.result.current.status).toBe('idle');
    const off = renderHook(() => useSchedule('c1', FROM, TO, { enabled: false }));
    expect(off.result.current.status).toBe('idle');
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('loads, then answers the mapped items for the class and range', async () => {
    api.getSchedule.mockResolvedValue(answer('Planning'));
    const { result } = renderHook(() => useSchedule('c1', FROM, TO));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.answer?.items.map((i) => i.title)).toEqual(['Planning']);
    expect(api.getSchedule).toHaveBeenCalledWith('c1', FROM, TO, expect.any(AbortSignal));
  });

  it('reports an error and asks again on retry', async () => {
    api.getSchedule.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(answer('Planning'));
    const { result } = renderHook(() => useSchedule('c1', FROM, TO));
    await waitFor(() => expect(result.current.status).toBe('error'));
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.getSchedule).toHaveBeenCalledTimes(2);
  });

  it('keeps the last answer on screen while a new range for the class loads, but not for another class', async () => {
    api.getSchedule.mockResolvedValueOnce(answer('Monday'));
    const { result, rerender } = renderHook(({ classId, from }) => useSchedule(classId, from, TO), {
      initialProps: { classId: 'c1', from: FROM },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const next = deferred<ApiSchedule>();
    api.getSchedule.mockReturnValueOnce(next.promise);
    rerender({ classId: 'c1', from: new Date('2026-11-11T08:00:00Z') });
    expect(result.current).toMatchObject({ status: 'ready', reloading: true });
    expect(result.current.answer?.items[0].title).toBe('Monday');
    next.resolve(answer('Tuesday'));
    await waitFor(() => expect(result.current.answer?.items[0].title).toBe('Tuesday'));
    expect(result.current.reloading).toBe(false);

    api.getSchedule.mockReturnValueOnce(new Promise(() => {}));
    rerender({ classId: 'c2', from: FROM });
    expect(result.current).toMatchObject({ status: 'loading', answer: null });
  });
});

describe('TodaySchedule', () => {
  function renderCard(props: Partial<Parameters<typeof TodaySchedule>[0]> = {}) {
    return render(
      <MemoryRouter>
        <TodaySchedule classId="c1" schoolZone={ZONE} zone={ZONE} {...props} />
      </MemoryRouter>,
    );
  }

  it('asks for today and the fourteen days after it, from midnight in the viewer’s zone', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T23:12:00Z'), toFake: ['Date'] });
    api.getSchedule.mockResolvedValue(answer('Planning'));
    renderCard();
    expect(await screen.findByText('Planning')).toBeInTheDocument();
    expect(api.getSchedule).toHaveBeenCalledWith(
      'c1',
      new Date('2026-11-10T08:00:00Z'),
      new Date('2026-11-25T08:00:00Z'),
      expect.any(AbortSignal),
    );
  });

  it('shows the empty state and asks nothing with no class selected', () => {
    renderCard({ classId: null });
    expect(screen.getByText('Class events and deadlines will appear here.')).toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('says the schedule is not part of the student preview, and asks nothing', () => {
    renderCard({ preview: true });
    expect(screen.getByText("The schedule isn't part of the student preview.")).toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });
});
