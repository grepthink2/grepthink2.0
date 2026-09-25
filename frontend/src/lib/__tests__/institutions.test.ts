import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const api = vi.hoisted(() => ({ getInstitutions: vi.fn() }));

vi.mock('@/lib/api', () => ({ api }));

import { clearInstitutionsCache, fetchInstitutions, useInstitutions } from '../institutions';

const UCSC: ApiInstitution = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc', email_domains: ['ucsc.edu'] };

beforeEach(() => {
  clearInstitutionsCache();
  vi.resetAllMocks();
});

describe('fetchInstitutions', () => {
  it('does not keep a failure, so the next call asks again', async () => {
    api.getInstitutions.mockResolvedValueOnce(null).mockResolvedValueOnce([UCSC]);
    expect(await fetchInstitutions()).toBeNull();
    expect(await fetchInstitutions()).toEqual([UCSC]);
    expect(api.getInstitutions).toHaveBeenCalledTimes(2);
  });

  it('keeps a list and shares it between callers', async () => {
    api.getInstitutions.mockResolvedValue([UCSC]);
    const [first, second] = await Promise.all([fetchInstitutions(), fetchInstitutions()]);
    expect(first).toEqual([UCSC]);
    expect(second).toBe(first);
    expect(await fetchInstitutions()).toBe(first);
    expect(api.getInstitutions).toHaveBeenCalledTimes(1);
  });

  it('keeps an empty list, which is a real answer', async () => {
    api.getInstitutions.mockResolvedValue([]);
    expect(await fetchInstitutions()).toEqual([]);
    expect(await fetchInstitutions()).toEqual([]);
    expect(api.getInstitutions).toHaveBeenCalledTimes(1);
  });
});

describe('useInstitutions', () => {
  it('is undefined while loading, then the list', async () => {
    api.getInstitutions.mockResolvedValue([UCSC]);
    const { result } = renderHook(() => useInstitutions());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual([UCSC]));
  });

  it('is undefined while loading, then null when the list could not load', async () => {
    api.getInstitutions.mockResolvedValue(null);
    const { result } = renderHook(() => useInstitutions());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBeNull());
  });
});
