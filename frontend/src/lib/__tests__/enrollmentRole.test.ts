import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));

vi.mock('@/lib/api', () => ({ api: { getMyEnrollmentRole: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => authState }));

import { api } from '@/lib/api';
import { clearEnrollmentRoleCache, fetchEnrollmentRole, useEnrollmentRole } from '../enrollmentRole';

const getRole = vi.mocked(api.getMyEnrollmentRole);

beforeEach(() => {
  clearEnrollmentRoleCache();
  getRole.mockReset();
  authState.user = { id: 'user-1' };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchEnrollmentRole', () => {
  it('shares one request between concurrent callers', async () => {
    getRole.mockResolvedValue({ enrollment_role: 'ta' });
    const [a, b] = await Promise.all([
      fetchEnrollmentRole('c1', 'user-1'),
      fetchEnrollmentRole('c1', 'user-1'),
    ]);
    expect([a, b]).toEqual(['ta', 'ta']);
    expect(getRole).toHaveBeenCalledTimes(1);
  });

  it('keeps separate entries per class and per user', async () => {
    getRole.mockResolvedValue({ enrollment_role: 'student' });
    await fetchEnrollmentRole('c1', 'user-1');
    await fetchEnrollmentRole('c2', 'user-1');
    await fetchEnrollmentRole('c1', 'user-2');
    expect(getRole).toHaveBeenCalledTimes(3);
  });

  it('reuses the answer briefly, then asks again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
    getRole.mockResolvedValue({ enrollment_role: 'student' });
    await fetchEnrollmentRole('c1', 'user-1');
    vi.setSystemTime(new Date('2026-09-12T10:00:20Z'));
    await fetchEnrollmentRole('c1', 'user-1');
    expect(getRole).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-09-12T10:01:00Z'));
    await fetchEnrollmentRole('c1', 'user-1');
    expect(getRole).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    getRole.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ enrollment_role: 'ta' });
    await expect(fetchEnrollmentRole('c1', 'user-1')).rejects.toThrow('boom');
    await expect(fetchEnrollmentRole('c1', 'user-1')).resolves.toBe('ta');
    expect(getRole).toHaveBeenCalledTimes(2);
  });

  it('maps a missing role to null', async () => {
    getRole.mockResolvedValue({ enrollment_role: null });
    await expect(fetchEnrollmentRole('c1', 'user-1')).resolves.toBeNull();
  });
});

describe('useEnrollmentRole', () => {
  it('is undefined while loading, then the role', async () => {
    getRole.mockResolvedValue({ enrollment_role: 'ta' });
    const { result } = renderHook(() => useEnrollmentRole('c1'));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('ta'));
  });

  it('is null without a class and does not call the API', () => {
    const { result } = renderHook(() => useEnrollmentRole(undefined));
    expect(result.current).toBeNull();
    expect(getRole).not.toHaveBeenCalled();
  });

  it('is null when the request fails', async () => {
    getRole.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEnrollmentRole('c1'));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('never shows the previous class role while the next one loads', async () => {
    let resolveSecond: (value: { enrollment_role: 'student' }) => void = () => {};
    getRole
      .mockResolvedValueOnce({ enrollment_role: 'ta' })
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const { result, rerender } = renderHook(({ id }) => useEnrollmentRole(id), {
      initialProps: { id: 'c1' },
    });
    await waitFor(() => expect(result.current).toBe('ta'));
    rerender({ id: 'c2' });
    expect(result.current).toBeUndefined();
    await act(async () => {
      resolveSecond({ enrollment_role: 'student' });
    });
    expect(result.current).toBe('student');
  });
});
