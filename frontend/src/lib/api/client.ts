/** Request plumbing shared by every endpoint module: auth header, preview guard and errors. */
import { announceUnauthorized } from '../authEvents';
import { assertWritableRequest } from '../previewGuard';
import { supabase } from '../supabaseClient';

/**
 * Read-tracking writes (mark-as-read) fire automatically as a side effect of
 * viewing a screen. In read-only preview we still block them, but silently —
 * surfacing a "changes disabled" toast for them would be noise, not signal.
 */
function isSilentWrite(endpoint: string): boolean {
  return /\/read(-all)?$/.test(endpoint);
}

// In dev, use relative paths so Vite proxy routes to the right backend (localhost or prod).
// In production builds, fall back to VITE_API_URL or same-origin.
export const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');

/** A non-2xx response from the backend. `message` is the server's `detail` when that is text. */
export class ApiError extends Error {
  readonly status: number;
  /** The body's `detail`: text, or FastAPI's list of validation errors for a 422. */
  readonly detail: unknown;

  constructor(status: number, detail: unknown, fallbackMessage: string) {
    super(typeof detail === 'string' && detail ? detail : fallbackMessage);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function accessToken(): Promise<string> {
  // getSession() returns the stored session, refreshing it first when it has expired.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('No authentication token available');
  }
  return token;
}

async function failure(response: Response, action: 'Request' | 'Upload'): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (response.status === 401) announceUnauthorized();
  return new ApiError(response.status, detail, `${action} failed with status ${response.status}`);
}

/**
 * Make an authenticated JSON request to the backend. Throws `ApiError` for a
 * non-2xx response; a 401 is also announced so the auth provider can sign out.
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Read-only preview: refuse mutating requests before they leave the browser.
  assertWritableRequest(options.method, isSilentWrite(endpoint));
  const token = await accessToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw await failure(response, 'Request');
  }

  // 204 No Content / empty body — return undefined cast to T.
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return response.json();
}

/** Upload a file as multipart/form-data (no JSON Content-Type). Throws `ApiError` on failure. */
export async function apiUpload<T = unknown>(
  endpoint: string,
  formData: FormData,
): Promise<T> {
  // Uploads are always writes (multipart POST) — block them in preview.
  assertWritableRequest('POST');
  const token = await accessToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw await failure(response, 'Upload');
  }
  return response.json();
}
