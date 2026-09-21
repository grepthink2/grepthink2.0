import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }));
vi.mock('@/lib/previewGuard', () => ({ assertWritableRequest: vi.fn() }));

import { AUTH_UNAUTHORIZED_EVENT } from '@/lib/authEvents';
import { ApiError, apiRequest, apiUpload } from '../client';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('expected the request to fail');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

describe('apiRequest', () => {
  it('sends the bearer token and returns parsed JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(apiRequest('/api/x')).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/x');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws an ApiError carrying the status and the server detail', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { detail: 'You do not own this class' }));
    const err = await failureOf(apiRequest('/api/x'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe('You do not own this class');
    expect(err.code).toBeNull();
  });

  it('keeps the error code the backend sends', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, {
        detail: 'The service is temporarily unavailable. Please try again in a moment.',
        code: 'database_unavailable',
      }),
    );
    const err = await failureOf(apiRequest('/api/x'));
    expect(err.status).toBe(503);
    expect(err.code).toBe('database_unavailable');
    expect(err.message).toBe('The service is temporarily unavailable. Please try again in a moment.');
  });

  it('falls back to a status message when the detail is not text', async () => {
    const detail = [{ loc: ['query', 'class_id'], msg: 'Field required' }];
    fetchMock.mockResolvedValue(jsonResponse(422, { detail }));
    const err = await failureOf(apiRequest('/api/x'));
    expect(err.message).toBe('Request failed with status 422');
    expect(err.detail).toEqual(detail);
  });

  it('announces a 401 so the auth provider can drop the session', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid token' }));
    const listener = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
    const err = await failureOf(apiRequest('/api/x'));
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
    expect(err.status).toBe(401);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not announce other failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: 'boom' }));
    const listener = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
    await failureOf(apiRequest('/api/x'));
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiRequest('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('refuses to call the API without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(apiRequest('/api/x')).rejects.toThrow('No authentication token available');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiUpload', () => {
  it('throws an ApiError on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { detail: 'Bad CSV' }));
    const err = await failureOf(apiUpload('/api/upload', new FormData()));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad CSV');
  });
});
